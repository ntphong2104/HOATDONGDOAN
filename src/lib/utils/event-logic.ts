/**
 * Utility functions for event lifecycle, scheduling, and auto-closing.
 */
import { formatVnHHMM, vnWallClockToUtcMs } from '@/lib/utils/vn-date';

export interface EventSessionSchedule {
  id?: string;
  name?: string;
  session_date?: string;
  end_time?: string;
  start_time?: string;
  room_name?: string | null;
  session_type?: string;
  is_main?: boolean;
}

export interface EventScheduleInfo {
  event_date?: string | null;
  end_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  status?: string | null;
  sessions?: EventSessionSchedule[] | null;
}

function isMeaningfulLocation(val?: string | null): string | null {
  const trimmed = typeof val === 'string' ? val.trim() : '';
  if (!trimmed || trimmed.toLowerCase() === 'không mượn') return null;
  return trimmed;
}

/**
 * Resolves the best human-readable location for an event:
 * 1) Explicit `event.location`
 * 2) Proposal/event `event.room_name`
 * 3) Unique `sessions[].room_name` entries (up to 2 listed + "+N")
 */
export function resolveEventDisplayLocation(
  event?: {
    location?: string | null;
    room_name?: string | null;
    sessions?: EventSessionSchedule[] | null;
  } | null
): string | null {
  if (!event) return null;
  const explicit = isMeaningfulLocation(event.location);
  if (explicit) return explicit;
  const fallbackRoom = isMeaningfulLocation(event.room_name);
  if (fallbackRoom) return fallbackRoom;

  if (Array.isArray(event.sessions) && event.sessions.length > 0) {
    const seen = new Set<string>();
    const uniqueRooms: string[] = [];
    for (const s of event.sessions) {
      const r = isMeaningfulLocation(s?.room_name);
      if (r && !seen.has(r.toLowerCase())) {
        seen.add(r.toLowerCase());
        uniqueRooms.push(r);
      }
    }
    if (uniqueRooms.length > 0) {
      if (uniqueRooms.length <= 2) return uniqueRooms.join(', ');
      return `${uniqueRooms.slice(0, 2).join(', ')} (+${uniqueRooms.length - 2})`;
    }
  }

  return null;
}

/**
 * Safely parses any date string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO string)
 * and time string (HH:MM or HH:MM:SS) into a timestamp (milliseconds).
 * Returns null if invalid.
 */
export function parseDateStringToTime(dateStr?: string | null, timeStr?: string | null): number | null {
  return vnWallClockToUtcMs(dateStr, timeStr || '22:00');
}

/**
 * Returns the effective end date for an event.
 * If event has sessions with dates, uses the LAST session by true chronological timestamp
 * unless `event.end_date` is on a strictly later calendar day.
 * Otherwise falls back to `event.end_date || event.event_date`.
 */
export function getEffectiveEndDate(event: EventScheduleInfo): { date: string; endTime: string } | null {
  const explicitEndDate =
    event.end_date && String(event.end_date).trim() ? String(event.end_date).trim() : null;
  const fallbackDate = explicitEndDate || event.event_date || null;
  const fallbackEndTime = event.end_time || '22:00';

  if (event.sessions && event.sessions.length > 0) {
    // Find session with the latest end time by actual timestamp (not string comparison)
    let latestSession: { id?: string; session_date?: string; end_time?: string } | null = null;
    let latestTime = -Infinity;

    for (const s of event.sessions) {
      if (!s.session_date) continue;
      const sTime = parseDateStringToTime(s.session_date, s.end_time || event.end_time || '23:59');
      if (sTime !== null && sTime > latestTime) {
        latestTime = sTime;
        latestSession = s;
      }
    }

    if (latestSession && latestSession.session_date) {
      if (explicitEndDate) {
        const explicitDayMs = parseDateStringToTime(explicitEndDate, '00:00');
        const sessionDayMs = parseDateStringToTime(latestSession.session_date, '00:00');
        if (explicitDayMs !== null && sessionDayMs !== null && explicitDayMs > sessionDayMs) {
          return {
            date: explicitEndDate,
            endTime: fallbackEndTime,
          };
        }
      }
      return {
        date: latestSession.session_date,
        endTime: latestSession.end_time || event.end_time || '23:59',
      };
    }
  }

  if (!fallbackDate) return null;
  return { date: fallbackDate, endTime: fallbackEndTime };
}

/**
 * Returns the chronological next upcoming (or currently active) session from a list of sessions,
 * plus the remaining session count and overall earliest/latest session dates.
 * Prefers sessions whose end_time has not passed yet; falls back to the 1-hour grace window.
 */
