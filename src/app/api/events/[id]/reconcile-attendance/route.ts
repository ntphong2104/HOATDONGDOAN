import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { reconcileAttendance, MAX_MISSED_STRIKES } from '@/lib/utils/blacklist-logic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin)) {
    return NextResponse.json({ success: false, error: 'Bạn không có quyền chốt điểm danh sự kiện này' }, { status: 403 });
  }

  const supabase = await createClient();

  // 1. Fetch event
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  // 2. Fetch all registrations for this event
  const { data: registrations } = await supabase
    .from('event_registrations')
    .select('*')
    .eq('event_id', resolvedParams.id);

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

  // 3. Fetch all checkins for this event
  const { data: checkIns } = await supabase
    .from('check_ins')
    .select('mssv')
    .eq('event_id', resolvedParams.id);

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

  for (const abs of absent) {
    // Fetch existing penalty record
    const { data: existing } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', abs.mssv)
      .single();

    const currentMissed = existing?.missed_count || 0;
    const newMissed = currentMissed + 1;
    const willBeBlacklisted = newMissed >= MAX_MISSED_STRIKES;

    if (willBeBlacklisted && !existing?.is_blacklisted) {
      newlyBlacklisted.push(abs.mssv);
    }

    await supabase.from('user_penalties').upsert(
      {
        mssv: abs.mssv,
        email: abs.email,
        full_name: abs.full_name || abs.email,
        class_id: abs.class_id || 'PTIT-HCM',
        missed_count: newMissed,
        is_blacklisted: willBeBlacklisted || existing?.is_blacklisted || false,
        blacklisted_at: willBeBlacklisted && !existing?.is_blacklisted ? new Date().toISOString() : existing?.blacklisted_at,
        notes: `Vắng mặt tại sự kiện: ${event.event_name} (${new Date().toLocaleDateString('vi-VN')})`,
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
