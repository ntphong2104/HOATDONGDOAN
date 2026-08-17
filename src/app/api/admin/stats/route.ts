import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const { count: eventsCount } = await supabase.from('events').select('*', { count: 'exact', head: true });
  const { count: checkinsCount } = await supabase.from('check_ins').select('*', { count: 'exact', head: true });
  const { count: attendedCount } = await supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('attended', true);
  const { count: studentsCount } = await supabase.from('users').select('*', { count: 'exact', head: true });

  const totalCheckins = Math.max(checkinsCount || 0, attendedCount || 0);

  return NextResponse.json({ 
    success: true, 
    data: {
      events: eventsCount || 0,
      checkins: totalCheckins,
      students: studentsCount || 0
    } 
  });
}
