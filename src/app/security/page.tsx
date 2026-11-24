export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, parseDemoCookie } from '@/lib/supabase/auth-helper';
import { getStoredProposals } from '@/lib/constants/proposals-store';
import { getHandoverRegistryFromDb } from '@/lib/constants/handover-store';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { getMasterStudentByMssv } from '@/lib/utils/student-profile';
import { sanitizePostgrestValue } from '@/lib/security/sanitizer';
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
            isSecurity: demoUser.tier === 'security',
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
    auth.tier === 'youth_union';

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

  let handoverDb: any = {};
  try {
    handoverDb = await getHandoverRegistryFromDb(supabase);
  } catch {}

  const stored = getStoredProposals()
    .filter((p) => p.status === 'approved' && p.room_name && p.room_name !== 'Không mượn')
    .sort((a, b) => (a.start_datetime || '').localeCompare(b.start_datetime || ''));

  let finalProposals: EventProposal[] = [];
  if (dbProposals.length > 0) {
    const storedMap = new Map(stored.map(s => [s.id, s]));
    finalProposals = dbProposals.map(p => {
      const local = storedMap.get(p.id);
      const dbHandover = handoverDb[p.id];
      return {
        ...p,
        key_status: dbHandover?.key_status || p.key_status || local?.key_status || 'pending',
        key_handed_at: dbHandover?.key_handed_at || p.key_handed_at || local?.key_handed_at || null,
        key_handed_by: dbHandover?.key_handed_by || p.key_handed_by || local?.key_handed_by || null,
        key_returned_at: dbHandover?.key_returned_at || p.key_returned_at || local?.key_returned_at || null,
        key_returned_by: dbHandover?.key_returned_by || p.key_returned_by || local?.key_returned_by || null,
      };
    });
  } else {
    finalProposals = stored.map(p => {
      const dbHandover = handoverDb[p.id];
      return {
        ...p,
        key_status: dbHandover?.key_status || p.key_status || 'pending',
        key_handed_at: dbHandover?.key_handed_at || p.key_handed_at || null,
        key_handed_by: dbHandover?.key_handed_by || p.key_handed_by || null,
        key_returned_at: dbHandover?.key_returned_at || p.key_returned_at || null,
        key_returned_by: dbHandover?.key_returned_by || p.key_returned_by || null,
      };
    });
  }

  const lowerEmail = auth.email.toLowerCase().trim();
  const extractedMssv = extractMSSV(lowerEmail);
  let resolvedMssv =
    extractedMssv || (auth.tier === 'security' ? 'TO-BAOVE' : lowerEmail.split('@')[0].toUpperCase());
  let resolvedName =
    auth.tier === 'security'
      ? 'Tổ Bảo Vệ (Quản Lý Chìa Khóa)'
      : extractedMssv || lowerEmail.split('@')[0].toUpperCase();
  let resolvedClass = auth.tier === 'security' ? 'TO-BAO-VE' : 'CANBO';

  try {
    const safeEmail = sanitizePostgrestValue(lowerEmail, 120);
    const safeMssv = sanitizePostgrestValue(resolvedMssv, 40);
    const { data: dbUser } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .or(`email.eq.${safeEmail},mssv.eq.${safeMssv}`)
      .maybeSingle();
    const master = extractedMssv ? getMasterStudentByMssv(extractedMssv) : null;
    if (dbUser?.mssv) resolvedMssv = dbUser.mssv;
    if (dbUser?.full_name && !dbUser.full_name.includes('@')) {
      resolvedName = dbUser.full_name;
    } else if (master?.full_name) {
      resolvedName = master.full_name;
    } else if (auth.tier !== 'security' && auth.user_metadata?.full_name) {
      resolvedName = String(auth.user_metadata.full_name);
    }
    if (dbUser?.class_id && dbUser.class_id !== 'PTIT-HCM') {
      resolvedClass = dbUser.class_id;
    } else if (master?.class_id) {
      resolvedClass = master.class_id;
    }
  } catch {}

  const sessionUser: SessionUser = {
    mssv: resolvedMssv,
    email: auth.email,
    full_name: resolvedName,
    class_id: resolvedClass,
    avatar_url: auth.avatarUrl || undefined,
    tier: auth.tier,
    isSuperAdmin: auth.isSuperAdmin,
    isSecurity: auth.tier === 'security' || Boolean(auth.isSecurity),
    managed_events: [],
  };

  return (
    <div className={styles.container}>
      <Header
        backHref={auth.isSuperAdmin ? '/super-admin' : '/'}
        avatarUrl={auth.avatarUrl}
        title="SỔ TRỰC BÀN GIAO CHÌA KHÓA"
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