export function getNextUpcomingSession<T extends EventSessionSchedule>(
  sessions?: T[] | null,
  fallbackEndTime: string = '22:00',
  currentTimeMs: number = Date.now()
): {
  nextSession: T | null;
  remainingCount: number;
  earliestDate: string | null;
  latestDate: string | null;
} {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { nextSession: null, remainingCount: 0, earliestDate: null, latestDate: null };
  }

  const parsed = sessions
    .map((s) => {
      if (!s?.session_date) return null;
      const startMs = parseDateStringToTime(s.session_date, s.start_time || '00:00');
      const endMs = parseDateStringToTime(s.session_date, s.end_time || fallbackEndTime || '23:59');
      if (startMs === null || endMs === null) return null;
      return { session: s, startMs, endMs };
    })
    .filter((x): x is { session: T; startMs: number; endMs: number } => x !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (parsed.length === 0) {
    return { nextSession: null, remainingCount: 0, earliestDate: null, latestDate: null };
  }

  const earliestDate = parsed[0].session.session_date || null;
  const latestDate = parsed[parsed.length - 1].session.session_date || null;

  const GRACE_MS = 60 * 60 * 1000;
  const upcomingStrict = parsed.filter((p) => p.endMs >= currentTimeMs);
  const upcomingWithGrace = parsed.filter((p) => p.endMs + GRACE_MS >= currentTimeMs);

  const nextEntry = upcomingStrict[0] || upcomingWithGrace[0] || null;

  return {
    nextSession: nextEntry ? nextEntry.session : null,
    remainingCount: upcomingWithGrace.length,
    earliestDate,
    latestDate,
  };
}

/**
 * Parses the event date and time into a Date object.
 */
export function getEventStartDateTime(event: EventScheduleInfo): Date | null {
  if (!event.event_date) return null;
  const timeMs = parseDateStringToTime(event.event_date, event.start_time || '07:00');
  if (timeMs === null) return null;
  return new Date(timeMs);
}

export type CancellationPolicy = 'before_2h' | 'disabled';

export function normalizeCancellationPolicy(policy?: unknown): CancellationPolicy {
  return policy === 'disabled' ? 'disabled' : 'before_2h';
}

/**
 * Evaluates whether a student can self-cancel their registration for an event.
 * - 'disabled': Never allowed (must contact BTC/Admin).
 * - 'before_2h': Allowed only if at least 2 hours (120 minutes) remain before the earliest start time.
 */
export function checkCancellationEligibility(
  event: EventScheduleInfo,
  policy?: unknown,
  currentTimeMs: number = Date.now()
): { canCancel: boolean; policy: CancellationPolicy; reason: string; deadlineMs: number | null } {
  const normalized = normalizeCancellationPolicy(policy);
  if (normalized === 'disabled') {
    return {
      canCancel: false,
      policy: 'disabled',
      reason: 'Ban tổ chức không cho phép tự hủy tham gia đối với sự kiện này. Vui lòng liên hệ BTC nếu có việc đột xuất.',
      deadlineMs: null,
    };
  }

  let earliestStartMs: number | null = null;
  if (Array.isArray(event.sessions) && event.sessions.length > 0) {
    for (const s of event.sessions) {
      if (!s?.session_date) continue;
      const ms = parseDateStringToTime(s.session_date, s.start_time || event.start_time || '07:00');
      if (ms !== null && (earliestStartMs === null || ms < earliestStartMs)) {
        earliestStartMs = ms;
      }
    }
  }
  if (earliestStartMs === null) {
    const startDt = getEventStartDateTime(event);
    earliestStartMs = startDt ? startDt.getTime() : null;
  }

  if (earliestStartMs === null) {
    return {
      canCancel: true,
      policy: 'before_2h',
      reason: 'Bạn có thể hủy tham gia trước giờ diễn ra sự kiện ít nhất 2 tiếng.',
      deadlineMs: null,
    };
  }

  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const deadlineMs = earliestStartMs - TWO_HOURS_MS;

  if (currentTimeMs >= deadlineMs) {
    return {
      canCancel: false,
      policy: 'before_2h',
      reason: 'Đã quá hạn tự hủy tham gia (chỉ được hủy trước giờ diễn ra sự kiện ít nhất 2 tiếng).',
      deadlineMs,
    };
  }

  return {
    canCancel: true,
    policy: 'before_2h',
    reason: 'Bạn có thể hủy tham gia trước giờ diễn ra sự kiện ít nhất 2 tiếng.',
    deadlineMs,
  };
}

/**
 * Checks whether an event is too early for check-in.
 * By default, check-in is allowed 15 minutes before start_time.
 */
export function isEventTooEarlyForCheckin(
  event: EventScheduleInfo,
  currentTimeMs: number = Date.now(),
  earlyBufferMinutes: number = 15
): boolean {
  if (event.status === 'closed') return false;
  const startDateTime = getEventStartDateTime(event);
  if (!startDateTime) return false;

  const allowedOpenTime = startDateTime.getTime() - earlyBufferMinutes * 60 * 1000;
  return currentTimeMs < allowedOpenTime;
}

/**
 * Returns the formatted earliest check-in time string (e.g., "20:45").
 */
export function getEarliestCheckinTime(
  event: EventScheduleInfo,
  earlyBufferMinutes: number = 15
): string | null {
  const startDateTime = getEventStartDateTime(event);
  if (!startDateTime) return null;

  const allowedOpenMs = startDateTime.getTime() - earlyBufferMinutes * 60 * 1000;
  return formatVnHHMM(allowedOpenMs);
}

