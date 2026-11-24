export type TimetablePeriod = 'morning' | 'afternoon' | 'evening';

export type ScheduleItemType = 'event' | 'duty' | 'borrow_pickup' | 'borrow_return';

export type ScheduleItemStatus =
  | 'upcoming'
  | 'today'
  | 'completed'
  | 'pending_review'
  | 'overdue';

export interface WeeklyScheduleItem {
  id: string;
  type: ScheduleItemType;
  date: string; // YYYY-MM-DD (Asia/Ho_Chi_Minh)
  period: TimetablePeriod;
  timeLabel: string;
  title: string;
  subtitle?: string;
  badgeLabel: string;
  status: ScheduleItemStatus;
  href: string;
  sortMinutes: number;
  meta?: {
    eventId?: string;
    roomName?: string;
    roleType?: string;
    isAttended?: boolean;
  };
}

export interface DutyShiftInput {
  id: string;
  duty_date: string;
  shift: 'morning' | 'afternoon';
  status?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
}

export interface BorrowRequestInput {
  id: string;
  purpose: string;
  borrow_date: string;
  due_date: string;
  status: string;
  items?: Array<{ item_name: string; quantity: number }>;
}

export interface DutyShiftHours {
  morning: { start: string; end: string };
  afternoon: { start: string; end: string };
}

export interface WeekDayColumn {
  date: string;
  dayShort: string;
  dayFull: string;
  dayLabel: string;
  isWeekend: boolean;
}

export const DEFAULT_TIMETABLE_SHIFT_HOURS: DutyShiftHours = {
  morning: { start: '07:30', end: '11:30' },
  afternoon: { start: '13:00', end: '17:00' },
};

const DAY_SHORTS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'] as const;
const DAY_FULLS = [
  'Thứ 2',
  'Thứ 3',
  'Thứ 4',
  'Thứ 5',
  'Thứ 6',
  'Thứ 7',
  'Chủ nhật',
] as const;

/**
 * Normalizes a date or timestamp string into a valid YYYY-MM-DD (Asia/Ho_Chi_Minh).
 */
export function normalizeDateYMD(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Date-only prefix (or midnight local format)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    if (
      probe.getUTCFullYear() === y &&
      probe.getUTCMonth() === m - 1 &&
      probe.getUTCDate() === d
    ) {
      return trimmed;
    }
    return null;
  }

  // Full ISO timestamp: convert to VN (+07:00) calendar date
  if (trimmed.includes('T') || trimmed.includes(' ')) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return getTodayDateVN(parsed);
    }
  }

  const prefixMatch = /^(\d{4}-\d{2}-\d{2})/.exec(trimmed);
  if (prefixMatch) {
    return normalizeDateYMD(prefixMatch[1]);
  }
  return null;
}

/**
 * Returns current date in Asia/Ho_Chi_Minh (+07:00) as YYYY-MM-DD.
 */
