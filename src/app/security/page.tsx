export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import { getStoredProposals } from '@/lib/constants/proposals-store';
import Header from '@/components/Header';
import SecurityDashboardClient from './SecurityDashboardClient';
import type { SessionUser, EventProposal } from '@/lib/types';
import styles from './page.module.css';

export default async function SecurityPage() {
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
            isSuperAdmin: demoUser.tier === 'super_admin',
            isEventAdmin: ['super_admin', 'youth_union', 'ctsv', 'facility', 'event_admin'].includes(demoUser.tier),
            isChecker: true,
            isSecurity: demoUser.tier === 'security' || demoUser.email.includes('baove'),
            tier: demoUser.tier || 'security',
          };
        }
      }
    } catch {}
  }

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
    console.log('--- SECURITY PAGE: NOT AUTHORIZED, REDIRECTING TO / ---');
    redirect('/');
  }

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

  let dbProposals: any[] = [];
  try {
    const { data } = await supabase
      .from('event_proposals')
      .select('*')
      .eq('status', 'approved')
      .neq('room_name', 'Không mượn')
      .order('start_datetime', { ascending: true });
    if (data && data.length > 0) {
      dbProposals = data;
    }
  } catch (err) {
    console.warn('Could not fetch proposals from DB in security page:', err);
  }

  const stored = getStoredProposals()
    .filter((p) => p.status === 'approved' && p.room_name && p.room_name !== 'Không mượn')
    .sort((a, b) => (a.start_datetime || '').localeCompare(b.start_datetime || ''));

  let finalProposals: EventProposal[] = [];
  if (dbProposals.length > 0) {
    const storedMap = new Map(stored.map(s => [s.id, s]));
    finalProposals = dbProposals.map(p => {
      const local = storedMap.get(p.id);
      return {
        ...p,
        key_status: p.key_status || local?.key_status || 'pending',
        key_handed_at: p.key_handed_at || local?.key_handed_at || null,
        key_handed_by: p.key_handed_by || local?.key_handed_by || null,
        key_returned_at: p.key_returned_at || local?.key_returned_at || null,
        key_returned_by: p.key_returned_by || local?.key_returned_by || null,
      };
    });
  } else {
    finalProposals = stored;
  }

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
          initialProposals={finalProposals}
          currentUser={sessionUser}
        />
      </main>
    </div>
  );
}
