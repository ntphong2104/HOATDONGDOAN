import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyDynamicToken } from '@/lib/utils/dynamic-qr';
import { extractMSSV, isValidMSSV } from '@/lib/utils/extract-mssv';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import {
  isEventPastDeadline,
  isEventTooEarlyForCheckin,
  getEarliestCheckinTime,
  isApprovedVolunteer,
  parseJsonSetting,
} from '@/lib/utils/event-logic';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, getSessionCheckIns, saveSessionCheckIn, checkinAtomic, getRegistrationExtras } from '@/lib/constants/event-meta-store';
import { getUserProfileExtraWithFallback } from '@/lib/constants/user-profile-store';
import { runWithConcurrency, QueueTimeoutError } from '@/lib/utils/concurrency-queue';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import { getGraduatedCohorts, getGraduatedBlockReason } from '@/lib/utils/graduated-cohorts';
import { getMasterStudentByMssv } from '@/lib/utils/student-profile';

// In-memory cache for event metadata during high-concurrency check-in spikes (TTL: 5 seconds, bounded)
const MAX_SELF_CHECKIN_CACHE = 200;
const eventCheckinCache = new Map<string, { event: any; meta: any; expiresAt: number }>();

// In-memory maintenance cache (TTL: 30 seconds)
let selfCheckinMaintenanceCache = { enabled: false, timestamp: 0 };

