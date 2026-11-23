import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { reconcileAllPastEvents } from '@/lib/utils/blacklist-reconcile';
import { cleanupExpiredStudentEventRoles } from '@/lib/constants/event-roles-cleanup';

/**
 * Cron Job: Tự động thu hồi quyền + chốt điểm danh + xử lý vi phạm
 * Chạy mỗi ngày lúc 2:00 AM (UTC) = 9:00 AM (VN)
 *
 * 1. cleanupExpiredStudentEventRoles: Thu hồi quyền Admin/CTV sự kiện > 3 ngày
 * 2. reconcileAllPastEvents: Chốt điểm danh tất cả sự kiện > 3 ngày
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function timingSafeBearerEquals(authHeader: string | null, cronSecret: string): boolean {
  if (!authHeader) return false;
  const expected = `Bearer ${cronSecret}`;
  const a = crypto.createHash('sha256').update(authHeader).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  // Xác thực: chỉ Cron có CRON_SECRET mới gọi được
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('CRON_SECRET not configured');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (!timingSafeBearerEquals(authHeader, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = typeof createAdminClient === 'function'
      ? await createAdminClient()
      : await createClient();

    // 1. Thu hồi quyền Admin/CTV sự kiện đã kết thúc > 3 ngày trước khi chốt sổ
    let cleanupResult = { cleanedCount: 0 };
    try {
      cleanupResult = await cleanupExpiredStudentEventRoles(supabase, 3);
    } catch (cleanupErr: any) {
      console.error('[CRON] Cleanup expired roles error:', cleanupErr);
    }

    // 2. Chốt điểm danh + xử lý vi phạm
    const reconcileResult = await reconcileAllPastEvents(supabase);

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
