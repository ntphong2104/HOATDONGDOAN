import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import { extractMSSV, isStudentPersonalAccount } from '@/lib/utils/extract-mssv';
import { getUserProfileExtraWithFallback } from '@/lib/constants/user-profile-store';
import { enrichHistoryWithSessionCounts } from '@/lib/constants/event-meta-store';
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

  let history: HistoryItem[] = [];
  let initialRegistrations: any[] = [];
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
    ]);

    isDutyVolunteer = Array.isArray(dutyVolRows) && dutyVolRows.length > 0;

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
    tier: auth.tier,
    isSuperAdmin: auth.isSuperAdmin,
    isEventAdmin: auth.isEventAdmin,
    isChecker: auth.isChecker,
    isOfficeAdmin: Boolean(auth.isOfficeAdmin || auth.isSuperAdmin || auth.tier === 'office_admin'),
    isDutyVolunteer,
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
        activeStudentTab={activeStudentTab}
      />
      <main className={styles.main}>
        <StudentDashboardClient
          user={user}
          tier={auth.isSuperAdmin ? 'super_admin' : auth.tier}
          initialHistory={history}
          initialRegistrations={initialRegistrations}
          activeSection={activeStudentTab}
          isDutyVolunteer={isDutyVolunteer}
        />
      </main>
    </div>
  );
}
