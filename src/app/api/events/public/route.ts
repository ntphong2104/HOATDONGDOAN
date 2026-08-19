import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: events, error } = await supabase
      .from('events')
      .select('event_id, event_name, event_date, start_time, end_time, location, description, semester, is_active, status, registration_open, created_by, max_participants')
      .order('event_date', { ascending: false });

    if (error) {
      return NextResponse.json({ success: true, data: [] });
    }

    const activeEvents = (events || []).filter((ev) => !isEventPastDeadline(ev) && ev.status !== 'closed');

    return NextResponse.json({ success: true, data: activeEvents });
  } catch (err: any) {
    return NextResponse.json({ success: true, data: [] });
  }
}
