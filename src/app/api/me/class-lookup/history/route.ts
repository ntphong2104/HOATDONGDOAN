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

    const isElevated = auth.isSuperAdmin || (auth.tier && auth.tier !== 'user');
    let delegateClassId: string | null = null;

    if (!isElevated) {
      // Verify active delegation for student delegates
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
      delegateClassId = delegate.class_id;
    }

    const { searchParams } = new URL(request.url);
    const mssv = searchParams.get('mssv');

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu MSSV cần tra cứu' }, { status: 400 });
    }

    const cleanMssv = decodeURIComponent(mssv).trim().toUpperCase();

    // Fetch target student profile
    const { data: targetStudent, error: studentErr } = await supabase
      .from('users')
      .select('mssv, full_name, class_id, email')
      .eq('mssv', cleanMssv)
      .maybeSingle();

    // Class boundary check for class delegates
    if (delegateClassId && targetStudent?.class_id) {
      if (targetStudent.class_id.trim().toUpperCase() !== delegateClassId.trim().toUpperCase()) {
        return NextResponse.json(
          { success: false, error: `Bạn chỉ có quyền tra cứu sinh viên trong lớp ${delegateClassId}` },
          { status: 403 }
        );
      }
    }

    // Fetch check-in records for this MSSV
    const { data: checkIns, error: checkInErr } = await supabase
      .from('check_ins')
      .select(`
        id,
        event_id,
        mssv,
        participate_role,
        created_at,
        events (
          event_id,
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
      console.error('Error fetching check-ins for delegate lookup:', checkInErr);
      return NextResponse.json({ success: false, error: 'Lỗi khi tải lịch sử điểm danh' }, { status: 500 });
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
        student: {
          mssv: cleanMssv,
          full_name: targetStudent?.full_name || cleanMssv,
          class_id: targetStudent?.class_id || delegateClassId || '',
          email: targetStudent?.email || `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`,
        },
        total_attended: formattedHistory.length,
        history: formattedHistory,
      },
    });
  } catch (err: any) {
    console.error('Unexpected error in class-lookup history:', err);
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
