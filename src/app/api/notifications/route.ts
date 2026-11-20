import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import { getMasterStudentByMssv, isPlaceholderClass } from '@/lib/utils/student-profile';

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

    const [{ data: logs, error: logsErr }, { data: userRow }, { data: regs }, readSet] =
      await Promise.all([
        supabase
          .from('push_logs')
          .select('id, title, body, url, target_type, target_value, created_at')
          .order('created_at', { ascending: false })
          .limit(60),
        mssv
          ? supabase
              .from('users')
              .select('class_id')
              .or(`email.eq.${lowerEmail},mssv.eq.${mssv}`)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        mssv
          ? supabase
              .from('event_registrations')
              .select('event_id')
              .eq('mssv', mssv)
          : Promise.resolve({ data: [] }),
        getReadIdSet(supabase, lowerEmail),
      ]);

    if (logsErr || !Array.isArray(logs)) {
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
    const myEventIds = new Set<string>(
      (regs || []).map((r: any) => String(r.event_id || '')).filter(Boolean)
    );

    const matched: InboxNotification[] = [];
    for (const row of logs) {
      const tType = String(row.target_type || '').toLowerCase();
      const tVal = String(row.target_value || '');
      const tValLower = tVal.toLowerCase();

      let relevant = false;
      if (tType === 'all' || tType === 'broadcast') {
        relevant = true;
      } else if (tType === 'lcd') {
        relevant = Boolean(myLcd && tVal.toUpperCase() === myLcd.code);
      } else if (tType === 'email' || tType === 'emails' || tType === 'user') {
        relevant = tValLower.includes(lowerEmail);
      } else if (tType === 'mssv') {
        relevant = Boolean(mssv && tVal.toUpperCase().includes(mssv));
      } else if (tType === 'event' || tType.startsWith('event')) {
        // target_value may be "<event_id>" or "<event_id>:<audience>"
        const eventIdPart = tVal.split(':')[0].trim();
        relevant = Boolean(eventIdPart && myEventIds.has(eventIdPart));
      }

      if (!relevant) continue;

      matched.push({
        id: String(row.id),
        title: String(row.title || 'Thông báo'),
        body: String(row.body || ''),
        url: row.url ? String(row.url) : null,
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
    const updatedList = Array.from(readSet).slice(-100);

    await supabase.from('system_settings').upsert(
      {
        key: getReadKey(lowerEmail),
        value: JSON.stringify(updatedList),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

    return NextResponse.json({ success: true, read_count: updatedList.length });
  } catch (err: any) {
    console.error('POST /api/notifications error:', err);
    return NextResponse.json({ success: false, error: 'Không thể cập nhật trạng thái đã đọc' }, { status: 500 });
  }
}