/**
 * Checks whether an event has passed its auto-close threshold (1 hour after end_time).
 * For multi-session events, uses the LAST session_date instead of event_date.
 */
export function isEventPastDeadline(
  event?: EventScheduleInfo | null,
  currentTimeMs: number = Date.now()
): boolean {
  if (!event) return false;
  if (event.status === 'closed') return true;

  const effective = getEffectiveEndDate(event);
  if (!effective) return false;

  const endDateTimeMs = parseDateStringToTime(effective.date, effective.endTime);
  if (endDateTimeMs === null) return false;

  // 1 hour buffer after end time
  const autoCloseThreshold = endDateTimeMs + 60 * 60 * 1000;
  return currentTimeMs > autoCloseThreshold;
}

/**
 * Returns the detailed lifecycle state of the event:
 * - 'closed': if closed manually or passed deadline (+1 hr)
 * - 'upcoming': if current time is before start_time - 15 minutes
 * - 'active': within the valid check-in window
 */
export function getEventLifecycleState(
  event: EventScheduleInfo,
  currentTimeMs: number = Date.now(),
  earlyBufferMinutes: number = 15
): 'upcoming' | 'active' | 'closed' {
  if (event.status === 'closed' || isEventPastDeadline(event, currentTimeMs)) {
    return 'closed';
  }
  if (isEventTooEarlyForCheckin(event, currentTimeMs, earlyBufferMinutes)) {
    return 'upcoming';
  }
  return 'active';
}

/**
 * Returns the effective status of the event ('active' | 'closed')
 * taking into account the 1-hour auto-close threshold.
 */
export function getEffectiveEventStatus(
  event: EventScheduleInfo,
  currentTimeMs: number = Date.now()
): 'active' | 'closed' {
  if (event.status === 'closed') return 'closed';
  if (isEventPastDeadline(event, currentTimeMs)) return 'closed';
  return 'active';
}

/**
 * Checks whether an event's schedule has passed its auto-close threshold (1 hour after end_time on event_date)
 * based purely on schedule date/time, ignoring the current status field.
 */
export function isEventScheduleExpired(
  event?: EventScheduleInfo | null,
  currentTimeMs: number = Date.now()
): boolean {
  if (!event) return false;

  const effective = getEffectiveEndDate(event);
  if (!effective) return false;

  const endDateTimeMs = parseDateStringToTime(effective.date, effective.endTime);
  if (endDateTimeMs === null) return false;

  const autoCloseThreshold = endDateTimeMs + 60 * 60 * 1000;
  return currentTimeMs > autoCloseThreshold;
}

/**
 * Checks whether an event has been closed or ended for more than 3 days (72 hours).
 * For multi-session events, uses the LAST session_date.
 * After 3 days, no event admin or regular officer can modify, delete, supplement or edit anything in this event.
 * Only Super Admin retains full edit permissions.
 */
export function isEventLockedPast3Days(
  event?: EventScheduleInfo | null,
  currentTimeMs: number = Date.now()
): boolean {
  if (!event) return false;

  // Nếu sự kiện đang ở trạng thái 'active', sự kiện đang diễn ra hoặc đang được ban tổ chức duy trì mở
  // Tuyệt đối không khóa chốt sổ khi trạng thái vẫn đang là active!
  if (event.status === 'active') {
    return false;
  }

  const effective = getEffectiveEndDate(event);
  if (!effective) return false;

  const endDateTimeMs = parseDateStringToTime(effective.date, effective.endTime);
  if (endDateTimeMs === null) return false;

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  return currentTimeMs - endDateTimeMs > THREE_DAYS_MS;
}

/**
 * Safely unwraps a `system_settings.value` payload whether stored natively as
 * a JSONB object/array/boolean or double-encoded as a JSON string scalar.
 */
export function parseJsonSetting<T = any>(raw: unknown): T | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return raw as T;
  let current: unknown = raw;
  for (let depth = 0; depth < 3 && typeof current === 'string'; depth++) {
    const trimmed = current.trim();
    if (!trimmed) return null;
    try {
      current = JSON.parse(trimmed);
    } catch {
      return depth === 0 ? null : (current as T);
    }
  }
  return current as T;
}

/**
 * Determines whether a student registration qualifies as an approved volunteer (CTV).
 * Strictly requires volunteer role (volunteer / ctv / dept_*) or assigned department
 * AND `review_status === 'accepted'`.
 * Regular `participant` registrations NEVER qualify as volunteers even when their
 * registration metadata carries `review_status: 'accepted'`.
 */
export function isApprovedVolunteer(
  registeredRole?: string | null,
  extra?: {
    review_status?: string | null;
    department_id?: string | null;
    department_name?: string | null;
  } | null
): boolean {
  const role = String(registeredRole || '').toLowerCase().trim();
  if (role === 'participant') return false;

  const status = String(extra?.review_status || '').toLowerCase().trim();
  if (status !== 'accepted') return false;

  if (role === 'volunteer' || role === 'ctv' || role.startsWith('dept_')) {
    return true;
  }

  return Boolean(extra?.department_id || extra?.department_name);
}
