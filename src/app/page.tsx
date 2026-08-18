import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import Header from '@/components/Header';
import StudentDashboardClient from '@/components/StudentDashboardClient';
import type { HistoryItem, ParticipateRole, SessionUser } from '@/lib/types';
import styles from './page.module.css';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const auth = await getAuthContext();
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
    if (auth.tier === 'checker') {
      redirect('/scanner');
    }
  }

  // ──── Giao diện Dành Riêng Cho Sinh Viên (Mã QR Điểm Danh & Lịch Sử) ────
  const supabase = await createClient();

  const { data: dbUser } = await supabase
    .from('users')
    .select('mssv, full_name, class_id')
    .eq('email', auth.email)
    .single();

  const user = dbUser || {
    mssv: auth.email.split('@')[0].toUpperCase(),
    full_name: auth.email.split('@')[0],
    class_id: 'PTIT',
  };

  const { data: historyData } = await supabase
    .from('check_ins')
    .select(`
      participate_role,
      created_at,
      events (event_name, event_date, semester)
    `)
    .eq('mssv', user.mssv)
    .order('created_at', { ascending: false });

  const history: HistoryItem[] = (historyData || []).map((item: any) => ({
    event_name: item.events?.event_name || 'Không rõ',
    event_date: item.events?.event_date,
    semester: item.events?.semester,
    participate_role: item.participate_role as ParticipateRole,
    checkin_time: item.created_at,
  }));

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
