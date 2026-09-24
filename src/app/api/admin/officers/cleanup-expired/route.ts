import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { cleanupExpiredStudentEventRoles } from '@/lib/constants/event-roles-cleanup';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền thu hồi quyền sự kiện sinh viên' },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const result = await cleanupExpiredStudentEventRoles(supabase, 3);

    return NextResponse.json({
      success: true,
      cleanedCount: result.cleanedCount,
      message:
        result.cleanedCount > 0
          ? `Đã thu hồi thành công ${result.cleanedCount} quyền Admin/CTV sự kiện của sinh viên đã kết thúc quá 3 ngày.`
          : 'Không có quyền sự kiện sinh viên nào quá hạn 3 ngày cần thu hồi.',
    });
  } catch (err: any) {
    console.error('Lỗi API cleanup-expired:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Lỗi hệ thống' },
      { status: 500 }
    );
  }
}
