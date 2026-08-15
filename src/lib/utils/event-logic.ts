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
