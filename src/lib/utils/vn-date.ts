/**
 * Returns YYYY-MM-DD in Vietnam time (Asia/Ho_Chi_Minh, permanently UTC+7),
 * avoiding the 00:00–06:59 morning drift of `new Date().toISOString().slice(0, 10)`.
 */
export function getVietnamDateString(offsetDays = 0, baseMs = Date.now()): string {
  const vnMs = baseMs + 7 * 3_600_000 + offsetDays * 86_400_000;
  return new Date(vnMs).toISOString().slice(0, 10);
}