export function getTodayDateVN(now: Date = new Date()): string {
  const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
  const d = new Date(vnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * Shifts a YYYY-MM-DD date string by deltaDays using +07:00 noon anchor to prevent DST/offset drift.
 */
export function shiftDateVN(dateStr: string, deltaDays: number): string {
  const normalized = normalizeDateYMD(dateStr) || getTodayDateVN();
  const d = new Date(`${normalized}T12:00:00+07:00`);
  const shifted = new Date(d.getTime() + deltaDays * 86_400_000);
  return getTodayDateVN(shifted);
}

/**
 * Returns 7 day columns (Mon -> Sun) for the week containing `anchorDate`.
 */
export function getWeekDaysVN(anchorDate?: string): WeekDayColumn[] {
  const normalized = normalizeDateYMD(anchorDate) || getTodayDateVN();
  const d = new Date(`${normalized}T12:00:00+07:00`);
  const day = d.getUTCDay(); // At 12:00+07:00 (=05:00Z), UTC day === VN day (0=Sun..6=Sat)
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mondayStr = shiftDateVN(normalized, diffToMon);

  const days: WeekDayColumn[] = [];
  for (let i = 0; i < 7; i++) {
    const date = shiftDateVN(mondayStr, i);
    const [, m, dd] = date.split('-');
    days.push({
      date,
      dayShort: DAY_SHORTS[i],
      dayFull: DAY_FULLS[i],
      dayLabel: `${dd}/${m}`,
      isWeekend: i >= 5,
    });
  }
  return days;
}

/**
 * Formats YYYY-MM-DD as DD/MM for compact Vietnamese display.
 */
export function formatDateShortVN(dateStr: string): string {
  const norm = normalizeDateYMD(dateStr);
  if (!norm) return dateStr;
  const [, m, d] = norm.split('-');
  return `${d}/${m}`;
}

function parseHHMM(raw?: string | null): { label: string; minutes: number } | null {
  if (!raw || typeof raw !== 'string') return null;
  const m = /(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return {
    label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
    minutes: hh * 60 + mm,
  };
}

/**
 * Classifies a HH:MM start time into morning (<12:00), afternoon (12:00-17:29), or evening (>=17:30).
 */
export function classifyPeriod(startTime?: string | null): {
  period: TimetablePeriod;
  sortMinutes: number;
} {
  const parsed = parseHHMM(startTime);
  if (!parsed) {
    return { period: 'morning', sortMinutes: 480 };
  }
  const { minutes } = parsed;
  if (minutes < 720) {
    return { period: 'morning', sortMinutes: minutes };
  }
  if (minutes < 1050) {
    return { period: 'afternoon', sortMinutes: minutes };
  }
  return { period: 'evening', sortMinutes: minutes };
}

function formatTimeRangeLabel(startTime?: string | null, endTime?: string | null): string {
  const s = parseHHMM(startTime)?.label;
  const e = parseHHMM(endTime)?.label;
  if (s && e) return `${s} – ${e}`;
  if (s) return s;
  return 'Trong ngày';
}

function summarizeBorrowItems(
  items?: Array<{ item_name: string; quantity: number }>,
  purpose?: string
): string {
  const cleanItems = Array.isArray(items)
    ? items.filter((it) => it && String(it.item_name || '').trim())
    : [];
  if (cleanItems.length > 0) {
    const head = cleanItems
      .slice(0, 2)
      .map((it) => `${String(it.item_name).trim()} (×${Math.max(1, Number(it.quantity) || 1)})`)
      .join(', ');
    if (cleanItems.length > 2) {
      return `${head} +${cleanItems.length - 2} món`;
    }
    return head;
  }
  const cleanedPurpose = String(purpose || '')
    .replace(/^\[Cơ sở:\s*[^\]]+\]\s*/i, '')
    .trim();
  return cleanedPurpose || 'Dụng cụ Văn phòng Đoàn';
}

export interface BuildStudentScheduleParams {
  registrations?: any[];
  checkedInEventIds?: Set<string>;
  dutyShifts?: DutyShiftInput[];
  borrowRequests?: BorrowRequestInput[];
  shiftHours?: DutyShiftHours;
  todayVN: string;
}

/**
 * Merges registered events (including multi-session), office duty shifts, and active
 * equipment borrow pickup/return milestones into chronological WeeklyScheduleItems.
 */
export function buildStudentScheduleItems({
  registrations = [],
  checkedInEventIds,
  dutyShifts = [],
  borrowRequests = [],
  shiftHours = DEFAULT_TIMETABLE_SHIFT_HOURS,
  todayVN,
}: BuildStudentScheduleParams): WeeklyScheduleItem[] {
  const items: WeeklyScheduleItem[] = [];
  const normToday = normalizeDateYMD(todayVN) || getTodayDateVN();
  const checkedSet = checkedInEventIds || new Set<string>();

  // 1. Registered Events (single or multi-session)
  for (let idx = 0; idx < registrations.length; idx++) {
    const ev = registrations[idx];
    if (!ev) continue;
    if (ev.status === 'rejected' || ev.review_status === 'rejected') continue;

    const roleType = ev.role_type || 'participant';
    const badgeLabel =
      roleType === 'organizer' ? 'BTC' : roleType === 'volunteer' ? 'CTV' : 'Sự kiện';
    const eventTitle = String(ev.event_name || 'Sự kiện Học Viện').trim();
    const baseKey = String(ev.event_id || ev.id || idx);
    const sessions = Array.isArray(ev.sessions) ? ev.sessions : [];

    if (sessions.length > 0) {
      for (let sIdx = 0; sIdx < sessions.length; sIdx++) {
        const sess = sessions[sIdx];
        if (!sess) continue;
        const date = normalizeDateYMD(sess.session_date) || normalizeDateYMD(ev.event_date);
        if (!date) continue;

        const sessName = String(sess.name || '').trim();
        const roomName = String(sess.room_name || '').trim();
        const { period, sortMinutes } = classifyPeriod(sess.start_time || ev.start_time);
        const timeLabel = formatTimeRangeLabel(
          sess.start_time || ev.start_time,
          sess.end_time || ev.end_time
        );

        const sessionNamesList = Array.isArray(ev.session_names) ? ev.session_names : [];
        const isAttended = Boolean(
          ev.attended ||
            (ev.event_id && checkedSet.has(ev.event_id)) ||
            (sessName && sessionNamesList.includes(sessName))
        );

        const status: ScheduleItemStatus = isAttended
          ? 'completed'
          : roleType === 'volunteer' && ev.review_status === 'pending'
          ? 'pending_review'
          : date === normToday
          ? 'today'
          : 'upcoming';

        const subtitleParts = [sessName, roomName, ev.department_name ? `Ban ${ev.department_name}` : '']
          .filter(Boolean);

        items.push({
          id: `event-${baseKey}-${sess.id || sIdx}`,
          type: 'event',
          date,
          period,
          timeLabel,
          title: eventTitle,
          subtitle: subtitleParts.join(' · ') || undefined,
          badgeLabel,
          status,
          href: '/?view=student&tab=registered',
          sortMinutes,
          meta: {
            eventId: ev.event_id,
            roomName: roomName || undefined,
            roleType,
            isAttended,
          },
        });
      }
    } else {
      const date = normalizeDateYMD(ev.event_date);
      if (!date) continue;

      const { period, sortMinutes } = classifyPeriod(ev.start_time);
      const timeLabel = formatTimeRangeLabel(ev.start_time, ev.end_time);
      const isAttended = Boolean(ev.attended || (ev.event_id && checkedSet.has(ev.event_id)));

      const status: ScheduleItemStatus = isAttended
        ? 'completed'
        : roleType === 'volunteer' && ev.review_status === 'pending'
        ? 'pending_review'
        : date === normToday
        ? 'today'
        : 'upcoming';

      items.push({
        id: `event-${baseKey}-${idx}`,
        type: 'event',
        date,
        period,
        timeLabel,
        title: eventTitle,
        subtitle: ev.department_name ? `Ban ${ev.department_name}` : undefined,
        badgeLabel,
        status,
        href: '/?view=student&tab=registered',
        sortMinutes,
        meta: {
          eventId: ev.event_id,
          roleType,
          isAttended,
        },
      });
    }
  }

  // 2. Office Duty Shifts (VPĐ)
  const safeHours: DutyShiftHours = {
    morning: shiftHours?.morning || DEFAULT_TIMETABLE_SHIFT_HOURS.morning,
    afternoon: shiftHours?.afternoon || DEFAULT_TIMETABLE_SHIFT_HOURS.afternoon,
  };
  for (let i = 0; i < dutyShifts.length; i++) {
    const duty = dutyShifts[i];
    if (!duty) continue;
    const date = normalizeDateYMD(duty.duty_date);
    if (!date) continue;

    const shift = duty.shift === 'afternoon' ? 'afternoon' : 'morning';
    const range = safeHours[shift];
    const { sortMinutes } = classifyPeriod(range.start);
    const isCompleted = Boolean(duty.check_out_at || duty.status === 'completed');
    const isCheckedIn = Boolean(duty.check_in_at || duty.status === 'checked_in');

    const status: ScheduleItemStatus = isCompleted
      ? 'completed'
      : isCheckedIn || date === normToday
      ? 'today'
      : 'upcoming';

    const subtitle = isCompleted
      ? 'Đã hoàn thành & check-out ca trực'
      : isCheckedIn
      ? 'Đang trong ca trực (đã check-in)'
      : 'Văn phòng Đoàn — chấm công qua WiFi VPĐ';

    items.push({
      id: `duty-${duty.id || i}`,
      type: 'duty',
      date,
      period: shift,
      timeLabel: `${range.start} – ${range.end}`,
      title:
        shift === 'morning'
          ? 'Trực Văn phòng Đoàn (Ca Sáng)'
          : 'Trực Văn phòng Đoàn (Ca Chiều)',
      subtitle,
      badgeLabel: 'Trực VPĐ',
      status,
      href: '/office/duty',
      sortMinutes,
      meta: {
        isAttended: isCompleted,
      },
    });
  }

  // 3. Office Equipment Borrow Requests (pickup & due dates)
  for (let i = 0; i < borrowRequests.length; i++) {
    const req = borrowRequests[i];
    if (!req) continue;
    const reqStatus = String(req.status || '').toLowerCase();
    if (reqStatus !== 'pending' && reqStatus !== 'approved' && reqStatus !== 'borrowed') {
      continue;
    }

    const itemsSummary = summarizeBorrowItems(req.items, req.purpose);
    const cleanPurpose = String(req.purpose || '')
      .replace(/^\[Cơ sở:\s*[^\]]+\]\s*/i, '')
      .trim();

    if (reqStatus === 'pending' || reqStatus === 'approved') {
      const borrowDate = normalizeDateYMD(req.borrow_date);
      if (borrowDate) {
        items.push({
          id: `borrow-pickup-${req.id || i}`,
          type: 'borrow_pickup',
          date: borrowDate,
          period: 'morning',
          timeLabel: 'Nhận dụng cụ',
          title: `Mượn: ${itemsSummary}`,
          subtitle:
            reqStatus === 'pending'
              ? `Đang chờ VPĐ duyệt${cleanPurpose ? ` · ${cleanPurpose}` : ''}`
              : `Đã duyệt — đến VPĐ nhận đồ${cleanPurpose ? ` · ${cleanPurpose}` : ''}`,
          badgeLabel: 'Mượn đồ',
          status:
            reqStatus === 'pending'
              ? 'pending_review'
              : borrowDate === normToday
              ? 'today'
              : 'upcoming',
          href: '/office/borrow',
          sortMinutes: 490,
        });
      }
    }

    if (reqStatus === 'approved' || reqStatus === 'borrowed') {
      const dueDate = normalizeDateYMD(req.due_date);
      if (dueDate) {
        const isOverdue = reqStatus === 'borrowed' && dueDate < normToday;
        items.push({
          id: `borrow-return-${req.id || i}`,
          type: 'borrow_return',
          date: dueDate,
          period: 'afternoon',
          timeLabel: 'Hạn trả đồ',
          title: `Trả: ${itemsSummary}`,
          subtitle: isOverdue
            ? 'Đã quá hạn trả dụng cụ — vui lòng mang trả Văn phòng Đoàn'
            : cleanPurpose || 'Bàn giao đầy đủ dụng cụ tại Văn phòng Đoàn',
          badgeLabel: isOverdue ? 'Quá hạn trả' : 'Trả đồ VPĐ',
          status: isOverdue ? 'overdue' : dueDate === normToday ? 'today' : 'upcoming',
          href: '/office/borrow',
          sortMinutes: 900,
        });
      }
    }
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes;
    return a.id.localeCompare(b.id);
  });

  return items;
}

/**
 * Finds the earliest non-completed scheduled item strictly after `afterDate` (YYYY-MM-DD).
 */
export function findNextUpcomingItem(
  items: WeeklyScheduleItem[],
  afterDate: string
): WeeklyScheduleItem | null {
  const normAfter = normalizeDateYMD(afterDate);
  if (!normAfter) return null;
  for (const item of items) {
    if (item.date > normAfter && item.status !== 'completed') {
      return item;
    }
  }
  return null;
}
