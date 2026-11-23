import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isEventPastDeadline, isEventLockedPast3Days } from '@/lib/utils/event-logic';

export const dynamic = 'force-dynamic';

const PUBLIC_EVENTS_TTL_MS = 15_000;

interface PublicEventsCache {
  data: any[] | null;
  expiresAt: number;
  inflight: Promise<any[]> | null;
}

function getPublicEventsCache(): PublicEventsCache {
  const g = globalThis as unknown as { __hddPublicEventsCache?: PublicEventsCache };
  if (!g.__hddPublicEventsCache) {
    g.__hddPublicEventsCache = { data: null, expiresAt: 0, inflight: null };
  }
  return g.__hddPublicEventsCache;
}

async function fetchActivePublicEvents(): Promise<any[]> {
  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false });

  if (error) {
    console.error('Fetch public events error:', error);
    return [];
  }

  // Fetch sessions for active events to correctly determine deadline
  const activeIds = (events || [])
    .filter((ev) => ev.status === 'active' || ev.status !== 'closed')
    .map((ev) => `event_meta_${ev.event_id}`);

  const metaMap: Record<string, any> = {};
  if (activeIds.length > 0) {
    try {
      const { data: metaRows } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', activeIds);
      for (const row of metaRows || []) {
        const eventId = row.key.replace('event_meta_', '');
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        metaMap[eventId] = parsed;
      }
    } catch {}
  }

  return (events || []).filter((ev) => {
    if (ev.status === 'closed') return false;
    const sessions = metaMap[ev.event_id]?.sessions || [];
    if (ev.status === 'active') {
      return !isEventLockedPast3Days({ ...ev, sessions });
    }
    return !isEventPastDeadline({ ...ev, sessions });
  });
}

export async function GET() {
  try {
    if (process.env.NODE_ENV === 'test') {
      return NextResponse.json({ success: true, data: await fetchActivePublicEvents() });
    }

    const cache = getPublicEventsCache();
    const now = Date.now();
    if (cache.data && now < cache.expiresAt) {
      return NextResponse.json({ success: true, data: cache.data });
    }

    if (!cache.inflight) {
      cache.inflight = fetchActivePublicEvents()
        .then((rows) => {
          cache.data = rows;
          cache.expiresAt = Date.now() + PUBLIC_EVENTS_TTL_MS;
          return rows;
        })
        .finally(() => {
          cache.inflight = null;
        });
    }

    const activeEvents = await cache.inflight;
    return NextResponse.json({ success: true, data: activeEvents });
  } catch {
    return NextResponse.json({ success: true, data: [] });
  }
}
