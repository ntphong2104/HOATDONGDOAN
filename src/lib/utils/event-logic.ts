/**
 * Utility functions for event lifecycle, scheduling, and auto-closing.
 */

export interface EventScheduleInfo {
  event_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  status?: string | null;
  sessions?: { id?: string; session_date?: string; end_time?: string; start_time?: string }[] | null;
}

/**
 * Safely parses any date string (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, ISO string)
 * and time string (HH:MM or HH:MM:SS) into a timestamp (milliseconds).
 * Returns null if invalid.
 */
export function parseDateStringToTime(dateStr?: string | null, timeStr?: string | null): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
  const cleanTime = (timeStr ? timeStr.slice(0, 5) : '22:00').trim();
  const [hoursStr, minutesStr] = cleanTime.split(':');
  const hours = parseInt(hoursStr || '22', 10);
  const minutes = parseInt(minutesStr || '0', 10);

  let year: number, month: number, day: number;

  if (cleanDate.includes('/')) {
    const parts = cleanDate.split('/');
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        // DD/MM/YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      } else {
        // YYYY/MM/DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      }
    } else {
      return null;
    }
  } else if (cleanDate.includes('-')) {
    const parts = cleanDate.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        day = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY
        day = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
        year = parseInt(parts[2], 10);
      }
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
    return null;
  }

  const dt = new Date(year, month - 1, day, hours, minutes, 0, 0);
  const time = dt.getTime();
  return isNaN(time) ? null : time;
}

/**
 * Returns the effective end date for an event.
 * If event has sessions with dates, uses the LAST session by true chronological timestamp.
 * Otherwise falls back to event_date.
 */
export function getEffectiveEndDate(event: EventScheduleInfo): { date: string; endTime: string } | null {
  const fallbackDate = event.event_date || null;
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
 * Parses the event date and time into a Date object.
 */
export function getEventStartDateTime(event: EventScheduleInfo): Date | null {
  if (!event.event_date) return null;
  const timeMs = parseDateStringToTime(event.event_date, event.start_time || '07:00');
  if (timeMs === null) return null;
  return new Date(timeMs);
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

  const allowedOpenDate = new Date(startDateTime.getTime() - earlyBufferMinutes * 60 * 1000);
  const hours = String(allowedOpenDate.getHours()).padStart(2, '0');
  const minutes = String(allowedOpenDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
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
