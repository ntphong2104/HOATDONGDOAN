import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; roleId: string }> }) {
  try {
    const { id, roleId } = await params;
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!roleId || !id) {
      return NextResponse.json({ success: false, error: 'Thiếu thông tin vai trò hoặc sự kiện' }, { status: 400 });
    }

    const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const { data: eventData } = await supabase
      .from('events')
      .select('event_id, event_date, end_time, status, created_by')
      .eq('event_id', id)
      .maybeSingle();

    if (eventData && isEventLockedPast3Days(eventData) && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền xóa vai trò.',
        },
        { status: 403 }
      );
    }

    // Authorization: only super_admin, youth_union, event_admin, or event creator
    const isSuperOrPrivileged = isSuperAdmin || auth.tier === 'youth_union';
    const isEventAdmin = auth.isEventAdmin || auth.tier === 'event_admin';

    if (!isSuperOrPrivileged && !isEventAdmin) {
      if (eventData?.created_by !== auth.email) {
        return NextResponse.json({ success: false, error: 'Bạn không có quyền xóa vai trò này' }, { status: 403 });
      }
    }

    // Support both UUID and integer role IDs
    const { error, count } = await supabase
      .from('event_roles')
      .delete({ count: 'exact' })
      .eq('id', roleId)
      .eq('event_id', id);

    if (error) {
      console.error('Delete role error:', error);
      return NextResponse.json({ success: false, error: `Lỗi xóa quyền: ${error.message}` }, { status: 500 });
    }

    if (count === 0) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy vai trò này (có thể đã bị xóa trước đó)' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (err: any) {
    console.error('Delete role catch:', err);
    return NextResponse.json({ success: false, error: `Lỗi hệ thống: ${err?.message || 'Vui lòng thử lại'}`}, { status: 500 });
  }
}
