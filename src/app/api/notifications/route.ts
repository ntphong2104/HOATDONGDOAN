import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import { getMasterStudentByMssv, isPlaceholderClass } from '@/lib/utils/student-profile';
import { runSerializedByKey } from '@/lib/utils/concurrency-queue';
import { sanitizeRedirectPath } from '@/lib/security/redirect';
import { sanitizePostgrestValue } from '@/lib/security/sanitizer';
import { getRegistrationExtras } from '@/lib/constants/event-meta-store';

export const dynamic = 'force-dynamic';

interface InboxNotification {
  id: string;
  title: string;
  body: string;
  url: string | null;
  target_type: string;
  created_at: string;
  is_read: boolean;
}

function getReadKey(email: string): string {
  return `notif_read_${email.toLowerCase().trim()}`;
}

async function getReadIdSet(supabase: any, email: string): Promise<Set<string>> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', getReadKey(email))
      .maybeSingle();
    if (!data?.value) return new Set();
    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    if (Array.isArray(parsed)) {
      return new Set(parsed.map((x) => String(x)));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

const SHARED_FEED_TTL_MS = 30_000; // 30s shared feed cache across all concurrent users

interface SharedFeedCacheState {
  rows: any[];
  expiresAt: number;
  inflight: Promise<any[]> | null;
}

function getSharedFeedCache(): SharedFeedCacheState {
  const g = globalThis as unknown as { __hddNotifFeedCache?: SharedFeedCacheState };
  if (!g.__hddNotifFeedCache) {
    g.__hddNotifFeedCache = { rows: [], expiresAt: 0, inflight: null };
  }
  return g.__hddNotifFeedCache;
}

async function loadSharedNotificationFeed(supabase: any): Promise<any[]> {
  const cache = getSharedFeedCache();
  const now = Date.now();
  if (now < cache.expiresAt) {
    return cache.rows;
  }
  if (cache.inflight) {
    return cache.inflight;
  }

  const task = (async (): Promise<any[]> => {
    try {
      const [{ data: globalLogs }, { data: recentLogs }, { data: fallbackRow }] = await Promise.all([
        supabase
          .from('push_logs')
          .select('id, title, body, url, target_type, target_value, created_at')
          .in('target_type', ['all', 'broadcast', 'lcd'])
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('push_logs')
          .select('id, title, body, url, target_type, target_value, created_at')
          .order('created_at', { ascending: false })
          .limit(80),
        supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'push_inbox_history')
          .maybeSingle(),
      ]);

      const combinedRows: any[] = [];
      const seenIds = new Set<string>();
      const pushUnique = (row: any) => {
        if (!row || !row.id) return;
        const sid = String(row.id);
        if (seenIds.has(sid)) return;
        seenIds.add(sid);
        combinedRows.push(row);
      };

      if (Array.isArray(globalLogs)) {
        for (const r of globalLogs) pushUnique(r);
      }
      if (Array.isArray(recentLogs)) {
        for (const r of recentLogs) pushUnique(r);
      }
      if (fallbackRow?.value) {
        try {
          const parsed =
            typeof fallbackRow.value === 'string'
              ? JSON.parse(fallbackRow.value)
              : fallbackRow.value;
          if (Array.isArray(parsed)) {
            for (const r of parsed) pushUnique(r);
          }
        } catch {}
      }

      combinedRows.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );

      cache.rows = combinedRows;
      cache.expiresAt = Date.now() + SHARED_FEED_TTL_MS;
      return combinedRows;
    } finally {
      cache.inflight = null;
    }
  })();

  cache.inflight = task;
  return task;
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const lowerEmail = auth.email.toLowerCase().trim();
    const mssv = (extractMSSV(lowerEmail) || '').toUpperCase().trim();
    const safeEmail = sanitizePostgrestValue(lowerEmail, 120);
    const safeMssv = sanitizePostgrestValue(mssv, 40);

    const [combinedRows, { data: userRow }, { data: regs }, readSet] = await Promise.all([
      loadSharedNotificationFeed(supabase),
      mssv
        ? supabase
            .from('users')
            .select('class_id')
            .or(`email.eq.${safeEmail},mssv.eq.${safeMssv}`)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      mssv
        ? supabase
            .from('event_registrations')
            .select('event_id, role_type, attended')
            .eq('mssv', mssv)
        : Promise.resolve({ data: [] }),
      getReadIdSet(supabase, lowerEmail),
    ]);

    if (combinedRows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { notifications: [], unread_count: 0 },
      });
    }

    const master = mssv ? getMasterStudentByMssv(mssv) : null;
    const classId =
      userRow?.class_id && !isPlaceholderClass(userRow.class_id)
        ? userRow.class_id
        : master?.class_id || '';
    const myLcd = resolveStudentLcd(classId, mssv);
    const myRegByEventId = new Map<string, { role_type?: string | null; attended?: boolean | null }>();
    for (const r of regs || []) {
      const evId = String(r.event_id || '').trim();
      if (evId) myRegByEventId.set(evId, r);
    }

    // Preload registration extras ONLY for events that have volunteer-audience notifications
    const volunteerExtraEvents = new Set<string>();
    for (const row of combinedRows) {
      const tType = String(row.target_type || '').toLowerCase();
      if (tType === 'event:volunteers_accepted' || tType === 'event:volunteers_pending') {
        const eventIdPart = String(row.target_value || '').split(':')[0].trim();
        if (eventIdPart && myRegByEventId.get(eventIdPart)?.role_type === 'volunteer') {
          volunteerExtraEvents.add(eventIdPart);
        }
      }
    }
    const extrasByEventId = new Map<string, Record<string, any>>();
    if (mssv && volunteerExtraEvents.size > 0) {
      await Promise.all(
        Array.from(volunteerExtraEvents).map(async (evId) => {
          try {
            const ex = await getRegistrationExtras(supabase, evId);
            if (ex) extrasByEventId.set(evId, ex);
          } catch {}
        })
      );
    }

    const matched: InboxNotification[] = [];
    for (const row of combinedRows) {
      const tType = String(row.target_type || '').toLowerCase();
      const tVal = String(row.target_value || '');

      let relevant = false;
      if (tType === 'all' || tType === 'broadcast') {
        relevant = true;
      } else if (tType === 'lcd') {
        const lcdTargets = tVal
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
        relevant = Boolean(myLcd && lcdTargets.includes(myLcd.code));
      } else if (tType === 'email' || tType === 'emails' || tType === 'user') {
        const emailTokens = tVal
          .split(',')
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
        relevant = emailTokens.includes(lowerEmail);
      } else if (tType === 'mssv') {
        const mssvTokens = tVal
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
        relevant = Boolean(mssv && mssvTokens.includes(mssv));
      } else if (tType === 'event' || tType.startsWith('event:')) {
        const eventIdPart = tVal.split(':')[0].trim();
        const myReg = eventIdPart ? myRegByEventId.get(eventIdPart) : undefined;
        if (myReg) {
          const audience = tType.startsWith('event:') ? tType.slice('event:'.length) : 'all_registered';
          if (audience === 'checked_in') {
            relevant = Boolean(myReg.attended);
          } else if (audience === 'not_checked_in') {
            relevant = !myReg.attended;
          } else if (audience === 'participants') {
            relevant = !myReg.role_type || myReg.role_type === 'participant';
          } else if (audience === 'volunteers_accepted') {
            const myExtra = mssv ? extrasByEventId.get(eventIdPart)?.[mssv] : undefined;
            relevant = myReg.role_type === 'volunteer' && String(myExtra?.review_status || '').toLowerCase() === 'accepted';
          } else if (audience === 'volunteers_pending') {
            const myExtra = mssv ? extrasByEventId.get(eventIdPart)?.[mssv] : undefined;
            const revStatus = String(myExtra?.review_status || '').toLowerCase();
            relevant = myReg.role_type === 'volunteer' && (revStatus === '' || revStatus === 'pending');
          } else {
            relevant = true;
          }
        }
      }

      if (!relevant) continue;

      const safeUrl = row.url ? sanitizeRedirectPath(String(row.url), '') || null : null;

      matched.push({
        id: String(row.id),
        title: String(row.title || 'Thông báo'),
        body: String(row.body || ''),
        url: safeUrl,
        target_type: tType,
        created_at: String(row.created_at),
        is_read: readSet.has(String(row.id)),
      });

      if (matched.length >= 20) break;
    }

    const unreadCount = matched.filter((n) => !n.is_read).length;

    return NextResponse.json(
      {
        success: true,
        data: {
          notifications: matched,
          unread_count: unreadCount,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('GET /api/notifications error:', err);
    return NextResponse.json({
      success: true,
      data: { notifications: [], unread_count: 0 },
    });
  }
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Chưa đăng nhập' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const lowerEmail = auth.email.toLowerCase().trim();
    const updatedList = await runSerializedByKey(`notif_read_${lowerEmail}`, async () => {
      const readSet = await getReadIdSet(supabase, lowerEmail);

      if (typeof body.id === 'string' && body.id.trim()) {
        readSet.add(body.id.trim());
      }
      if (Array.isArray(body.ids)) {
        for (const id of body.ids) {
          if (typeof id === 'string' && id.trim()) {
            readSet.add(id.trim());
          }
        }
      }

      // Keep latest 100 read IDs so system_settings row stays compact
      const nextList = Array.from(readSet).slice(-100);

      await supabase.from('system_settings').upsert(
        {
          key: getReadKey(lowerEmail),
          value: JSON.stringify(nextList),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
      return nextList;
    });

    return NextResponse.json({ success: true, read_count: updatedList.length });
  } catch (err: any) {
    console.error('POST /api/notifications error:', err);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật trạng thái đã đọc' }, { status: 500 });
  }
}
