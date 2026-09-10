import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  try {
    const { id, roleId } = await params;
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    // Authorization: only super_admin, youth_union, event_admin, or event creator
    const isSuperOrPrivileged = auth.isSuperAdmin || auth.tier === 'super_admin' || auth.tier === 'youth_union';
    const isEventAdmin = auth.isEventAdmin || auth.tier === 'event_admin';

    if (!isSuperOrPrivileged && !isEventAdmin) {
      const checkSupabase = (typeof createAdminClient === 'function' ? await createAdminClient() : null) || await createClient();
      const { data: eventData } = await checkSupabase
        .from('events')
        .select('created_by')
        .eq('event_id', id)
        .maybeSingle();
      
      if (eventData?.created_by !== auth.email) {
        return NextResponse.json({ success: false, error: 'Forbidden', message: 'Bạn không có quyền xóa vai trò này' }, { status: 403 });
      }
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // Verify the role belongs to this event (prevent cross-event deletion)
    const { error } = await supabase
      .from('event_roles')
      .delete()
      .eq('id', parseInt(roleId))
      .eq('event_id', id);

    if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
