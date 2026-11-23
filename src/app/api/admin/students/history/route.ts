import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { enrichHistoryWithSessionCounts } from '@/lib/constants/event-meta-store';
import { getUserProfileExtraWithFallback } from '@/lib/constants/user-profile-store';
import { resolveActorLcdScope } from '@/lib/utils/lcd-auth';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import { getCohortFromMssv } from '@/lib/utils/cohort';
import {
  getMasterStudentByMssv,
  isPlaceholderClass,
  isPlaceholderName,
} from '@/lib/utils/student-profile';

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'youth_union' && auth.tier !== 'ctsv' && auth.tier !== 'event_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const mssv = searchParams.get('mssv');

    if (!mssv) {
      return NextResponse.json({ success: false, error: 'Thiếu MSSV' }, { status: 400 });
    }

    const cleanMssv = decodeURIComponent(mssv).trim().toUpperCase();
    const userEmailGuess = `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn`;
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const isFullViewer =
      Boolean(auth.isSuperAdmin) ||
      auth.tier === 'super_admin' ||
      auth.tier === 'youth_union' ||
      auth.tier === 'ctsv';

    const [
      scope,
      userResult,
      checkInsResult,
      attendedRegsResult,
      penaltyResult,
      profileExtra,
      dutyVol,
      delegateRow,
    ] = await Promise.all([
      isFullViewer ? Promise.resolve({ role: 'all' as const, lcd: null }) : resolveActorLcdScope(supabase, auth),
      supabase.from('users').select('*').eq('mssv', cleanMssv).maybeSingle(),
      supabase.from('check_ins').select(`
        id, event_id, participate_role, created_at,
        events ( event_id, event_name, event_date, start_time, end_time, semester, created_by )
      `).eq('mssv', cleanMssv).order('created_at', { ascending: false }),
      supabase.from('event_registrations').select(`
        id, event_id, role_type, created_at,
        events ( event_id, event_name, event_date, start_time, end_time, semester, created_by )
      `).eq('mssv', cleanMssv).eq('attended', true),
      supabase.from('user_penalties').select('*').eq('mssv', cleanMssv).maybeSingle(),
      getUserProfileExtraWithFallback(supabase, userEmailGuess, cleanMssv).catch(() => null),
      Promise.resolve(
        supabase
          .from('office_duty_volunteers')
          .select('mssv, is_active')
          .eq('mssv', cleanMssv)
          .eq('is_active', true)
          .maybeSingle()
      )
        .then((r: any) => r?.data || null)
        .catch(() => null),
      Promise.resolve(
        supabase
          .from('class_delegates')
          .select('class_id, role_title, valid_until, is_active')
          .eq('mssv', cleanMssv)
          .eq('is_active', true)
          .maybeSingle()
      )
        .then((r: any) => r?.data || null)
        .catch(() => null),
    ]);

    const user = userResult.data;
    const master = getMasterStudentByMssv(cleanMssv);
    const resolvedFullName =
      user?.full_name && !isPlaceholderName(user.full_name, cleanMssv)
        ? user.full_name
        : master?.full_name || user?.full_name || 'Sinh viên PTIT';
    const cls =
      user?.class_id && !isPlaceholderClass(user.class_id)
        ? String(user.class_id).trim().toUpperCase()
        : master?.class_id || null;
    const targetLcd = resolveStudentLcd(cls, cleanMssv);

    if (!isFullViewer) {
      if (scope.role === 'none' || !scope.lcd) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
      if (!targetLcd || targetLcd.code !== scope.lcd.code) {
        return NextResponse.json(
          { success: false, error: 'Bạn chỉ có quyền tra cứu sinh viên thuộc Liên Chi Đoàn của mình.' },
          { status: 403 }
        );
      }
    }

    let resolvedExtra = profileExtra;
    if (user?.email && String(user.email).trim().toLowerCase() !== userEmailGuess) {
      const altExtra = await getUserProfileExtraWithFallback(
        supabase,
        String(user.email).trim().toLowerCase(),
        cleanMssv
      ).catch(() => null);
      if (altExtra?.phone) resolvedExtra = altExtra;
    }
    const checkIns = checkInsResult.data;
    if (checkInsResult.error) console.error('Check-in fetch error:', checkInsResult.error);
    const attendedRegs = attendedRegsResult.data;
    if (attendedRegsResult.error) console.error('Attended regs fetch error:', attendedRegsResult.error);
    const penalty = penaltyResult.data;

    const historyMap = new Map<string, any>();

    (checkIns || []).forEach((ci: any) => {
      historyMap.set(ci.event_id || String(ci.id), {
        id: ci.id, event_id: ci.event_id,
        event_name: ci.events?.event_name || 'Sự kiện Đoàn Thanh Niên',
        event_date: ci.events?.event_date, start_time: ci.events?.start_time,
        end_time: ci.events?.end_time, semester: ci.events?.semester || 'Chưa phân kỳ',
        organizer: ci.events?.created_by || 'Đoàn trường',
        participate_role: ci.participate_role || 'participant', checkin_time: ci.created_at,
      });
    });

    (attendedRegs || []).forEach((ar: any) => {
      const key = ar.event_id || String(ar.id);
      if (!historyMap.has(key)) {
        historyMap.set(key, {
          id: ar.id, event_id: ar.event_id,
          event_name: ar.events?.event_name || 'Sự kiện Đoàn Thanh Niên',
          event_date: ar.events?.event_date, start_time: ar.events?.start_time,
          end_time: ar.events?.end_time, semester: ar.events?.semester || 'Chưa phân kỳ',
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
        user: {
          ...(user || {}),
          mssv: cleanMssv,
          full_name: resolvedFullName,
          class_id: cls || user?.class_id || 'N/A',
          email: user?.email || userEmailGuess,
          phone: resolvedExtra?.phone || user?.phone || '',
          gender: resolvedExtra?.gender || user?.gender || '',
          cohort: getCohortFromMssv(cleanMssv) || '',
          lcd_code: targetLcd?.code || null,
          lcd_name: targetLcd?.name || null,
          lcd_short_name: targetLcd?.shortName || null,
          lcd_color: targetLcd?.color || null,
        },
        roles: {
          is_duty_volunteer: Boolean(dutyVol),
          delegate: delegateRow || null,
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
