import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { getEventMetaBatch } from '@/lib/constants/event-meta-store';
import { OFFICIAL_UNITS } from '@/lib/constants/units';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';
import { isEventScheduleExpired } from '@/lib/utils/event-logic';
import { checkCohortEligibility, getCohortFromMssv } from '@/lib/utils/cohort';
import {
  checkLcdEligibility,
  normalizeAllowedLcds,
  normalizeLcdCode,
  resolveStudentLcd,
  formatLcdsLabel,
  type LcdCode,
} from '@/lib/utils/lcd';
import { getMasterStudentByMssv, isPlaceholderClass, isPlaceholderName } from '@/lib/utils/student-profile';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SharedDiscoverEvent {
  event_id: string;
  event_name: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  semester: string | null;
  status: string;
  is_registration_open: boolean | null;
  is_recruitment_open: boolean;
  allowed_cohorts: string[];
  allowed_lcds: LcdCode[];
  allowed_lcds_label: string;
  max_participants: number;
  max_volunteers: number;
  participant_count: number;
  departments_count: number;
  sessions_count: number;
  room_name: string | null;
  organizer_unit: string;
  organizer_lcd_code: LcdCode | null;
  description: string | null;
  is_expired: boolean;
  registration_window: { isOpen: boolean; reason?: string };
  recruitment_window: { isOpen: boolean; reason?: string };
}

interface DiscoverCacheState {
  data: SharedDiscoverEvent[] | null;
  expiresAt: number;
  inflight: Promise<SharedDiscoverEvent[]> | null;
}

const DISCOVER_CACHE_TTL_MS = 10_000; // 10s shared cache across all concurrent students

function getCacheState(): DiscoverCacheState {
  const g = globalThis as unknown as { __hddDiscoverCache?: DiscoverCacheState };
  if (!g.__hddDiscoverCache) {
    g.__hddDiscoverCache = { data: null, expiresAt: 0, inflight: null };
  }
  return g.__hddDiscoverCache;
}

const UNIT_BY_EMAIL = new Map(
  OFFICIAL_UNITS.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.name])
);

