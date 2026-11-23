import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { fetchAllRows } from '@/lib/supabase/pagination';
import { getAcademicSemesters, getActiveSemester, isEventInSemester } from '@/lib/utils/semesters';
import {
  LCD_DEFINITIONS,
  getLcdByCode,
  normalizeLcdCode,
  resolveStudentLcd,
  type LcdCode,
} from '@/lib/utils/lcd';
import { OFFICIAL_UNITS } from '@/lib/constants/units';
import {
  getMasterStudentDirectory,
  getMasterStudentByMssv,
  isPlaceholderClass,
} from '@/lib/utils/student-profile';
import { isValidMSSV, isUnitAccount } from '@/lib/utils/extract-mssv';
import {
  getGraduatedCohortsConfig,
  isStudentGraduated,
  isStudentInDeletedCohort,
} from '@/lib/utils/graduated-cohorts';
import { getHandoverRegistryFromDb } from '@/lib/constants/handover-store';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import { getEffectiveEventStatus } from '@/lib/utils/event-logic';
import type { AcademicSemester } from '@/lib/types';

export const dynamic = 'force-dynamic';

const FRESH_TTL_MS = 60_000; // 60s fresh
const STALE_TTL_MS = 300_000; // 5m stale-while-revalidate

interface DashboardCacheEntry {
  ts: number;
  data: any;
}

const gDash = globalThis as unknown as {
  __hddAdminDashboardCache?: Map<string, DashboardCacheEntry>;
  __hddAdminDashboardInFlight?: Map<string, Promise<any>>;
};

const dashboardCache =
  gDash.__hddAdminDashboardCache || (gDash.__hddAdminDashboardCache = new Map());
const dashboardInFlight =
  gDash.__hddAdminDashboardInFlight || (gDash.__hddAdminDashboardInFlight = new Map());

const UNIT_BY_EMAIL = new Map<string, string>(
  OFFICIAL_UNITS.map((u) => [u.email.toLowerCase(), u.name])
);

const OFFICIAL_CLUBS = OFFICIAL_UNITS.filter(
  (u) => !u.code.startsWith('LCD_') && !u.type.includes('LCĐ') && !u.type.includes('Khoa')
);

function classifyUnit(
  proposalUnit?: string | null,
  creatorEmail?: string | null
): { unitName: string; unitType: 'lcd' | 'clb' | 'school'; lcdCode: LcdCode | null } {
  const emailLower = String(creatorEmail || '').toLowerCase().trim();
  const rawName = String(proposalUnit || '').trim() || UNIT_BY_EMAIL.get(emailLower) || '';
  const rawLower = rawName.toLowerCase();

  const isExplicitClub =
    rawLower.startsWith('clb') ||
    rawLower.startsWith('câu lạc bộ') ||
    rawLower.startsWith('đội ') ||
    emailLower.startsWith('clb') ||
    emailLower.startsWith('doi');

  if (isExplicitClub && rawName) {
    return { unitName: rawName, unitType: 'clb', lcdCode: null };
  }

  const lcdCode = normalizeLcdCode(rawName) || normalizeLcdCode(emailLower);
  if (lcdCode) {
    const lcd = getLcdByCode(lcdCode);
    if (lcd) {
      return { unitName: lcd.name, unitType: 'lcd', lcdCode: lcd.code };
    }
  }

  if (rawName) {
    const isSchool =
      rawLower.includes('đoàn học viện') ||
      rawLower.includes('đoàn trường') ||
      rawLower.includes('đoàn tncs') ||
      rawLower.includes('phòng ') ||
      rawLower.includes('khoa ') ||
      rawLower.includes('ban chấp hành đoàn');
    return { unitName: rawName, unitType: isSchool ? 'school' : 'clb', lcdCode: null };
  }

  return { unitName: 'Đoàn TNCS Học Viện', unitType: 'school', lcdCode: null };
}

