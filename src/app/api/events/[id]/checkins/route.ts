import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  const email = session.user.email!;
  
  const { data: superAdmin } = await supabase.from('super_admins').select('email').eq('email', email).single();
  const { data: eventRole } = await supabase.from('event_roles').select('role_type').eq('email', email).eq('event_id', resolvedParams.id).eq('role_type', 'event_admin').single();

  if (!superAdmin && !eventRole) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
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

  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });

  const exportData = checkins.map((c: any, index: number) => ({
    stt: index + 1,
    mssv: c.mssv,
    full_name: c.users?.full_name || '',
    class_id: c.users?.class_id || '',
    participate_role: c.participate_role === 'participant' ? 'Người tham gia' : c.participate_role === 'volunteer' ? 'Cộng tác viên' : 'Ban tổ chức',
    checked_by: c.checked_by,
    checkin_time: c.created_at
  }));

  return NextResponse.json({ success: true, data: exportData });
}
