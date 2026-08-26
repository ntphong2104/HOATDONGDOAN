import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyDynamicToken } from '@/lib/utils/dynamic-qr';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isEventPastDeadline, isEventTooEarlyForCheckin, getEarliestCheckinTime } from '@/lib/utils/event-logic';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import { getEventMeta, getSessionCheckIns, saveSessionCheckIn, type EventSession } from '@/lib/constants/event-meta-store';
import { getUserProfileExtra } from '@/lib/constants/user-profile-store';

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
    if (parts.length < 3) {
      return NextResponse.json({ success: false, error: 'Mã QR sự kiện không đúng định dạng' }, { status: 400 });
    }

    const eventId = parts[0];

    // Verify dynamic token validity and get encoded role & sessionId
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

    const targetSessionId = verification.sessionId || 'main';

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

    // Check phone number - require phone to be updated before checkin
    const profileExtra = getUserProfileExtra(email || '') || getUserProfileExtra(mssv);
    const userPhone = profileExtra?.phone || '';
    if (!userPhone || userPhone.trim().length < 8) {
      return NextResponse.json({
        success: false,
        error: 'Bạn chưa cập nhật Số Điện Thoại / Zalo. Vui lòng cập nhật SĐT trong hồ sơ cá nhân trước khi điểm danh.',
        require_phone: true,
      }, { status: 400 });
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

    if (event.status === 'closed' || event.is_active === false) {
      return NextResponse.json({ success: false, error: 'Sự kiện này đã đóng điểm danh' }, { status: 400 });
    }

    // Retrieve event sessions and check session-specific time
    const meta = await getEventMeta(supabase, eventId);
    const sessions = meta.sessions || [];
    const matchedSession = sessions.find((s) => s.id === targetSessionId) || {
      id: 'main',
      name: 'Buổi chính',
      session_date: event.event_date || new Date().toISOString().split('T')[0],
      start_time: event.start_time || '07:30',
      end_time: event.end_time || '11:30',
    };

    const sessionSchedule = {
      event_date: matchedSession.session_date || event.event_date,
      start_time: matchedSession.start_time || event.start_time,
      end_time: matchedSession.end_time || event.end_time,
      status: event.status,
    };

    if (isEventPastDeadline(sessionSchedule)) {
      return NextResponse.json({
        success: false,
        error: `Ca "${matchedSession.name}" đã kết thúc và quá hạn điểm danh (sau 1 giờ từ khi kết thúc ca).`,
      }, { status: 400 });
    }

    if (typeof isEventTooEarlyForCheckin === 'function' && isEventTooEarlyForCheckin(sessionSchedule, Date.now(), 15)) {
      const earliestTime = (typeof getEarliestCheckinTime === 'function' ? getEarliestCheckinTime(sessionSchedule, 15) : null) || '15 phút trước giờ diễn ra';
      return NextResponse.json({
        success: false,
        error: `⏳ Chưa đến giờ điểm danh của "${matchedSession.name}"! Cổng điểm danh sẽ tự động mở lúc ${earliestTime} (trước giờ bắt đầu 15 phút).`,
      }, { status: 400 });
    }

    // Check if student has registered for this event
    let registration = null;
    if (meta.require_registration !== false) {
      const { data: regData } = await supabase
        .from('event_registrations')
        .select('id, role_type, attended')
        .eq('event_id', eventId)
        .eq('mssv', mssv)
        .maybeSingle();
      
      registration = regData;

      if (!registration) {
        return NextResponse.json({
          success: false,
          error: 'Sự kiện này yêu cầu đăng ký trước khi điểm danh. Vui lòng đăng ký tại cổng đăng ký sự kiện trước.',
          require_registration: true,
        }, { status: 400 });
      }
    } else {
      const { data: regData } = await supabase
        .from('event_registrations')
        .select('id, role_type, attended')
        .eq('event_id', eventId)
        .eq('mssv', mssv)
        .maybeSingle();
      registration = regData;
    }

    const effectiveRole =
      assignedRole !== 'participant'
        ? assignedRole
        : registration?.role_type === 'volunteer'
        ? 'volunteer'
        : 'participant';

    // 🔒 STRICT DUPLICATE CHECK PER SESSION:
    // Check if student has already checked in for THIS specific session
    const existingSessionCheckins = await getSessionCheckIns(supabase, eventId);
    const hasCheckedInThisSession = existingSessionCheckins.some(
      (c) => c.session_id === targetSessionId && c.mssv.toUpperCase() === mssv.toUpperCase()
    );

    if (hasCheckedInThisSession) {
      return NextResponse.json({
        success: false,
        is_duplicate: true,
        error: `Bạn đã điểm danh "${matchedSession.name}" trước đó rồi! Mỗi ca/buổi chỉ được điểm danh 1 lần duy nhất.`,
      }, { status: 409 });
    }

    // Record session check-in
    await saveSessionCheckIn(supabase, {
      event_id: eventId,
      session_id: targetSessionId,
      session_name: matchedSession.name,
      mssv,
      participate_role: effectiveRole,
      checked_at: new Date().toISOString(),
      checked_by: 'Mã QR Động (Tự quét)',
    });

    // Also record/update global check_ins table (ignore 23505 duplicate if attended previous session)
    try {
      await supabase
        .from('check_ins')
        .upsert(
          {
            event_id: eventId,
            mssv,
            participate_role: effectiveRole,
            checked_by: `Mã QR Động: ${matchedSession.name}`,
          },
          { onConflict: 'event_id,mssv' }
        );
    } catch {}

    // Synchronize event_registrations attended status
    try {
      await supabase
        .from('event_registrations')
        .update({ attended: true })
        .eq('event_id', eventId)
        .eq('mssv', mssv);
    } catch (syncErr) {
      console.warn('Could not sync event_registrations:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message: `Điểm danh thành công: ${matchedSession.name}!`,
      data: {
        event_name: event.event_name,
        session_name: matchedSession.name,
        mssv,
        full_name: studentUser?.full_name || mssv,
        class_id: studentUser?.class_id || '',
        checkin_time: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Self checkin catch error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}
