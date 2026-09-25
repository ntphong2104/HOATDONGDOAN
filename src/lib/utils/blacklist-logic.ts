// ════════════════════════════════════════════════════════════════
// src/lib/utils/blacklist-logic.ts — No-Show & Blacklist Utilities
// ════════════════════════════════════════════════════════════════

export const MAX_MISSED_STRIKES = 3;

export interface PenaltyEvaluation {
  isBlacklisted: boolean;
  missedCount: number;
  strikesLeft: number;
  statusLabel: string;
  badgeColor: string;
}

/**
 * Calculates current penalty standing and strikes left before blacklisting.
 */
export function evaluatePenaltyStanding(missedCount: number, manualBlacklist = false): PenaltyEvaluation {
  const effectiveMissed = Math.max(0, missedCount);
  const isBlacklisted = manualBlacklist || effectiveMissed >= MAX_MISSED_STRIKES;
  const strikesLeft = Math.max(0, MAX_MISSED_STRIKES - effectiveMissed);

  let statusLabel = 'Bình thường';
  let badgeColor = 'var(--success-500)';

  if (isBlacklisted) {
    statusLabel = 'Đã bị Blacklist (Khóa đăng ký)';
    badgeColor = 'var(--error-500)';
  } else if (effectiveMissed === 2) {
    statusLabel = 'Cảnh báo nguy cấp (Vắng 2/3 lần)';
    badgeColor = 'var(--error-500)';
  } else if (effectiveMissed === 1) {
    statusLabel = 'Cảnh báo nhẹ (Vắng 1/3 lần)';
    badgeColor = 'var(--warning-500)';
  }

  return {
    isBlacklisted,
    missedCount: effectiveMissed,
    strikesLeft,
    statusLabel,
    badgeColor,
  };
}

/**
 * Reconciles registrations against actual check-ins.
 * Returns array of attended students and absent students.
 */
export function reconcileAttendance(
  registrations: { mssv: string; email: string; full_name?: string; class_id?: string }[],
  checkIns: { mssv: string }[]
): {
  attended: { mssv: string; email: string }[];
  absent: { mssv: string; email: string; full_name?: string; class_id?: string }[];
} {
  const checkInSet = new Set(checkIns.map((c) => c.mssv.toUpperCase().trim()));

  const attended: { mssv: string; email: string }[] = [];
  const absent: { mssv: string; email: string; full_name?: string; class_id?: string }[] = [];

  for (const reg of registrations) {
    const cleanMssv = reg.mssv.toUpperCase().trim();
    if (checkInSet.has(cleanMssv)) {
      attended.push({ mssv: cleanMssv, email: reg.email });
    } else {
      absent.push({
        mssv: cleanMssv,
        email: reg.email,
        full_name: reg.full_name,
        class_id: reg.class_id,
      });
    }
  }

  return { attended, absent };
}

export const REGISTRATION_CUTOFF_HOURS = 12;

/**
 * Checks if the registration window is currently open (Registration is allowed until event starts, or unless closed manually by organizer).
 */
