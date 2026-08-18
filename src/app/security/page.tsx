export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import Header from '@/components/Header';
import SecurityDashboardClient from './SecurityDashboardClient';
import type { SessionUser } from '@/lib/types';
import styles from './page.module.css';

export default async function SecurityPage() {
  const auth = await getAuthContext();
  if (!auth) {
    redirect('/login');
  }

  const isAuthorized =
    auth.isSuperAdmin ||
    auth.tier === 'security' ||
    auth.tier === 'facility' ||
    auth.tier === 'youth_union' ||
    auth.email.includes('baove') ||
    auth.email.includes('security');

  if (!isAuthorized) {
    redirect('/');
  }

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

  const { data: proposals } = await supabase
    .from('event_proposals')
    .select('*')
    .eq('status', 'approved')
    .neq('room_name', 'Không mượn')
    .order('start_datetime', { ascending: true });

  const sessionUser: SessionUser = {
    mssv: 'TO-BAOVE',
    email: auth.email,
    full_name: 'Tổ Bảo Vệ (Quản Lý Chìa Khóa)',
    class_id: 'TO-BAO-VE',
    tier: auth.tier,
    isSuperAdmin: auth.isSuperAdmin,
    isSecurity: true,
    managed_events: [],
  };

  return (
    <div className={styles.container}>
      <Header
        showBack={auth.isSuperAdmin}
        backHref={auth.isSuperAdmin ? '/super-admin' : '/'}
        user={sessionUser}
        userName={sessionUser.full_name}
      />
      <main className={styles.main}>
        <SecurityDashboardClient
          initialProposals={proposals || []}
          currentUser={sessionUser}
        />
      </main>
    </div>
  );
}
