import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import { extractMSSV, isStudentPersonalAccount } from '@/lib/utils/extract-mssv';
import { getUserProfileExtraWithFallback } from '@/lib/constants/user-profile-store';
import { enrichHistoryWithSessionCounts, getEventMetaBatch } from '@/lib/constants/event-meta-store';
import { getOfficeDutyConfig, getTodayVN } from '@/lib/utils/office-duty';
import {
  shiftDateVN,
  type BorrowRequestInput,
  type DutyShiftHours,
  type DutyShiftInput,
} from '@/lib/utils/student-schedule';
import {
  isPlaceholderName,
  isPlaceholderClass,
  getMasterStudentByMssv,
} from '@/lib/utils/student-profile';
import Header from '@/components/Header';
import StudentDashboardClient from '@/components/StudentDashboardClient';
import type { HistoryItem, ParticipateRole, SessionUser } from '@/lib/types';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; tab?: string }>;
}) {
  let auth = await getAuthContext();
  if (!auth) {
    try {
      const cookieStore = await cookies();
      const demoCookie = cookieStore.get('demo_session');
      if (demoCookie?.value) {
        const demoUser = parseDemoCookie(demoCookie.value);
        if (demoUser?.email) {
          auth = {
            email: demoUser.email,
            isSuperAdmin: demoUser.tier === 'super_admin' || demoUser.email.toLowerCase() === 'n22dccn158@student.ptithcm.edu.vn',
            isEventAdmin: ['super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'].includes(demoUser.tier),
            isChecker: demoUser.tier === 'checker' || Boolean(demoUser.isChecker),
            isSecurity: demoUser.tier === 'security',
            isOfficeAdmin:
              demoUser.tier === 'super_admin' ||
              demoUser.tier === 'office_admin' ||
              Boolean(demoUser.isOfficeAdmin),
            tier: demoUser.tier || 'user',
          };
        }
      }
    } catch {}
  }

  if (!auth) {
    redirect('/login');
  }

  const resolvedParams = searchParams ? await searchParams : {};

  // Super Admin mặc định vào thẳng Tổng quan Điều hành (/super-admin),
  // trừ khi chủ động mở Cổng Sinh Viên cá nhân (/?view=student)
  if ((auth.tier === 'super_admin' || auth.isSuperAdmin) && resolvedParams.view !== 'student') {
    redirect('/super-admin');
  }

  const isStudent = isStudentPersonalAccount({
    email: auth.email,
    mssv: auth.email.split('@')[0],
  });

  // Tài khoản Đơn vị / LCĐ / CLB / Phòng ban (không phải sinh viên cá nhân) vào thẳng Bàn làm việc
  if (!isStudent) {
    if (auth.tier === 'super_admin' || auth.isSuperAdmin) {
      redirect('/super-admin');
    }
    if (auth.tier === 'ctsv' || auth.tier === 'facility') {
      redirect('/admin/proposals');
    }
    if (auth.tier === 'security') {
      redirect('/security');
    }
    if (auth.tier === 'checker') {
      redirect('/scanner');
    }
    redirect('/admin');
  }

  // Tài khoản sinh viên mặc định vào Trang Tổng Quan cá nhân & Thẻ QR (/)
  const rawMssv = extractMSSV(auth.email) || auth.email.split('@')[0].toUpperCase();
  let user = {
    mssv: rawMssv,
    full_name: rawMssv,
    class_id: 'PTIT-HCM',
    gender: 'Nam',
    phone: '',
  };

  try {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    if (demoCookie?.value) {
      const demoUser = parseDemoCookie(demoCookie.value);
      if (demoUser) {
        user = {
          mssv: demoUser.mssv || user.mssv,
          full_name: demoUser.full_name || user.full_name,
          class_id: demoUser.class_id || user.class_id,
          gender: demoUser.gender || user.gender,
          phone: demoUser.phone || user.phone,
        };
      }
    }
  } catch {}

  const todayVN = getTodayVN();
  const lookbackDate = shiftDateVN(todayVN, -14);
  let history: HistoryItem[] = [];
  let initialRegistrations: any[] = [];
  let initialDutyShifts: DutyShiftInput[] = [];
  let initialBorrowRequests: BorrowRequestInput[] = [];
  let dutyShiftConfig: DutyShiftHours | undefined = undefined;
  let initialDelegateInfo: {
    isDelegate: boolean;
    class_id?: string;
    daysLeft?: number;
    expires_at?: string;
  } | null = null;
  let isDutyVolunteer = false;

  try {
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());
    const lowerEmail = auth.email.toLowerCase().trim();

    // Run all student dashboard queries IN PARALLEL and use .eq() on normalized keys to hit B-tree indexes!
    const [
      { data: dbUser },
      profileExtra,
      { data: historyData },
      { data: regData },
      dutyVolRows,
      dutyRegRows,
      dutyAttRows,
      borrowRows,
      officeConfig,
      delegateRow,
    ] = await Promise.all([
      supabase
        .from('users')
        .select('mssv, full_name, class_id')
        .or(`email.eq.${lowerEmail},mssv.eq.${rawMssv}`)
        .maybeSingle(),
      getUserProfileExtraWithFallback(supabase, lowerEmail, rawMssv),
      supabase
        .from('check_ins')
        .select(`
          id,
          event_id,
          participate_role,
          created_at,
          events (event_id, event_name, event_date, semester)
        `)
        .eq('mssv', rawMssv)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_registrations')
        .select(`
          id,
          event_id,
          mssv,
          role_type,
          attended,
          created_at,
          events (
            event_id,
            event_name,
            event_date,
            start_time,
            end_time,
            semester,
            status,
            is_active
          )
        `)
        .or(`email.eq.${lowerEmail},mssv.eq.${rawMssv}`)
        .order('created_at', { ascending: false }),
      Promise.resolve(
        supabase
          .from('office_duty_volunteers')
          .select('mssv')
          .eq('is_active', true)
          .or(`email.ilike.${lowerEmail},mssv.eq.${rawMssv}`)
          .limit(1)
      )
        .then((r: any) => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => []),
      Promise.resolve(
        supabase
          .from('office_duty_registrations')
          .select('id, duty_date, shift')
          .or(`email.ilike.${lowerEmail},mssv.eq.${rawMssv}`)
          .gte('duty_date', lookbackDate)
          .order('duty_date', { ascending: true })
      )
        .then((r: any) => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => []),
      Promise.resolve(
        supabase
          .from('office_duty_attendance')
          .select('registration_id, duty_date, shift, status, check_in_at, check_out_at')
          .or(`email.ilike.${lowerEmail},mssv.eq.${rawMssv}`)
          .gte('duty_date', lookbackDate)
      )
        .then((r: any) => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => []),
      Promise.resolve(
        supabase
          .from('office_borrow_requests')
          .select('id, purpose, borrow_date, due_date, status, office_borrow_items(item_name, quantity)')
          .ilike('requester_email', lowerEmail)
          .in('status', ['pending', 'approved', 'borrowed'])
          .order('borrow_date', { ascending: true })
      )
        .then((r: any) => (Array.isArray(r?.data) ? r.data : []))
        .catch(() => []),
      getOfficeDutyConfig(supabase).catch(() => null),
      Promise.resolve(
        supabase
          .from('class_delegates')
          .select('class_id, granted_at, expires_at')
          .or(`email.eq.${lowerEmail},mssv.eq.${rawMssv}`)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('expires_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
        .then((r: any) => r?.data || null)
        .catch(() => null),
    ]);

    if (delegateRow) {
      const daysLeft = delegateRow.expires_at
        ? Math.max(
            0,
            Math.ceil((new Date(delegateRow.expires_at).getTime() - Date.now()) / 86_400_000)
          )
        : 0;
      initialDelegateInfo = {
        isDelegate: true,
        class_id: delegateRow.class_id || undefined,
        daysLeft,
        expires_at: delegateRow.expires_at || undefined,
      };
    }

    isDutyVolunteer = Array.isArray(dutyVolRows) && dutyVolRows.length > 0;
    if (officeConfig?.shifts) {
      dutyShiftConfig = {
        morning: {
          start: officeConfig.shifts.morning.start,
          end: officeConfig.shifts.morning.end,
        },
        afternoon: {
          start: officeConfig.shifts.afternoon.start,
          end: officeConfig.shifts.afternoon.end,
        },
      };
    }

    const attByRegId = new Map<string, any>();
    for (const a of dutyAttRows || []) {
      if (a?.registration_id) {
        attByRegId.set(String(a.registration_id), a);
      }
    }
    initialDutyShifts = (dutyRegRows || []).map((d: any) => {
      const att = attByRegId.get(String(d.id));
      return {
        id: String(d.id),
        duty_date: String(d.duty_date || ''),
        shift: d.shift === 'afternoon' ? 'afternoon' : 'morning',
        status: att?.status || null,
        check_in_at: att?.check_in_at || null,
        check_out_at: att?.check_out_at || null,
      };
    });

    initialBorrowRequests = (borrowRows || []).map((b: any) => ({
      id: String(b.id),
      purpose: String(b.purpose || ''),
      borrow_date: String(b.borrow_date || ''),
      due_date: String(b.due_date || ''),
      status: String(b.status || ''),
      items: Array.isArray(b.office_borrow_items) ? b.office_borrow_items : [],
    }));

    if (dbUser) {
      const realName = (dbUser.full_name && !dbUser.full_name.includes('@')) ? dbUser.full_name : user.full_name;
      const realClass = dbUser.class_id || user.class_id;
      user = {
        ...user,
        ...dbUser,
        mssv: dbUser.mssv || user.mssv,
        full_name: realName,
        class_id: realClass,
      };
    }

    if (isPlaceholderName(user.full_name, user.mssv) || isPlaceholderClass(user.class_id)) {
      const masterRecord = getMasterStudentByMssv(user.mssv);
      if (masterRecord) {
        if (isPlaceholderName(user.full_name, user.mssv) && masterRecord.full_name) {
          user.full_name = masterRecord.full_name;
        }
        if (isPlaceholderClass(user.class_id) && masterRecord.class_id) {
          user.class_id = masterRecord.class_id;
        }
      }
    }

    if (profileExtra) {
      if (profileExtra.gender) user.gender = profileExtra.gender;
      if (profileExtra.phone) user.phone = profileExtra.phone;
    }

    if (historyData) {
      const historyMap = new Map<string, HistoryItem>();
      historyData.forEach((item: any) => {
        const key = item.event_id || String(item.id);
        if (!historyMap.has(key)) {
          historyMap.set(key, {
            event_id: item.event_id || item.events?.event_id,
            event_name: item.events?.event_name || 'Không rõ',
            event_date: item.events?.event_date,
            semester: item.events?.semester,
            participate_role: item.participate_role as ParticipateRole,
            checkin_time: item.created_at,
          });
        }
      });
      history = await enrichHistoryWithSessionCounts(
        supabase,
        user.mssv,
        Array.from(historyMap.values())
      );
    }

    if (regData) {
      const checkedInEventIds = new Set(
        history.map((h) => h.event_id).filter((id): id is string => Boolean(id))
      );
      const uniqueRegEventIds = Array.from(
        new Set(regData.map((r: any) => r.event_id).filter((id): id is string => Boolean(id)))
      );
      let metaMap: Record<string, any> = {};
      if (uniqueRegEventIds.length > 0) {
        try {
          metaMap = await getEventMetaBatch(supabase, uniqueRegEventIds);
        } catch {}
      }
      initialRegistrations = regData.map((r: any) => ({
        id: r.id,
        event_id: r.event_id,
        event_name: r.events?.event_name || 'Sự kiện Học Viện',
        event_date: r.events?.event_date,
        start_time: r.events?.start_time ? String(r.events.start_time).slice(0, 5) : null,
        end_time: r.events?.end_time ? String(r.events.end_time).slice(0, 5) : null,
        semester: r.events?.semester && r.events.semester !== 'Chưa xếp kỳ' ? r.events.semester : null,
        status: r.events?.status || 'active',
        role_type: r.role_type || 'participant',
        attended: Boolean(r.attended || checkedInEventIds.has(r.event_id)),
        registered_at: r.created_at,
        sessions: Array.isArray(metaMap[r.event_id]?.sessions) ? metaMap[r.event_id].sessions : [],
      }));
    }
  } catch {}

  const profileMissingFields: ('full_name' | 'class_id')[] = [];
  if (!auth.isSuperAdmin && extractMSSV(auth.email)) {
    if (isPlaceholderName(user.full_name, user.mssv)) profileMissingFields.push('full_name');
    if (isPlaceholderClass(user.class_id)) profileMissingFields.push('class_id');
  }

  const sessionUser: SessionUser = {
    mssv: user.mssv,
    full_name: user.full_name,
    class_id: user.class_id,
    gender: user.gender,
    phone: user.phone,
    email: auth.email,
    avatar_url: auth.avatarUrl || undefined,
    tier: auth.tier,
    isSuperAdmin: auth.isSuperAdmin,
    isEventAdmin: auth.isEventAdmin,
    isChecker: auth.isChecker,
    isOfficeAdmin: Boolean(auth.isOfficeAdmin || auth.isSuperAdmin || auth.tier === 'office_admin'),
    isDutyVolunteer,
    isClassDelegate: Boolean(initialDelegateInfo?.isDelegate),
    delegate_class_id: initialDelegateInfo?.class_id,
    delegate_days_left: initialDelegateInfo?.daysLeft,
    managed_events: auth.managed_events || [],
    profile_incomplete: profileMissingFields.length > 0,
    profile_missing_fields: profileMissingFields,
  };

  const rawTab = resolvedParams?.tab;
  const activeStudentTab: 'overview' | 'registered' | 'history' | 'delegate' =
    rawTab === 'registered' || rawTab === 'history' || rawTab === 'delegate'
      ? rawTab
      : 'overview';

  return (
    <div className={styles.container}>
      <Header
        user={sessionUser}
        userName={sessionUser.full_name}
        avatarUrl={sessionUser.avatar_url}
        activeStudentTab={activeStudentTab}
      />
      <main className={styles.main}>
        <StudentDashboardClient
          user={user}
          tier={auth.isSuperAdmin ? 'super_admin' : auth.tier}
          initialHistory={history}
          initialRegistrations={initialRegistrations}
          initialDutyShifts={initialDutyShifts}
          initialBorrowRequests={initialBorrowRequests}
          dutyShiftConfig={dutyShiftConfig}
          initialDelegateInfo={initialDelegateInfo}
          todayVN={todayVN}
          activeSection={activeStudentTab}
          isDutyVolunteer={isDutyVolunteer}
        />
      </main>
    </div>
  );
}
