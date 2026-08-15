import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mssv: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'event_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { mssv } = await params;
    const cleanMssv = decodeURIComponent(mssv).trim().toUpperCase();

    const supabase = await createClient();

    // Fetch user info
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('mssv', cleanMssv)
      .single();

    // Fetch check-ins
    const { data: checkIns, error: checkInErr } = await supabase
      .from('check_ins')
      .select(`
        id,
        event_id,
        participate_role,
        created_at,
        events (
          id,
          event_name,
          event_date,
          start_time,
          end_time,
          semester,
          created_by
        )
      `)
      .eq('mssv', cleanMssv)
      .order('created_at', { ascending: false });

    if (checkInErr) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    // Fetch penalties / missed events
    const { data: penalty } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', cleanMssv)
      .single();

    const formattedHistory = (checkIns || []).map((ci: any) => ({
      id: ci.id,
      event_id: ci.event_id,
      event_name: ci.events?.event_name || 'Không rõ sự kiện',
      event_date: ci.events?.event_date,
      start_time: ci.events?.start_time,
      end_time: ci.events?.end_time,
      semester: ci.events?.semester || 'Không rõ',
      organizer: ci.events?.created_by || 'Đoàn trường',
      participate_role: ci.participate_role,
      checkin_time: ci.created_at,
    }));

    return NextResponse.json({
      success: true,
      data: {
        user: user || { mssv: cleanMssv, full_name: 'Chưa có thông tin', class_id: 'N/A' },
        total_attended: formattedHistory.length,
        penalty: penalty || { missed_count: 0, is_blacklisted: false },
        history: formattedHistory,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
