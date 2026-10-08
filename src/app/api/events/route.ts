import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isEventPastDeadline } from '@/lib/utils/event-logic';

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isYouthUnion = auth.tier === 'youth_union';

  const supabase = await createClient();
  let query = supabase
    .from('events')
    .select('*, event_roles(id, email, role_type)')
    .order('created_at', { ascending: false });

  if (!isSuperAdmin && !isYouthUnion) {
    const [
      { data: eventRoles },
      { data: createdEvents }
    ] = await Promise.all([
      supabase
        .from('event_roles')
        .select('event_id')
        .ilike('email', auth.email)
        .eq('role_type', 'event_admin'),
      supabase
        .from('events')
        .select('event_id')
        .ilike('created_by', auth.email)
    ]);

    const roleEventIds = (eventRoles || []).map((r) => r.event_id);
    const createdEventIds = (createdEvents || []).map((e) => e.event_id);
    const allAccessibleIds = [...new Set([...roleEventIds, ...createdEventIds])];

    if (allAccessibleIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
    query = query.in('event_id', allAccessibleIds);
  }

  const { data: events, error } = await query;

  if (error) return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });

  // Batch-fetch all event meta (sessions) to correctly determine deadline
  const metaKeys = (events || []).map((ev: any) => `event_meta_${ev.event_id}`);
  
  let metaMap: Record<string, any> = {};
  if (metaKeys.length > 0) {
    try {
      const { data: metaRows } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', metaKeys);
      for (const row of metaRows || []) {
        const eventId = row.key.replace('event_meta_', '');
        const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
        metaMap[eventId] = parsed;
      }
    } catch {}
  }

  const processedEvents = (events || []).map((ev: any) => {
    const sessions = metaMap[ev.event_id]?.sessions || [];
    const isPast = isEventPastDeadline({ ...ev, sessions });
    // Include sessions so client-side lifecycle labels (EventCard, super-admin list)
    // use the real last session instead of only event_date.
    return { ...ev, sessions, is_past_deadline: isPast };
  });

  return NextResponse.json({ success: true, data: processedEvents });
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(`event_create_${auth.email}`, 5, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: `Thao tác quá nhanh, thử lại sau ${rateLimit.resetInSeconds} giây` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
    );
  }

  if (!auth.isSuperAdmin && !auth.isEventAdmin) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const { event_name, event_date, start_time, end_time, semester, allowed_cohorts } = await req.json();

  if (!event_name || !event_name.trim()) {
    return NextResponse.json({ success: false, error: 'Tên sự kiện không được để trống' }, { status: 400 });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  if (event_date && event_date < todayStr) {
    return NextResponse.json({ success: false, error: '🚫 Ngày tổ chức sự kiện không thể ở trong quá khứ! Vui lòng chọn ngày hiện tại hoặc tương lai.' }, { status: 400 });
  }
  const supabase = await createClient();
  const isAutoApproved = auth.isSuperAdmin;
  const initialStatus = isAutoApproved ? 'active' : 'pending';
  const initialIsActive = isAutoApproved;

  const { data, error } = await supabase
    .from('events')
    .insert({
      event_name: event_name.trim(),
      event_date: event_date || todayStr,
      start_time: start_time || '07:00:00',
      end_time: end_time || '22:00:00',
      semester: semester || 'Chưa xếp kỳ',
      is_active: initialIsActive,
      status: initialStatus,
      created_by: auth.email,
      allowed_cohorts: Array.isArray(allowed_cohorts) && allowed_cohorts.length > 0 ? allowed_cohorts : null,
    })
    .select()
    .single();

  if (error) {
    console.error('Supabase create event error:', error);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  // If requested by Event Admin, automatically assign them to event_roles so they can track approval
  if (!auth.isSuperAdmin && auth.email && data?.event_id) {
    await supabase.from('event_roles').insert({
      event_id: data.event_id,
      email: auth.email,
      role_type: 'event_admin',
    });
  }

  return NextResponse.json({ success: true, data });
}
