/**
 * Vietnam timezone (Asia/Ho_Chi_Minh, UTC+7, no DST) utilities.
 *
 * Node processes on UTC or misconfigured OS timezones drift on both
 * ISO date slicing (00:00–06:59 VN = previous UTC day) and `new Date(y, m, d, h, m)`
 * wall-clock construction. All event schedule comparisons must go through these helpers.
 */

const VN_OFFSET_MS = 7 * 3_600_000;

/**
 * Returns YYYY-MM-DD in Vietnam time (Asia/Ho_Chi_Minh, permanently UTC+7).
 */
export function getVietnamDateString(offsetDays = 0, baseMs = Date.now()): string {
  const vnMs = baseMs + VN_OFFSET_MS + offsetDays * 86_400_000;
  return new Date(vnMs).toISOString().slice(0, 10);
}

/**
 * Returns HH:MM in Vietnam time (24-hour clock) for a given epoch ms or Date.
 */
export function formatVnHHMM(dateOrMs: Date | number): string {
  const ms = typeof dateOrMs === 'number' ? dateOrMs : dateOrMs.getTime();
  if (!Number.isFinite(ms)) return '00:00';
  const vnDate = new Date(ms + VN_OFFSET_MS);
  const hh = String(vnDate.getUTCHours()).padStart(2, '0');
  const mm = String(vnDate.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Returns current HH:MM in Vietnam time (24-hour clock).
 */
export function getVietnamHHMM(baseMs = Date.now()): string {
  return formatVnHHMM(baseMs);
}

/**
 * Parses any supported date string (`YYYY-MM-DD`, `YYYY/MM/DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, or ISO prefix)
 * and wall-clock time (`HH:MM` or `HH:MM:SS`) interpreted strictly in `Asia/Ho_Chi_Minh` (`UTC+7`)
 * into UTC epoch milliseconds. Returns `null` if invalid.
 */
export function vnWallClockToUtcMs(
  dateStr?: string | null,
  timeStr: string | null = '22:00'
): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0].trim() : dateStr.trim();
  const cleanTime = (timeStr ? timeStr.slice(0, 5) : '22:00').trim();
  const [hoursStr, minutesStr] = cleanTime.split(':');
  const hours = parseInt(hoursStr || '22', 10);
  const minutes = parseInt(minutesStr || '0', 10);

  let year: number;
  let month: number;
  let day: number;

  if (cleanDate.includes('/')) {
    const parts = cleanDate.split('/');
    if (parts.length !== 3) return null;
    if (parts[2].length === 4) {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    } else {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    }
  } else if (cleanDate.includes('-')) {
    const parts = cleanDate.split('-');
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) {
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }
  } else {
    return null;
  }

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return null;
  }

  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0) - VN_OFFSET_MS;
  return Number.isFinite(utcMs) ? utcMs : null;
}

/**
 * Convenience wrapper returning a `Date` for a Vietnam wall-clock date + time.
 */
export function vnWallClockToDate(
  dateStr?: string | null,
  timeStr: string | null = '22:00'
): Date | null {
  const ms = vnWallClockToUtcMs(dateStr, timeStr);
  return ms === null ? null : new Date(ms);
}
