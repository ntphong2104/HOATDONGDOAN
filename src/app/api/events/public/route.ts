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

    const activeEvents = (events || []).filter((ev) => !isEventPastDeadline(ev) && ev.status !== 'closed');

    return NextResponse.json({ success: true, data: activeEvents });
  } catch (err: any) {
    return NextResponse.json({ success: true, data: [] });
  }
}
