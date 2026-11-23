import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { enrichHistoryWithSessionCounts } from '@/lib/constants/event-meta-store';
import { resolveActorLcdScope } from '@/lib/utils/lcd-auth';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import {
  getMasterStudentByMssv,
  isPlaceholderClass,
  isPlaceholderName,
} from '@/lib/utils/student-profile';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mssv: string }> }
) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (
      !auth.isSuperAdmin &&
      auth.tier !== 'super_admin' &&
      auth.tier !== 'youth_union' &&
      auth.tier !== 'ctsv' &&
      auth.tier !== 'event_admin'
    ) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { mssv } = await params;
    const cleanMssv = decodeURIComponent(mssv).trim().toUpperCase();

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // Run all queries in parallel for performance
    const [scope, userResult, checkInsResult, attendedRegsResult, penaltyResult] = await Promise.all([
      resolveActorLcdScope(supabase, auth),
      // Fetch user info
      supabase.from('users').select('*').eq('mssv', cleanMssv).maybeSingle(),
      // Fetch check-ins
      supabase.from('check_ins').select(`
        id, event_id, participate_role, created_at,
        events ( event_id, event_name, event_date, start_time, end_time, semester, created_by )
      `).eq('mssv', cleanMssv).order('created_at', { ascending: false }),
      // Fetch attended event registrations
      supabase.from('event_registrations').select(`
        id, event_id, role_type, created_at,
        events ( event_id, event_name, event_date, start_time, end_time, semester, created_by )
      `).eq('mssv', cleanMssv).eq('attended', true),
      // Fetch penalties
      supabase.from('user_penalties').select('*').eq('mssv', cleanMssv).maybeSingle(),
    ]);

    const dbUser = userResult.data;
    const masterUser = getMasterStudentByMssv(cleanMssv);
    const resolvedFullName =
      dbUser?.full_name && !isPlaceholderName(dbUser.full_name, cleanMssv)
        ? dbUser.full_name
        : masterUser?.full_name || dbUser?.full_name || 'Chưa có thông tin';
    const resolvedClassId =
      dbUser?.class_id && !isPlaceholderClass(dbUser.class_id)
        ? String(dbUser.class_id).trim().toUpperCase()
        : masterUser?.class_id || dbUser?.class_id || 'N/A';

    const user = dbUser
      ? {
          ...dbUser,
          full_name: resolvedFullName,
          class_id: resolvedClassId,
        }
      : masterUser
      ? {
          mssv: cleanMssv,
          full_name: masterUser.full_name,
          class_id: masterUser.class_id,
          email: `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`,
        }
      : null;

    // If caller is not Super Admin / Đoàn HV / CTSV, enforce strict LCĐ scope (reject CLB/single-event admins)
    const isFullViewer =
      Boolean(auth.isSuperAdmin) ||
      auth.tier === 'super_admin' ||
      auth.tier === 'youth_union' ||
      auth.tier === 'ctsv';

    if (!isFullViewer) {
      if (scope.role !== 'lcd' || !scope.lcd) {
        return NextResponse.json(
          { success: false, error: 'Chỉ Super Admin, Đoàn Học Viện, CTSV hoặc Liên Chi Đoàn chủ quản mới có quyền xem lịch sử sinh viên.' },
          { status: 403 }
        );
      }
      const targetLcd = resolveStudentLcd(resolvedClassId !== 'N/A' ? resolvedClassId : null, cleanMssv);
      if (!targetLcd || targetLcd.code !== scope.lcd.code) {
        return NextResponse.json(
          { success: false, error: `Sinh viên ${cleanMssv} thuộc ${targetLcd?.shortName || 'đơn vị khác'}, ngoài phạm vi của ${scope.lcd.shortName}.` },
          { status: 403 }
        );
      }
    }
    const checkIns = checkInsResult.data;
    const checkInErr = checkInsResult.error;
    const attendedRegs = attendedRegsResult.data;
    const penalty = penaltyResult.data;

    if (checkInErr) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
    }

    const historyMap = new Map<string, any>();

    (checkIns || []).forEach((ci: any) => {
      historyMap.set(ci.event_id || String(ci.id), {
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
      });
    });

    (attendedRegs || []).forEach((ar: any) => {
      const key = ar.event_id || String(ar.id);
      if (!historyMap.has(key)) {
        historyMap.set(key, {
          id: ar.id,
          event_id: ar.event_id,
          event_name: ar.events?.event_name || 'Không rõ sự kiện',
          event_date: ar.events?.event_date,
          start_time: ar.events?.start_time,
          end_time: ar.events?.end_time,
          semester: ar.events?.semester || 'Không rõ',
          organizer: ar.events?.created_by || 'Đoàn trường',
          participate_role: ar.role_type === 'volunteer' ? 'volunteer' : 'participant',
          checkin_time: ar.created_at,
        });
      }
    });

    const formattedHistory = await enrichHistoryWithSessionCounts(
      supabase,
      cleanMssv,
      Array.from(historyMap.values())
    );

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
