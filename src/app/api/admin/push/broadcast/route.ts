import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { normalizeLcdCode } from '@/lib/utils/lcd';
import { dispatchPushToSubscriptions } from '@/lib/utils/web-push';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'youth_union') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const [{ data: subs }, { data: logs }, { data: activeEvents }] = await Promise.all([
      supabase
        .from('push_subscriptions')
        .select('user_email, device_type, lcd_code')
        .eq('is_active', true),
      supabase
        .from('push_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('events')
        .select('event_id, event_name, event_date, status')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    const rows = subs || [];
    const uniqueUsers = new Set(rows.map((r: any) => String(r.user_email || '').toLowerCase())).size;
    const byDevice: Record<string, number> = { ios_pwa: 0, android: 0, desktop: 0, unknown: 0 };
    for (const r of rows) {
      const dt = String(r.device_type || 'unknown');
      byDevice[dt] = (byDevice[dt] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalActiveDevices: rows.length,
        uniqueUsers,
        byDevice,
        recentLogs: logs || [],
        activeEvents: activeEvents || [],
      },
    });
  } catch (err: any) {
    console.error('GET /api/admin/push/broadcast error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi tải thống kê thông báo' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'youth_union') {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin hoặc Đoàn Học Viện mới có quyền gửi thông báo toàn hệ thống' },
        { status: 403 }
      );
    }

    const rl = checkRateLimit(`push_broadcast_${auth.email}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Gửi quá nhanh, thử lại sau ${rl.resetInSeconds} giây` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const title = String(body?.title || '').trim();
    const message = String(body?.body || '').trim();
    const rawUrl = String(body?.url || '/').trim();
    const url = rawUrl.startsWith('/') ? rawUrl : '/';
    const targetType = String(body?.target_type || 'all');
    const targetValue = String(body?.target_value || '').trim();

    if (!title || !message) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng nhập đầy đủ Tiêu đề và Nội dung thông báo' },
        { status: 400 }
      );
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    let subscriptions: any[] = [];

    if (targetType === 'lcd') {
      const lcdCode = normalizeLcdCode(targetValue);
      if (!lcdCode) {
        return NextResponse.json({ success: false, error: 'Vui lòng chọn Liên Chi Đoàn hợp lệ' }, { status: 400 });
      }
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_email')
        .eq('is_active', true)
        .eq('lcd_code', lcdCode)
        .limit(5000);
      subscriptions = data || [];
    } else if (targetType === 'event') {
      if (!targetValue) {
        return NextResponse.json({ success: false, error: 'Vui lòng chọn sự kiện cần gửi nhắc lịch' }, { status: 400 });
      }
      const { data: regs } = await supabase
        .from('event_registrations')
        .select('mssv, email')
        .eq('event_id', targetValue);

      const mssvs = Array.from(
        new Set((regs || []).map((r: any) => String(r.mssv || '').trim().toUpperCase()).filter(Boolean))
      );
      if (mssvs.length > 0) {
        for (let i = 0; i < mssvs.length; i += 250) {
          const { data: subChunk } = await supabase
            .from('push_subscriptions')
            .select('id, endpoint, p256dh, auth, user_email')
            .eq('is_active', true)
            .in('mssv', mssvs.slice(i, i + 250));
          if (subChunk) subscriptions.push(...subChunk);
        }
      }
    } else {
      const { data } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, user_email')
        .eq('is_active', true)
        .limit(5000);
      subscriptions = data || [];
    }

    const stats = await dispatchPushToSubscriptions(supabase, subscriptions, {
      title,
      body: message,
      url,
      tag: `broadcast-${Date.now()}`,
    });

    try {
      await supabase.from('push_logs').insert({
        title,
        body: message,
        url,
        target_type: targetType,
        target_value: targetValue || null,
        sent_by: auth.email,
        total_targets: stats.total,
        delivered_count: stats.delivered,
        failed_count: stats.failed,
      });
    } catch {}

    return NextResponse.json({
      success: true,
      message:
        stats.total === 0
          ? 'Chưa có thiết bị nào trong nhóm đối tượng này bật thông báo đẩy.'
          : `Đã gửi thông báo thành công tới ${stats.delivered}/${stats.total} thiết bị!`,
      data: stats,
    });
  } catch (err: any) {
    console.error('POST /api/admin/push/broadcast error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống khi gửi thông báo' }, { status: 500 });
  }
}
