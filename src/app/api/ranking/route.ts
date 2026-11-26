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
import { getEventMetaBatch } from '@/lib/constants/event-meta-store';
import { getStoredOfficerRoles } from '@/lib/constants/officers-store';
import {
  buildSchoolYouthUnionEmailSet,
  classifyEventForRanking,
  type ResolvedRankingEventOrigin,
} from '@/lib/utils/ranking-scope';
import { fetchAllRows } from '@/lib/supabase/pagination';
import type {
  AcademicSemester,
  LcdRankingItem,
  UnitRankingItem,
  StudentRankingItem,
  MyRankingSummary,
  RankingResponseData,
  RankingScopeKey,
  RankingScopeDataset,
  SchoolCampaignEventItem,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RANKING_CACHE_TTL_MS = 300_000; // 5 phút fresh
const RANKING_STALE_TTL_MS = 1_800_000; // 30 phút stale-while-revalidate (trả tức thì & làm mới ngầm)
const MAX_RANKING_CACHE_ENTRIES = 12;

interface InternalScopeBucket {
  scope: RankingScopeKey;
  total_events: number;
  support_events_count?: number;
  official_school_events_count?: number;
  total_participations: number;
  total_students_participated: number;
  lcd_rankings: LcdRankingItem[];
  top_students: StudentRankingItem[];
  top50Threshold: number;
  totalRankedStudents: number;
  studentRankMap: Map<string, { rank: number; count: number; full_name: string; class_id: string }>;
}

interface CachedSemesterRanking {
  unit_rankings: UnitRankingItem[];
  school_events: SchoolCampaignEventItem[];
  scopes: {
    all: InternalScopeBucket;
    school: InternalScopeBucket;
    other: InternalScopeBucket;
  };
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

const OFFICIAL_CLUBS = OFFICIAL_UNITS.filter(
  (u) => !u.code.startsWith('LCD_') && !u.type.includes('LCĐ') && !u.type.includes('Khoa')
);

interface ScopeAccumulator {
  studentParticipationMap: Map<string, number>;
  lcdActiveStudentsSet: Map<string, Set<string>>;
  lcdTotalParticipationsMap: Map<string, number>;
  totalParticipations: number;
}

function createScopeAccumulator(): ScopeAccumulator {
  const lcdActiveStudentsSet = new Map<string, Set<string>>();
  const lcdTotalParticipationsMap = new Map<string, number>();
  for (const lcd of LCD_DEFINITIONS) {
    lcdActiveStudentsSet.set(lcd.code, new Set<string>());
    lcdTotalParticipationsMap.set(lcd.code, 0);
  }
  return {
    studentParticipationMap: new Map<string, number>(),
    lcdActiveStudentsSet,
    lcdTotalParticipationsMap,
    totalParticipations: 0,
  };
}

function finalizeScopeBucket(
  scope: RankingScopeKey,
  acc: ScopeAccumulator,
  totalEvents: number,
  lcdTotalStudentsMap: Map<string, number>,
  organizedCountByLcd: Map<string, number>,
  resolveStudentInfo: (mssv: string) => { full_name: string; class_id: string },
  extraCounts?: { support_events_count?: number; official_school_events_count?: number }
): InternalScopeBucket {
  const lcdRankings: LcdRankingItem[] = LCD_DEFINITIONS.map((lcd) => {
    const totalStudents = lcdTotalStudentsMap.get(lcd.code) || 0;
    const activeStudentsCount = acc.lcdActiveStudentsSet.get(lcd.code)?.size || 0;
    const totalParticipations = acc.lcdTotalParticipationsMap.get(lcd.code) || 0;
    const participationRate =
      totalStudents > 0
        ? Math.round((activeStudentsCount / totalStudents) * 1000) / 10
        : 0;
    const participationWeightRate =
      totalStudents > 0
        ? Math.round((totalParticipations / totalStudents) * 1000) / 10
        : 0;
    const avgParticipationsPerStudent =
      totalStudents > 0
        ? Math.round((totalParticipations / totalStudents) * 100) / 100
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
      participation_weight_rate: participationWeightRate,
      avg_participations_per_student: avgParticipationsPerStudent,
      events_organized_count: scope === 'school' ? 0 : organizedCountByLcd.get(lcd.code) || 0,
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

  const allSortedStudents = Array.from(acc.studentParticipationMap.entries()).sort((a, b) => {
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
    scope,
    total_events: totalEvents,
    ...(extraCounts || {}),
    total_participations: acc.totalParticipations,
    total_students_participated: acc.studentParticipationMap.size,
    lcd_rankings: lcdRankings,
    top_students: topStudents,
    top50Threshold,
    totalRankedStudents: allSortedStudents.length,
    studentRankMap,
  };
}

async function computeSemesterRanking(
  supabase: any,
  selectedSemester: AcademicSemester
): Promise<CachedSemesterRanking> {
  // 2. Lấy danh sách sự kiện, proposals, phân quyền cán bộ & quy tắc khóa tốt nghiệp song song
  const [
    { data: eventsData, error: eventsError },
    { data: proposalsData },
    graduatedRules,
    storedOfficers,
  ] = await Promise.all([
    fetchAllRows<any>(() =>
      supabase
        .from('events')
        .select('event_id, event_name, event_date, created_at, created_by, semester, status')
        .order('event_date', { ascending: false })
        .order('event_id', { ascending: false })
    ),
    fetchAllRows<any>(() =>
      supabase
        .from('event_proposals')
        .select('created_event_id, organization_unit')
        .not('created_event_id', 'is', null)
        .order('created_at', { ascending: false })
    ),
    getGraduatedCohorts(supabase, true),
    getStoredOfficerRoles(supabase).catch(() => []),
  ]);

  if (eventsError) {
    console.error('Error fetching events for ranking:', eventsError);
  }

  const schoolOfficerEmails = buildSchoolYouthUnionEmailSet(storedOfficers);

  const proposalUnitByEventId = new Map<string, string>();
  for (const p of proposalsData || []) {
    if (p.created_event_id && p.organization_unit) {
      proposalUnitByEventId.set(String(p.created_event_id), String(p.organization_unit));
    }
  }

  // Lọc sự kiện thuộc học kỳ đã chọn dựa trên khoảng thời gian [start_date, end_date]
  const allEvents = eventsData || [];
  const semesterEvents = allEvents.filter((ev: any) => {
    if (ev.status === 'rejected' || ev.status === 'pending') return false;
    const effectiveDate = ev.event_date || (ev.created_at ? String(ev.created_at).slice(0, 10) : null);
    if (effectiveDate && isEventInSemester(effectiveDate, selectedSemester)) return true;
    if (!effectiveDate && ev.semester) {
      return ev.semester === selectedSemester?.name || ev.semester === selectedSemester?.id;
    }
    return false;
  });

  const eventIds = semesterEvents.map((ev: any) => String(ev.event_id));
  const eventIdSet = new Set(eventIds);

  // Nạp metadata sự kiện theo lô để nhận diện chính xác Sự kiện Hỗ trợ / Phát động (is_support_event) và đơn vị
  const eventMetaMap =
    eventIds.length > 0 ? await getEventMetaBatch(supabase, eventIds).catch(() => ({})) : {};

  // Ánh xạ event_id -> đơn vị tổ chức & phân hệ xét thi đua ('school' vs 'other')
  const unitInfoByEventId = new Map<string, ResolvedRankingEventOrigin>();
  const organizedCountByLcd = new Map<string, number>();

  interface UnitAgg {
    unitName: string;
    unitType: 'lcd' | 'clb' | 'school' | 'faculty';
    lcdCode: string | null;
    lcdColor: string | null;
    eventsCount: number;
    totalParticipants: number;
    uniqueParticipants: Set<string>;
  }
  const unitAggMap = new Map<string, UnitAgg>();

  for (const club of OFFICIAL_CLUBS) {
    unitAggMap.set(club.name, {
      unitName: club.name,
      unitType: 'clb',
      lcdCode: null,
      lcdColor: '#7c3aed',
      eventsCount: 0,
      totalParticipants: 0,
      uniqueParticipants: new Set<string>(),
    });
  }

  interface SchoolEventAgg {
    event_id: string;
    event_name: string;
    event_date: string | null;
    unit_name: string;
    campaign_kind: 'support' | 'official';
    total_participants: number;
  }
  const schoolEventAggMap = new Map<string, SchoolEventAgg>();

  let schoolEventsCount = 0;
  let supportEventsCount = 0;
  let officialSchoolEventsCount = 0;
  let otherEventsCount = 0;

  for (const ev of semesterEvents) {
    const evId = String(ev.event_id);
    const meta = (eventMetaMap as Record<string, any>)[evId];
    const origin = classifyEventForRanking({
      proposalUnit: proposalUnitByEventId.get(evId),
      metaUnit: meta?.organization_unit,
      creatorEmail: ev.created_by,
      isSupportEvent: Boolean(meta?.is_support_event),
      schoolOfficerEmails,
    });
    unitInfoByEventId.set(evId, origin);

    if (origin.rankingScope === 'school') {
      schoolEventsCount += 1;
      const kind: 'support' | 'official' = origin.campaignKind === 'support' ? 'support' : 'official';
      if (kind === 'support') supportEventsCount += 1;
      else officialSchoolEventsCount += 1;

      schoolEventAggMap.set(evId, {
        event_id: evId,
        event_name: String(ev.event_name || 'Hoạt động Đoàn Trường'),
        event_date: ev.event_date || (ev.created_at ? String(ev.created_at).slice(0, 10) : null),
        unit_name: origin.unitName,
        campaign_kind: kind,
        total_participants: 0,
      });
    } else {
      otherEventsCount += 1;
    }

    if (origin.lcdCode) {
      organizedCountByLcd.set(
        origin.lcdCode,
        (organizedCountByLcd.get(origin.lcdCode) || 0) + 1
      );
    }

    const existing = unitAggMap.get(origin.unitName);
    if (existing) {
      existing.eventsCount += 1;
    } else {
      unitAggMap.set(origin.unitName, {
        unitName: origin.unitName,
        unitType: origin.unitType,
        lcdCode: origin.lcdCode,
        lcdColor: origin.lcdColor,
        eventsCount: 1,
        totalParticipants: 0,
        uniqueParticipants: new Set<string>(),
      });
    }
  }

  // 3. Lấy toàn bộ lượt check-in thuộc các sự kiện trong học kỳ này
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
    const class_id =
      (db?.class_id && !isPlaceholderClass(db.class_id) ? db.class_id : '') ||
      master?.class_id ||
      'PTIT-HCM';
    return { full_name, class_id };
  };

  // 5. Tính toán đồng thời cho cả 3 phân hệ (all = school + other) trong 1 vòng lặp duy nhất trên RAM
  const accAll = createScopeAccumulator();
  const accSchool = createScopeAccumulator();
  const accOther = createScopeAccumulator();

  const distinctEventStudentSet = new Set<string>();

  const recordToAccumulator = (acc: ScopeAccumulator, mssv: string, lcdCode: string | null) => {
    acc.totalParticipations += 1;
    acc.studentParticipationMap.set(mssv, (acc.studentParticipationMap.get(mssv) || 0) + 1);
    if (lcdCode) {
      acc.lcdActiveStudentsSet.get(lcdCode)?.add(mssv);
      acc.lcdTotalParticipationsMap.set(
        lcdCode,
        (acc.lcdTotalParticipationsMap.get(lcdCode) || 0) + 1
      );
    }
  };

  for (const row of checkinRows) {
    const mssv = String(row.mssv || '').trim().toUpperCase();
    if (!mssv || !isValidMSSV(mssv)) continue;
    const eventId = String(row.event_id || '');
    if (!eventIdSet.has(eventId)) continue;

    const comboKey = `${eventId}__${mssv}`;
    if (distinctEventStudentSet.has(comboKey)) continue;
    distinctEventStudentSet.add(comboKey);

    const stInfo = resolveStudentInfo(mssv);
    const lcd = resolveStudentLcd(stInfo.class_id, mssv);
    const lcdCode = lcd?.code || null;
    const unitInfo = unitInfoByEventId.get(eventId);
    const isSchoolScope = unitInfo?.rankingScope === 'school';

    // 1. Tổng toàn trường
    recordToAccumulator(accAll, mssv, lcdCode);

    // 2. Đoàn Trường & Phát động vs 3. Còn lại (Cơ sở)
    if (isSchoolScope) {
      recordToAccumulator(accSchool, mssv, lcdCode);
      const sEvt = schoolEventAggMap.get(eventId);
      if (sEvt) sEvt.total_participants += 1;
    } else {
      recordToAccumulator(accOther, mssv, lcdCode);
    }

    // 4. Đơn vị tổ chức (CLB / Đội / Nhóm)
    if (unitInfo) {
      const agg = unitAggMap.get(unitInfo.unitName);
      if (agg) {
        agg.totalParticipants += 1;
        agg.uniqueParticipants.add(mssv);
      }
    }
  }

  // 6. Chuẩn hóa 3 bộ kết quả phân hệ
  const allBucket = finalizeScopeBucket(
    'all',
    accAll,
    semesterEvents.length,
    lcdTotalStudentsMap,
    organizedCountByLcd,
    resolveStudentInfo
  );
  const schoolBucket = finalizeScopeBucket(
    'school',
    accSchool,
    schoolEventsCount,
    lcdTotalStudentsMap,
    organizedCountByLcd,
    resolveStudentInfo,
    {
      support_events_count: supportEventsCount,
      official_school_events_count: officialSchoolEventsCount,
    }
  );
  const otherBucket = finalizeScopeBucket(
    'other',
    accOther,
    otherEventsCount,
    lcdTotalStudentsMap,
    organizedCountByLcd,
    resolveStudentInfo
  );

  // 7. Xây dựng Bảng Xếp Hạng CLB / Đội / Nhóm
  const unitRankings: UnitRankingItem[] = Array.from(unitAggMap.values())
    .filter((agg) => agg.unitType === 'clb')
    .map((agg) => ({
      rank: 0,
      unit_name: agg.unitName,
      unit_type: 'clb' as const,
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

  // 8. Danh sách chi tiết các Hoạt động Đoàn Trường & Phát động trong kỳ
  const schoolEvents: SchoolCampaignEventItem[] = Array.from(schoolEventAggMap.values())
    .sort((a, b) => {
      if (b.total_participants !== a.total_participants) {
        return b.total_participants - a.total_participants;
      }
      return String(b.event_date || '').localeCompare(String(a.event_date || ''));
    })
    .map((item, idx) => ({
      rank: idx + 1,
      ...item,
    }));

  return {
    unit_rankings: unitRankings,
    school_events: schoolEvents,
    scopes: {
      all: allBucket,
      school: schoolBucket,
      other: otherBucket,
    },
  };
}

function buildMyRankForBucket(
  bucket: InternalScopeBucket,
  myMssv: string | null
): MyRankingSummary | null {
  if (!myMssv || !isValidMSSV(myMssv)) return null;
  const rankedEntry = bucket.studentRankMap.get(myMssv);
  const master = rankedEntry ? null : getMasterStudentByMssv(myMssv);
  const fullName = rankedEntry?.full_name || master?.full_name || myMssv;
  const classId = rankedEntry?.class_id || master?.class_id || 'PTIT-HCM';
  const myCount = rankedEntry?.count || 0;
  const myRankNum = rankedEntry?.rank || 0;
  const lcd = resolveStudentLcd(classId, myMssv);
  return {
    rank: myRankNum,
    mssv: myMssv,
    full_name: fullName,
    class_id: classId,
    lcd_code: lcd?.code || null,
    lcd_name: lcd?.name || null,
    lcd_color: lcd?.color || null,
    participations_count: myCount,
    total_ranked_students: bucket.totalRankedStudents,
    gap_to_top50:
      myRankNum > 0 && myRankNum <= 50 ? 0 : Math.max(1, bucket.top50Threshold - myCount),
  };
}

function toPublicScopeDataset(
  bucket: InternalScopeBucket,
  myMssv: string | null
): RankingScopeDataset {
  return {
    scope: bucket.scope,
    total_events: bucket.total_events,
    ...(bucket.support_events_count !== undefined
      ? { support_events_count: bucket.support_events_count }
      : {}),
    ...(bucket.official_school_events_count !== undefined
      ? { official_school_events_count: bucket.official_school_events_count }
      : {}),
    total_participations: bucket.total_participations,
    total_students_participated: bucket.total_students_participated,
    lcd_rankings: bucket.lcd_rankings,
    top_students: bucket.top_students,
    my_rank: buildMyRankForBucket(bucket, myMssv),
  };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const requestedSemesterId = searchParams.get('semester_id');
    const forceRefresh = searchParams.get('refresh') === '1';

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

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

    const allSemesters = await getAcademicSemesters(supabase);
    const activeSemester = getActiveSemester(allSemesters);

    let selectedSemester: AcademicSemester = activeSemester;
    if (canSelectSemester && requestedSemesterId) {
      const found = allSemesters.find((s) => s.id === requestedSemesterId);
      if (found) selectedSemester = found;
    }

    const cacheKey = `v2_${selectedSemester.id}_${selectedSemester.start_date}_${selectedSemester.end_date}`;
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

    let myMssv: string | null = null;
    if (auth && !isUnitAccount({ email: auth.email })) {
      const extracted = (extractMSSV(auth.email || '') || '').trim().toUpperCase();
      if (extracted && isValidMSSV(extracted)) {
        myMssv = extracted;
      }
    }

    const scopeAll = toPublicScopeDataset(rankedData.scopes.all, myMssv);
    const scopeSchool = toPublicScopeDataset(rankedData.scopes.school, myMssv);
    const scopeOther = toPublicScopeDataset(rankedData.scopes.other, myMssv);

    const responseData: RankingResponseData = {
      semester: selectedSemester,
      all_semesters: canSelectSemester ? allSemesters : [selectedSemester],
      can_select_semester: canSelectSemester,
      my_rank: scopeAll.my_rank,
      lcd_rankings: scopeAll.lcd_rankings,
      unit_rankings: rankedData.unit_rankings,
      top_students: scopeAll.top_students,
      total_events_in_semester: scopeAll.total_events,
      total_participations_in_semester: scopeAll.total_participations,
      total_students_participated: scopeAll.total_students_participated,
      school_events: rankedData.school_events,
      scopes: {
        all: scopeAll,
        school: scopeSchool,
        other: scopeOther,
      },
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
