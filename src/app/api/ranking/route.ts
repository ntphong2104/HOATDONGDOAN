import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import {
  getAcademicSemesters,
  getActiveSemester,
  isEventInSemester,
} from '@/lib/utils/semesters';
import {
  LCD_DEFINITIONS,
  getLcdByCode,
  normalizeLcdCode,
  resolveStudentLcd,
} from '@/lib/utils/lcd';
import { OFFICIAL_UNITS } from '@/lib/constants/units';
import {
  getMasterStudentDirectory,
  getMasterStudentByMssv,
  isPlaceholderClass,
  isPlaceholderName,
} from '@/lib/utils/student-profile';
import { isValidMSSV, isUnitAccount, extractMSSV } from '@/lib/utils/extract-mssv';
import { getGraduatedCohorts, isStudentGraduated } from '@/lib/utils/graduated-cohorts';
import type {
  AcademicSemester,
  LcdRankingItem,
  UnitRankingItem,
  StudentRankingItem,
  MyRankingSummary,
  RankingResponseData,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANKING_CACHE_TTL_MS = 300_000; // 5 phút fresh
const RANKING_STALE_TTL_MS = 1_800_000; // 30 phút stale-while-revalidate (trả tức thì & làm mới ngầm)
const MAX_RANKING_CACHE_ENTRIES = 12;

interface CachedSemesterRanking {
  lcd_rankings: LcdRankingItem[];
  unit_rankings: UnitRankingItem[];
  top_students: StudentRankingItem[];
  total_events_in_semester: number;
  total_participations_in_semester: number;
  total_students_participated: number;
  top50Threshold: number;
  totalRankedStudents: number;
  studentRankMap: Map<string, { rank: number; count: number; full_name: string; class_id: string }>;
}

const gRanking = globalThis as unknown as {
  __hddRankingCache?: Map<string, { ts: number; data: CachedSemesterRanking }>;
  __hddRankingInFlight?: Map<string, Promise<CachedSemesterRanking>>;
};
const rankingCache =
  gRanking.__hddRankingCache ||
  (gRanking.__hddRankingCache = new Map<string, { ts: number; data: CachedSemesterRanking }>());
const rankingInFlight =
  gRanking.__hddRankingInFlight ||
  (gRanking.__hddRankingInFlight = new Map<string, Promise<CachedSemesterRanking>>());

const UNIT_BY_EMAIL = new Map<string, string>(
  OFFICIAL_UNITS.map((u) => [u.email.toLowerCase(), u.name])
);

function resolveUnitDisplayName(
  proposalUnit?: string | null,
  creatorEmail?: string | null
): { unitName: string; unitType: 'lcd' | 'clb' | 'school'; lcdCode: string | null; lcdColor: string | null } {
  const emailLower = String(creatorEmail || '').toLowerCase().trim();
  const rawName = String(proposalUnit || '').trim() || UNIT_BY_EMAIL.get(emailLower) || '';

  const lcdCode = normalizeLcdCode(rawName) || normalizeLcdCode(emailLower);
  if (lcdCode) {
    const lcd = getLcdByCode(lcdCode);
    if (lcd) {
      return {
        unitName: lcd.name,
        unitType: 'lcd',
        lcdCode: lcd.code,
        lcdColor: lcd.color,
      };
    }
  }

  if (rawName) {
    const lower = rawName.toLowerCase();
    const isSchool =
      lower.includes('đoàn học viện') ||
      lower.includes('đoàn trường') ||
      lower.includes('đoàn tncs') ||
      lower.includes('phòng ') ||
      lower.includes('ban chấp hành đoàn');
    return {
      unitName: rawName,
      unitType: isSchool ? 'school' : 'clb',
      lcdCode: null,
      lcdColor: isSchool ? '#1d4ed8' : '#7c3aed',
    };
  }

  return {
    unitName: 'Đoàn TNCS Học Viện',
    unitType: 'school',
    lcdCode: null,
    lcdColor: '#1d4ed8',
  };
}

async function computeSemesterRanking(
  supabase: any,
  selectedSemester: AcademicSemester
): Promise<CachedSemesterRanking> {
    // 2. Lấy danh sách sự kiện, proposals & quy tắc khóa tốt nghiệp song song
    const [{ data: eventsData, error: eventsError }, { data: proposalsData }, graduatedRules] = await Promise.all([
      supabase
        .from('events')
        .select('event_id, event_name, event_date, created_at, created_by, semester, status'),
      supabase
        .from('event_proposals')
        .select('created_event_id, organization_unit')
        .not('created_event_id', 'is', null),
      getGraduatedCohorts(supabase),
    ]);

    if (eventsError) {
      console.error('Error fetching events for ranking:', eventsError);
    }

    const proposalUnitByEventId = new Map<string, string>();
    for (const p of proposalsData || []) {
      if (p.created_event_id && p.organization_unit) {
        proposalUnitByEventId.set(String(p.created_event_id), String(p.organization_unit));
      }
    }

    // Lọc sự kiện thuộc học kỳ đã chọn dựa trên khoảng thời gian [start_date, end_date] do Super Admin cấu hình
    const allEvents = eventsData || [];
    const semesterEvents = allEvents.filter((ev: any) => {
      if (ev.status === 'rejected' || ev.status === 'pending') return false;
      const effectiveDate = ev.event_date || (ev.created_at ? String(ev.created_at).slice(0, 10) : null);
      if (effectiveDate && isEventInSemester(effectiveDate, selectedSemester)) return true;
      // Fallback: nếu sự kiện không có event_date thì đối chiếu theo tên/mã học kỳ
      if (!effectiveDate && ev.semester) {
        return ev.semester === selectedSemester?.name || ev.semester === selectedSemester?.id;
      }
      return false;
    });

    const eventIds = semesterEvents.map((ev: any) => String(ev.event_id));
    const eventIdSet = new Set(eventIds);

    // Ánh xạ event_id -> đơn vị tổ chức
    const unitInfoByEventId = new Map<
      string,
      { unitName: string; unitType: 'lcd' | 'clb' | 'school'; lcdCode: string | null; lcdColor: string | null }
    >();
    const organizedCountByLcd = new Map<string, number>();

    interface UnitAgg {
      unitName: string;
      unitType: 'lcd' | 'clb' | 'school';
      lcdCode: string | null;
      lcdColor: string | null;
      eventsCount: number;
      totalParticipants: number;
      uniqueParticipants: Set<string>;
    }
    const unitAggMap = new Map<string, UnitAgg>();

    for (const ev of semesterEvents) {
      const evId = String(ev.event_id);
      const unitInfo = resolveUnitDisplayName(
        proposalUnitByEventId.get(evId),
        ev.created_by
      );
      unitInfoByEventId.set(evId, unitInfo);

      if (unitInfo.lcdCode) {
        organizedCountByLcd.set(
          unitInfo.lcdCode,
          (organizedCountByLcd.get(unitInfo.lcdCode) || 0) + 1
        );
      }

      const existing = unitAggMap.get(unitInfo.unitName);
      if (existing) {
        existing.eventsCount += 1;
      } else {
        unitAggMap.set(unitInfo.unitName, {
          unitName: unitInfo.unitName,
          unitType: unitInfo.unitType,
          lcdCode: unitInfo.lcdCode,
          lcdColor: unitInfo.lcdColor,
          eventsCount: 1,
          totalParticipants: 0,
          uniqueParticipants: new Set<string>(),
        });
      }
    }

    // 3. Lấy toàn bộ lượt check-in thuộc các sự kiện trong học kỳ này
    //    Ưu tiên RPC SECURITY DEFINER (get_ranking_checkins_for_events) có phân trang song song theo đợt 4 trang (4.000 dòng/wave)
    //    để vừa vượt giới hạn 1.000 dòng của PostgREST vừa giảm số vòng chờ mạng xuống 4 lần.
    const checkinRows: Array<{ event_id: string; mssv: string }> = [];
    let loadedViaRpc = false;
    if (eventIds.length > 0) {
      const CHUNK = 150;
      const pageSize = 1000;
      const WAVE_PAGES = 4;
      const slices: string[][] = [];
      for (let i = 0; i < eventIds.length; i += CHUNK) {
        slices.push(eventIds.slice(i, i + CHUNK));
      }

      try {
        const rpcRows: Array<{ event_id: string; mssv: string }> = [];
        let rpcOk = true;

        const sliceResults = await Promise.all(
          slices.map(async (slice) => {
            const rows: Array<{ event_id: string; mssv: string }> = [];
            let offset = 0;
            while (offset < 30_000) {
              const offsets = Array.from({ length: WAVE_PAGES }, (_, idx) => offset + idx * pageSize).filter(
                (o) => o < 30_000
              );
              const wave = await Promise.all(
                offsets.map((o) =>
                  supabase
                    .rpc('get_ranking_checkins_for_events', { p_event_ids: slice })
                    .range(o, o + pageSize - 1)
                )
              );
              let reachedEnd = false;
              for (const { data: rData, error: rErr } of wave) {
                if (rErr || !Array.isArray(rData)) {
                  console.warn('[ranking] RPC get_ranking_checkins_for_events fallback:', rErr?.message || 'non-array');
                  return null;
                }
                rows.push(...rData);
                if (rData.length < pageSize) {
                  reachedEnd = true;
                  break;
                }
              }
              if (reachedEnd) break;
              offset += WAVE_PAGES * pageSize;
            }
            return rows;
          })
        );

        for (const res of sliceResults) {
          if (res === null) {
            rpcOk = false;
            break;
          }
          rpcRows.push(...res);
        }

        if (rpcOk) {
          checkinRows.push(...rpcRows);
          loadedViaRpc = true;
        }
      } catch (e: any) {
        console.warn('[ranking] RPC exception fallback:', e?.message);
      }

      if (!loadedViaRpc) {
        const fallbackResults = await Promise.all(
          slices.map(async (slice) => {
            const rows: Array<{ event_id: string; mssv: string }> = [];
            let offset = 0;
            while (offset < 30_000) {
              const offsets = Array.from({ length: WAVE_PAGES }, (_, idx) => offset + idx * pageSize).filter(
                (o) => o < 30_000
              );
              const wave = await Promise.all(
                offsets.map((o) =>
                  supabase
                    .from('check_ins')
                    .select('event_id, mssv')
                    .in('event_id', slice)
                    .range(o, o + pageSize - 1)
                )
              );
              let reachedEnd = false;
              for (const { data, error } of wave) {
                if (error || !data || data.length === 0) {
                  reachedEnd = true;
                  break;
                }
                rows.push(...data);
                if (data.length < pageSize) {
                  reachedEnd = true;
                  break;
                }
              }
              if (reachedEnd) break;
              offset += WAVE_PAGES * pageSize;
            }
            return rows;
          })
        );
        for (const rows of fallbackResults) {
          checkinRows.push(...rows);
        }
      }
    }

    // 4. Nạp danh bạ chuẩn Học viện để phân bổ chính xác đoàn viên đang học theo 8 LCĐ
    //    (tự động trừ các cặp LCĐ + Khóa đã đánh dấu tốt nghiệp khỏi mẫu số)
    const masterDir = getMasterStudentDirectory();
    const lcdTotalStudentsMap = new Map<string, number>();
    for (const lcd of LCD_DEFINITIONS) {
      lcdTotalStudentsMap.set(lcd.code, 0);
    }

    for (const [rawMssv, info] of masterDir.entries()) {
      const mssv = String(rawMssv || '').trim().toUpperCase();
      if (!isValidMSSV(mssv)) continue;
      const classId = String(info.class_id || '').trim().toUpperCase();
      if (isStudentGraduated(mssv, classId, graduatedRules)) continue;
      const lcd = resolveStudentLcd(classId, mssv);
      if (lcd) {
        lcdTotalStudentsMap.set(lcd.code, (lcdTotalStudentsMap.get(lcd.code) || 0) + 1);
      }
    }

    // Nạp thông tin lớp & họ tên mới nhất từ bảng users cho các MSSV có check-in
    // (ưu tiên users.class_id trong DB để phản ánh ngay khi SV năm 4 chuyển lớp chuyên ngành)
    const uniqueCheckedInMssvs = new Set<string>();
    for (const row of checkinRows) {
      const mssv = String(row.mssv || '').trim().toUpperCase();
      if (mssv && isValidMSSV(mssv)) {
        uniqueCheckedInMssvs.add(mssv);
      }
    }

    const dbUserMap = new Map<string, { full_name: string; class_id: string }>();
    if (uniqueCheckedInMssvs.size > 0) {
      const mssvArr = Array.from(uniqueCheckedInMssvs);
      const userChunks: string[][] = [];
      for (let i = 0; i < mssvArr.length; i += 500) {
        userChunks.push(mssvArr.slice(i, i + 500));
      }
      const userResults = await Promise.all(
        userChunks.map((chunk) =>
          supabase
            .from('users')
            .select('mssv, full_name, class_id')
            .in('mssv', chunk)
        )
      );
      for (const { data: uRows } of userResults) {
        for (const u of uRows || []) {
          const m = String(u.mssv || '').trim().toUpperCase();
          if (m) {
            dbUserMap.set(m, {
              full_name: String(u.full_name || '').trim(),
              class_id: String(u.class_id || '').trim().toUpperCase(),
            });
          }
        }
      }
    }

    const resolveStudentInfo = (mssv: string) => {
      const master = getMasterStudentByMssv(mssv);
      const db = dbUserMap.get(mssv);
      const full_name =
        (db?.full_name && !isPlaceholderName(db.full_name, mssv) ? db.full_name : '') ||
        master?.full_name ||
        mssv;
      // Luôn ưu tiên class_id trong DB (users) trước Data.xlsx để tự cập nhật khi năm 4 đổi mã lớp
      const class_id =
        (db?.class_id && !isPlaceholderClass(db.class_id) ? db.class_id : '') ||
        master?.class_id ||
        'PTIT-HCM';
      return { full_name, class_id };
    };

    // 5. Thống kê theo từng sinh viên, từng LCĐ & từng Đơn vị tổ chức
    const studentParticipationMap = new Map<string, number>();
    const lcdActiveStudentsSet = new Map<string, Set<string>>();
    const lcdTotalParticipationsMap = new Map<string, number>();

    for (const lcd of LCD_DEFINITIONS) {
      lcdActiveStudentsSet.set(lcd.code, new Set<string>());
      lcdTotalParticipationsMap.set(lcd.code, 0);
    }

    // Mỗi sự kiện 1 sinh viên tính 1 lượt tham gia hợp lệ
    const distinctEventStudentSet = new Set<string>();

    for (const row of checkinRows) {
      const mssv = String(row.mssv || '').trim().toUpperCase();
      if (!mssv || !isValidMSSV(mssv)) continue;
      const eventId = String(row.event_id || '');
      if (!eventIdSet.has(eventId)) continue;

      const comboKey = `${eventId}__${mssv}`;
      if (distinctEventStudentSet.has(comboKey)) continue;
      distinctEventStudentSet.add(comboKey);

      // a. Cá nhân sinh viên
      studentParticipationMap.set(mssv, (studentParticipationMap.get(mssv) || 0) + 1);

      // b. Liên Chi Đoàn của sinh viên
      const stInfo = resolveStudentInfo(mssv);
      const lcd = resolveStudentLcd(stInfo.class_id, mssv);
      if (lcd) {
        lcdActiveStudentsSet.get(lcd.code)?.add(mssv);
        lcdTotalParticipationsMap.set(
          lcd.code,
          (lcdTotalParticipationsMap.get(lcd.code) || 0) + 1
        );
      }

      // c. Đơn vị tổ chức sự kiện
      const unitInfo = unitInfoByEventId.get(eventId);
      if (unitInfo) {
        const agg = unitAggMap.get(unitInfo.unitName);
        if (agg) {
          agg.totalParticipants += 1;
          agg.uniqueParticipants.add(mssv);
        }
      }
    }

    // 6. Xây dựng Bảng Xếp Hạng 8 Liên Chi Đoàn (theo lượng đoàn viên tham gia)
    const lcdRankings: LcdRankingItem[] = LCD_DEFINITIONS.map((lcd) => {
      const totalStudents = lcdTotalStudentsMap.get(lcd.code) || 0;
      const activeStudentsCount = lcdActiveStudentsSet.get(lcd.code)?.size || 0;
      const totalParticipations = lcdTotalParticipationsMap.get(lcd.code) || 0;
      const participationRate =
        totalStudents > 0
          ? Math.round((activeStudentsCount / totalStudents) * 1000) / 10
          : 0;

      return {
        rank: 0,
        lcd_code: lcd.code,
        lcd_name: lcd.name,
        lcd_short_name: lcd.shortName,
        lcd_color: lcd.color,
        total_students: totalStudents,
        active_students_count: activeStudentsCount,
        total_participations: totalParticipations,
        participation_rate: participationRate,
        events_organized_count: organizedCountByLcd.get(lcd.code) || 0,
      };
    });

    lcdRankings.sort((a, b) => {
      if (b.total_participations !== a.total_participations) {
        return b.total_participations - a.total_participations;
      }
      if (b.active_students_count !== a.active_students_count) {
        return b.active_students_count - a.active_students_count;
      }
      return b.participation_rate - a.participation_rate;
    });
    lcdRankings.forEach((item, index) => {
      item.rank = index + 1;
    });

    // 7. Xây dựng Bảng Xếp Hạng Đơn vị tổ chức (LCĐ / CLB / Đội thu hút nhiều người tham gia nhất)
    const unitRankings: UnitRankingItem[] = Array.from(unitAggMap.values())
      .map((agg) => ({
        rank: 0,
        unit_name: agg.unitName,
        unit_type: agg.unitType,
        lcd_code: agg.lcdCode,
        lcd_color: agg.lcdColor,
        events_count: agg.eventsCount,
        total_participants: agg.totalParticipants,
        unique_participants: agg.uniqueParticipants.size,
        avg_participants_per_event:
          agg.eventsCount > 0 ? Math.round(agg.totalParticipants / agg.eventsCount) : 0,
      }))
      .sort((a, b) => {
        if (b.total_participants !== a.total_participants) {
          return b.total_participants - a.total_participants;
        }
        return b.events_count - a.events_count;
      });
    unitRankings.forEach((item, index) => {
      item.rank = index + 1;
    });

    // 8. Xây dựng Bảng Xếp Hạng Top 50 Sinh Viên tham gia nhiều sự kiện nhất & vị trí cá nhân
    const allSortedStudents = Array.from(studentParticipationMap.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const top50Threshold =
      allSortedStudents.length >= 50 ? allSortedStudents[49][1] : 1;

    const topStudents: StudentRankingItem[] = allSortedStudents
      .slice(0, 50)
      .map(([mssv, count], index) => {
        const stInfo = resolveStudentInfo(mssv);
        const lcd = resolveStudentLcd(stInfo.class_id, mssv);
        return {
          rank: index + 1,
          mssv,
          full_name: stInfo.full_name,
          class_id: stInfo.class_id,
          lcd_code: lcd?.code || null,
          lcd_name: lcd?.name || null,
          lcd_color: lcd?.color || null,
          participations_count: count,
        };
      });

    const studentRankMap = new Map<string, { rank: number; count: number; full_name: string; class_id: string }>();
    for (let i = 0; i < allSortedStudents.length; i++) {
      const [mssv, count] = allSortedStudents[i];
      const stInfo = resolveStudentInfo(mssv);
      studentRankMap.set(mssv, {
        rank: i + 1,
        count,
        full_name: stInfo.full_name,
        class_id: stInfo.class_id,
      });
    }

    return {
      lcd_rankings: lcdRankings,
      unit_rankings: unitRankings,
      top_students: topStudents,
      total_events_in_semester: semesterEvents.length,
      total_participations_in_semester: distinctEventStudentSet.size,
      total_students_participated: studentParticipationMap.size,
      top50Threshold,
      totalRankedStudents: allSortedStudents.length,
      studentRankMap,
    };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    const { searchParams } = new URL(req.url);
    const requestedSemesterId = searchParams.get('semester_id');
    const forceRefresh = searchParams.get('refresh') === '1';

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // Chỉ Super Admin, Đoàn Trường, Phòng ban, LCĐ/CLB hoặc Admin sự kiện mới được chọn xem các kỳ khác;
    // Sinh viên bình thường chỉ xem được học kỳ hiện tại (đang kích hoạt).
    const canSelectSemester = Boolean(
      auth &&
        (auth.isSuperAdmin ||
          auth.tier === 'super_admin' ||
          auth.tier === 'youth_union' ||
          auth.tier === 'event_admin' ||
          auth.tier === 'ctsv' ||
          auth.tier === 'facility' ||
          auth.isEventAdmin ||
          isUnitAccount({ email: auth.email }))
    );

    // 1. Lấy danh sách cấu hình học kỳ do Super Admin gán thời gian
    const allSemesters = await getAcademicSemesters(supabase);
    const activeSemester = getActiveSemester(allSemesters);

    let selectedSemester: AcademicSemester = activeSemester;
    if (canSelectSemester && requestedSemesterId) {
      const found = allSemesters.find((s) => s.id === requestedSemesterId);
      if (found) selectedSemester = found;
    }

    const cacheKey = `${selectedSemester.id}_${selectedSemester.start_date}_${selectedSemester.end_date}`;
    const now = Date.now();
    const cachedEntry = rankingCache.get(cacheKey);
    const allowBypass = canSelectSemester && forceRefresh;

    let rankedData: CachedSemesterRanking;
    let cacheStatus: 'HIT' | 'STALE' | 'MISS' | 'COALESCED' = 'MISS';

    const triggerBackgroundRefresh = () => {
      if (rankingInFlight.has(cacheKey)) return;
      const bg = computeSemesterRanking(supabase, selectedSemester)
        .then((fresh) => {
          rankingCache.set(cacheKey, { ts: Date.now(), data: fresh });
          if (rankingCache.size > MAX_RANKING_CACHE_ENTRIES) {
            const oldestKey = rankingCache.keys().next().value;
            if (oldestKey) rankingCache.delete(oldestKey);
          }
          return fresh;
        })
        .catch((err) => {
          console.error('[ranking] Background refresh failed:', err);
          return cachedEntry!.data;
        })
        .finally(() => {
          if (rankingInFlight.get(cacheKey) === bg) {
            rankingInFlight.delete(cacheKey);
          }
        });
      rankingInFlight.set(cacheKey, bg);
    };

    if (!allowBypass && cachedEntry && now - cachedEntry.ts < RANKING_CACHE_TTL_MS) {
      rankedData = cachedEntry.data;
      cacheStatus = 'HIT';
    } else if (!allowBypass && cachedEntry && now - cachedEntry.ts < RANKING_STALE_TTL_MS) {
      // Stale-While-Revalidate: trả dữ liệu tức thì (<5ms) và tự tính lại ngầm ở nền
      rankedData = cachedEntry.data;
      cacheStatus = 'STALE';
      triggerBackgroundRefresh();
    } else {
      let pending = !allowBypass ? rankingInFlight.get(cacheKey) : undefined;
      if (pending) {
        cacheStatus = 'COALESCED';
        rankedData = await pending;
      } else {
        pending = computeSemesterRanking(supabase, selectedSemester);
        rankingInFlight.set(cacheKey, pending);
        try {
          rankedData = await pending;
          rankingCache.set(cacheKey, { ts: Date.now(), data: rankedData });
          if (rankingCache.size > MAX_RANKING_CACHE_ENTRIES) {
            const oldestKey = rankingCache.keys().next().value;
            if (oldestKey) rankingCache.delete(oldestKey);
          }
        } finally {
          if (rankingInFlight.get(cacheKey) === pending) {
            rankingInFlight.delete(cacheKey);
          }
        }
      }
    }

    // Tính thứ hạng hiện tại của chính sinh viên đang đăng nhập (O(1) từ cache)
    let myRank: MyRankingSummary | null = null;
    if (auth && !isUnitAccount({ email: auth.email })) {
      const myMssv = (extractMSSV(auth.email || '') || '').trim().toUpperCase();

      if (myMssv && isValidMSSV(myMssv)) {
        const rankedEntry = rankedData.studentRankMap.get(myMssv);
        const master = rankedEntry ? null : getMasterStudentByMssv(myMssv);
        const fullName = rankedEntry?.full_name || master?.full_name || myMssv;
        const classId = rankedEntry?.class_id || master?.class_id || 'PTIT-HCM';
        const myCount = rankedEntry?.count || 0;
        const myRankNum = rankedEntry?.rank || 0;
        const lcd = resolveStudentLcd(classId, myMssv);
        myRank = {
          rank: myRankNum,
          mssv: myMssv,
          full_name: fullName,
          class_id: classId,
          lcd_code: lcd?.code || null,
          lcd_name: lcd?.name || null,
          lcd_color: lcd?.color || null,
          participations_count: myCount,
          total_ranked_students: rankedData.totalRankedStudents,
          gap_to_top50:
            myRankNum > 0 && myRankNum <= 50 ? 0 : Math.max(1, rankedData.top50Threshold - myCount),
        };
      }
    }

    const responseData: RankingResponseData = {
      semester: selectedSemester,
      all_semesters: canSelectSemester ? allSemesters : [selectedSemester],
      can_select_semester: canSelectSemester,
      my_rank: myRank,
      lcd_rankings: rankedData.lcd_rankings,
      unit_rankings: rankedData.unit_rankings,
      top_students: rankedData.top_students,
      total_events_in_semester: rankedData.total_events_in_semester,
      total_participations_in_semester: rankedData.total_participations_in_semester,
      total_students_participated: rankedData.total_students_participated,
    };

    return NextResponse.json(
      {
        success: true,
        data: responseData,
      },
      {
        headers: {
          'X-Cache': cacheStatus,
        },
      }
    );
  } catch (err: any) {
    console.error('GET /api/ranking error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi máy chủ khi tính toán bảng xếp hạng' },
      { status: 500 }
    );
  }
}
