import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext, canManageEvent } from '@/lib/supabase/auth-helper';
import { reconcileAttendance, MAX_MISSED_STRIKES } from '@/lib/utils/blacklist-logic';
import { isEventLockedPast3Days, isEventScheduleExpired } from '@/lib/utils/event-logic';
import { getEventMeta, getRegistrationExtras } from '@/lib/constants/event-meta-store';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import { runSerializedByKey } from '@/lib/utils/concurrency-queue';
import { getVietnamDateString } from '@/lib/utils/vn-date';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  return runSerializedByKey(`reconcile_event_${resolvedParams.id}`, async () => {
    // 1. Fetch event, meta, registrations, checkins, and regExtras
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('*')
      .eq('event_id', resolvedParams.id)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
    }

    const allowed = isSuperAdmin || (await canManageEvent(auth, resolvedParams.id, event.created_by, supabase));
    if (!allowed) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền chốt điểm danh sự kiện này' }, { status: 403 });
    }

    const meta = await getEventMeta(supabase, resolvedParams.id);

    if (event.status === 'active' && !isEventScheduleExpired({ ...event, sessions: meta.sessions || [] }) && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sự kiện vẫn chưa kết thúc theo lịch trình nên chưa thể chốt điểm danh và phạt vắng.',
        },
        { status: 400 }
      );
    }

    if (isEventLockedPast3Days({ ...event, sessions: meta.sessions || [] }) && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền chốt lại điểm danh sự kiện này.',
        },
        { status: 403 }
      );
    }

    const [{ data: registrations }, { data: checkIns }, regExtras] = await Promise.all([
      fetchAllRows<any>(() => supabase.from('event_registrations').select('*').eq('event_id', resolvedParams.id)),
      fetchAllRows<any>(() => supabase.from('check_ins').select('mssv').eq('event_id', resolvedParams.id)),
      getRegistrationExtras(supabase, resolvedParams.id),
    ]);

    if (!registrations || registrations.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalRegistrations: 0,
          attendedCount: 0,
          absentCount: 0,
          newlyBlacklisted: [],
        },
        message: 'Sự kiện chưa có lượt đăng ký nào trước đó.',
      });
    }

    const reconcilableRegistrations = registrations.filter((reg: any) => {
      const cleanM = String(reg.mssv || '').toUpperCase().trim();
      const extra = regExtras?.[cleanM];
      const reviewStatus = String(extra?.review_status || '').toLowerCase();
      if (reg.role_type === 'volunteer' && reviewStatus !== 'accepted') {
        return false;
      }
      if (reg.attended === true) {
        return false;
      }
      return true;
    });

    // 4. Reconcile attendance
    const { attended, absent } = reconcileAttendance(reconcilableRegistrations, checkIns || []);

    // 5. Update attended status in event_registrations in chunks
    if (attended.length > 0) {
      const attendedMssvs = attended.map((a) => a.mssv);
      for (const mChunk of chunkArray(attendedMssvs, 200)) {
        await supabase
          .from('event_registrations')
          .update({ attended: true })
          .eq('event_id', resolvedParams.id)
          .in('mssv', mChunk);
      }
    }

    // 6. Process absent students (No-show penalties) using batched reads + upserts
    const newlyBlacklisted: string[] = [];
    const absentMssvs = absent.map((a) => a.mssv.toUpperCase().trim()).filter(Boolean);

    const userProfiles: any[] = [];
    const existingPenalties: any[] = [];
    await Promise.all(
      chunkArray(absentMssvs, 200).map(async (mChunk) => {
        const [{ data: uRows }, { data: pRows }] = await Promise.all([
          supabase.from('users').select('mssv, full_name, class_id, email').in('mssv', mChunk),
          supabase.from('user_penalties').select('*').in('mssv', mChunk),
        ]);
        if (uRows) userProfiles.push(...uRows);
        if (pRows) existingPenalties.push(...pRows);
      })
    );

    const userMap = new Map(userProfiles.map((u: any) => [u.mssv?.toUpperCase().trim(), u]));
    const penaltyMap = new Map(existingPenalties.map((p: any) => [p.mssv?.toUpperCase().trim(), p]));
    const eventIdentifier = `[${resolvedParams.id}]`;
    const eventShortName = event.event_name ? event.event_name.slice(0, 40) : 'Sự kiện';
    const upsertRowsByMssv = new Map<string, any>();

    for (const abs of absent) {
      const cleanMssv = abs.mssv.toUpperCase().trim();
      if (!cleanMssv || upsertRowsByMssv.has(cleanMssv)) continue;
      const existing: any = penaltyMap.get(cleanMssv);

      // Deduplicate strictly by [event_id] tag
      if (existing?.notes && existing.notes.includes(eventIdentifier)) {
        continue;
      }

      const currentMissed = existing?.missed_count || 0;
      const newMissed = currentMissed + 1;
      const willBeBlacklisted = newMissed >= MAX_MISSED_STRIKES;

      if (willBeBlacklisted && !existing?.is_blacklisted) {
        newlyBlacklisted.push(cleanMssv);
      }

      const penaltyNote = `Vắng: ${eventShortName} (${event.event_date || getVietnamDateString(0)}) ${eventIdentifier}`;
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
        is_blacklisted: willBeBlacklisted || existing?.is_blacklisted || false,
        blacklisted_at: willBeBlacklisted && !existing?.is_blacklisted ? new Date().toISOString() : existing?.blacklisted_at,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      });
    }

    const upsertRows = Array.from(upsertRowsByMssv.values());
    for (const chunk of chunkArray(upsertRows, 50)) {
      const { error: upsertErr } = await supabase.from('user_penalties').upsert(chunk, { onConflict: 'mssv' });
      if (upsertErr) {
        console.error(`Failed upserting penalties for event ${resolvedParams.id}:`, upsertErr);
        return NextResponse.json(
          { success: false, error: 'Lỗi khi cập nhật sổ kỷ luật sinh viên vắng mặt' },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalRegistrations: reconcilableRegistrations.length,
        attendedCount: attended.length,
        absentCount: absent.length,
        newlyBlacklisted,
      },
      message: `Đã chốt điểm danh thành công: ${attended.length} người có mặt, ${absent.length} người vắng mặt.${
        newlyBlacklisted.length > 0 ? ` Có ${newlyBlacklisted.length} sinh viên bị khóa Blacklist do vắng đủ 3 lần.` : ''
      }`,
    });
  });
}