function buildSemesterMonths(startStr: string, endStr: string): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = [];
  const startParts = String(startStr || '').slice(0, 7).split('-').map(Number);
  const endParts = String(endStr || '').slice(0, 7).split('-').map(Number);
  if (startParts.length !== 2 || endParts.length !== 2 || !startParts[0] || !endParts[0]) {
    return out;
  }
  let y = startParts[0];
  let m = startParts[1];
  const endY = endParts[0];
  const endM = endParts[1];
  let guard = 0;
  while ((y < endY || (y === endY && m <= endM)) && guard < 18) {
    const mm = String(m).padStart(2, '0');
    out.push({
      key: `${y}-${mm}`,
      label: `T${mm}/${String(y).slice(-2)}`,
    });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    guard += 1;
  }
  return out;
}

async function fetchPaginatedRows(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>,
  maxRows = 25_000
): Promise<any[]> {
  const pageSize = 1000;
  const WAVE = 4;
  const all: any[] = [];
  let offset = 0;
  while (offset < maxRows) {
    const offsets = Array.from({ length: WAVE }, (_, idx) => offset + idx * pageSize).filter(
      (o) => o < maxRows
    );
    const waveRes = await Promise.all(
      offsets.map((o) => Promise.resolve(queryFactory(o, o + pageSize - 1)))
    );
    let done = false;
    for (const { data, error } of waveRes) {
      if (error || !data || data.length === 0) {
        done = true;
        break;
      }
      all.push(...data);
      if (data.length < pageSize) {
        done = true;
        break;
      }
    }
    if (done) break;
    offset += WAVE * pageSize;
  }
  return all;
}

