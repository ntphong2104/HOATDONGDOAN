import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';
import { getEventMeta, saveEventMeta, type EventMeta } from '@/lib/constants/event-meta-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ═══ In-memory cache — giảm 90% DB load khi 800 SV GET cùng event ═══
const eventCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 5000; // 5 giây

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const eventId = resolvedParams.id;

  // Check cache first
  const cached = eventCache.get(eventId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, data: cached.data }, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
        'X-Cache': 'HIT',
      },
    });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());
  const [eventResult, meta] = await Promise.all([
    supabase.from('events').select('*').eq('event_id', eventId).maybeSingle(),
    getEventMeta(supabase, eventId)
  ]);
  const { data, error } = eventResult;
  
  if (error || !data) return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện'}, { status: 404 });
  
  const enriched = {
    ...data,
    departments: meta.departments || [],
    sessions: meta.sessions || [],
    is_recruitment_open: meta.is_recruitment_open !== false,
    require_registration: meta.require_registration !== false,
    target_scope: meta.target_scope || 'all',
    max_participants: meta.max_participants || 0,
    max_volunteers: meta.max_volunteers || 0,
    is_locked_past_3_days: isEventLockedPast3Days({ ...data, sessions: meta.sessions || [] }),
  };

  // Save to cache
  eventCache.set(eventId, { data: enriched, ts: Date.now() });
  // Auto-cleanup: remove stale entries every 60s
  if (eventCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of eventCache) {
      if (now - v.ts > 60000) eventCache.delete(k);
    }
  }

  return NextResponse.json({ success: true, data: enriched }, {
    headers: {
      'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      'X-Cache': 'MISS',
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  eventCache.delete(resolvedParams.id); // Invalidate cache khi admin cập nhật
  const auth = await getAuthContext();

  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin && !auth.isEventAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());
  const { data: currentEvent, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .maybeSingle();

  if (fetchError || !currentEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');

  const meta = await getEventMeta(supabase, resolvedParams.id);

  // Khóa toàn bộ quyền chỉnh sửa khi sự kiện đã kết thúc quá 3 ngày (trừ Super Admin)
  if (isEventLockedPast3Days({ ...currentEvent, sessions: meta.sessions || [] }) && !isSuperAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền điều chỉnh.',
      },
      { status: 403 }
    );
  }

  const isPrivileged =
    auth.isSuperAdmin ||
    auth.tier === 'youth_union';

  const body = await req.json().catch(() => ({}));
  const {
    status,
    event_name,
    event_date,
    start_time,
    end_time,
    semester,
    departments,
    target_scope,
    is_recruitment_open,
    require_registration,
    max_participants,
    max_volunteers,
    allowed_cohorts,
  } = body;


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

  // Chỉ Super Admin mới có quyền điều chỉnh sức chứa sự kiện
  if ((max_participants !== undefined || max_volunteers !== undefined) && !isSuperAdmin) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Super Admin mới có quyền điều chỉnh sức chứa sự kiện' },
      { status: 403 }
    );
  }

  // Save departments, max_participants & recruitment custom metadata safely
  const metaUpdates: Partial<EventMeta> = {};
  if (departments !== undefined) metaUpdates.departments = departments;
  if (target_scope !== undefined) metaUpdates.target_scope = target_scope;
  if (is_recruitment_open !== undefined) metaUpdates.is_recruitment_open = is_recruitment_open;
  if (require_registration !== undefined) metaUpdates.require_registration = require_registration;
  if (max_participants !== undefined && isSuperAdmin) metaUpdates.max_participants = Math.max(0, Number(max_participants));
  if (max_volunteers !== undefined && isSuperAdmin) metaUpdates.max_volunteers = Math.max(0, Number(max_volunteers));

  if (Object.keys(metaUpdates).length > 0) {
    await saveEventMeta(supabase, resolvedParams.id, metaUpdates);
  }

  const dbPayload: Record<string, any> = {};
  if (status !== undefined) {
    dbPayload.status = status;
    dbPayload.is_active = status === 'active';
  }

  if (event_name !== undefined) dbPayload.event_name = event_name;
  if (event_date !== undefined) dbPayload.event_date = event_date;
  if (start_time !== undefined) dbPayload.start_time = start_time;
  if (end_time !== undefined) dbPayload.end_time = end_time;
  if (semester !== undefined) dbPayload.semester = semester;
  if (allowed_cohorts !== undefined) dbPayload.allowed_cohorts = Array.isArray(allowed_cohorts) && allowed_cohorts.length > 0 ? allowed_cohorts : null;

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
    require_registration: latestMeta.require_registration !== false,
    target_scope: latestMeta.target_scope || 'all',
    max_participants: latestMeta.max_participants || 0,
    max_volunteers: latestMeta.max_volunteers || 0,
  };

  return NextResponse.json({ success: true, data: result });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  eventCache.delete(resolvedParams.id);
  const auth = await getAuthContext();

  if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  if (!auth.isSuperAdmin && !auth.isEventAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');

  const { data: currentEvent } = await supabase
    .from('events')
    .select('event_id, event_date, end_time, status, created_by')
    .eq('event_id', resolvedParams.id)
    .maybeSingle();

  if (!currentEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const meta = await getEventMeta(supabase, resolvedParams.id);

  // Khóa quyền xóa khi sự kiện đã kết thúc quá 3 ngày (trừ Super Admin)
  if (isEventLockedPast3Days({ ...currentEvent, sessions: meta.sessions || [] }) && !isSuperAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền xóa sự kiện này.',
      },
      { status: 403 }
    );
  }

  // If not super admin, check if this event admin is authorized for this event
  if (!isSuperAdmin) {
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

  // Delete all dependent records in parallel
  await Promise.allSettled([
    supabase.from('check_ins').delete().eq('event_id', resolvedParams.id),
    supabase.from('event_roles').delete().eq('event_id', resolvedParams.id),
    supabase.from('event_ratings').delete().eq('event_id', resolvedParams.id),
    supabase.from('event_registrations').delete().eq('event_id', resolvedParams.id),
    supabase.from('event_proposals').delete().eq('created_event_id', resolvedParams.id),
  ]);

  const { error } = await supabase.from('events').delete().eq('event_id', resolvedParams.id);

  if (error) {
    console.error('DELETE /api/events/[id] error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Lỗi xóa sự kiện' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Đã xóa sự kiện thành công' });
}
