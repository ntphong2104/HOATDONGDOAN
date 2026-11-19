import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { resolveActorLcdScope } from '@/lib/utils/lcd-auth';
import {
  getLcdByCode,
  normalizeLcdCode,
  resolveStudentLcd,
  type LcdCode,
} from '@/lib/utils/lcd';
import { getCohortFromMssv } from '@/lib/utils/cohort';
import { isValidMSSV } from '@/lib/utils/extract-mssv';

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
  if (!g.__hddLcdUsersCache) {
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
  const cache = getUsersCache();
  if (cache.rows && Date.now() < cache.expiresAt) {
    return cache.rows;
  }
  if (cache.inflight) {
    return cache.inflight;
  }

  const task = (async (): Promise<CachedUserRow[]> => {
    try {
      const all: any[] = [];
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
        all.push(...data);
        if (data.length < pageSize) {
          hasMore = false;
        } else {
          page++;
        }
      }

      const mapped: CachedUserRow[] = [];
      for (const u of all) {
        if (isUnitAccount(u)) continue;
        const mssv = String(u.mssv || '').trim().toUpperCase();
        if (!mssv || !isValidMSSV(mssv)) continue;
        const classId = String(u.class_id || 'PTIT-HCM').trim().toUpperCase();
        const lcd = resolveStudentLcd(classId, mssv);
        mapped.push({
          mssv,
          full_name: String(u.full_name || mssv).trim(),
          class_id: classId,
          email: String(u.email || `${mssv.toLowerCase()}@student.ptithcm.edu.vn`).trim().toLowerCase(),
          lcd_code: lcd?.code || null,
          cohort: getCohortFromMssv(mssv),
        });
      }

      cache.rows = mapped;
      cache.expiresAt = Date.now() + USERS_CACHE_TTL_MS;
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

    const [allStudents, { data: delegatesData }] = await Promise.all([
      loadAllStudentsCached(supabase),
      supabase
        .from('class_delegates')
        .select('*')
        .order('granted_at', { ascending: false }),
    ]);

    const lcdStudents = allStudents.filter((s) => s.lcd_code === targetLcd.code);
    const lcdMssvs = lcdStudents.map((s) => s.mssv);

    // Count distinct attended events per student in chunks of 400 MSSVs (fast B-tree index scan)
    const attendedEventsByMssv = new Map<string, Set<string>>();
    const CHUNK = 400;
    const checkinPromises: Promise<any>[] = [];
    for (let i = 0; i < lcdMssvs.length; i += CHUNK) {
      const slice = lcdMssvs.slice(i, i + CHUNK);
      checkinPromises.push(
        Promise.resolve(
          supabase
            .from('check_ins')
            .select('mssv, event_id')
            .in('mssv', slice)
        ).catch(() => ({ data: [] }))
      );
    }
    const checkinChunks = await Promise.all(checkinPromises);
    for (const chunk of checkinChunks) {
      for (const row of chunk?.data || []) {
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
