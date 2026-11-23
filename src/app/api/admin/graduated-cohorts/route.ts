import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { normalizeCohort } from '@/lib/utils/cohort';
import { isUnitAccount } from '@/lib/utils/extract-mssv';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';
import {
  getGraduatedCohortsConfig,
  saveGraduatedCohorts,
  getGraduationMatrixCohorts,
  normalizeGraduatedRules,
  resolveStudentCohort,
  getCohortGraduationStatus,
} from '@/lib/utils/graduated-cohorts';

export const dynamic = 'force-dynamic';

function clearRelatedCaches() {
  const g = globalThis as unknown as {
    __hddRankingCache?: Map<string, unknown>;
    __hddLcdUsersCache?: { expiresAt: number };
    __hddAdminDashboardCache?: Map<string, unknown>;
    __hddDiscoverCache?: { expiresAt: number };
  };
  if (g.__hddRankingCache) g.__hddRankingCache.clear();
  if (g.__hddLcdUsersCache) g.__hddLcdUsersCache.expiresAt = 0;
  if (g.__hddAdminDashboardCache) g.__hddAdminDashboardCache.clear();
  if (g.__hddDiscoverCache) g.__hddDiscoverCache.expiresAt = 0;
}

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const { rules, deleted_cohorts } = await getGraduatedCohortsConfig(supabase, true);
    const cohorts = getGraduationMatrixCohorts(rules, new Date(), deleted_cohorts);

    return NextResponse.json({
      success: true,
      data: {
        rules,
        cohorts,
        deleted_cohorts,
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

    clearRelatedCaches();

    return NextResponse.json({
      success: true,
      data: {
        rules: saved.rules,
        cohorts: getGraduationMatrixCohorts(saved.rules, new Date(), saved.deleted_cohorts),
        deleted_cohorts: saved.deleted_cohorts,
      },
      message: `Đã lưu cấu hình tốt nghiệp (${saved.rules.length} nhóm LCĐ + Khóa). Hệ thống đã tự động trừ khỏi quân số quản lý và chặn đăng ký chương trình mới.`,
    });
  } catch (err: any) {
    console.error('PUT /api/admin/graduated-cohorts error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi lưu cấu hình khóa tốt nghiệp' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.isSuperAdmin && auth.tier !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Chỉ Super Admin mới có quyền xóa khóa sinh viên khỏi danh sách hệ thống' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    let rawCohort = searchParams.get('cohort');
    let rawConfirm = searchParams.get('confirm');
    if (!rawCohort || !rawConfirm) {
      const body = await req.json().catch(() => ({}));
      rawCohort = rawCohort || body?.cohort;
      rawConfirm = rawConfirm || body?.confirm;
    }
    const cohort = normalizeCohort(rawCohort);
    if (!cohort) {
      return NextResponse.json({ success: false, error: 'Mã khóa không hợp lệ (VD: D19, D20)' }, { status: 400 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // Enforce full-cohort graduation (all LCĐs marked and saved) & explicit confirmation phrase before deleting
    const currentCfg = await getGraduatedCohortsConfig(supabase, true);
    const gradStatus = getCohortGraduationStatus(cohort, currentCfg.rules);
    if (!gradStatus.isFullyGraduated) {
      return NextResponse.json(
        {
          success: false,
          error: `Khóa ${cohort} mới chỉ tốt nghiệp ${gradStatus.graduatedCount}/${gradStatus.totalLcds} Liên Chi Đoàn (chưa tốt nghiệp: ${gradStatus.missingLcds.join(', ')}). Chỉ được xóa danh sách sau khi toàn bộ ${gradStatus.totalLcds} LCĐ của khóa đã tốt nghiệp và được lưu cấu hình.`,
        },
        { status: 400 }
      );
    }

    const expectedConfirm = `XOA ${cohort}`;
    const normalizedConfirm = String(rawConfirm || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    if (normalizedConfirm !== expectedConfirm) {
      return NextResponse.json(
        {
          success: false,
          error: `Thiếu hoặc sai mã xác nhận xóa. Vui lòng nhập chính xác "${expectedConfirm}" để xác nhận.`,
        },
        { status: 400 }
      );
    }

    const yy = cohort.slice(1); // '19', '20', ...

    // 1. Collect all users belonging to this cohort in public.users
    const matchedMssvs: string[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (offset < 20_000) {
      const { data: rows, error } = await supabase
        .from('users')
        .select('mssv, class_id, email')
        .or(`mssv.ilike.N${yy}%,class_id.ilike.D${yy}%,class_id.ilike.E${yy}%`)
        .order('mssv', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error || !rows || rows.length === 0) break;
      for (const u of rows) {
        if (isUnitAccount({ mssv: u.mssv, email: u.email })) continue;
        if (resolveStudentCohort(u.mssv, u.class_id) === cohort && u.mssv) {
          matchedMssvs.push(String(u.mssv).trim().toUpperCase());
        }
      }
      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    const uniqueMssvs = Array.from(new Set(matchedMssvs));
    let deletedDbCount = 0;
    let preservedHistoryCount = 0;

    if (uniqueMssvs.length > 0) {
      // 2. Find which MSSVs have historical check_ins / registrations / penalties (preserve those rows so old event stats stay intact)
      const protectedSet = new Set<string>();
      for (const chunk of chunkArray(uniqueMssvs, 200)) {
        const [ciRes, regRes, penRes] = await Promise.all([
          fetchAllRows<any>(() => supabase.from('check_ins').select('mssv').in('mssv', chunk)),
          fetchAllRows<any>(() => supabase.from('event_registrations').select('mssv').in('mssv', chunk)),
          fetchAllRows<any>(() => supabase.from('user_penalties').select('mssv').in('mssv', chunk)),
        ]);
        for (const r of ciRes.data || []) if (r.mssv) protectedSet.add(String(r.mssv).trim().toUpperCase());
        for (const r of regRes.data || []) if (r.mssv) protectedSet.add(String(r.mssv).trim().toUpperCase());
        for (const r of penRes.data || []) if (r.mssv) protectedSet.add(String(r.mssv).trim().toUpperCase());

        // Clean up active delegates & push subscriptions for this graduated cohort
        await Promise.allSettled([
          supabase.from('class_delegates').delete().in('mssv', chunk),
          supabase.from('push_subscriptions').delete().in('mssv', chunk),
        ]);
      }

      const deletableMssvs = uniqueMssvs.filter((m) => !protectedSet.has(m));
      preservedHistoryCount = uniqueMssvs.length - deletableMssvs.length;

      for (const chunk of chunkArray(deletableMssvs, 200)) {
        const { error: delErr } = await supabase.from('users').delete().in('mssv', chunk);
        if (!delErr) {
          deletedDbCount += chunk.length;
        }
      }
    }

    // 3. Persist cohort in deleted_cohorts (hides preserved-history rows from Student List & KPI stats, and removes column from matrix)
    const nextDeleted = Array.from(new Set([...currentCfg.deleted_cohorts, cohort])).sort();
    const saved = await saveGraduatedCohorts(supabase, currentCfg.rules, nextDeleted);
    if (!saved.success) {
      return NextResponse.json(
        { success: false, error: saved.error || 'Không thể cập nhật trạng thái xóa khóa' },
        { status: 500 }
      );
    }

    clearRelatedCaches();

    return NextResponse.json({
      success: true,
      data: {
        rules: saved.rules,
        cohorts: getGraduationMatrixCohorts(saved.rules, new Date(), saved.deleted_cohorts),
        deleted_cohorts: saved.deleted_cohorts,
        deleted_db_count: deletedDbCount,
        preserved_history_count: preservedHistoryCount,
      },
      message:
        uniqueMssvs.length > 0
          ? `Đã xóa khóa ${cohort} khỏi Danh sách Sinh viên hệ thống (dọn ${deletedDbCount} hồ sơ trống, ẩn & bảo lưu ${preservedHistoryCount} hồ sơ có lịch sử sự kiện cũ).`
          : `Đã xóa khóa ${cohort} khỏi danh sách quản lý hệ thống.`,
    });
  } catch (err: any) {
    console.error('DELETE /api/admin/graduated-cohorts error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi xóa khóa sinh viên' }, { status: 500 });
  }
}
