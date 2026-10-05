import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { reconcileAttendance, MAX_MISSED_STRIKES } from '@/lib/utils/blacklist-logic';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin)) {
    return NextResponse.json({ success: false, error: 'Bạn không có quyền chốt điểm danh sự kiện này' }, { status: 403 });
  }

  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
  const supabase = typeof createAdminClient === 'function' ? await createAdminClient() : await createClient();

  // 1. Fetch event, registrations, and checkins in parallel
  const [
    { data: event, error: eventErr },
    { data: registrations },
    { data: checkIns }
  ] = await Promise.all([
    supabase.from('events').select('*').eq('event_id', resolvedParams.id).single(),
    supabase.from('event_registrations').select('*').eq('event_id', resolvedParams.id),
    supabase.from('check_ins').select('mssv').eq('event_id', resolvedParams.id)
  ]);

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  if (isEventLockedPast3Days(event) && !isSuperAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền chốt lại điểm danh sự kiện này.',
      },
      { status: 403 }
    );
  }

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

  // 4. Reconcile attendance
  const { attended, absent } = reconcileAttendance(registrations, checkIns || []);

  // 5. Update attended status in event_registrations
  if (attended.length > 0) {
    const attendedMssvs = attended.map((a) => a.mssv);
    await supabase
      .from('event_registrations')
      .update({ attended: true })
      .eq('event_id', resolvedParams.id)
      .in('mssv', attendedMssvs);
  }

  // 6. Process absent students (No-show penalties)
  const newlyBlacklisted: string[] = [];
  const absentMssvs = absent.map((a) => a.mssv);
  const { data: userProfiles } = absentMssvs.length > 0
    ? await supabase.from('users').select('mssv, full_name, class_id, email').in('mssv', absentMssvs)
    : { data: [] };
  const userMap = new Map((userProfiles || []).map((u: any) => [u.mssv?.toUpperCase().trim(), u]));

  for (const abs of absent) {
    const cleanMssv = abs.mssv.toUpperCase().trim();
    // Fetch existing penalty record
    const { data: existing } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', cleanMssv)
      .single();

    const eventIdentifier = `[${resolvedParams.id}]`;
    const eventShortName = event.event_name ? event.event_name.slice(0, 40) : 'Sự kiện';

    // Skip if already penalized or pardoned for this event
    if (existing?.notes && (existing.notes.includes(eventIdentifier) || existing.notes.includes(eventShortName))) {
      continue;
    }

    const currentMissed = existing?.missed_count || 0;
    const newMissed = currentMissed + 1;
    const willBeBlacklisted = newMissed >= MAX_MISSED_STRIKES;

    if (willBeBlacklisted && !existing?.is_blacklisted) {
      newlyBlacklisted.push(cleanMssv);
    }

    const penaltyNote = `Vắng: ${eventShortName} (${event.event_date || new Date().toLocaleDateString('vi-VN')}) ${eventIdentifier}`;
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

    await supabase.from('user_penalties').upsert(
      {
        mssv: cleanMssv,
        email: resolvedEmail,
        full_name: resolvedFullName,
        class_id: resolvedClassId,
        missed_count: newMissed,
        is_blacklisted: willBeBlacklisted || existing?.is_blacklisted || false,
        blacklisted_at: willBeBlacklisted && !existing?.is_blacklisted ? new Date().toISOString() : existing?.blacklisted_at,
        notes: updatedNotes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'mssv' }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      totalRegistrations: registrations.length,
      attendedCount: attended.length,
      absentCount: absent.length,
      newlyBlacklisted,
    },
    message: `Đã chốt điểm danh thành công: ${attended.length} người có mặt, ${absent.length} người vắng mặt.${
      newlyBlacklisted.length > 0 ? ` Có ${newlyBlacklisted.length} sinh viên bị khóa Blacklist do vắng đủ 3 lần.` : ''
    }`,
  });
}
