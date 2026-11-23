import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getGraduatedCohortsConfig } from '@/lib/utils/graduated-cohorts';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
  const { deleted_cohorts } = await getGraduatedCohortsConfig(supabase);

  let usersQuery = supabase.from('users').select('*', { count: 'exact', head: true });
  for (const dc of deleted_cohorts) {
    const yy = dc.slice(1);
    usersQuery = usersQuery
      .not('mssv', 'ilike', `N${yy}%`)
      .not('class_id', 'ilike', `D${yy}%`)
      .not('class_id', 'ilike', `E${yy}%`);
  }

  const [
    { count: eventsCount },
    { count: checkinsCount },
    { count: attendedCount },
    { count: studentsCount },
  ] = await Promise.all([
    supabase.from('events').select('*', { count: 'exact', head: true }),
    supabase.from('check_ins').select('*', { count: 'exact', head: true }),
    supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('attended', true),
    usersQuery,
  ]);

  const totalCheckins = Math.max(checkinsCount || 0, attendedCount || 0);

  return NextResponse.json({
    success: true,
    data: {
      events: eventsCount || 0,
      checkins: totalCheckins,
      students: studentsCount || 0,
    },
  });
}
