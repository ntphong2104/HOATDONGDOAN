export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMetaBatch } from '@/lib/constants/event-meta-store';
import { resolveActorLcdScope } from '@/lib/utils/lcd-auth';
import Header from '@/components/Header';
import AdminDashboardClient from './AdminDashboardClient';
import type { Event } from '@/lib/types';
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

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

  // Fetch events for admin
  let eventsQuery = supabase.from('events').select('*').order('created_at', { ascending: false });

  if (!auth.isSuperAdmin && auth.tier !== 'youth_union') {
    // Check if user has explicit event_roles
    const { data: eventRoles } = await supabase
      .from('event_roles')
      .select('event_id')
      .ilike('email', auth.email)
      .eq('role_type', 'event_admin');

    const roleEventIds = (eventRoles || []).map((r) => r.event_id);

    // Also find events created by this user/unit
    const { data: createdEvents } = await supabase
      .from('events')
      .select('event_id')
      .ilike('created_by', auth.email);

    const createdEventIds = (createdEvents || []).map((e) => e.event_id);

    // Combine both lists (assigned + created)
    const allAccessibleIds = [...new Set([...roleEventIds, ...createdEventIds])];

    if (allAccessibleIds.length > 0) {
      eventsQuery = eventsQuery.in('event_id', allAccessibleIds);
    } else {
      // No events at all for this unit — return empty
      eventsQuery = eventsQuery.eq('event_id', '__none__');
    }
  }

  const [{ data: events }, lcdScope] = await Promise.all([
    eventsQuery,
    resolveActorLcdScope(supabase, auth),
  ]);

  // Attach sessions from event_meta so multi-session events compute deadline & display date range accurately
  const eventList = (events || []) as Event[];
  const eventIds = eventList.map((ev) => ev.event_id).filter(Boolean);
  const metaMap = eventIds.length > 0 ? await getEventMetaBatch(supabase, eventIds) : {};
  const enrichedEvents: Event[] = eventList.map((ev) => ({
    ...ev,
    sessions: metaMap[ev.event_id]?.sessions || [],
  }));

  return (
    <div className={styles.container}>
      <Header
        showBack={auth.isSuperAdmin}
        backHref={auth.isSuperAdmin ? '/super-admin' : '/'}
        title={lcdScope.lcd ? `BÀN LÀM VIỆC — ${lcdScope.lcd.shortName.toUpperCase()}` : 'BÀN LÀM VIỆC ĐƠN VỊ TỔ CHỨC'}
      />
      <main className={styles.main}>
        <AdminDashboardClient
          initialEvents={enrichedEvents}
          lcdScope={{
            role: lcdScope.role,
            lcdCode: lcdScope.lcd?.code || null,
            lcdName: lcdScope.lcd?.name || null,
            lcdShortName: lcdScope.lcd?.shortName || null,
          }}
        />
      </main>
    </div>
  );
}