async function loadSharedActiveEvents(supabase: any): Promise<SharedDiscoverEvent[]> {
  const cache = getCacheState();
  const now = Date.now();
  if (cache.data && now < cache.expiresAt) {
    return cache.data;
  }
  if (cache.inflight) {
    return cache.inflight;
  }

  const task = (async (): Promise<SharedDiscoverEvent[]> => {
    try {
      const { data: rawEvents, error } = await supabase
        .from('events')
        .select('event_id, event_name, event_date, start_time, end_time, semester, status, is_active, is_registration_open, created_by, allowed_cohorts')
        .eq('status', 'active')
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(120);

      if (error || !rawEvents || rawEvents.length === 0) {
        cache.data = [];
        cache.expiresAt = Date.now() + DISCOVER_CACHE_TTL_MS;
        return [];
      }

      const eventIds = rawEvents.map((e: any) => e.event_id);

      const [metaMap, { data: proposals }, { data: regRows }] = await Promise.all([
        getEventMetaBatch(supabase, eventIds),
        supabase
          .from('event_proposals')
          .select('created_event_id, organization_unit, room_name, description')
          .in('created_event_id', eventIds),
        supabase
          .from('event_registrations')
          .select('event_id, role_type')
          .in('event_id', eventIds),
      ]);

      const proposalByEventId = new Map<string, any>();
      for (const p of proposals || []) {
        if (p.created_event_id) {
          proposalByEventId.set(p.created_event_id, p);
        }
      }

      const participantCountMap = new Map<string, number>();
      for (const r of regRows || []) {
        if (!r.role_type || r.role_type === 'participant') {
          participantCountMap.set(r.event_id, (participantCountMap.get(r.event_id) || 0) + 1);
        }
      }

      const items: SharedDiscoverEvent[] = [];

      for (const raw of rawEvents) {
        const meta = metaMap[raw.event_id] || {};
        const sessions = Array.isArray(meta.sessions) ? meta.sessions : [];
        const participantSessions = sessions.filter((s: any) => s?.session_type !== 'internal');
        const mainSession = participantSessions.find((s: any) => s?.is_main) || participantSessions[0] || null;

        const displayDate = mainSession?.session_date || raw.event_date || null;
        const displayStart = mainSession?.start_time || raw.start_time || null;
        const displayEnd = mainSession?.end_time || raw.end_time || null;

        const isExpired = isEventScheduleExpired({
          event_date: raw.event_date,
          start_time: raw.start_time,
          end_time: raw.end_time,
          status: raw.status,
          sessions,
        });

        // Không hiển thị các sự kiện đã kết thúc trên Cổng Khám Phá Sự Kiện (/events)
        if (isExpired) {
          continue;
        }

        const maxParticipants = Number(meta.max_participants) || 0;
        const maxVolunteers = Number(meta.max_volunteers) || 0;
        const departments = Array.isArray(meta.departments) ? meta.departments : [];
        const participantCount = participantCountMap.get(raw.event_id) || 0;

        let registrationWindow: { isOpen: boolean; reason?: string } = isRegistrationWindowOpen(
          displayDate || undefined,
          displayStart || undefined,
          raw.status,
          raw.is_registration_open
        );

        if (raw.is_registration_open === false || raw.status !== 'active') {
          registrationWindow = {
            isOpen: false,
            reason: 'Không mở đăng ký khán giả',
          };
        } else if (maxParticipants > 0 && participantCount >= maxParticipants) {
          registrationWindow = {
            isOpen: false,
            reason: `Đã đủ chỉ tiêu (${participantCount}/${maxParticipants})`,
          };
        }

        const hasRecruitment =
          raw.status === 'active' &&
          meta.is_recruitment_open !== false &&
          (departments.length > 0 || maxVolunteers > 0);

        const recruitmentWindow = hasRecruitment
          ? { isOpen: true }
          : {
              isOpen: false,
              reason: meta.is_recruitment_open === false ? 'Đã đóng cổng tuyển CTV' : 'Không tuyển CTV',
            };

        const prop = proposalByEventId.get(raw.event_id);
        const creatorEmail = String(raw.created_by || '').toLowerCase().trim();
        const organizerUnit =
          prop?.organization_unit ||
          UNIT_BY_EMAIL.get(creatorEmail) ||
          'Đoàn TNCS Học Viện';

        const roomFromSession =
          mainSession?.room_name && mainSession.room_name !== 'Không mượn'
            ? mainSession.room_name
            : null;
        const roomFromProp =
          prop?.room_name && prop.room_name !== 'Không mượn' ? prop.room_name : null;

        const allowedLcds = normalizeAllowedLcds(meta.allowed_lcds);
        const organizerLcdCode = normalizeLcdCode(organizerUnit) || normalizeLcdCode(creatorEmail);

        items.push({
          event_id: raw.event_id,
          event_name: raw.event_name,
          event_date: displayDate,
          start_time: displayStart,
          end_time: displayEnd,
          semester: raw.semester || null,
          status: raw.status,
          is_registration_open: raw.is_registration_open,
          is_recruitment_open: meta.is_recruitment_open !== false,
          allowed_cohorts: Array.isArray(raw.allowed_cohorts) ? raw.allowed_cohorts : [],
          allowed_lcds: allowedLcds,
          allowed_lcds_label: formatLcdsLabel(allowedLcds),
          max_participants: maxParticipants,
          max_volunteers: maxVolunteers,
          participant_count: participantCount,
          departments_count: departments.length,
          sessions_count: participantSessions.length || sessions.length || 1,
          room_name: roomFromSession || roomFromProp || null,
          organizer_unit: organizerUnit,
          organizer_lcd_code: organizerLcdCode,
          description: prop?.description ? String(prop.description).slice(0, 260) : null,
          is_expired: isExpired,
          registration_window: registrationWindow,
          recruitment_window: recruitmentWindow,
        });
      }

      // Sort: open registration/recruitment & non-expired first, then soonest date
      items.sort((a, b) => {
        const aOpen = (a.registration_window.isOpen || a.recruitment_window.isOpen) && !a.is_expired ? 0 : 1;
        const bOpen = (b.registration_window.isOpen || b.recruitment_window.isOpen) && !b.is_expired ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        const dateA = a.event_date || '9999-12-31';
        const dateB = b.event_date || '9999-12-31';
        return dateA.localeCompare(dateB);
      });

      cache.data = items;
      cache.expiresAt = Date.now() + DISCOVER_CACHE_TTL_MS;
      return items;
    } finally {
      cache.inflight = null;
    }
  })();

  cache.inflight = task;
  return task;
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  try {
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const mssv = (extractMSSV(auth.email) || auth.email).toUpperCase().trim();
    const lowerEmail = auth.email.toLowerCase().trim();

    const [sharedEvents, { data: userRow }, { data: myRegs }] = await Promise.all([
      loadSharedActiveEvents(supabase),
      supabase
        .from('users')
        .select('mssv, full_name, class_id')
        .or(`email.eq.${lowerEmail},mssv.eq.${mssv}`)
        .maybeSingle(),
      supabase
        .from('event_registrations')
        .select('event_id, role_type, attended')
        .eq('mssv', mssv),
    ]);

    const masterStudent = getMasterStudentByMssv(mssv);
    const fullName =
      userRow?.full_name && !isPlaceholderName(userRow.full_name, mssv)
        ? userRow.full_name
        : masterStudent?.full_name || userRow?.full_name || mssv;
    const classId =
      userRow?.class_id && !isPlaceholderClass(userRow.class_id)
        ? userRow.class_id
        : masterStudent?.class_id || userRow?.class_id || 'PTIT-HCM';

    const myLcd = resolveStudentLcd(classId, mssv);
    const myCohort = getCohortFromMssv(mssv);

    const myRegByEventId = new Map<string, any>();
    for (const r of myRegs || []) {
      myRegByEventId.set(r.event_id, r);
    }

    const personalizedEvents = sharedEvents.map((ev) => {
      const lcdEligibility = checkLcdEligibility(ev.allowed_lcds, classId, mssv);
      const cohortEligibility = checkCohortEligibility(ev.allowed_cohorts, mssv);
      const myReg = myRegByEventId.get(ev.event_id) || null;

      const isMyLcdScoped = Boolean(
        myLcd && lcdEligibility.restricted && lcdEligibility.allowed.includes(myLcd.code)
      );
      const isMyLcdEvent = Boolean(
        isMyLcdScoped || (myLcd && ev.organizer_lcd_code === myLcd.code)
      );

      return {
        ...ev,
        lcd_eligibility: lcdEligibility,
        cohort_eligibility: cohortEligibility,
        is_eligible_for_me: lcdEligibility.eligible && cohortEligibility.eligible,
        is_my_lcd_scoped: isMyLcdScoped,
        is_my_lcd_event: isMyLcdEvent,
        is_registered: Boolean(myReg),
        my_role_type: myReg?.role_type || null,
        my_attended: Boolean(myReg?.attended),
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          my_profile: {
            mssv,
            full_name: fullName,
            class_id: classId,
            cohort: myCohort,
            lcd: myLcd
              ? {
                  code: myLcd.code,
                  name: myLcd.name,
                  shortName: myLcd.shortName,
                  color: myLcd.color,
                  bg: myLcd.bg,
                  border: myLcd.border,
                }
              : null,
          },
          events: personalizedEvents,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    console.error('GET /api/events/discover error:', err);
    return NextResponse.json(
      { success: false, error: 'Không thể tải danh sách sự kiện' },
      { status: 500 }
    );
  }
}
