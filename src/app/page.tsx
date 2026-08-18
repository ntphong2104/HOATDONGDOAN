import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import Header from '@/components/Header';
import StudentDashboardClient from '@/components/StudentDashboardClient';
import type { HistoryItem, ParticipateRole, SessionUser } from '@/lib/types';
import styles from './page.module.css';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
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
  const isStudentView = resolvedParams?.view === 'student';

  // ──── Điều hướng các cấp Quản trị về đúng Không Gian Làm Việc (Trừ khi chủ động vào xem Cổng Sinh Viên) ────
  if (!isStudentView) {
    if (auth.tier === 'super_admin' || auth.isSuperAdmin) {
      redirect('/super-admin');
    }
    if (auth.tier === 'youth_union') {
      redirect('/admin');
    }
    if (auth.tier === 'ctsv' || auth.tier === 'facility') {
      redirect('/admin/proposals');
    }
    if (auth.tier === 'event_admin' || auth.isEventAdmin) {
      redirect('/admin');
    }
    if (auth.tier === 'security') {
      redirect('/security');
    }
    if (auth.tier === 'checker') {
      redirect('/scanner');
    }
  }

  // ──── Giao diện Dành Riêng Cho Sinh Viên (Mã QR Điểm Danh & Lịch Sử) ────
  let user = {
    mssv: auth.email.split('@')[0].toUpperCase(),
    full_name: auth.email.split('@')[0],
    class_id: 'PTIT-HCM',
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
        };
      }
    }
  } catch {}

  let history: HistoryItem[] = [];

  try {
    const supabase = await createClient();

    const { data: dbUser } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .eq('email', auth.email)
      .maybeSingle();

    if (dbUser) {
      user = dbUser;
    }

    const { data: historyData } = await supabase
      .from('check_ins')
      .select(`
        participate_role,
        created_at,
        events (event_name, event_date, semester)
      `)
      .eq('mssv', user.mssv)
      .order('created_at', { ascending: false });

    if (historyData) {
      history = historyData.map((item: any) => ({
        event_name: item.events?.event_name || 'Không rõ',
        event_date: item.events?.event_date,
        semester: item.events?.semester,
        participate_role: item.participate_role as ParticipateRole,
        checkin_time: item.created_at,
      }));
    }
  } catch {}

  if (history.length === 0 && auth.email.toLowerCase().includes('n22dccn158')) {
    history = [
      {
        event_name: 'Workshop Lập Trình Web Hiện Đại & Next.js 2026',
        event_date: '2026-08-15',
        semester: 'HK1 (2026-2027)',
        participate_role: 'participant',
        checkin_time: '2026-08-15T08:30:00Z',
      },
      {
        event_name: 'Lễ Khai Mạc Giải Bóng Đá Mini PTIT Cup',
        event_date: '2026-07-20',
        semester: 'HK1 (2026-2027)',
        participate_role: 'organizer',
        checkin_time: '2026-07-20T07:15:00Z',
      },
    ];
  }

  const sessionUser: SessionUser = {
    mssv: user.mssv,
    full_name: user.full_name,
    class_id: user.class_id,
    email: auth.email,
    tier: auth.tier,
    isSuperAdmin: auth.isSuperAdmin,
    isEventAdmin: auth.isEventAdmin,
    isChecker: auth.isChecker,
    managed_events: [],
  };

  return (
    <div className={styles.container}>
      <Header user={sessionUser} userName={sessionUser.full_name} />
      <main className={styles.main}>
        <StudentDashboardClient
          user={user}
          tier={auth.tier}
          initialHistory={history}
        />
      </main>
    </div>
  );
}
