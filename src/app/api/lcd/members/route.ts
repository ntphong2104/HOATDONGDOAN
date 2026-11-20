import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { resolveActorLcdScope } from '@/lib/utils/lcd-auth';
import { getGraduatedCohorts, isStudentGraduated } from '@/lib/utils/graduated-cohorts';
import {
  getLcdByCode,
  normalizeLcdCode,
  resolveStudentLcd,
  type LcdCode,
} from '@/lib/utils/lcd';
import { getCohortFromMssv } from '@/lib/utils/cohort';
import { isValidMSSV } from '@/lib/utils/extract-mssv';
import {
  getMasterStudentDirectory,
  isPlaceholderClass,
  isPlaceholderName,
} from '@/lib/utils/student-profile';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CachedUserRow {
  mssv: string;
  full_name: string;
  class_id: string;
  email: string;
  lcd_code: LcdCode | null;
  cohort: string | null;
}

interface UsersCacheState {
  rows: CachedUserRow[] | null;
  expiresAt: number;
  inflight: Promise<CachedUserRow[]> | null;
}

const USERS_CACHE_TTL_MS = 30_000;

function getUsersCache(): UsersCacheState {
  const g = globalThis as unknown as { __hddLcdUsersCache?: UsersCacheState };
  if (!g.__hddLcdUsersCache || (g.__hddLcdUsersCache.rows && g.__hddLcdUsersCache.rows.length === 0)) {
    g.__hddLcdUsersCache = { rows: null, expiresAt: 0, inflight: null };
  }
  return g.__hddLcdUsersCache;
}

function isUnitAccount(u: { mssv?: string; email?: string }): boolean {
  const m = (u.mssv || '').toUpperCase();
  const e = (u.email || '').toLowerCase();
  return (
    m.startsWith('LCD_') ||
    m.startsWith('CLB_') ||
    m.startsWith('DOI_') ||
    m.startsWith('PHONG_') ||
    m.startsWith('DOAN_') ||
    m.startsWith('SUPER_') ||
    e.startsWith('lcd') ||
    e.startsWith('clb') ||
    e.startsWith('doi') ||
    e.includes('ctsv') ||
    e.includes('quantri') ||
    e.includes('superadmin')
  );
}

