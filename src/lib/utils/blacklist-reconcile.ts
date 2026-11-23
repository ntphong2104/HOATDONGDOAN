import { isEventLockedPast3Days } from './event-logic';
import { getVietnamDateString } from './vn-date';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import { runSerializedByKey } from './concurrency-queue';
import { getRegistrationExtras, getEventMeta } from '@/lib/constants/event-meta-store';
import { reconcileAttendance, MAX_MISSED_STRIKES } from './blacklist-logic';

export interface ReconcileSummary {
  totalProcessedEvents: number;
  reconciledEvents: {
    event_id: string;
    event_name: string;
    event_date: string;
    attendedCount: number;
    absentCount: number;
    penalizedCount: number;
  }[];
  totalAttended: number;
  totalAbsent: number;
  totalPenaltiesAdded: number;
  totalNewlyBlacklisted: string[];
}

/**
 * Reconciles all events ended >= 3 days ago.
 * Finds all students who registered but did not check in,
 * marks them in event_registrations, and adds penalties into user_penalties.
 */
export async function reconcileAllPastEvents(supabase: any): Promise<ReconcileSummary> {
  return runSerializedByKey('reconcile_all_past_events', async () => {
    const summary: ReconcileSummary = {
      totalProcessedEvents: 0,
      reconciledEvents: [],
      totalAttended: 0,
      totalAbsent: 0,
      totalPenaltiesAdded: 0,
      totalNewlyBlacklisted: [],
    };

    if (!supabase) return summary;

    // 1. Calculate threshold: 3 days ago in Vietnam time (UTC+7)
    const thresholdDate = getVietnamDateString(-3);

    // 2. Fetch unclosed past events (paginated — never re-scan already closed/reconciled events and overwrite pardons)
    const { data: pastEvents, error: evErr } = await fetchAllRows<any>(() =>
      supabase
        .from('events')
        .select('event_id, event_name, event_date, start_time, end_time, status, is_active')
        .neq('status', 'closed')
        .lte('event_date', thresholdDate)
        .order('event_date', { ascending: false })
        .order('event_id', { ascending: false })
    );

    if (evErr || !pastEvents || pastEvents.length === 0) {
      return summary;
    }

    // 3. Process each past event (including overdue `active` events whose last session ended > 3 days ago)
    for (const event of pastEvents) {
      try {
        const meta = await getEventMeta(supabase, event.event_id);

        // Evaluate 3-day lock purely by schedule end time (treat `active` as overdue if >3 days past end)
        if (!isEventLockedPast3Days({ ...event, status: 'closed', sessions: meta?.sessions || [] })) {
          continue;
        }

        // Check registrations, checkins, and extras with pagination
        const [{ data: registrations }, { data: checkIns }, regExtras] = await Promise.all([
          fetchAllRows<any>(() => supabase.from('event_registrations').select('*').eq('event_id', event.event_id)),
          fetchAllRows<any>(() => supabase.from('check_ins').select('mssv').eq('event_id', event.event_id)),
          getRegistrationExtras(supabase, event.event_id),
        ]);

        if (!registrations || registrations.length === 0) {
          if (event.status !== 'closed' || event.is_active !== false) {
            await supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', event.event_id);
          }
          continue;
        }

        // Skip volunteer applicants who were not explicitly accepted (excludes pending, rejected, and unreviewed)
        const reconcilableRegistrations = registrations.filter((reg: any) => {
          const cleanM = String(reg.mssv || '').toUpperCase().trim();
          const extra = regExtras?.[cleanM];
          const reviewStatus = String(extra?.review_status || '').toLowerCase();
          if (reg.role_type === 'volunteer' && reviewStatus !== 'accepted') {
            return false;
          }
          // Never overwrite registrations already explicitly marked attended (e.g. via pardon)
          if (reg.attended === true) {
            return false;
          }
          return true;
        });

        // If checkIns is 0 and registrations > 50, check if this is an abandoned duplicate container
        if ((!checkIns || checkIns.length === 0) && reconcilableRegistrations.length > 50) {
          const sampleMssvs = reconcilableRegistrations.slice(0, 10).map((r: any) => r.mssv);
          const { data: otherCheckins } = await supabase
            .from('check_ins')
            .select('mssv')
            .in('mssv', sampleMssvs);

          if (otherCheckins && otherCheckins.length >= 5) {
            if (event.status !== 'closed' || event.is_active !== false) {
              await supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', event.event_id);
            }
            continue;
          }
        }

        const { attended, absent } = reconcileAttendance(reconcilableRegistrations, checkIns || []);

        // Update attended status in event_registrations in chunks
        if (attended.length > 0) {
          const attendedMssvs = attended.map((a) => a.mssv);
          for (const mChunk of chunkArray(attendedMssvs, 200)) {
            await supabase
              .from('event_registrations')
              .update({ attended: true })
              .eq('event_id', event.event_id)
              .in('mssv', mChunk);
          }
        }

        let eventPenaltiesAdded = 0;

        if (absent.length > 0) {
          const absentMssvs = absent.map((a) => a.mssv);
          for (const mChunk of chunkArray(absentMssvs, 200)) {
            await supabase
              .from('event_registrations')
              .update({ attended: false })
              .eq('event_id', event.event_id)
              .in('mssv', mChunk);
          }

          // Fetch existing penalties and authoritative user profiles in parallel chunks
          const existingPenalties: any[] = [];
          const userProfiles: any[] = [];
          await Promise.all(
            chunkArray(absentMssvs, 200).map(async (mChunk) => {
              const [{ data: penChunk }, { data: userChunk }] = await Promise.all([
                supabase.from('user_penalties').select('*').in('mssv', mChunk),
                supabase.from('users').select('mssv, full_name, class_id, email').in('mssv', mChunk),
              ]);
              if (penChunk) existingPenalties.push(...penChunk);
              if (userChunk) userProfiles.push(...userChunk);
            })
          );

          const penaltyMap = new Map(existingPenalties.map((p: any) => [p.mssv.toUpperCase().trim(), p]));
          const userMap = new Map(userProfiles.map((u: any) => [u.mssv.toUpperCase().trim(), u]));
          const eventIdentifier = `[${event.event_id}]`;
          const eventShortName = event.event_name ? event.event_name.slice(0, 40) : 'Sự kiện';

          const upsertRowsByMssv = new Map<string, any>();

          for (const abs of absent) {
            const cleanMssv = abs.mssv.toUpperCase().trim();
            if (!cleanMssv || upsertRowsByMssv.has(cleanMssv)) continue;
            const existing: any = penaltyMap.get(cleanMssv);

            // Deduplicate strictly by [event_id] tag so identically prefixed event names are never skipped
            if (existing?.notes && existing.notes.includes(eventIdentifier)) {
              continue;
            }

            const currentMissed = existing?.missed_count || 0;
            const newMissed = currentMissed + 1;
            const willBeBlacklisted = newMissed >= MAX_MISSED_STRIKES || Boolean(existing?.is_blacklisted);

            if (willBeBlacklisted && !existing?.is_blacklisted) {
              summary.totalNewlyBlacklisted.push(cleanMssv);
            }

            const penaltyNote = `Vắng: ${eventShortName} (${event.event_date}) ${eventIdentifier}`;
            const updatedNotes = existing?.notes ? `${existing.notes}; ${penaltyNote}` : penaltyNote;

            const u: any = userMap.get(cleanMssv);
            const isPlaceholderName = (name?: string) =>
              !name || !name.trim() || name.trim().toUpperCase() === cleanMssv || name.includes('@');

            const resolvedFullName =
              !isPlaceholderName(u?.full_name)
                ? u.full_name.trim()
                : !isPlaceholderName(abs.full_name) && abs.full_name
                  ? abs.full_name.trim()
                  : !isPlaceholderName(existing?.full_name) && existing?.full_name
                    ? existing.full_name.trim()
                    : (u?.full_name || abs.full_name || abs.email || cleanMssv);

            const resolvedClassId =
              u?.class_id && u.class_id.trim() !== 'PTIT-HCM'
                ? u.class_id.trim()
                : abs.class_id && abs.class_id.trim() !== 'PTIT-HCM'
                  ? abs.class_id.trim()
                  : existing?.class_id && existing.class_id.trim() !== 'PTIT-HCM'
                    ? existing.class_id.trim()
                    : (u?.class_id || abs.class_id || 'PTIT-HCM');

            const resolvedEmail = u?.email || abs.email;

            upsertRowsByMssv.set(cleanMssv, {
              mssv: cleanMssv,
              email: resolvedEmail,
              full_name: resolvedFullName,
              class_id: resolvedClassId,
              missed_count: newMissed,
              is_blacklisted: willBeBlacklisted,
              blacklisted_at: willBeBlacklisted && !existing?.is_blacklisted ? new Date().toISOString() : existing?.blacklisted_at,
              notes: updatedNotes,
              updated_at: new Date().toISOString(),
            });
          }

          const upsertRows = Array.from(upsertRowsByMssv.values());
          let hadUpsertError = false;
          // Batch upsert in chunks of 50
          for (const chunk of chunkArray(upsertRows, 50)) {
            const { error: upsertErr } = await supabase.from('user_penalties').upsert(chunk, { onConflict: 'mssv' });
            if (upsertErr) {
              hadUpsertError = true;
              console.error(`Failed upserting penalties for event ${event.event_id}:`, upsertErr);
            }
          }

          if (hadUpsertError) {
            continue;
          }

          eventPenaltiesAdded = upsertRows.length;
        }

        // Close event
        if (event.status !== 'closed' || event.is_active !== false) {
          await supabase
            .from('events')
            .update({ status: 'closed', is_active: false })
            .eq('event_id', event.event_id);
        }

        summary.totalProcessedEvents++;
        summary.totalAttended += attended.length;
        summary.totalAbsent += absent.length;
        summary.totalPenaltiesAdded += eventPenaltiesAdded;
        summary.reconciledEvents.push({
          event_id: event.event_id,
          event_name: event.event_name,
          event_date: event.event_date,
          attendedCount: attended.length,
          absentCount: absent.length,
          penalizedCount: eventPenaltiesAdded,
        });
      } catch (err) {
        console.error(`Error reconciling event ${event.event_id}:`, err);
      }
    }

    return summary;
  });
}
