import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import Header from '@/components/Header';
import EventCard from '@/components/EventCard';
import styles from './page.module.css';

export default async function AdminEventsPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const email = session.user.email!;
  
  const { data: superAdmin } = await supabase
    .from('super_admins')
    .select('email')
    .eq('email', email)
    .single();

  const { data: eventRoles } = await supabase
    .from('event_roles')
    .select('event_id')
    .eq('email', email)
    .eq('role_type', 'event_admin');

  const isSuperAdmin = !!superAdmin;
  const isEventAdmin = eventRoles && eventRoles.length > 0;

  if (!isSuperAdmin && !isEventAdmin) {
    redirect('/');
  }

  let eventsQuery = supabase.from('events').select('*').order('created_at', { ascending: false });
  
  if (!isSuperAdmin) {
    const eventIds = eventRoles!.map(r => r.event_id);
    eventsQuery = eventsQuery.in('event_id', eventIds);
  }

  const { data: events } = await eventsQuery;

  return (
    <div className={styles.container}>
      <Header />
      <main className={styles.main}>
        <div className={styles.tabs}>
          <div className={styles.tabActive}>Sự kiện</div>
          <Link href="/scanner" className={styles.tabInactive}>Quét mã</Link>
        </div>