export function isRegistrationWindowOpen(
  eventDate?: string,
  startTime?: string,
  eventStatus?: string,
  isRegistrationOpen?: boolean | null
): {
  isOpen: boolean;
  eventStartTime?: Date;
  reason?: string;
} {
  // 1. Check if organizer manually toggled registration off
  if (isRegistrationOpen === false) {
    return {
      isOpen: false,
      reason: 'Ban tổ chức đã chủ động đóng cổng đăng ký cho sự kiện này.',
    };
  }

  // 2. Check if event is closed or rejected
  if (eventStatus === 'closed' || eventStatus === 'rejected') {
    return {
      isOpen: false,
      reason: 'Sự kiện đã kết thúc hoặc đã đóng.',
    };
  }

  if (!eventDate) {
    return { isOpen: true };
  }

  const cleanDate = eventDate.split('T')[0];
  const timeParts = (startTime || '07:30').slice(0, 5).split(':');
  const hours = parseInt(timeParts[0] || '7', 10);
  const minutes = parseInt(timeParts[1] || '30', 10);

  const dateParts = cleanDate.split('-').map(Number);
  if (dateParts.length < 3) {
    return { isOpen: true };
  }

  const [year, month, day] = dateParts;
  const eventStart = new Date(year, month - 1, day, hours, minutes, 0);

  if (isNaN(eventStart.getTime())) {
    return { isOpen: true };
  }

  // If organizer explicitly opened registration, keep it open!
  if (isRegistrationOpen === true) {
    return {
      isOpen: true,
      eventStartTime: eventStart,
    };
  }

  const now = new Date();

  // 3. Closes when event starts by default
  if (now > eventStart) {
    return {
      isOpen: false,
      eventStartTime: eventStart,
      reason: 'Sự kiện đã bắt đầu diễn ra hoặc đã kết thúc.',
    };
  }

  // 4. Auto-close 12 hours before event start by default
  const hoursDiff = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursDiff < 12) {
    return {
      isOpen: false,
      eventStartTime: eventStart,
      reason: 'Cổng đăng ký đã tự động đóng (trước giờ khai mạc 12 tiếng). Ban tổ chức có thể mở lại thủ công.',
    };
  }

  return {
    isOpen: true,
    eventStartTime: eventStart,
  };
}

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
  const summary: ReconcileSummary = {
    totalProcessedEvents: 0,
    reconciledEvents: [],
    totalAttended: 0,
    totalAbsent: 0,
    totalPenaltiesAdded: 0,
    totalNewlyBlacklisted: [],
  };

  if (!supabase) return summary;

  // 1. Calculate threshold: 3 days ago
  const thresholdDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // 2. Fetch past events
  const { data: pastEvents, error: evErr } = await supabase
    .from('events')
    .select('event_id, event_name, event_date, start_time, end_time, status, is_active')
    .lte('event_date', thresholdDate)
    .order('event_date', { ascending: false });

  if (evErr || !pastEvents || pastEvents.length === 0) {
    return summary;
  }

  // 3. Process each past event
  for (const event of pastEvents) {
    try {
      // Check registrations and checkins
      const [{ data: registrations }, { data: checkIns }] = await Promise.all([
        supabase.from('event_registrations').select('*').eq('event_id', event.event_id),
        supabase.from('check_ins').select('mssv').eq('event_id', event.event_id),
      ]);

      if (!registrations || registrations.length === 0) {
        // If event had no registrations, just ensure it is closed
        if (event.status !== 'closed') {
          await supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', event.event_id);
        }
        continue;
      }

      // Check if event was a duplicate or test event where 0 checkins occurred across all students
      // If checkIns is 0 and registrations > 10, check if this is an abandoned entry
      if ((!checkIns || checkIns.length === 0) && registrations.length > 50) {
        const sampleMssvs = registrations.slice(0, 10).map((r: any) => r.mssv);
        const { data: otherCheckins } = await supabase
          .from('check_ins')
          .select('mssv')
          .in('mssv', sampleMssvs);

        if (otherCheckins && otherCheckins.length >= 5) {
          // These students checked in to other events; this was a duplicate registration container (like d0086402)
          if (event.status !== 'closed') {
            await supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', event.event_id);
          }
          continue;
        }
      }

      const { attended, absent } = reconcileAttendance(registrations, checkIns || []);

      // Update attended status in event_registrations
      if (attended.length > 0) {
        const attendedMssvs = attended.map((a) => a.mssv);
        await supabase
          .from('event_registrations')
          .update({ attended: true })
          .eq('event_id', event.event_id)
          .in('mssv', attendedMssvs);
      }

      let eventPenaltiesAdded = 0;

      if (absent.length > 0) {
        const absentMssvs = absent.map((a) => a.mssv);
        await supabase
          .from('event_registrations')
          .update({ attended: false })
          .eq('event_id', event.event_id)
          .in('mssv', absentMssvs);

        // Fetch existing penalties for these absent students
        const { data: existingPenalties } = await supabase
          .from('user_penalties')
          .select('*')
          .in('mssv', absentMssvs);

        const penaltyMap = new Map((existingPenalties || []).map((p: any) => [p.mssv.toUpperCase().trim(), p]));
        const eventIdentifier = `[${event.event_id}]`;
        const eventShortName = event.event_name ? event.event_name.slice(0, 40) : 'Sự kiện';

        const upsertRows: any[] = [];

        for (const abs of absent) {
          const cleanMssv = abs.mssv.toUpperCase().trim();
          const existing: any = penaltyMap.get(cleanMssv);

          // Check if already penalized for this event
          if (existing?.notes && (existing.notes.includes(eventIdentifier) || existing.notes.includes(eventShortName))) {
            continue; // Already penalized for this event
          }

          const currentMissed = existing?.missed_count || 0;
          const newMissed = currentMissed + 1;
          const willBeBlacklisted = newMissed >= MAX_MISSED_STRIKES || Boolean(existing?.is_blacklisted);

          if (willBeBlacklisted && !existing?.is_blacklisted) {
            summary.totalNewlyBlacklisted.push(cleanMssv);
          }

          const penaltyNote = `Vắng: ${eventShortName} (${event.event_date}) ${eventIdentifier}`;
          const updatedNotes = existing?.notes ? `${existing.notes}; ${penaltyNote}` : penaltyNote;

          upsertRows.push({
            mssv: cleanMssv,
            email: abs.email,
            full_name: abs.full_name || abs.email,
            class_id: abs.class_id || 'PTIT-HCM',
            missed_count: newMissed,
            is_blacklisted: willBeBlacklisted,
            blacklisted_at: willBeBlacklisted && !existing?.is_blacklisted ? new Date().toISOString() : existing?.blacklisted_at,
            notes: updatedNotes,
            updated_at: new Date().toISOString(),
          });
        }

        // Batch upsert in chunks of 50
        const CHUNK_SIZE = 50;
        for (let i = 0; i < upsertRows.length; i += CHUNK_SIZE) {
          const chunk = upsertRows.slice(i, i + CHUNK_SIZE);
          await supabase.from('user_penalties').upsert(chunk, { onConflict: 'mssv' });
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
}

