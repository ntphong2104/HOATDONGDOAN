import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getRegistrationExtras } from '@/lib/constants/event-meta-store';
import { notifyUsersByMssv, recordInboxNotification } from '@/lib/utils/web-push';
import { fetchAllRows } from '@/lib/supabase/pagination';

export const dynamic = 'force-dynamic';

type EventAudience =
  | 'all_registered'
  | 'participants'
  | 'volunteers_accepted'
  | 'volunteers_pending'
  | 'not_checked_in'
  | 'checked_in';

async function verifyEventNotifyPermission(
  supabase: any,
  auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>,
  eventId: string
): Promise<{ allowed: boolean; event?: any }> {
  const { data: event } = await supabase
    .from('events')
    .select('event_id, event_name, created_by, status')
    .eq('event_id', eventId)
    .maybeSingle();

  if (!event) return { allowed: false };

  if (auth.isSuperAdmin || auth.tier === 'super_admin' || auth.tier === 'youth_union') {
    return { allowed: true, event };
  }

  const email = auth.email.toLowerCase().trim();
  if (String(event.created_by || '').toLowerCase().trim() === email) {
    return { allowed: true, event };
  }

  const { data: roleRow } = await supabase
    .from('event_roles')
    .select('id')
    .eq('event_id', eventId)
    .ilike('email', email)
    .eq('role_type', 'event_admin')
    .maybeSingle();

  return { allowed: Boolean(roleRow), event };
}

async function resolveAudienceBuckets(supabase: any, eventId: string) {
  const [{ data: regs }, { data: checkins }, extras] = await Promise.all([
    fetchAllRows<any>(() =>
      supabase
        .from('event_registrations')
        .select('mssv, role_type, attended')
        .eq('event_id', eventId)
    ),
    fetchAllRows<any>(() => supabase.from('check_ins').select('mssv').eq('event_id', eventId)),
    getRegistrationExtras(supabase, eventId),
  ]);

  const checkedInSet = new Set<string>(
    (checkins || []).map((c: any) => String(c.mssv || '').trim().toUpperCase()).filter(Boolean)
  );

  const buckets: Record<EventAudience, Set<string>> = {
    all_registered: new Set(),
    participants: new Set(),
    volunteers_accepted: new Set(),
    volunteers_pending: new Set(),
    not_checked_in: new Set(),
    checked_in: new Set(checkedInSet),
  };

  for (const r of regs || []) {
    const mssv = String(r.mssv || '').trim().toUpperCase();
    if (!mssv) continue;

    buckets.all_registered.add(mssv);
    const extra = extras?.[mssv] || {};
    const reviewStatus = String(extra.review_status || '').toLowerCase();
    const isVolunteer = r.role_type === 'volunteer' || Boolean(extra.department_id || extra.department_name);

    if (isVolunteer) {
      if (reviewStatus === 'accepted' || (r.role_type === 'volunteer' && reviewStatus !== 'pending' && reviewStatus !== 'rejected')) {
        buckets.volunteers_accepted.add(mssv);
      } else if (reviewStatus === 'pending') {
        buckets.volunteers_pending.add(mssv);
      }
    } else {
      buckets.participants.add(mssv);
    }

    if (r.attended || checkedInSet.has(mssv)) {
      buckets.checked_in.add(mssv);
    } else {
      buckets.not_checked_in.add(mssv);
    }
  }

  return buckets;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await params;
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const perm = await verifyEventNotifyPermission(supabase, auth, resolved.id);
    if (!perm.allowed || !perm.event) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const buckets = await resolveAudienceBuckets(supabase, resolved.id);
    const counts: Record<EventAudience, number> = {
      all_registered: buckets.all_registered.size,
      participants: buckets.participants.size,
      volunteers_accepted: buckets.volunteers_accepted.size,
      volunteers_pending: buckets.volunteers_pending.size,
      not_checked_in: buckets.not_checked_in.size,
      checked_in: buckets.checked_in.size,
    };

    return NextResponse.json({ success: true, data: { counts } });
  } catch (err: any) {
    console.error('GET /api/events/[id]/notify error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi tải số lượng đối tượng nhận thông báo' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await params;
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`event_notify_${resolved.id}`, 5, 5 * 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Gửi quá nhanh cho sự kiện này, thử lại sau ${rl.resetInSeconds} giây.` },
        { status: 429 }
      );
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const perm = await verifyEventNotifyPermission(supabase, auth, resolved.id);
    if (!perm.allowed || !perm.event) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Ban tổ chức sự kiện, Đoàn Học Viện hoặc Super Admin mới có quyền gửi thông báo.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const audience = String(body?.audience || 'all_registered') as EventAudience;
    const title = String(body?.title || '').trim();
    const message = String(body?.body || '').trim();

    const validAudiences: EventAudience[] = [
      'all_registered',
      'participants',
      'volunteers_accepted',
      'volunteers_pending',
      'not_checked_in',
      'checked_in',
    ];
    if (!validAudiences.includes(audience)) {
      return NextResponse.json({ success: false, error: 'Nhóm người nhận không hợp lệ' }, { status: 400 });
    }
    if (!title || !message) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng nhập đầy đủ Tiêu đề và Nội dung thông báo' },
        { status: 400 }
      );
    }

    const buckets = await resolveAudienceBuckets(supabase, resolved.id);
    const targetMssvs = Array.from(buckets[audience]);

    if (targetMssvs.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không có sinh viên nào trong nhóm đối tượng này.' },
        { status: 400 }
      );
    }

    const stats = await notifyUsersByMssv(
      supabase,
      targetMssvs,
      {
        title,
        body: message,
        url: `/events/${resolved.id}/register`,
        tag: `event-notify-${resolved.id}-${Date.now()}`,
      },
      { skipInboxLog: true }
    );

    await recordInboxNotification(supabase, {
      title,
      body: message,
      url: `/events/${resolved.id}/register`,
      target_type: `event:${audience}`,
      target_value: resolved.id,
    });

    try {
      await supabase.from('push_logs').insert({
        title,
        body: message,
        url: `/events/${resolved.id}/register`,
        target_type: `event:${audience}`,
        target_value: resolved.id,
        sent_by: auth.email,
        total_targets: stats.total,
        delivered_count: stats.delivered,
        failed_count: stats.failed,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      data: {
        recipients_in_group: targetMssvs.length,
        ...stats,
      },
      message:
        stats.total === 0
          ? `Nhóm này có ${targetMssvs.length} sinh viên nhưng chưa bạn nào bật thông báo đẩy trên điện thoại.`
          : `Đã gửi thông báo tới ${stats.delivered}/${stats.total} thiết bị đã bật thông báo (trên tổng ${targetMssvs.length} SV thuộc nhóm)!`,
    });
  } catch (err: any) {
    console.error('POST /api/events/[id]/notify error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi gửi thông báo cho sự kiện' }, { status: 500 });
  }
}
