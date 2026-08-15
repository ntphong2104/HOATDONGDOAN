import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    // Verify active delegation
    const { data: delegate } = await supabase
      .from('class_delegates')
      .select('*')
      .or(`email.eq.${auth.email},mssv.eq.${auth.email.split('@')[0].toUpperCase()}`)
      .eq('is_active', true)
      .gt('expires_at', now)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!delegate) {
      return NextResponse.json(
        { success: false, error: 'Quyền tra cứu Ban cán sự lớp của bạn đã hết hạn' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const mssv = searchParams.get('mssv');

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu MSSV cần tra cứu' }, { status: 400 });
    }

    const cleanMssv = decodeURIComponent(mssv).trim().toUpperCase();

    // Security Check: Verify that target student belongs to the SAME class as delegate
    const { data: targetStudent, error: studentErr } = await supabase
      .from('users')
      .select('*')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    if (studentErr || !targetStudent) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy sinh viên' }, { status: 404 });
    }

    if (targetStudent.class_id !== delegate.class_id) {
      return NextResponse.json(
        { success: false, error: `Bạn chỉ có quyền tra cứu sinh viên trong lớp ${delegate.class_id}` },
        { status: 403 }
      );
    }

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

    const formattedHistory = (checkIns || []).map((ci: any) => ({
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
    }));

    return NextResponse.json({
      success: true,
      data: {
        student: targetStudent,
        total_attended: formattedHistory.length,
        history: formattedHistory,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
