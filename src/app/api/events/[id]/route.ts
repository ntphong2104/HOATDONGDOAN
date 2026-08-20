import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isEventPastDeadline } from '@/lib/utils/event-logic';
import { getEventMeta, saveEventMeta, type EventMeta } from '@/lib/constants/event-meta-store';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from('events').select('*').eq('event_id', resolvedParams.id).maybeSingle();
  
  if (error || !data) return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện'}, { status: 404 });
  
  if (data && data.status === 'active' && isEventPastDeadline(data)) {
    data.status = 'closed';
    data.is_active = false;
    supabase.from('events').update({ status: 'closed', is_active: false }).eq('event_id', resolvedParams.id).then(() => {});
  }

  const meta = await getEventMeta(supabase, resolvedParams.id);
  const enriched = {
    ...data,
    departments: meta.departments || [],
    is_recruitment_open: meta.is_recruitment_open !== false,
    target_scope: meta.target_scope || 'all',
  };

  return NextResponse.json({ success: true, data: enriched });
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
    .maybeSingle();

  if (fetchError || !currentEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const isPrivileged =
    auth.isSuperAdmin ||
    auth.tier === 'youth_union' ||
    auth.email.toLowerCase().includes('doanthanhnien');

  const body = await req.json().catch(() => ({}));
  const { status, event_name, event_date, start_time, end_time, semester, departments, target_scope, is_recruitment_open } = body;

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

  // Save departments & recruitment custom metadata safely
  const metaUpdates: Partial<EventMeta> = {};
  if (departments !== undefined) metaUpdates.departments = departments;
  if (target_scope !== undefined) metaUpdates.target_scope = target_scope;
  if (is_recruitment_open !== undefined) metaUpdates.is_recruitment_open = is_recruitment_open;

  if (Object.keys(metaUpdates).length > 0) {
    await saveEventMeta(supabase, resolvedParams.id, metaUpdates);
  }

  const dbPayload: Record<string, any> = {};
  if (status !== undefined) {
    dbPayload.status = status;
    dbPayload.is_active = status === 'active';

    if (status === 'active' && isEventPastDeadline(currentEvent) && isPrivileged) {
      const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const todayStr = nowVN.toISOString().split('T')[0];
      if (currentEvent.event_date < todayStr && !event_date) {
        dbPayload.event_date = todayStr;
      }
      if (!end_time) {
        dbPayload.end_time = '23:59';
      }
    }
  }

  if (event_name !== undefined) dbPayload.event_name = event_name;
  if (event_date !== undefined) dbPayload.event_date = event_date;
  if (start_time !== undefined) dbPayload.start_time = start_time;
  if (end_time !== undefined) dbPayload.end_time = end_time;
  if (semester !== undefined) dbPayload.semester = semester;

  let updatedEvent = currentEvent;
  if (Object.keys(dbPayload).length > 0) {
    const { data, error } = await supabase
      .from('events')
      .update(dbPayload)
      .eq('event_id', resolvedParams.id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Update event error:', error);
      return NextResponse.json({ success: false, error: 'Lỗi cập nhật thông tin sự kiện' }, { status: 500 });
    }
    if (data) updatedEvent = data;
  }

  const latestMeta = await getEventMeta(supabase, resolvedParams.id);
  const result = {
    ...updatedEvent,
    departments: latestMeta.departments || [],
    is_recruitment_open: latestMeta.is_recruitment_open !== false,
    target_scope: latestMeta.target_scope || 'all',
  };

  return NextResponse.json({ success: true, data: result });
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
