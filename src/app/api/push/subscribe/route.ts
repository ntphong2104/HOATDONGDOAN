import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import { getMasterStudentByMssv, isPlaceholderClass } from '@/lib/utils/student-profile';
import { getPublicVapidKey } from '@/lib/utils/web-push';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());
    const email = auth.email.toLowerCase().trim();

    const [publicKey, { data: subs }] = await Promise.all([
      getPublicVapidKey(supabase),
      supabase
        .from('push_subscriptions')
        .select('id, endpoint, device_type, updated_at')
        .eq('user_email', email)
        .eq('is_active', true),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        configured: Boolean(publicKey),
        publicKey: publicKey || null,
        subscribed: Array.isArray(subs) && subs.length > 0,
        deviceCount: Array.isArray(subs) ? subs.length : 0,
        endpoints: (subs || []).map((s: any) => s.endpoint),
      },
    });
  } catch (err: any) {
    console.error('GET /api/push/subscribe error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi tải trạng thái thông báo' }, { status: 500 });
  }
}

import { isTrustedPushEndpoint } from '@/lib/utils/web-push';

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || '').trim();
    const p256dh = String(body?.keys?.p256dh || body?.p256dh || '').trim();
    const authKey = String(body?.keys?.auth || body?.auth || '').trim();
    const deviceType = String(body?.device_type || 'unknown').slice(0, 32);

    if (!isTrustedPushEndpoint(endpoint) || !p256dh || !authKey) {
      return NextResponse.json(
        { success: false, error: 'Endpoint hoặc dữ liệu đăng ký thiết bị Web Push không hợp lệ' },
        { status: 400 }
      );
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());
    const email = auth.email.toLowerCase().trim();
    const mssv = extractMSSV(email) || null;

    let lcdCode: string | null = null;
    if (mssv) {
      const { data: userRow } = await supabase
        .from('users')
        .select('class_id')
        .eq('mssv', mssv)
        .maybeSingle();
      const master = getMasterStudentByMssv(mssv);
      const classId =
        userRow?.class_id && !isPlaceholderClass(userRow.class_id)
          ? userRow.class_id
          : master?.class_id || null;
      const lcd = resolveStudentLcd(classId, mssv);
      lcdCode = lcd?.code || null;
    } else {
      const lcd = resolveStudentLcd(null, email);
      lcdCode = lcd?.code || null;
    }

    const userAgent = (req.headers.get('user-agent') || '').slice(0, 240);
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_email: email,
          mssv,
          lcd_code: lcdCode,
          endpoint,
          p256dh,
          auth: authKey,
          device_type: deviceType,
          user_agent: userAgent,
          is_active: true,
          updated_at: nowIso,
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('Upsert push subscription error:', error);
      return NextResponse.json(
        { success: false, error: `Không thể lưu đăng ký thông báo: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Đã bật thông báo đẩy cho thiết bị này thành công!',
    });
  } catch (err: any) {
    console.error('POST /api/push/subscribe error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống khi đăng ký thông báo' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || '').trim();
    const email = auth.email.toLowerCase().trim();

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    let query = supabase
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_email', email);

    if (endpoint) {
      query = query.eq('endpoint', endpoint);
    }

    const { error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Đã tắt thông báo đẩy trên thiết bị này.',
    });
  } catch (err: any) {
    console.error('DELETE /api/push/subscribe error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hủy đăng ký thông báo' }, { status: 500 });
  }
}
