import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { sanitizeInput } from '@/lib/security/sanitizer';
import { isEventPastDeadline, isEventTooEarlyForCheckin, getEarliestCheckinTime } from '@/lib/utils/event-logic';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, getSessionCheckIns, saveSessionCheckIn } from '@/lib/constants/event-meta-store';
import { getUserProfileExtra } from '@/lib/constants/user-profile-store';
import type { CheckInRequest } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await getAuthContext();
  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  let userEmail = auth?.email;
  if (!userEmail) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.email) {
      userEmail = session.user.email;
    }
  }

  if (!userEmail) {
    return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập để thực hiện điểm danh' }, { status: 401 });
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
    const { event_id, participate_role = 'participant', session_id } = body;
    const mssv = sanitizeInput(body.mssv || '').toUpperCase().trim();

    const validRoles = ['participant', 'volunteer', 'organizer'];
    if (!mssv || !event_id || !validRoles.includes(participate_role)) {
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Thông tin điểm danh hoặc MSSV không hợp lệ' }, { status: 400 });
    }

    const isSuperOrEventAdmin =
      auth?.isSuperAdmin ||
      auth?.isEventAdmin ||
      auth?.tier === 'super_admin' ||
      auth?.tier === 'youth_union' ||
      auth?.tier === 'event_admin';

    if (participate_role !== 'participant' && !isSuperOrEventAdmin) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden',
        message: 'Tài khoản Checker chỉ có quyền điểm danh Người tham gia. Quyền điểm danh Ban tổ chức / Tình nguyện viên thuộc về Quản trị viên sự kiện.'
      }, { status: 403 });
    }

    const [
      { data: event, error: eventErr },
      { data: student },
      meta
    ] = await Promise.all([
      supabase
        .from('events')
        .select('event_id, event_name, status, event_date, start_time, end_time')
        .eq('event_id', event_id)
        .maybeSingle(),
      supabase
        .from('users')
        .select('mssv, full_name, class_id, email')
        .eq('mssv', mssv)
        .maybeSingle(),
      getEventMeta(supabase, event_id)
    ]);

    if (!event) {
      return NextResponse.json({ success: false, error: 'Not Found', message: 'Sự kiện không tồn tại' }, { status: 404 });
    }

    if (!isSuperOrEventAdmin && (event.status !== 'active' || isEventPastDeadline(event))) {
      if (event.status === 'active' && isEventPastDeadline(event)) {
        supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', event_id).then(() => {});
      }
      return NextResponse.json({ success: false, error: 'Bad Request', message: 'Sự kiện đã đóng hoặc đã kết thúc điểm danh (quá 1 giờ sau khi kết thúc)' }, { status: 400 });
    }

    if (!isSuperOrEventAdmin && typeof isEventTooEarlyForCheckin === 'function' && isEventTooEarlyForCheckin(event, Date.now(), 15)) {
      const earliestTime = (typeof getEarliestCheckinTime === 'function' ? getEarliestCheckinTime(event, 15) : null) || '15 phút trước giờ diễn ra';
      return NextResponse.json({
        success: false,
        error: 'Bad Request',
        message: `⏳ Chưa đến giờ điểm danh! Cổng điểm danh sẽ tự động mở lúc ${earliestTime} (trước giờ bắt đầu 15 phút).`,
      }, { status: 400 });
    }

    let finalStudent = student;
    if (!finalStudent) {
      if (isSuperOrEventAdmin) {
        finalStudent = {
          mssv,
          full_name: mssv,
          class_id: 'PTIT-HCM',
          email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
        };
        try {
          await supabase.from('users').upsert(finalStudent, { onConflict: 'mssv' });
        } catch {}
      } else {
        return NextResponse.json({
          success: false,
          error: 'Not Found',
          message: `Không tìm thấy sinh viên có MSSV "${mssv}" trong hệ thống`,
        }, { status: 404 });
      }
    }

    // Check phone number requirement
    const studentEmail = finalStudent.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`;
    const profileExtra = getUserProfileExtra(studentEmail) || getUserProfileExtra(mssv);
    const studentPhone = profileExtra?.phone || '';
    if (!studentPhone || studentPhone.trim().length < 8) {
      return NextResponse.json({
        success: false,
        error: `Sinh viên ${finalStudent.full_name || mssv} (${mssv}) chưa cập nhật SĐT. Yêu cầu sinh viên cập nhật SĐT trong hồ sơ cá nhân trước khi điểm danh.`,
        require_phone: true,
      }, { status: 400 });
    }

    // ── Determine which session to check in for ──
    const sessions = meta.sessions || [];

    // Auto-detect current session if not specified and event has multiple sessions
    let targetSessionId = session_id || '';
    let matchedSessionName = 'Buổi chính';

    if (sessions.length > 0) {
      if (targetSessionId) {
        // Explicit session_id provided
        const matched = sessions.find((s) => s.id === targetSessionId);
        if (matched) {
          matchedSessionName = matched.name;
        }
      } else {
        // Auto-detect: find the session whose time range covers "now"
        const now = new Date();
        const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        let bestSession = sessions[0]; // fallback to first session
        for (const s of sessions) {
          const sStart = s.start_time || '00:00';
          const sEnd = s.end_time || '23:59';
          // Give 1-hour buffer after end_time for late check-ins
          const endHour = parseInt(sEnd.split(':')[0], 10) + 1;
          const bufferedEnd = `${String(Math.min(endHour, 23)).padStart(2, '0')}:${sEnd.split(':')[1] || '00'}`;
          if (nowHHMM >= sStart && nowHHMM <= bufferedEnd) {
            bestSession = s;
            break;
          }
        }
        targetSessionId = bestSession.id;
        matchedSessionName = bestSession.name;
      }
    }

    // ── Session-aware duplicate check ──
    if (targetSessionId && sessions.length > 0) {
      // Multi-session event: check duplicate per session (allows check-in across sessions)
      const existingSessionCheckins = await getSessionCheckIns(supabase, event_id);
      const hasCheckedInThisSession = existingSessionCheckins.some(
        (c) => c.session_id === targetSessionId && c.mssv.toUpperCase() === mssv.toUpperCase()
      );

      if (hasCheckedInThisSession) {
        return NextResponse.json({
          success: false,
          error: 'Conflict',
          message: `Sinh viên ${mssv} đã được điểm danh "${matchedSessionName}" trước đó rồi!`,
          is_duplicate: true,
          session_name: matchedSessionName,
        }, { status: 409 });
      }

      // Record session check-in
      await saveSessionCheckIn(supabase, {
        event_id,
        session_id: targetSessionId,
        session_name: matchedSessionName,
        mssv,
        participate_role,
        checked_at: new Date().toISOString(),
        checked_by: body.checked_by || userEmail || 'Scanner',
      });

      // Also upsert into global check_ins table (won't fail on duplicate)
      try {
        await supabase
          .from('check_ins')
          .upsert(
            {
              event_id,
              mssv,
              participate_role,
              checked_by: body.checked_by || userEmail || `Scanner: ${matchedSessionName}`,
            },
            { onConflict: 'event_id,mssv' }
          );
      } catch {}
    } else {
      // Single-session event: use standard insert with duplicate detection
      const { error: insertError } = await supabase
        .from('check_ins')
        .insert({
          mssv,
          event_id,
          participate_role,
          checked_by: body.checked_by || userEmail || 'Điểm danh thủ công',
        });

      if (insertError) {
        if (insertError.code === '23505') {
          const { data: existing } = await supabase
            .from('check_ins')
            .select('created_at')
            .eq('mssv', mssv)
            .eq('event_id', event_id)
            .maybeSingle();

          return NextResponse.json({ 
            success: false, 
            error: 'Conflict', 
            message: `Sinh viên ${mssv} đã được điểm danh trước đó!`,
            checked_at: existing?.created_at
          }, { status: 409 });
        }
        return NextResponse.json({
          success: false,
          error: 'Database Error',
          message: `Lỗi ghi nhận điểm danh: ${insertError.message}`,
        }, { status: 500 });
      }
    }

    // Synchronize event_registrations attended status
    try {
      await supabase
        .from('event_registrations')
        .upsert(
          {
            event_id,
            email: finalStudent.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
            mssv,
            full_name: finalStudent.full_name || mssv,
            class_id: finalStudent.class_id || 'PTIT-HCM',
            role_type: participate_role === 'volunteer' ? 'volunteer' : 'participant',
            attended: true,
          },
          { onConflict: 'event_id,mssv' }
        );
    } catch (syncErr) {
      console.warn('Could not sync event_registrations in checkin:', syncErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        student: finalStudent,
        checkin_time: new Date().toISOString(),
        session_name: matchedSessionName,
      },
      message: sessions.length > 0
        ? `Đã điểm danh thành công "${matchedSessionName}" cho sinh viên ${finalStudent.full_name} (${mssv})!`
        : `Đã điểm danh thành công cho sinh viên ${finalStudent.full_name} (${mssv})!`,
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Internal Error', message: err?.message || 'Lỗi xử lý điểm danh' }, { status: 500 });
  }
}
