import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyDynamicToken } from '@/lib/utils/dynamic-qr';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isEventPastDeadline, isEventTooEarlyForCheckin, getEarliestCheckinTime } from '@/lib/utils/event-logic';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    let email = auth?.email || null;

    if (!email) {
      try {
        const cookieStore = await cookies();
        const demoCookie = cookieStore.get('demo_session');
        if (demoCookie?.value) {
          const parsed = parseDemoCookie(demoCookie.value);
          email = parsed?.email || null;
        }
      } catch {}
    }

    if (!email) {
      return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập để điểm danh' }, { status: 401 });
    }
    const supabase = await createAdminClient();

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

    const assignedRole =
      verification.role === 'volunteer' || verification.role === 'organizer'
        ? verification.role
        : 'participant';

    // Find student info
    let mssv = extractMSSV(email);
    const { data: studentUser } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .eq('email', email)
      .single();

    if (studentUser?.mssv) {
      mssv = studentUser.mssv;
    } else if (!mssv && email) {
      mssv = email.split('@')[0].toUpperCase();
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

    if (typeof isEventTooEarlyForCheckin === 'function' && isEventTooEarlyForCheckin(event, Date.now(), 15)) {
      const earliestTime = (typeof getEarliestCheckinTime === 'function' ? getEarliestCheckinTime(event, 15) : null) || '15 phút trước giờ diễn ra';
      return NextResponse.json({
        success: false,
        error: `⏳ Chưa đến giờ điểm danh! Cổng điểm danh sẽ tự động mở lúc ${earliestTime} (trước giờ bắt đầu 15 phút).`,
      }, { status: 400 });
    }

    // Check if student has registered for this event
    const { data: registration } = await supabase
      .from('event_registrations')
      .select('id, role_type, attended')
      .eq('event_id', eventId)
      .eq('mssv', mssv)
      .maybeSingle();

    if (!registration) {
      return NextResponse.json({
        success: false,
        error: `Bạn chưa đăng ký tham gia sự kiện "${event.event_name}". Vui lòng đăng ký trước khi điểm danh!`,
        not_registered: true,
      }, { status: 400 });
    }

    const effectiveRole =
      assignedRole !== 'participant'
        ? assignedRole
        : registration.role_type === 'volunteer'
        ? 'volunteer'
        : 'participant';

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
        participate_role: effectiveRole,
        checked_by: 'Mã QR Động (Tự quét)',
      })
      .select()
      .single();

    if (checkinErr) {
      console.error('Checkin DB insert error:', checkinErr);
      if (checkinErr.code === '23505') {
        return NextResponse.json({
          success: false,
          is_duplicate: true,
          error: `Bạn đã điểm danh sự kiện "${event.event_name}" trước đó rồi!`,
        }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: 'Lỗi ghi nhận điểm danh: ' + (checkinErr.message || 'Lỗi hệ thống') }, { status: 500 });
    }

    // Synchronize event_registrations attended status
    try {
      await supabase
        .from('event_registrations')
        .upsert(
          {
            event_id: eventId,
            email: email,
            mssv: mssv,
            full_name: studentUser?.full_name || mssv,
            class_id: studentUser?.class_id || 'PTIT',
            role_type: assignedRole === 'volunteer' ? 'volunteer' : 'participant',
            attended: true,
          },
          { onConflict: 'event_id,mssv' }
        );
    } catch (syncErr) {
      console.warn('Could not sync event_registrations:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Điểm danh thành công!',
      data: {
        event_name: event.event_name,
        mssv,
        full_name: studentUser?.full_name || mssv,
        class_id: studentUser?.class_id || '',
        checkin_time: checkinRecord?.created_at || new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Self checkin catch error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}
