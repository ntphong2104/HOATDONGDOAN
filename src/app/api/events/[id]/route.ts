import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from('events').select('*').eq('event_id', resolvedParams.id).single();
  
  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  
  if (data && data.status === 'active' && isEventPastDeadline(data)) {
    data.status = 'closed';
    data.is_active = false;
    supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', resolvedParams.id).then(() => {});
  }

  return NextResponse.json({ success: true, data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin && !auth.isEventAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: currentEvent, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .single();

  if (fetchError || !currentEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const isPrivileged =
    auth.isSuperAdmin ||
    auth.tier === 'youth_union' ||
    auth.email.toLowerCase().includes('doanthanhnien');

  const { status, event_name, event_date, start_time, end_time, semester } = await req.json();

  // Kiểm tra quyền MỞ LẠI sự kiện khi đã quá 1 tiếng sau giờ kết thúc
  if (status === 'active') {
    const isExpired = isEventPastDeadline(currentEvent);
    if (isExpired && !isPrivileged) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Chương trình đã kết thúc quá 1 giờ và tự động đóng. Cán bộ đơn vị trực thuộc không được phép tự mở lại. Chỉ Super Admin hoặc Đoàn Thanh Niên mới có quyền mở lại sự kiện này.',
        },
        { status: 403 }
      );
    }
  }

  // Cán bộ đơn vị trực thuộc chỉ được sửa sự kiện mình phụ trách
  if (!isPrivileged) {
    const { data: role } = await supabase
      .from('event_roles')
      .select('id')
      .eq('event_id', resolvedParams.id)
      .eq('email', auth.email)
      .eq('role_type', 'event_admin')
      .maybeSingle();

    const isCreator =
      currentEvent.created_by &&
      currentEvent.created_by.toLowerCase() === auth.email.toLowerCase();

    if (!role && !isCreator) {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền chỉnh sửa sự kiện này' },
        { status: 403 }
      );
    }
  }

  const updatePayload: Record<string, any> = {};
  if (status !== undefined) {
    updatePayload.status = status;
    updatePayload.is_active = status === 'active';

    // Nếu Super Admin hoặc Đoàn TN mở lại một sự kiện đã quá hạn trong quá khứ, tự động gia hạn giờ kết thúc để không bị re-close ngay lập tức
    if (status === 'active' && isEventPastDeadline(currentEvent) && isPrivileged) {
      const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const todayStr = nowVN.toISOString().split('T')[0];
      if (currentEvent.event_date < todayStr && !event_date) {
        updatePayload.event_date = todayStr;
      }
      if (!end_time) {
        updatePayload.end_time = '23:59';
      }
    }
  }

  if (event_name !== undefined) updatePayload.event_name = event_name;
  if (event_date !== undefined) updatePayload.event_date = event_date;
  if (start_time !== undefined) updatePayload.start_time = start_time;
  if (end_time !== undefined) updatePayload.end_time = end_time;
  if (semester !== undefined) updatePayload.semester = semester;

  const { data, error } = await supabase
    .from('events')
    .update(updatePayload)
    .eq('event_id', resolvedParams.id)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });

  return NextResponse.json({ success: true, data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin && !auth.isEventAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();

  // If not super admin, check if this event admin is authorized for this event
  if (!auth.isSuperAdmin) {
    const { data: role } = await supabase
      .from('event_roles')
      .select('id')
      .eq('event_id', resolvedParams.id)
      .eq('email', auth.email)
      .eq('role_type', 'event_admin')
      .maybeSingle();

    if (!role) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền xóa sự kiện này' }, { status: 403 });
    }
  }

  // Delete all dependent records in cascade order
  try { await supabase.from('check_ins').delete().eq('event_id', resolvedParams.id); } catch {}
  try { await supabase.from('event_roles').delete().eq('event_id', resolvedParams.id); } catch {}
  try { await supabase.from('event_ratings').delete().eq('event_id', resolvedParams.id); } catch {}
  try { await supabase.from('event_registrations').delete().eq('event_id', resolvedParams.id); } catch {}
  try { await supabase.from('event_proposals').delete().eq('created_event_id', resolvedParams.id); } catch {}

  const { error } = await supabase.from('events').delete().eq('event_id', resolvedParams.id);

  if (error) {
    console.error('DELETE /api/events/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Lỗi xóa sự kiện' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Đã xóa sự kiện thành công' });
}
