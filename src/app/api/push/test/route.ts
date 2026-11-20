import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { notifyUsersByEmail } from '@/lib/utils/web-push';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const rl = checkRateLimit(`push_test_${auth.email}`, 5, 60_000);
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Thử lại sau ${rl.resetInSeconds} giây.` },
        { status: 429 }
      );
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const result = await notifyUsersByEmail(supabase, [auth.email], {
      title: '🔔 Thông báo từ Hoạt Động Đoàn PTIT HCM',
      body: 'Thiết bị của bạn đã kết nối thông báo đẩy thành công! Bạn sẽ nhận tin tức sự kiện, điểm danh và phê duyệt ngay lập tức.',
      url: '/',
      tag: `test-${Date.now()}`,
    });

    if (result.total === 0) {
      return NextResponse.json(
        { success: false, error: 'Bạn chưa bật thông báo trên thiết bị nào.' },
        { status: 400 }
      );
    }

    if (result.delivered === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Không gửi được thông báo tới thiết bị (có thể khóa VAPID chưa cấu hình hoặc thiết bị đã thu hồi quyền).',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Đã gửi thông báo thử nghiệm tới ${result.delivered}/${result.total} thiết bị!`,
      data: result,
    });
  } catch (err: any) {
    console.error('POST /api/push/test error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi gửi thông báo thử nghiệm' }, { status: 500 });
  }
}