async function loadAllStudentsCached(supabase: any): Promise<CachedUserRow[]> {
  const hasServiceRole = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  );
  const cache = getUsersCache();
  if (cache.rows && cache.rows.length > 0 && Date.now() < cache.expiresAt) {
    return cache.rows;
  }
  if (cache.inflight) {
    return cache.inflight;
  }

  const task = (async (): Promise<CachedUserRow[]> => {
    try {
      // 1. Khởi tạo từ danh bạ chuẩn Học viện (data/Data.xlsx — ~4.500+ SV)
      //    để luôn đầy đủ danh sách đoàn viên theo 8 LCĐ ngay cả khi môi trường local
      //    chưa cấu hình SUPABASE_SERVICE_ROLE_KEY hoặc RLS chưa mở rộng bảng users.
      const mergedByMssv = new Map<string, CachedUserRow>();
      const masterDir = getMasterStudentDirectory();
      for (const [rawMssv, info] of masterDir.entries()) {
        const mssv = String(rawMssv || '').trim().toUpperCase();
        if (!mssv || !isValidMSSV(mssv)) continue;
        const classId = String(info.class_id || 'PTIT-HCM').trim().toUpperCase();
        const lcd = resolveStudentLcd(classId, mssv);
        mergedByMssv.set(mssv, {
          mssv,
          full_name: String(info.full_name || mssv).trim(),
          class_id: classId,
          email: `${mssv.toLowerCase()}@student.ptithcm.edu.vn`,
          lcd_code: lcd?.code || null,
          cohort: getCohortFromMssv(mssv),
        });
      }

      // 2. Hợp nhất thêm / ghi đè từ bảng public.users (nhận SV khóa mới, SV đổi lớp, email thật)
      const allDbUsers: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore && page < 20) {
        const start = page * pageSize;
        const end = start + pageSize - 1;
        const { data, error } = await supabase
          .from('users')
          .select('mssv, full_name, class_id, email')
          .order('mssv', { ascending: true })
          .range(start, end);

        if (error || !data || data.length === 0) {
          hasMore = false;
          break;
        }
        allDbUsers.push(...data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      let dbStudentCount = 0;
      for (const u of allDbUsers) {
        if (isUnitAccount(u)) continue;
        const mssv = String(u.mssv || '').trim().toUpperCase();
        if (!mssv || !isValidMSSV(mssv)) continue;
        dbStudentCount++;

        const existing = mergedByMssv.get(mssv);
        const rawDbName = String(u.full_name || '').trim();
        const rawDbClass = String(u.class_id || '').trim().toUpperCase();
        const rawDbEmail = String(u.email || '').trim().toLowerCase();

        const full_name =
          rawDbName && !isPlaceholderName(rawDbName, mssv)
            ? rawDbName
            : existing?.full_name || rawDbName || mssv;

        const class_id =
          rawDbClass && !isPlaceholderClass(rawDbClass)
            ? rawDbClass
            : existing?.class_id || rawDbClass || 'PTIT-HCM';

        const email =
          rawDbEmail ||
          existing?.email ||
          `${mssv.toLowerCase()}@student.ptithcm.edu.vn`;

        const lcd = resolveStudentLcd(class_id, mssv);
        mergedByMssv.set(mssv, {
          mssv,
          full_name,
          class_id,
          email,
          lcd_code: lcd?.code || null,
          cohort: getCohortFromMssv(mssv),
        });
      }

      const mapped = Array.from(mergedByMssv.values()).sort((a, b) =>
        a.mssv.localeCompare(b.mssv)
      );

      // Chỉ cache toàn cục khi đọc được đầy đủ từ DB (tránh cache kết quả bị RLS giới hạn cho session khác)
      if (mapped.length > 0 && (hasServiceRole || dbStudentCount > 1)) {
        cache.rows = mapped;
        cache.expiresAt = Date.now() + USERS_CACHE_TTL_MS;
      }
      return mapped;
    } finally {
      cache.inflight = null;
    }
  })();

  cache.inflight = task;
  return task;
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const scope = await resolveActorLcdScope(supabase, auth);
    if (scope.role === 'none') {
      return NextResponse.json(
        { success: false, error: 'Chỉ tài khoản Liên Chi Đoàn hoặc Đoàn Trường mới có quyền quản lý đoàn viên theo LCĐ.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const requestedLcd = normalizeLcdCode(searchParams.get('lcd'));

    // LCĐ manager is strictly locked to their own LCĐ; Super Admin / Youth Union can pick any LCĐ
    const targetLcdCode: LcdCode =
      scope.role === 'lcd' && scope.lcd
        ? scope.lcd.code
        : requestedLcd || 'LCD_CNTT';

    const targetLcd = getLcdByCode(targetLcdCode);
    if (!targetLcd) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy Liên Chi Đoàn' }, { status: 400 });
    }

    const [allStudents, { data: delegatesData }, graduatedRules] = await Promise.all([
      loadAllStudentsCached(supabase),
      supabase
        .from('class_delegates')
        .select('*')
        .order('granted_at', { ascending: false }),
      getGraduatedCohorts(supabase, true),
    ]);

    const lcdAllStudents = allStudents.filter((s) => s.lcd_code === targetLcd.code);
    // Tự động trừ sinh viên thuộc cặp (LCĐ + Khóa đã tốt nghiệp) khỏi quân số đang quản lý
    const lcdStudents = lcdAllStudents.filter(
      (s) => !isStudentGraduated(s.mssv, s.class_id, graduatedRules)
    );
    const lcdMssvs = lcdStudents.map((s) => s.mssv);

    // Count distinct attended events per student in chunks of 150 MSSVs
    // with pagination guard so PostgREST's 1,000-row limit never truncates counts.
    const attendedEventsByMssv = new Map<string, Set<string>>();
    const CHUNK = 150;
    const fetchCheckinChunk = async (slice: string[]): Promise<any[]> => {
      const rows: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (offset < 10_000) {
        try {
          const { data, error } = await supabase
            .from('check_ins')
            .select('mssv, event_id')
            .in('mssv', slice)
            .range(offset, offset + pageSize - 1);
          if (error || !data || data.length === 0) break;
          rows.push(...data);
          if (data.length < pageSize) break;
          offset += pageSize;
        } catch {
          break;
        }
      }
      return rows;
    };

    const checkinPromises: Promise<any[]>[] = [];
    for (let i = 0; i < lcdMssvs.length; i += CHUNK) {
      checkinPromises.push(fetchCheckinChunk(lcdMssvs.slice(i, i + CHUNK)));
    }
    const checkinChunks = await Promise.all(checkinPromises);
    for (const chunkRows of checkinChunks) {
      for (const row of chunkRows) {
        const m = String(row.mssv || '').trim().toUpperCase();
        if (!m) continue;
        let set = attendedEventsByMssv.get(m);
        if (!set) {
          set = new Set<string>();
          attendedEventsByMssv.set(m, set);
        }
        set.add(String(row.event_id));
      }
    }

    // Filter active delegates belonging to this LCĐ
    const now = new Date();
    const activeDelegateByMssv = new Map<string, any>();
    const activeDelegatesByClass = new Map<string, any[]>();
    let activeDelegateCount = 0;

    for (const d of delegatesData || []) {
      const dLcd = resolveStudentLcd(d.class_id, d.mssv);
      if (dLcd?.code !== targetLcd.code) continue;
      if (isStudentGraduated(d.mssv, d.class_id, graduatedRules)) continue;

      const expires = new Date(d.expires_at);
      const isExpired = expires < now;
      const isActive = Boolean(d.is_active) && !isExpired;
      if (isActive) {
        activeDelegateCount++;
        const cleanM = String(d.mssv || '').trim().toUpperCase();
        const cleanCls = String(d.class_id || '').trim().toUpperCase();
        activeDelegateByMssv.set(cleanM, d);
        const arr = activeDelegatesByClass.get(cleanCls) || [];
        arr.push({
          id: d.id,
          mssv: cleanM,
          full_name: d.full_name,
          notes: d.notes,
          expires_at: d.expires_at,
        });
        activeDelegatesByClass.set(cleanCls, arr);
      }
    }

    // Group by class_id (Chi đoàn)
    const classMap = new Map<string, { class_id: string; student_count: number; cohort: string | null; delegates: any[] }>();

    const enrichedStudents = lcdStudents.map((s) => {
      const totalAttended = attendedEventsByMssv.get(s.mssv)?.size || 0;
      const activeDel = activeDelegateByMssv.get(s.mssv) || null;

      const clsKey = s.class_id || 'PTIT-HCM';
      let clsEntry = classMap.get(clsKey);
      if (!clsEntry) {
        clsEntry = {
          class_id: clsKey,
          student_count: 0,
          cohort: s.cohort,
          delegates: activeDelegatesByClass.get(clsKey) || [],
        };
        classMap.set(clsKey, clsEntry);
      }
      clsEntry.student_count++;

      return {
        mssv: s.mssv,
        full_name: s.full_name,
        class_id: s.class_id,
        email: s.email,
        cohort: s.cohort,
        total_attended: totalAttended,
        is_delegate: Boolean(activeDel),
        delegate_id: activeDel?.id || null,
        delegate_notes: activeDel?.notes || null,
        delegate_expires_at: activeDel?.expires_at || null,
      };
    });

    const classes = Array.from(classMap.values()).sort((a, b) =>
      a.class_id.localeCompare(b.class_id)
    );
    const classesWithDelegate = classes.filter((c) => c.delegates.length > 0).length;
    const classesWithoutDelegate = classes
      .filter((c) => c.delegates.length === 0 && c.class_id !== 'PTIT-HCM')
      .map((c) => c.class_id);

    return NextResponse.json(
      {
        success: true,
        data: {
          lcd: {
            code: targetLcd.code,
            name: targetLcd.name,
            shortName: targetLcd.shortName,
            color: targetLcd.color,
            bg: targetLcd.bg,
            border: targetLcd.border,
          },
          summary: {
            total_students: enrichedStudents.length,
            total_classes: classes.length,
            classes_with_delegate: classesWithDelegate,
            classes_without_delegate_count: classesWithoutDelegate.length,
            active_delegates: activeDelegateCount,
          },
          classes,
          classes_without_delegate: classesWithoutDelegate,
          students: enrichedStudents,
        },
      },
      {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
      }
    );
  } catch (err: any) {
    console.error('GET /api/lcd/members error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi tải danh sách đoàn viên theo LCĐ' },
      { status: 500 }
    );
  }
}
