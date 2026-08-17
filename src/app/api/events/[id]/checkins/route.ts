import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isPrivileged = isSuperAdmin || auth.tier === 'youth_union' || auth.email.includes('doanthanhnien');

  if (!isPrivileged) {
    const { data: eventRole } = await supabase
      .from('event_roles')
      .select('role_type')
      .eq('email', auth.email)
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    const { data: event } = await supabase
      .from('events')
      .select('created_by')
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    const isCreator = event?.created_by && event.created_by.toLowerCase() === auth.email.toLowerCase();

    if (!eventRole && !isCreator && auth.tier !== 'event_admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: checkins, error } = await supabase
    .from('check_ins')
    .select(`
      mssv,
      participate_role,
      checked_by,
      created_at,
      users (full_name, class_id)
    `)
    .eq('event_id', resolvedParams.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Fetch checkins error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  const checkinsMap = new Map<string, any>();

  (checkins || []).forEach((c: any) => {
    if (!checkinsMap.has(c.mssv)) {
      checkinsMap.set(c.mssv, {
        mssv: c.mssv,
        full_name: c.users?.full_name || c.mssv,
        class_id: c.users?.class_id || '',
        participate_role:
          c.participate_role === 'volunteer'
            ? 'Cộng tác viên'
            : c.participate_role === 'organizer'
            ? 'Ban tổ chức'
            : 'Người tham gia',
        checked_by: c.checked_by || 'Mã QR Động (Tự quét)',
        checkin_time: c.created_at,
      });
    }
  });

  const exportData = Array.from(checkinsMap.values()).map((c, index) => ({
    stt: index + 1,
    ...c,
  }));

  return NextResponse.json({ success: true, data: exportData });
}
