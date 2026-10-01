/**
 * Utility functions for event lifecycle, scheduling, and auto-closing.
 */

export interface EventScheduleInfo {
  event_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  status?: string | null;
  sessions?: { id: string; session_date?: string; end_time?: string }[] | null;
}

/**
 * Returns the effective end date for an event.
 * If event has sessions with dates, uses the LAST session_date.
 * Otherwise falls back to event_date.
 */
export function getEffectiveEndDate(event: EventScheduleInfo): { date: string; endTime: string } | null {
  const fallbackDate = event.event_date || null;
  const fallbackEndTime = event.end_time || '22:00';

  if (event.sessions && event.sessions.length > 0) {
    // Find last session by date
    const sessionsWithDate = event.sessions
      .filter((s) => s.session_date)
      .sort((a, b) => (a.session_date! > b.session_date! ? 1 : -1));

    if (sessionsWithDate.length > 0) {
      const lastSession = sessionsWithDate[sessionsWithDate.length - 1];
      return {
        date: lastSession.session_date!,
        endTime: lastSession.end_time || event.end_time || '23:59',
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
  try {
    const datePart = event.event_date.includes('T')
      ? event.event_date.split('T')[0]
      : event.event_date;
    const startTimePart = event.start_time ? event.start_time.slice(0, 5) : '07:00';
    const [hoursStr, minutesStr] = startTimePart.split(':');
    const hours = parseInt(hoursStr || '7', 10);
    const minutes = parseInt(minutesStr || '0', 10);

    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        return new Date(year, month - 1, day, hours, minutes, 0, 0);
      }
    }

    const [yearStr, monthStr, dayStr] = datePart.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return null;
    }

    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  } catch {
    return null;
  }
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

  try {
    const datePart = effective.date.includes('T')
      ? effective.date.split('T')[0]
      : effective.date;
    const endTimePart = effective.endTime ? effective.endTime.slice(0, 5) : '22:00';
    const [hoursStr, minutesStr] = endTimePart.split(':');
    const hours = parseInt(hoursStr || '22', 10);
    const minutes = parseInt(minutesStr || '0', 10);

    let endDateTime: Date;
    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      endDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else {
      const [yearStr, monthStr, dayStr] = datePart.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);
      endDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    }

    // 1 hour buffer after end time
    const autoCloseThreshold = endDateTime.getTime() + 60 * 60 * 1000;
    return currentTimeMs > autoCloseThreshold;
  } catch {
    return false;
  }
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

  try {
    const datePart = effective.date.includes('T')
      ? effective.date.split('T')[0]
      : effective.date;
    const endTimePart = effective.endTime ? effective.endTime.slice(0, 5) : '22:00';
    const [hoursStr, minutesStr] = endTimePart.split(':');
    const hours = parseInt(hoursStr || '22', 10);
    const minutes = parseInt(minutesStr || '0', 10);

    const [yearStr, monthStr, dayStr] = datePart.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);

    if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hours) || isNaN(minutes)) {
      return false;
    }

    const endDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    const autoCloseThreshold = endDateTime.getTime() + 60 * 60 * 1000;
    return currentTimeMs > autoCloseThreshold;
  } catch {
    return false;
  }
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

  const effective = getEffectiveEndDate(event);
  if (!effective) return false;

  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  try {
    const datePart = effective.date.includes('T')
      ? effective.date.split('T')[0]
      : effective.date;
    const endTimePart = effective.endTime ? effective.endTime.slice(0, 5) : '22:00';
    const [hoursStr, minutesStr] = endTimePart.split(':');
    const hours = parseInt(hoursStr || '22', 10);
    const minutes = parseInt(minutesStr || '0', 10);

    let endDateTime: Date;
    if (datePart.includes('/')) {
      const parts = datePart.split('/');
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      endDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    } else {
      const [yearStr, monthStr, dayStr] = datePart.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const day = parseInt(dayStr, 10);
      endDateTime = new Date(year, month - 1, day, hours, minutes, 0, 0);
    }

    if (isNaN(endDateTime.getTime())) return false;
    return currentTimeMs - endDateTime.getTime() > THREE_DAYS_MS;
  } catch {
    return false;
  }
}

