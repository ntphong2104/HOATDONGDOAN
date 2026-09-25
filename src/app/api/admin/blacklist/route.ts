import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { reconcileAllPastEvents } from '@/lib/utils/blacklist-logic';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());

  // Auto reconcile past events ended >= 3 days ago in background
  if (auth.isSuperAdmin || auth.tier === 'super_admin') {
    reconcileAllPastEvents(supabase).catch((e) => console.warn('Background past events reconcile error:', e));
  }

  const { data: penalties, error } = await supabase
    .from('user_penalties')
    .select('*')
    .or('is_blacklisted.eq.true,missed_count.gt.0')
    .order('is_blacklisted', { ascending: false })
    .order('missed_count', { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: penalties || [],
  });
}