export async function POST(req: Request) {
  try {
    return await runWithConcurrency('self_checkin', 35, () => handleSelfCheckinPost(req), 20_000);
  } catch (err: any) {
    if (err instanceof QueueTimeoutError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

async function handleSelfCheckinPost(req: Request) {
  try {
    const auth = await getAuthContext();
    const email = auth?.email || null;

    if (!email) {
      return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập để điểm danh' }, { status: 401 });
    }
    const supabase = await createAdminClient();

    // Rate Limiting: 15 attempts per 10 seconds per student (prevent blocking students if camera scans multiple frames)
    const rateLimit = checkRateLimit(`checkin_self_${email}`, 15, 10000);
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

    // Check maintenance mode with 30s in-memory cache to save database queries
    const now = Date.now();
    let isMaintenance = selfCheckinMaintenanceCache.enabled;
    if (now - selfCheckinMaintenanceCache.timestamp >= 30000) {
      try {
        const { data: maintenanceSetting } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single();

        const val = parseJsonSetting<any>(maintenanceSetting?.value);
        isMaintenance =
          val === true ||
          val === 'true' ||
          (Boolean(val) && typeof val === 'object' && (val.enabled === true || val.enabled === 'true'));
        selfCheckinMaintenanceCache = { enabled: isMaintenance, timestamp: now };
      } catch {}
    }

    if (isMaintenance) {
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

    // Use in-memory event cache (5s TTL) during high-concurrency check-in rushes
    let cachedEventInfo = eventCheckinCache.get(eventId);
    if (!cachedEventInfo || cachedEventInfo.expiresAt <= Date.now()) {
      const [{ data: fetchedEvent }, fetchedMeta] = await Promise.all([
        supabase
          .from('events')
          .select('event_id, event_name, status, is_active, event_date, start_time, end_time')
          .eq('event_id', eventId)
          .maybeSingle(),
        getEventMeta(supabase, eventId),
      ]);
      if (fetchedEvent) {
        if (!eventCheckinCache.has(eventId) && eventCheckinCache.size >= MAX_SELF_CHECKIN_CACHE) {
          const oldestKey = eventCheckinCache.keys().next().value;
          if (oldestKey !== undefined) eventCheckinCache.delete(oldestKey);
        }
        cachedEventInfo = {
          event: fetchedEvent,
          meta: fetchedMeta,
          expiresAt: Date.now() + 5000,
        };
        eventCheckinCache.set(eventId, cachedEventInfo);
      }
    }

    const event = cachedEventInfo?.event;
    const meta = cachedEventInfo?.meta || {};

    const { data: studentUser } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .eq('email', email)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ success: false, error: 'Sự kiện không tồn tại' }, { status: 404 });
    }

    if (studentUser?.mssv) {
      mssv = studentUser.mssv;
    } else if (!mssv && email) {
      mssv = email.split('@')[0].toUpperCase();
    }

    if (!mssv || !isValidMSSV(mssv)) {
      return NextResponse.json({ success: false, error: 'Tài khoản không có MSSV sinh viên hợp lệ để tự điểm danh' }, { status: 400 });
    }
    mssv = mssv.trim().toUpperCase();

    // Check phone number - require phone to be updated before checkin
    const profileExtra = await getUserProfileExtraWithFallback(supabase, email || '', mssv);
    const userPhone = profileExtra?.phone || '';
    if (!userPhone || userPhone.trim().length < 8) {
      return NextResponse.json({
        success: false,
        error: '📱 Bạn chưa cập nhật Số Điện Thoại / Zalo!\n\n👉 Cách cập nhật:\n1. Bấm vào ảnh đại diện (góc trên bên phải)\n2. Chọn "Hồ Sơ Cá Nhân"\n3. Nhập Số Điện Thoại / Zalo của bạn\n4. Bấm "Lưu"\n5. Quay lại quét mã QR để điểm danh\n\n⚠️ Đây là yêu cầu bắt buộc để BTC có thể liên hệ bạn khi cần.',
        require_phone: true,
      }, { status: 400 });
    }

    if (event.status === 'closed' || event.is_active === false) {
      return NextResponse.json({ success: false, error: 'Sự kiện này đã đóng điểm danh' }, { status: 400 });
    }

    // Retrieve event sessions and check session-specific time
    const sessions = meta.sessions || [];
    const matchedSession = sessions.find((s: any) => s.id === targetSessionId) || {
      id: 'main',
      name: 'Buổi chính',
      session_date: event.event_date || getVietnamDateString(0),
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

    const isInternalSession = matchedSession?.session_type === 'internal';

    // Check blacklist, graduated cohorts, registrations, and extras in parallel (even when require_registration === false)
    const [
      { data: penalty },
      graduatedRules,
      { data: registration },
      regExtras,
      { data: eventRoleRow },
    ] = await Promise.all([
      supabase.from('user_penalties').select('is_blacklisted, missed_count').eq('mssv', mssv).maybeSingle(),
      getGraduatedCohorts(supabase),
      supabase
        .from('event_registrations')
        .select('id, role_type, attended')
        .eq('event_id', eventId)
        .eq('mssv', mssv)
        .maybeSingle(),
      isInternalSession ? getRegistrationExtras(supabase, eventId) : Promise.resolve(null),
      isInternalSession
        ? supabase
            .from('event_roles')
            .select('role_type')
            .eq('event_id', eventId)
            .ilike('email', email.trim())
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (penalty?.is_blacklisted) {
      return NextResponse.json({
        success: false,
        error: `Tài khoản của bạn (${mssv}) đang bị KHÓA (Blacklist) do vắng mặt ${penalty.missed_count || 3} lần. Vui lòng liên hệ Văn phòng Đoàn để được xem xét mở khóa.`,
        is_blacklisted: true,
      }, { status: 403 });
    }

    if (graduatedRules.length > 0) {
      const graduatedReason = getGraduatedBlockReason(mssv, studentUser?.class_id || null, graduatedRules);
      if (graduatedReason) {
        return NextResponse.json({
          success: false,
          error: graduatedReason,
          is_graduated: true,
        }, { status: 403 });
      }
    }

    const extra = regExtras?.[mssv] || null;
    const isAcceptedVolunteer =
      typeof isApprovedVolunteer === 'function'
        ? isApprovedVolunteer(registration?.role_type, extra)
        : Boolean(
            registration?.role_type === 'volunteer' &&
              extra?.review_status === 'accepted'
          );
    const isStaff = Boolean(
      auth?.isSuperAdmin ||
        auth?.tier === 'super_admin' ||
        auth?.tier === 'youth_union' ||
        eventRoleRow?.role_type === 'event_admin' ||
        eventRoleRow?.role_type === 'checker' ||
        registration?.role_type === 'organizer'
    );

    if (isInternalSession && !isStaff && !isAcceptedVolunteer) {
      return NextResponse.json({
        success: false,
        error: `🚫 Ca "${matchedSession.name}" là ca nội bộ dành cho Ban Tổ Chức & Cộng Tác Viên đã duyệt.`,
      }, { status: 403 });
    }

    if (!isInternalSession && meta.require_registration !== false && !registration) {
      return NextResponse.json({
        success: false,
        error: 'Sự kiện này yêu cầu đăng ký trước khi điểm danh. Vui lòng đăng ký tại cổng đăng ký sự kiện trước.',
        require_registration: true,
      }, { status: 400 });
    }

    // Ensure student exists in `users` before checkin_atomic inserts FK-bound check-in rows
    if (!studentUser) {
      const masterStudent = getMasterStudentByMssv(mssv);
      try {
        await supabase.from('users').upsert(
          {
            mssv,
            email: email.toLowerCase(),
            full_name: masterStudent?.full_name || mssv,
            class_id: masterStudent?.class_id || 'PTIT-HCM',
            tier: 'user',
          },
          { onConflict: 'mssv', ignoreDuplicates: true }
        );
      } catch {}
    }

    const effectiveRole = isInternalSession
      ? isStaff
        ? 'organizer'
        : 'volunteer'
      : assignedRole !== 'participant'
      ? assignedRole
      : isAcceptedVolunteer
      ? 'volunteer'
      : registration?.role_type === 'organizer'
      ? 'organizer'
      : 'participant';

    // ── Sức chứa chỉ áp dụng cho NGƯỜI THAM GIA vãng lai (không có đăng ký) ──
    // Người đã đăng ký đã được giữ chỗ lúc đăng ký; CTV/BTC không tính vào sức chứa khán giả.
    const maxParticipants = meta.max_participants || 0;
    if (maxParticipants > 0 && effectiveRole === 'participant' && !registration) {
      const { count: participantCheckins } = await supabase
        .from('check_ins')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('participate_role', 'participant');

      if ((participantCheckins || 0) >= maxParticipants) {
        return NextResponse.json({
          success: false,
          error: `🚫 Sự kiện đã ĐẦY (${participantCheckins}/${maxParticipants} người tham gia). Không thể điểm danh thêm.`,
        }, { status: 400 });
      }
    }

    // ── Try Atomic Check-in via RPC (duplicate + insert in 1 transaction) ──
    const atomicResult = await checkinAtomic(supabase, {
      event_id: eventId,
      session_id: targetSessionId,
      session_name: matchedSession.name,
      mssv,
      role: effectiveRole,
      checked_by: 'Mã QR Động (Tự quét)',
      max_participants: 0, // sức chứa đã kiểm tra ở trên theo đúng vai trò
    });

    if (atomicResult.error === 'RPC_NOT_AVAILABLE') {
      // Fallback: RPC not deployed yet, use old method

      // Duplicate check + save
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

      await saveSessionCheckIn(supabase, {
        event_id: eventId,
        session_id: targetSessionId,
        session_name: matchedSession.name,
        mssv,
        participate_role: effectiveRole,
        checked_at: new Date().toISOString(),
        checked_by: 'Mã QR Động (Tự quét)',
      });

      try {
        await supabase
          .from('check_ins')
          .upsert(
            { event_id: eventId, mssv, participate_role: effectiveRole, checked_by: `Mã QR Động: ${matchedSession.name}` },
            { onConflict: 'event_id,mssv' }
          );
      } catch {}

      try {
        await supabase
          .from('event_registrations')
          .update({ attended: true })
          .eq('event_id', eventId)
          .eq('mssv', mssv);
      } catch {}
    } else if (!atomicResult.success) {
      // RPC returned an error (duplicate or capacity full)
      const status = atomicResult.is_duplicate ? 409 : 400;
      return NextResponse.json({
        success: false,
        is_duplicate: atomicResult.is_duplicate || false,
        error: atomicResult.is_duplicate
          ? `Bạn đã điểm danh "${matchedSession.name}" trước đó rồi! Mỗi ca/buổi chỉ được điểm danh 1 lần duy nhất.`
          : atomicResult.error || 'Lỗi điểm danh',
      }, { status });
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
