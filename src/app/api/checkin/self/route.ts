import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifyDynamicToken } from '@/lib/utils/dynamic-qr';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    let email: string | null = null;

    // Check demo cookie
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    if (demoCookie?.value) {
      const demoUser = JSON.parse(demoCookie.value);
      email = demoUser.email;
    }

    // Check Supabase session
    if (!email) {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser?.email) {
        email = authUser.email;
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.email) {
          email = session.user.email;
        }
      }
    }

    if (!email) {
      return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập để điểm danh' }, { status: 401 });
    }

    // Rate Limiting: Max 5 attempts per 10 seconds per student to prevent spam / brute-force
    const rateLimit = checkRateLimit(`checkin_self_${email}`, 5, 10000);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        error: `Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ${rateLimit.resetInSeconds} giây`,
      }, {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.resetInSeconds),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
        },
      });
    }

    // Check maintenance mode
    const { data: maintenanceSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .single();

    if (maintenanceSetting && maintenanceSetting.value === true) {
      return NextResponse.json({
        success: false,
        error: 'Hệ thống đang bảo trì, tạm thời ngưng tiếp nhận điểm danh',
      }, { status: 503 });
    }

    const { token, participate_role = 'Người tham gia' } = await req.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ success: false, error: 'Mã QR không hợp lệ' }, { status: 400 });
    }

    const parts = token.split(':');
    if (parts.length !== 3 && parts.length !== 4) {
      return NextResponse.json({ success: false, error: 'Mã QR sự kiện không đúng định dạng' }, { status: 400 });
    }

    const eventId = parts[0];

    // Verify dynamic token validity and get encoded role
    const verification = verifyDynamicToken(eventId, token);
    if (!verification.valid) {
      return NextResponse.json({
        success: false,
        error: 'Mã QR đã hết hạn. Vui lòng quét lại mã mới nhất trên màn hình',
      }, { status: 400 });
    }

    const assignedRole = verification.role === 'volunteer' 
      ? 'Cộng tác viên' 
      : verification.role === 'organizer' 
      ? 'Ban tổ chức' 
      : 'Người tham gia';

    // Find student info
    let mssv = extractMSSV(email);
    const { data: studentUser } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .eq('email', email)
      .single();

    if (studentUser) {
      mssv = studentUser.mssv;
    }

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy thông tin MSSV của bạn' }, { status: 400 });
    }

    // Check event status
    const { data: event, error: eventErr } = await supabase
      .from('events')
      .select('event_id, event_name, status, is_active, event_date, start_time, end_time')
      .eq('event_id', eventId)
      .single();

    if (eventErr || !event) {
      return NextResponse.json({ success: false, error: 'Sự kiện không tồn tại' }, { status: 404 });
    }

    if (event.status === 'closed' || event.is_active === false || isEventPastDeadline(event)) {
      if (event.status === 'active' && isEventPastDeadline(event)) {
        supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', eventId).then(() => {});
      }
      return NextResponse.json({ success: false, error: 'Sự kiện này đã kết thúc và quá hạn điểm danh (sau 1 giờ từ khi kết thúc)' }, { status: 400 });
    }

    // Check duplicate check-in
    const { data: existingCheckin } = await supabase
      .from('check_ins')
      .select('id, created_at')
      .eq('event_id', eventId)
      .eq('mssv', mssv)
      .single();

    if (existingCheckin) {
      return NextResponse.json({
        success: false,
        is_duplicate: true,
        error: `Bạn đã điểm danh sự kiện "${event.event_name}" trước đó rồi!`,
      }, { status: 409 });
    }

    // Insert check-in record
    const { data: checkinRecord, error: checkinErr } = await supabase
      .from('check_ins')
      .insert({
        event_id: eventId,
        mssv,
        participate_role: assignedRole,
        checked_by: 'Mã QR Động (Tự quét)',
      })
      .select()
      .single();

    if (checkinErr) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Điểm danh thành công!',
      data: {
        event_name: event.event_name,
        mssv,
        full_name: studentUser?.full_name || mssv,
        class_id: studentUser?.class_id || '',
        checkin_time: checkinRecord.created_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
