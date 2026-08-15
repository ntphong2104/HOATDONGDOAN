export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import Header from '@/components/Header';
import AdminDashboardClient from './AdminDashboardClient';
import styles from './page.module.css';

export default async function AdminEventsPage() {
  const auth = await getAuthContext();
  if (!auth) {
    redirect('/login');
  }

  if (
    !auth.isSuperAdmin &&
    !auth.isEventAdmin &&
    auth.tier !== 'youth_union' &&
    auth.tier !== 'ctsv' &&
    auth.tier !== 'facility'
  ) {
    redirect('/');
  }

  const supabase = await createClient();

  // Fetch events for admin
  let eventsQuery = supabase.from('events').select('*').order('created_at', { ascending: false });

  if (!auth.isSuperAdmin) {
    // Check if user has explicit event_roles
    const { data: eventRoles } = await supabase
      .from('event_roles')
      .select('event_id')
      .eq('email', auth.email)
      .eq('role_type', 'event_admin');

    const roleEventIds = (eventRoles || []).map((r) => r.event_id);

    // If unit has specific assigned events, filter by them; otherwise show all events for convenience
    if (roleEventIds.length > 0) {
      eventsQuery = eventsQuery.in('event_id', roleEventIds);
    }
  }

  const { data: events } = await eventsQuery;

  return (
    <div className={styles.container}>
      <Header
        showBack={auth.isSuperAdmin}
        backHref={auth.isSuperAdmin ? '/super-admin' : '/'}
        title="BÀN LÀM VIỆC ĐƠN VỊ TỔ CHỨC"
      />
      <main className={styles.main}>
        <AdminDashboardClient initialEvents={events || []} />
      </main>
    </div>
  );
}
