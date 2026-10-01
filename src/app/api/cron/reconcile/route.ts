import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { reconcileAllPastEvents } from '@/lib/utils/blacklist-logic';
import { cleanupExpiredStudentEventRoles } from '@/lib/constants/event-roles-cleanup';

/**
 * Cron Job: Tự động chốt điểm danh + xử lý vi phạm + thu hồi quyền
 * Chạy mỗi ngày lúc 2:00 AM (UTC) = 9:00 AM (VN)
 * 
 * 1. reconcileAllPastEvents: Chốt điểm danh tất cả sự kiện > 3 ngày
 * 2. cleanupExpiredStudentEventRoles: Thu hồi quyền Admin/CTV sự kiện > 3 ngày
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

    // 1. Chốt điểm danh + xử lý vi phạm
    const reconcileResult = await reconcileAllPastEvents(supabase);

    // 2. Thu hồi quyền Admin/CTV sự kiện đã kết thúc > 3 ngày
    let cleanupResult = { cleanedCount: 0 };
    try {
      cleanupResult = await cleanupExpiredStudentEventRoles(supabase, 3);
    } catch (cleanupErr: any) {
      console.error('[CRON] Cleanup expired roles error:', cleanupErr);
    }

    console.log(`[CRON] Daily job completed:`, {
      reconcile: {
        eventsProcessed: reconcileResult.totalProcessedEvents,
        totalAbsent: reconcileResult.totalAbsent,
        newBlacklisted: reconcileResult.totalNewlyBlacklisted,
      },
      cleanup: {
        rolesRevoked: cleanupResult.cleanedCount,
      },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: {
        reconcile: reconcileResult,
        cleanup: cleanupResult,
      },
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
