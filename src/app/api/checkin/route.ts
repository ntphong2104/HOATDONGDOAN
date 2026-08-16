import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeInput } from '@/lib/security/sanitizer';
import { isEventPastDeadline } from '@/lib/utils/event-logic';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import type { CheckInRequest } from '@/lib/types';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  const supabase = await createClient();

  let userEmail = auth?.email;
  if (!userEmail) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      userEmail = session.user.email;
    }
  }

  if (!userEmail) {
    return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  // Security: Rate limiting 30 scans per 10 seconds per scanner account
  const rateLimit = checkRateLimit(`scanner_${userEmail}`, 30, 10000);
  if (!rateLimit.allowed) {
    return NextResponse.json({
      success: false,
      error: 'Too Many Requests',
      message: `Quét quá nhanh. Vui lòng chờ ${rateLimit.resetInSeconds} giây`,
    }, { status: 429 });
  }
  
  try {
    const body: CheckInRequest = await req.json();
    const { event_id, participate_role } = body;
    const mssv = sanitizeInput(body.mssv).toUpperCase();

    const validRoles = ['participant', 'volunteer', 'organizer'];
    if (!mssv || !event_id || !participate_role || !validRoles.includes(participate_role)) {
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Thông tin điểm danh hoặc vai trò không hợp lệ' }, { status: 400 });
    }

    // Nghiệp vụ: Checker chỉ có quyền điểm danh Người tham gia (participant).
    // Quyền điểm danh Ban tổ chức / Tình nguyện viên thuộc về Quản trị viên sự kiện hoặc Super Admin.
    const isSuperOrEventAdmin = auth?.isSuperAdmin || auth?.isEventAdmin || auth?.tier === 'super_admin' || auth?.tier === 'event_admin';
    if (participate_role !== 'participant' && !isSuperOrEventAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden',
        message: 'Tài khoản Checker chỉ có quyền điểm danh Người tham gia. Quyền điểm danh Ban tổ chức / Tình nguyện viên thuộc về Quản trị viên sự kiện.'
      }, { status: 403 });
    }

    const { data: event } = await supabase
      .from('events')
      .select('event_id, status, event_date, start_time, end_time')
      .eq('event_id', event_id)
      .single();

    if (!event || (!isSuperOrEventAdmin && (event.status !== 'active' || isEventPastDeadline(event)))) {
      if (event && event.status === 'active' && isEventPastDeadline(event)) {
        supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', event_id).then(() => {});
      }
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Sự kiện đã đóng hoặc đã kết thúc điểm danh (quá 1 giờ sau khi kết thúc)' }, { status: 400 });
    }

    if (!event) {
      return NextResponse.json({ success: false, error: 'Not Found', message: 'Sự kiện không tồn tại' }, { status: 404 });
    }

    const { data: student } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .eq('mssv', mssv)
      .single();

    if (!student) {
      return NextResponse.json({ success: false, error: 'Not Found', message: 'Không tìm thấy sinh viên trong hệ thống' }, { status: 404 });
    }

    const { error } = await supabase
      .from('check_ins')
      .insert({
        mssv,
        event_id,
        participate_role,
        checked_by: userEmail
      });

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('check_ins')
          .select('created_at')
          .eq('mssv', mssv)
          .eq('event_id', event_id)
          .single();
          
        return NextResponse.json({ 
          success: false, 
          error: 'Conflict', 
          message: 'Đã điểm danh trước đó',
          checked_at: existing?.created_at
        }, { status: 409 });
      }
      throw error;
    }

    // Synchronize event_registrations attended status
    try {
      await supabase
        .from('event_registrations')
        .upsert(
          {
            event_id,
            email: student.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
            mssv,
            full_name: student.full_name || mssv,
            class_id: student.class_id || 'PTIT',
            role_type: participate_role === 'volunteer' ? 'volunteer' : 'participant',
            attended: true,
          },
          { onConflict: 'event_id,mssv' }
        );
    } catch (syncErr) {
      console.warn('Could not sync event_registrations in checker checkin:', syncErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        student,
        checkin_time: new Date().toISOString()
      }
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: err.message }, { status: 500 });
  }
}
