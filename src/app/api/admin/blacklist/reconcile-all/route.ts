import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { reconcileAllPastEvents } from '@/lib/utils/blacklist-logic';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền chốt sổ toàn bộ sự kiện đã kết thúc' },
        { status: 403 }
      );
    }

    const supabase = (typeof createAdminClient === 'function' ? await createAdminClient() : await createClient()) || (await createClient());
    const result = await reconcileAllPastEvents(supabase);

    return NextResponse.json({
      success: true,
      message: `Đã chốt sổ thành công ${result.totalProcessedEvents} sự kiện đã qua! Ghi nhận ${result.totalAttended} lượt có mặt, ${result.totalAbsent} lượt vắng mặt (${result.totalPenaltiesAdded} lượt ghi sổ phạt, ${result.totalNewlyBlacklisted.length} sinh viên mới bị khóa Blacklist do vắng 3 lần).`,
      data: result,
    });
  } catch (err: any) {
    console.error('Error in reconcile-all POST:', err);
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống khi chốt sổ' }, { status: 500 });
  }
}
