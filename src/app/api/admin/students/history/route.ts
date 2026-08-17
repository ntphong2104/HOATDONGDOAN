import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'event_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const mssv = searchParams.get('mssv');

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
    }

    const cleanMssv = decodeURIComponent(mssv).trim().toUpperCase();
    const supabase = await createClient();

    // 1. Fetch student info
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    // 2. Fetch check-ins with event details
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
      console.error('Check-in fetch error:', checkInErr);
    }

    // Also fetch attended event registrations
    const { data: attendedRegs } = await supabase
      .from('event_registrations')
      .select(`
        id,
        event_id,
        role_type,
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
      .eq('attended', true);

    const historyMap = new Map<string, any>();

    (checkIns || []).forEach((ci: any) => {
      historyMap.set(ci.event_id || String(ci.id), {
        id: ci.id,
        event_id: ci.event_id,
        event_name: ci.events?.event_name || 'Sự kiện Đoàn Thanh Niên',
        event_date: ci.events?.event_date,
        start_time: ci.events?.start_time,
        end_time: ci.events?.end_time,
        semester: ci.events?.semester || 'Chưa phân kỳ',
        organizer: ci.events?.created_by || 'Đoàn trường',
        participate_role: ci.participate_role || 'participant',
        checkin_time: ci.created_at,
      });
    });

    (attendedRegs || []).forEach((ar: any) => {
      const key = ar.event_id || String(ar.id);
      if (!historyMap.has(key)) {
        historyMap.set(key, {
          id: ar.id,
          event_id: ar.event_id,
          event_name: ar.events?.event_name || 'Sự kiện Đoàn Thanh Niên',
          event_date: ar.events?.event_date,
          start_time: ar.events?.start_time,
          end_time: ar.events?.end_time,
          semester: ar.events?.semester || 'Chưa phân kỳ',
          organizer: ar.events?.created_by || 'Đoàn trường',
          participate_role: ar.role_type === 'volunteer' ? 'volunteer' : 'participant',
          checkin_time: ar.created_at,
        });
      }
    });

    const formattedHistory = Array.from(historyMap.values());

    // 3. Fetch penalty status
    const { data: penalty } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      data: {
        user: user || {
          mssv: cleanMssv,
          full_name: 'Sinh viên PTIT',
          class_id: 'N/A',
          email: `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`,
        },
        total_attended: formattedHistory.length,
        penalty: penalty || { missed_count: 0, is_blacklisted: false },
        history: formattedHistory,
      },
    });
  } catch (err: any) {
    console.error('Student history API error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
