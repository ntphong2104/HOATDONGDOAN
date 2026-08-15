import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

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
