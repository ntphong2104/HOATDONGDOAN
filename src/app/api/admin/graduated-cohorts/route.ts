import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  getGraduatedCohorts,
  saveGraduatedCohorts,
  getGraduationMatrixCohorts,
  normalizeGraduatedRules,
} from '@/lib/utils/graduated-cohorts';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const rules = await getGraduatedCohorts(supabase, true);
    const cohorts = getGraduationMatrixCohorts(rules);

    return NextResponse.json({
      success: true,
      data: {
        rules,
        cohorts,
      },
    });
  } catch (err: any) {
    console.error('GET /api/admin/graduated-cohorts error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi tải cấu hình khóa tốt nghiệp' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'youth_union') {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin hoặc Đoàn Học Viện mới có quyền cấu hình khóa đã tốt nghiệp' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rules = normalizeGraduatedRules(body?.rules);

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const saved = await saveGraduatedCohorts(supabase, rules);
    if (!saved.success) {
      return NextResponse.json(
        { success: false, error: saved.error || 'Không thể lưu cấu hình khóa tốt nghiệp' },
        { status: 500 }
      );
    }

    // Xóa cache bảng xếp hạng & cache đoàn viên LCĐ để số liệu cập nhật ngay lập tức
    const g = globalThis as unknown as {
      __hddRankingCache?: Map<string, unknown>;
      __hddLcdUsersCache?: { expiresAt: number };
    };
    if (g.__hddRankingCache) g.__hddRankingCache.clear();
    if (g.__hddLcdUsersCache) g.__hddLcdUsersCache.expiresAt = 0;

    return NextResponse.json({
      success: true,
      data: {
        rules: saved.rules,
        cohorts: getGraduationMatrixCohorts(saved.rules),
      },
      message: `Đã lưu cấu hình tốt nghiệp (${saved.rules.length} nhóm LCĐ + Khóa). Hệ thống đã tự động trừ khỏi quân số quản lý và chặn đăng ký chương trình mới.`,
    });
  } catch (err: any) {
    console.error('PUT /api/admin/graduated-cohorts error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi lưu cấu hình khóa tốt nghiệp' }, { status: 500 });
  }
}
