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

  if (isPrivileged) {
    try {
      await supabase.from('super_admins').upsert({ email: auth.email.toLowerCase() }, { onConflict: 'email' });
    } catch {}
  }

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
  }

  // Also query attended registrations so attended students are consistently included
  const { data: attendedRegistrations } = await supabase
    .from('event_registrations')
    .select('mssv, full_name, class_id, role_type, created_at')
    .eq('event_id', resolvedParams.id)
    .eq('attended', true);

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

  (attendedRegistrations || []).forEach((r: any) => {
    if (!checkinsMap.has(r.mssv)) {
      checkinsMap.set(r.mssv, {
        mssv: r.mssv,
        full_name: r.full_name || r.mssv,
        class_id: r.class_id || '',
        participate_role: r.role_type === 'volunteer' ? 'Cộng tác viên' : 'Người tham gia',
        checked_by: 'Mã QR Động (Tự quét)',
        checkin_time: r.created_at || new Date().toISOString(),
      });
    }
  });

  // Fetch master user profiles for all checkin MSSVs to guarantee real student full name and class
  const allMssvs = [...checkinsMap.keys()];
  if (allMssvs.length > 0) {
    const { data: userProfiles } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .in('mssv', allMssvs);

    const uMap = new Map((userProfiles || []).map((u) => [u.mssv.toUpperCase(), u]));

    checkinsMap.forEach((val, key) => {
      const u = uMap.get(key.toUpperCase());
      if (u?.full_name && !u.full_name.includes('@')) {
        val.full_name = u.full_name;
      }
      if (u?.class_id) {
        val.class_id = u.class_id;
      }
    });
  }

  const exportData = Array.from(checkinsMap.values()).map((c, index) => ({
    stt: index + 1,
    ...c,
  }));

  return NextResponse.json({
    success: true,
    data: exportData,
    count: exportData.length,
  });
}
