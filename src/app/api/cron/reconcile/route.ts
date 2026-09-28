import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { reconcileAllPastEvents } from '@/lib/utils/blacklist-logic';

/**
 * Cron Job: Tự động chốt điểm danh + xử lý vi phạm
 * Chạy mỗi ngày lúc 2:00 AM (UTC) = 9:00 AM (VN)
 * 
 * Vercel Cron gọi route này → reconcile tất cả sự kiện
 * đã kết thúc quá 3 ngày mà chưa được chốt.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Cho phép chạy tối đa 60s (Vercel Pro) hoặc 10s (Hobby)

export async function GET(req: Request) {
  // Xác thực: chỉ Vercel Cron mới gọi được
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = typeof createAdminClient === 'function'
      ? await createAdminClient()
      : await createClient();

    const result = await reconcileAllPastEvents(supabase);

    console.log(`[CRON] Reconcile completed:`, {
      eventsProcessed: result.eventsProcessed,
      totalAbsent: result.totalAbsent,
      newBlacklisted: result.newBlacklisted,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[CRON] Reconcile error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
