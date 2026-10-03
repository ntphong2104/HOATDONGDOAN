import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });

    if (error) {
      console.error('Fetch public events error:', error);
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch sessions for active events to correctly determine deadline
    const activeIds = (events || [])
      .filter((ev) => ev.status === 'active' || ev.status !== 'closed')
      .map((ev) => `event_meta_${ev.event_id}`);

    let metaMap: Record<string, any> = {};
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

    const activeEvents = (events || []).filter((ev) => {
      const sessions = metaMap[ev.event_id]?.sessions || [];
      return !isEventPastDeadline({ ...ev, sessions }) && ev.status !== 'closed';
    });

    return NextResponse.json({ success: true, data: activeEvents });
  } catch (err: any) {
    return NextResponse.json({ success: true, data: [] });
  }
}
