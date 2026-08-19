/**
 * Utility functions for event lifecycle, scheduling, and auto-closing.
 */

export interface EventScheduleInfo {
  event_date?: string | null;
  end_time?: string | null;
  start_time?: string | null;
  status?: string | null;
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
 * Checks whether an event has passed its auto-close threshold (1 hour after end_time on event_date).
 * If end_time is not specified, defaults to 22:00.
 */
export function isEventPastDeadline(
  event: EventScheduleInfo,
  currentTimeMs: number = Date.now()
): boolean {
  if (event.status === 'closed') return true;
  if (!event.event_date) return false;

  try {
    const datePart = event.event_date.includes('T')
      ? event.event_date.split('T')[0]
      : event.event_date;
    const endTimePart = event.end_time ? event.end_time.slice(0, 5) : '22:00';
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

    // 1 hour buffer after end time (60 mins * 60 secs * 1000 ms)
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
  event: EventScheduleInfo,
  currentTimeMs: number = Date.now()
): boolean {
  if (!event.event_date) return false;

  try {
    const datePart = event.event_date.includes('T')
      ? event.event_date.split('T')[0]
      : event.event_date;
    const endTimePart = event.end_time ? event.end_time.slice(0, 5) : '22:00';
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

    // 1 hour buffer after end time (60 mins * 60 secs * 1000 ms)
    const autoCloseThreshold = endDateTime.getTime() + 60 * 60 * 1000;

    return currentTimeMs > autoCloseThreshold;
  } catch {
    return false;
  }
}