async function computeDashboardPayload(
  supabase: any,
  selectedSemester: AcademicSemester,
  allSemesters: AcademicSemester[]
) {
  const todayVN = getVietnamDateString(0);
  const tomorrowVN = getVietnamDateString(1);
  const now = new Date();

  const safeSelect = async (table: string, cols: string, required = false) => {
    try {
      const { data, error } = await fetchAllRows<any>(() => supabase.from(table).select(cols));
      if (error) {
        if (required) {
          throw new Error(`Dashboard query failed for ${table}`);
        }
        return [];
      }
      return data || [];
    } catch (err) {
      if (required) throw err;
      return [];
    }
  };

  const [
    eventsRows,
    proposalsRows,
    gradCfg,
    delegatesRows,
    penaltiesRows,
    borrowReqRows,
    borrowBanRows,
    pushSubRows,
    ratingsRows,
    handoverRegistry,
    dbUsersRows,
  ] = await Promise.all([
    safeSelect(
      'events',
      'event_id, event_name, event_date, start_time, end_time, created_at, created_by, semester, status, is_active',
      true
    ),
    safeSelect(
      'event_proposals',
      'id, title, organization_unit, created_by, status, current_stage, start_date, end_date, start_time, end_time, room_name, created_event_id',
      true
    ),
    getGraduatedCohortsConfig(supabase, true),
    safeSelect('class_delegates', 'id, mssv, class_id, is_active, expires_at'),
    safeSelect('user_penalties', 'mssv, is_blacklisted, missed_count'),
    safeSelect('office_borrow_requests', 'id, status, due_date'),
    safeSelect('office_borrow_bans', 'id, is_active, banned_until'),
    safeSelect('push_subscriptions', 'id, device_type, is_active'),
    safeSelect('unit_ratings', 'event_id, stars, organization_unit'),
    getHandoverRegistryFromDb(supabase),
    fetchPaginatedRows(
      (from, to) =>
        supabase
          .from('users')
          .select('mssv, class_id, email')
          .order('mssv', { ascending: true })
          .range(from, to),
      15_000
    ),
  ]);

  const { rules: gradRules, deleted_cohorts: deletedCohorts } = gradCfg;

  // ── 1. Active Student Directory & Classes per LCĐ (excluding graduated & deleted cohorts) ──
  const studentClassByMssv = new Map<string, string>();
  const masterDir = getMasterStudentDirectory();
  for (const [rawM, info] of masterDir.entries()) {
    const m = String(rawM || '').trim().toUpperCase();
    if (!isValidMSSV(m)) continue;
    studentClassByMssv.set(m, String(info.class_id || 'PTIT-HCM').trim().toUpperCase());
  }
  for (const u of dbUsersRows) {
    if (isUnitAccount({ mssv: u.mssv, email: u.email })) continue;
    const m = String(u.mssv || '').trim().toUpperCase();
    if (!isValidMSSV(m)) continue;
    const rawCls = String(u.class_id || '').trim().toUpperCase();
    if (rawCls && !isPlaceholderClass(rawCls)) {
      studentClassByMssv.set(m, rawCls);
    } else if (!studentClassByMssv.has(m)) {
      studentClassByMssv.set(m, rawCls || 'PTIT-HCM');
    }
  }

  const lcdTotalStudents = new Map<LcdCode, number>();
  const lcdClassesSet = new Map<LcdCode, Set<string>>();
  for (const lcd of LCD_DEFINITIONS) {
    lcdTotalStudents.set(lcd.code, 0);
    lcdClassesSet.set(lcd.code, new Set());
  }

  let totalActiveStudents = 0;
  const allActiveClasses = new Set<string>();

  for (const [mssv, cls] of studentClassByMssv.entries()) {
    if (isStudentInDeletedCohort(mssv, cls, deletedCohorts)) continue;
    if (isStudentGraduated(mssv, cls, gradRules)) continue;
    totalActiveStudents += 1;
    const lcd = resolveStudentLcd(cls, mssv);
    if (lcd) {
      lcdTotalStudents.set(lcd.code, (lcdTotalStudents.get(lcd.code) || 0) + 1);
      if (cls && cls !== 'PTIT-HCM') {
        lcdClassesSet.get(lcd.code)?.add(cls);
        allActiveClasses.add(cls);
      }
    }
  }

  // Active delegates per class
  const classesWithActiveDelegate = new Set<string>();
  const lcdDelegatedClasses = new Map<LcdCode, Set<string>>();
  for (const lcd of LCD_DEFINITIONS) lcdDelegatedClasses.set(lcd.code, new Set());

  for (const d of delegatesRows) {
    if (!d.is_active || new Date(d.expires_at) <= now) continue;
    const cls = String(d.class_id || '').trim().toUpperCase();
    const m = String(d.mssv || '').trim().toUpperCase();
    if (isStudentInDeletedCohort(m, cls, deletedCohorts)) continue;
    if (isStudentGraduated(m, cls, gradRules)) continue;
    if (allActiveClasses.has(cls)) {
      classesWithActiveDelegate.add(cls);
      const lcd = resolveStudentLcd(cls, m);
      if (lcd) lcdDelegatedClasses.get(lcd.code)?.add(cls);
    }
  }

  // ── 2. Action Center Counts ──
  const pendingByStage = { youth_union: 0, ctsv: 0, facility: 0 };
  let pendingProposalsTotal = 0;
  const proposalByEventId = new Map<string, any>();

  for (const p of proposalsRows) {
    if (p.created_event_id) {
      proposalByEventId.set(String(p.created_event_id), p);
    }
    if (p.status === 'pending') {
      pendingProposalsTotal += 1;
      const stg = String(p.current_stage || 'youth_union');
      if (stg === 'ctsv') pendingByStage.ctsv += 1;
      else if (stg === 'facility') pendingByStage.facility += 1;
      else pendingByStage.youth_union += 1;
    }
  }

  let pendingBorrows = 0;
  let overdueBorrows = 0;
  for (const r of borrowReqRows) {
    if (r.status === 'pending') pendingBorrows += 1;
    if (r.status === 'borrowed' && r.due_date && String(r.due_date).slice(0, 10) < todayVN) {
      overdueBorrows += 1;
    }
  }

  const activeBannedUnits = borrowBanRows.filter(
    (b: any) => b.is_active && b.banned_until && new Date(b.banned_until) > now
  ).length;

  const blacklistedStudents = penaltiesRows.filter((p: any) => Boolean(p.is_blacklisted)).length;

  // ── 3. Filter Semester Events ──
  const semesterEvents = eventsRows.filter((ev: any) => {
    if (ev.status === 'rejected' || ev.status === 'pending') return false;
    const effDate = ev.event_date || (ev.created_at ? String(ev.created_at).slice(0, 10) : null);
    if (effDate && isEventInSemester(effDate, selectedSemester)) return true;
    if (!effDate && ev.semester) {
      return ev.semester === selectedSemester.name || ev.semester === selectedSemester.id;
    }
    return false;
  });

  const semesterEventIds = semesterEvents.map((e: any) => String(e.event_id));
  const semesterEventIdSet = new Set(semesterEventIds);

  // Also include Today/Tomorrow event IDs so live check-in progress is always populated
  const liveScheduleEvents = eventsRows.filter((ev: any) => {
    if (ev.status === 'rejected' || ev.status === 'pending') return false;
    const d = String(ev.event_date || '').slice(0, 10);
    return d === todayVN || d === tomorrowVN;
  });

  const queryEventIds = Array.from(
    new Set([...semesterEventIds, ...liveScheduleEvents.map((e: any) => String(e.event_id))])
  );

  // ── 4. Load Check-ins & Registrations for Semester + Live Schedule Events ──
  const checkinRows: any[] = [];
  const regRows: any[] = [];

  if (queryEventIds.length > 0) {
    const CHUNK = 150;
    const slices: string[][] = [];
    for (let i = 0; i < queryEventIds.length; i += CHUNK) {
      slices.push(queryEventIds.slice(i, i + CHUNK));
    }

    const [ciSlices, regSlices] = await Promise.all([
      Promise.all(
        slices.map((slice) =>
          fetchPaginatedRows((from, to) =>
            supabase
              .from('check_ins')
              .select('event_id, mssv, participate_role')
              .in('event_id', slice)
              .order('created_at', { ascending: false })
              .order('mssv', { ascending: true })
              .range(from, to)
          )
        )
      ),
      Promise.all(
        slices.map((slice) =>
          fetchPaginatedRows((from, to) =>
            supabase
              .from('event_registrations')
              .select('event_id, mssv, attended')
              .in('event_id', slice)
              .order('created_at', { ascending: false })
              .order('mssv', { ascending: true })
              .range(from, to)
          )
        )
      ),
    ]);

    for (const s of ciSlices) checkinRows.push(...s);
    for (const s of regSlices) regRows.push(...s);
  }

  // Deduplicate check-ins & registrations per (event_id, mssv)
  const checkinsByEvent = new Map<string, Set<string>>();
  const regsByEvent = new Map<string, Set<string>>();
  const roleBreakdown = { participant: 0, volunteer: 0, organizer: 0 };
  const activeStudentsInSemester = new Set<string>();
  const lcdActiveStudents = new Map<LcdCode, Set<string>>();
  const lcdParticipations = new Map<LcdCode, number>();
  for (const lcd of LCD_DEFINITIONS) {
    lcdActiveStudents.set(lcd.code, new Set());
    lcdParticipations.set(lcd.code, 0);
  }

  const seenCheckinCombo = new Set<string>();
  for (const ci of checkinRows) {
    const evId = String(ci.event_id || '');
    const m = String(ci.mssv || '').trim().toUpperCase();
    if (!evId || !m || !isValidMSSV(m)) continue;
    const combo = `${evId}__${m}`;
    if (seenCheckinCombo.has(combo)) continue;
    seenCheckinCombo.add(combo);

    let set = checkinsByEvent.get(evId);
    if (!set) {
      set = new Set();
      checkinsByEvent.set(evId, set);
    }
    set.add(m);

    if (semesterEventIdSet.has(evId)) {
      const role = String(ci.participate_role || 'participant');
      if (role === 'volunteer') roleBreakdown.volunteer += 1;
      else if (role === 'organizer') roleBreakdown.organizer += 1;
      else roleBreakdown.participant += 1;

      const cls =
        studentClassByMssv.get(m) || getMasterStudentByMssv(m)?.class_id || 'PTIT-HCM';
      if (!isStudentInDeletedCohort(m, cls, deletedCohorts) && !isStudentGraduated(m, cls, gradRules)) {
        activeStudentsInSemester.add(m);
      }
      const lcd = resolveStudentLcd(cls, m);
      if (lcd) {
        if (!isStudentInDeletedCohort(m, cls, deletedCohorts) && !isStudentGraduated(m, cls, gradRules)) {
          lcdActiveStudents.get(lcd.code)?.add(m);
        }
        lcdParticipations.set(lcd.code, (lcdParticipations.get(lcd.code) || 0) + 1);
      }
    }
  }

  const seenRegCombo = new Set<string>();
  for (const r of regRows) {
    const evId = String(r.event_id || '');
    const m = String(r.mssv || '').trim().toUpperCase();
    if (!evId || !m || !isValidMSSV(m)) continue;
    const combo = `${evId}__${m}`;
    if (seenRegCombo.has(combo)) continue;
    seenRegCombo.add(combo);

    let set = regsByEvent.get(evId);
    if (!set) {
      set = new Set();
      regsByEvent.set(evId, set);
    }
    set.add(m);
  }

  // ── 5. Monthly Trend, Source Breakdown, Unit & Event Aggregations ──
  const months = buildSemesterMonths(selectedSemester.start_date, selectedSemester.end_date);
  const monthlyMap = new Map<string, { key: string; label: string; events_count: number; checkins_count: number }>();
  for (const mo of months) {
    monthlyMap.set(mo.key, { ...mo, events_count: 0, checkins_count: 0 });
  }

  const sourceBreakdown = {
    school: { events: 0, checkins: 0 },
    lcd: { events: 0, checkins: 0 },
    clb: { events: 0, checkins: 0 },
  };

  const lcdEventsOrganized = new Map<LcdCode, number>();
  for (const lcd of LCD_DEFINITIONS) lcdEventsOrganized.set(lcd.code, 0);

  const clbAgg = new Map<string, { unit_name: string; events_count: number; total_participants: number }>();
  for (const club of OFFICIAL_CLUBS) {
    clbAgg.set(club.name, { unit_name: club.name, events_count: 0, total_participants: 0 });
  }

  // Ratings by event_id
  const ratingsByEvent = new Map<string, { sum: number; count: number }>();
  let totalRatingSum = 0;
  let totalRatingCount = 0;
  for (const rt of ratingsRows) {
    const evId = String(rt.event_id || '');
    const stars = Number(rt.stars) || 0;
    if (!evId || stars <= 0) continue;
    const cur = ratingsByEvent.get(evId) || { sum: 0, count: 0 };
    cur.sum += stars;
    cur.count += 1;
    ratingsByEvent.set(evId, cur);
    if (semesterEventIdSet.has(evId)) {
      totalRatingSum += stars;
      totalRatingCount += 1;
    }
  }

  let openEventsCount = 0;
  let closedEventsCount = 0;
  let totalCheckinsInSemester = 0;
  let totalRegistrationsInSemester = 0;
  let attendedFromRegistered = 0;

  const eventStatsList: Array<{
    event_id: string;
    event_name: string;
    unit_name: string;
    event_date: string | null;
    checkins_count: number;
    registered_count: number;
    noshow_count: number;
    noshow_rate: number;
    avg_stars: number | null;
    reviews_count: number;
  }> = [];

  for (const ev of semesterEvents) {
    const evId = String(ev.event_id);
    const effStatus = getEffectiveEventStatus(ev);
    if (effStatus === 'active') openEventsCount += 1;
    else closedEventsCount += 1;

    const prop = proposalByEventId.get(evId);
    const unitInfo = classifyUnit(prop?.organization_unit, ev.created_by);

    const ciSet = checkinsByEvent.get(evId) || new Set<string>();
    const regSet = regsByEvent.get(evId) || new Set<string>();
    const ciCount = ciSet.size;
    const regCount = regSet.size;

    let regAttended = 0;
    for (const m of regSet) {
      if (ciSet.has(m)) regAttended += 1;
    }
    const noShow = Math.max(0, regCount - regAttended);
    const noShowRate = regCount > 0 ? Math.round((noShow / regCount) * 1000) / 10 : 0;

    totalCheckinsInSemester += ciCount;
    totalRegistrationsInSemester += regCount;
    attendedFromRegistered += regAttended;

    // Monthly bucket
    const effDate = String(ev.event_date || ev.created_at || '').slice(0, 7);
    const moBucket = monthlyMap.get(effDate);
    if (moBucket) {
      moBucket.events_count += 1;
      moBucket.checkins_count += ciCount;
    }

    // Source breakdown
    sourceBreakdown[unitInfo.unitType].events += 1;
    sourceBreakdown[unitInfo.unitType].checkins += ciCount;

    if (unitInfo.lcdCode) {
      lcdEventsOrganized.set(unitInfo.lcdCode, (lcdEventsOrganized.get(unitInfo.lcdCode) || 0) + 1);
    }
    if (unitInfo.unitType === 'clb') {
      const existingClub = clbAgg.get(unitInfo.unitName);
      if (existingClub) {
        existingClub.events_count += 1;
        existingClub.total_participants += ciCount;
      } else {
        clbAgg.set(unitInfo.unitName, {
          unit_name: unitInfo.unitName,
          events_count: 1,
          total_participants: ciCount,
        });
      }
    }

    const rt = ratingsByEvent.get(evId);
    eventStatsList.push({
      event_id: evId,
      event_name: String(ev.event_name || 'Sự kiện'),
      unit_name: unitInfo.unitName,
      event_date: ev.event_date ? String(ev.event_date).slice(0, 10) : null,
      checkins_count: ciCount,
      registered_count: regCount,
      noshow_count: noShow,
      noshow_rate: noShowRate,
      avg_stars: rt && rt.count > 0 ? Math.round((rt.sum / rt.count) * 10) / 10 : null,
      reviews_count: rt?.count || 0,
    });
  }

  // ── 6. Today & Tomorrow Live Schedule ──
  const liveSchedule = liveScheduleEvents
    .map((ev: any) => {
      const evId = String(ev.event_id);
      const prop = proposalByEventId.get(evId);
      const unitInfo = classifyUnit(prop?.organization_unit, ev.created_by);
      const roomName = prop?.room_name || 'Không mượn';
      const hasRoom = Boolean(roomName && roomName !== 'Không mượn');
      const handover = prop?.id ? handoverRegistry[String(prop.id)] : undefined;
      const keyStatus: 'not_needed' | 'pending' | 'handed_over' | 'returned' = !hasRoom
        ? 'not_needed'
        : handover?.key_status || 'pending';

      const d = String(ev.event_date || '').slice(0, 10);
      const st = ev.start_time ? String(ev.start_time).slice(0, 5) : '07:30';
      const et = ev.end_time ? String(ev.end_time).slice(0, 5) : '17:00';

      return {
        event_id: evId,
        proposal_id: prop?.id || null,
        event_name: String(ev.event_name || 'Sự kiện'),
        unit_name: unitInfo.unitName,
        event_date: d,
        is_today: d === todayVN,
        time_range: `${st} – ${et}`,
        room_name: roomName,
        key_status: keyStatus,
        registered_count: regsByEvent.get(evId)?.size || 0,
        checked_in_count: checkinsByEvent.get(evId)?.size || 0,
      };
    })
    .sort((a: any, b: any) => {
      if (a.event_date !== b.event_date) return a.event_date.localeCompare(b.event_date);
      return a.time_range.localeCompare(b.time_range);
    });

  // ── 7. Push Subscription Breakdown ──
  const pushStats = { total: 0, ios: 0, android: 0, desktop: 0 };
  for (const sub of pushSubRows) {
    if (sub.is_active === false) continue;
    pushStats.total += 1;
    const dt = String(sub.device_type || '').toLowerCase();
    if (dt.includes('ios') || dt.includes('iphone') || dt.includes('ipad')) pushStats.ios += 1;
    else if (dt.includes('android')) pushStats.android += 1;
    else pushStats.desktop += 1;
  }

  // ── 8. LCĐ & CLB Health Summaries ──
  const lcdHealth = LCD_DEFINITIONS.map((lcd) => {
    const totalSt = lcdTotalStudents.get(lcd.code) || 0;
    const activeSt = lcdActiveStudents.get(lcd.code)?.size || 0;
    const totalCls = lcdClassesSet.get(lcd.code)?.size || 0;
    const delCls = lcdDelegatedClasses.get(lcd.code)?.size || 0;
    return {
      lcd_code: lcd.code,
      lcd_name: lcd.name,
      lcd_short_name: lcd.shortName,
      lcd_color: lcd.color,
      total_students: totalSt,
      active_students: activeSt,
      coverage_rate: totalSt > 0 ? Math.round((activeSt / totalSt) * 1000) / 10 : 0,
      events_count: lcdEventsOrganized.get(lcd.code) || 0,
      total_participations: lcdParticipations.get(lcd.code) || 0,
      classes_with_delegate: delCls,
      total_classes: totalCls,
    };
  }).sort((a, b) => b.coverage_rate - a.coverage_rate);

  const allClbs = Array.from(clbAgg.values()).sort((a, b) => {
    if (b.total_participants !== a.total_participants) {
      return b.total_participants - a.total_participants;
    }
    return b.events_count - a.events_count;
  });
  const inactiveClubs = allClbs.filter((c) => c.events_count === 0).map((c) => c.unit_name);
  const activeClubsCount = allClbs.length - inactiveClubs.length;

  // ── 9. Event Leaderboards ──
  const topAttended = [...eventStatsList]
    .sort((a, b) => b.checkins_count - a.checkins_count)
    .slice(0, 6);

  const topRated = eventStatsList
    .filter((e) => e.avg_stars !== null && e.reviews_count > 0)
    .sort((a, b) => {
      if ((b.avg_stars || 0) !== (a.avg_stars || 0)) return (b.avg_stars || 0) - (a.avg_stars || 0);
      return b.checkins_count - a.checkins_count;
    })
    .slice(0, 6);

  const highestNoShow = eventStatsList
    .filter((e) => e.registered_count >= 10 && e.noshow_count > 0)
    .sort((a, b) => {
      if (b.noshow_rate !== a.noshow_rate) return b.noshow_rate - a.noshow_rate;
      return b.noshow_count - a.noshow_count;
    })
    .slice(0, 6);

  const studentCoverageRate =
    totalActiveStudents > 0
      ? Math.round((activeStudentsInSemester.size / totalActiveStudents) * 1000) / 10
      : 0;

  const attendanceConversionRate =
    totalRegistrationsInSemester > 0
      ? Math.round((attendedFromRegistered / totalRegistrationsInSemester) * 1000) / 10
      : 0;

  return {
    generated_at: now.toISOString(),
    today_vn: todayVN,
    tomorrow_vn: tomorrowVN,
    semester: selectedSemester,
    all_semesters: allSemesters,
    action_center: {
      pending_proposals: {
        total: pendingProposalsTotal,
        by_stage: pendingByStage,
      },
      office_borrows: {
        pending: pendingBorrows,
        overdue: overdueBorrows,
      },
      delegates_gap: {
        classes_without_delegate: Math.max(0, allActiveClasses.size - classesWithActiveDelegate.size),
        total_classes: allActiveClasses.size,
      },
      discipline: {
        blacklisted_students: blacklistedStudents,
        banned_units: activeBannedUnits,
      },
    },
    live_schedule: liveSchedule,
    kpis: {
      total_active_students: totalActiveStudents,
      active_students_in_semester: activeStudentsInSemester.size,
      student_coverage_rate: studentCoverageRate,
      total_events_in_semester: semesterEvents.length,
      open_events_count: openEventsCount,
      closed_events_count: closedEventsCount,
      total_checkins_in_semester: totalCheckinsInSemester,
      role_breakdown: roleBreakdown,
      total_registrations_in_semester: totalRegistrationsInSemester,
      attended_from_registered: attendedFromRegistered,
      no_show_count: Math.max(0, totalRegistrationsInSemester - attendedFromRegistered),
      attendance_conversion_rate: attendanceConversionRate,
      avg_rating_stars:
        totalRatingCount > 0 ? Math.round((totalRatingSum / totalRatingCount) * 10) / 10 : null,
      total_ratings_count: totalRatingCount,
      push_subscribers: pushStats,
    },
    monthly_trend: Array.from(monthlyMap.values()),
    source_breakdown: sourceBreakdown,
    lcd_health: lcdHealth,
    clb_health: {
      total_clubs: allClbs.length,
      active_clubs_count: activeClubsCount,
      inactive_clubs: inactiveClubs,
      top_clubs: allClbs.filter((c) => c.events_count > 0).slice(0, 6),
      all_clubs: allClbs,
    },
    event_leaderboards: {
      top_attended: topAttended,
      top_rated: topRated,
      highest_noshow: highestNoShow,
    },
  };
}

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const canAccess =
      auth.isSuperAdmin || auth.tier === 'super_admin' || auth.tier === 'youth_union';
    if (!canAccess) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const allSemesters = await getAcademicSemesters(supabase);
    const activeSemester = getActiveSemester(allSemesters);

    const { searchParams } = new URL(req.url);
    const requestedSemId = searchParams.get('semester_id');
    const forceRefresh = searchParams.get('refresh') === '1';

    const selectedSemester =
      (requestedSemId && allSemesters.find((s) => s.id === requestedSemId)) || activeSemester;

    const cacheKey = `${selectedSemester.id}::${selectedSemester.start_date}::${selectedSemester.end_date}`;
    const cached = dashboardCache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && now - cached.ts < FRESH_TTL_MS) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } }
      );
    }

    if (!forceRefresh && cached && now - cached.ts < STALE_TTL_MS) {
      // Stale-while-revalidate: serve immediately and refresh in background
      if (!dashboardInFlight.has(cacheKey)) {
        const bg = computeDashboardPayload(supabase, selectedSemester, allSemesters)
          .then((fresh) => {
            dashboardCache.set(cacheKey, { ts: Date.now(), data: fresh });
            return fresh;
          })
          .catch(() => cached.data)
          .finally(() => {
            dashboardInFlight.delete(cacheKey);
          });
        dashboardInFlight.set(cacheKey, bg);
      }
      return NextResponse.json(
        { success: true, data: cached.data },
        { headers: { 'X-Cache': 'STALE', 'Cache-Control': 'no-store' } }
      );
    }

    let pending = !forceRefresh ? dashboardInFlight.get(cacheKey) : undefined;
    if (!pending) {
      pending = computeDashboardPayload(supabase, selectedSemester, allSemesters)
        .then((fresh) => {
          dashboardCache.set(cacheKey, { ts: Date.now(), data: fresh });
          if (dashboardCache.size > 12) {
            const firstKey = dashboardCache.keys().next().value;
            if (firstKey) dashboardCache.delete(firstKey);
          }
          return fresh;
        })
        .finally(() => {
          if (dashboardInFlight.get(cacheKey) === pending) {
            dashboardInFlight.delete(cacheKey);
          }
        });
      dashboardInFlight.set(cacheKey, pending);
    }

    const payload = await pending;
    return NextResponse.json(
      { success: true, data: payload },
      { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('GET /api/admin/dashboard error:', err);
    return NextResponse.json(
      { success: false, error: 'Lỗi tổng hợp dữ liệu Dashboard điều hành' },
      { status: 500 }
    );
  }
}
