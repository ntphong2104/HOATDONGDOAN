/**
 * Room booking slots & per-session conflict detection.
 *
 * A proposal books a room through its sessions (ca), NOT through its overall
 * start → end range. Treating the whole range as one continuous booking made a
 * weekly "sinh hoạt" from 08/09 → 31/12 block the room 24/7 for months.
 *
 * Pure functions only (no server imports) so the proposal form, the detail page
 * and the API routes all share exactly the same interpretation.
 */

export const NO_ROOM = 'Không mượn';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_SLOTS = 400;

export type BookingSlotKind = 'session' | 'daily' | 'range';

export interface BookingSlot {
  /** Session id (or 'main') this slot belongs to */
  key: string;
  /** Human label of the session */
  label: string;
  room_id: string | null;
  room_name: string;
  /** YYYY-MM-DD the slot starts */
  date: string;
  /** YYYY-MM-DD the slot ends (differs from `date` only for continuous ranges / overnight) */
  end_date: string;
  start_time: string;
  end_time: string;
  startMs: number;
  endMs: number;
  kind: BookingSlotKind;
}

export interface BookingSessionInput {
  id?: string;
  name?: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  room_id?: string | null;
  room_name?: string | null;
  status?: string;
}

export interface BookingProposalInput {
  id?: string;
  title?: string;
  organization_unit?: string | null;
  status?: string;
  created_by?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  room_id?: string | null;
  room_name?: string | null;
}

export interface BookingSchedule {
  /** How the booking is interpreted */
  mode: 'sessions' | 'daily' | 'range' | 'none';
  slots: BookingSlot[];
}

export interface RoomConflict {
  /** Slot of the proposal being checked */
  slot_key: string;
  slot_label: string;
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  room_id: string | null;
  room_name: string;
  /** The other proposal that already holds the room */
  other_id: string;
  other_title: string;
  other_unit: string;
  other_status: string;
  other_created_by: string;
  other_slot_label: string;
  other_slot_kind: BookingSlotKind;
  other_slot_date: string;
  other_slot_end_date: string;
  other_slot_start_time: string;
  other_slot_end_time: string;
}

export function hhmm(t?: string | null): string {
  return String(t || '').slice(0, 5);
}

export function hasRoom(roomId?: string | null, roomName?: string | null): boolean {
  if (roomId) return true;
  const name = String(roomName || '').trim();
  return name !== '' && name !== NO_ROOM;
}

function isDate(d?: string | null): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.slice(0, 10));
}

function isTime(t?: string | null): boolean {
  return typeof t === 'string' && /^\d{2}:\d{2}/.test(t);
}

/** Wall-clock Vietnam time → epoch ms (independent of server timezone). */
export function vnToMs(date: string, time: string): number {
  return new Date(`${date.slice(0, 10)}T${hhmm(time)}:00+07:00`).getTime();
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetweenInclusive(start: string, end: string): number {
  const a = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${end.slice(0, 10)}T00:00:00Z`).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

function buildSlot(
  key: string,
  label: string,
  roomId: string | null,
  roomName: string,
  date: string,
  startTime: string,
  endTime: string,
  kind: BookingSlotKind,
  endDate?: string
): BookingSlot | null {
  if (!isDate(date) || !isTime(startTime) || !isTime(endTime)) return null;
  const lastDate = endDate && isDate(endDate) ? endDate.slice(0, 10) : date.slice(0, 10);
  const startMs = vnToMs(date, startTime);
  let endMs = vnToMs(lastDate, endTime);
  let finalEndDate = lastDate;
  // Same-day slot ending at/before its start = crosses midnight
  if (endMs <= startMs && lastDate === date.slice(0, 10)) {
    endMs += DAY_MS;
    finalEndDate = addDays(date, 1);
  }
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return null;
  return {
    key,
    label,
    room_id: roomId || null,
    room_name: roomName || NO_ROOM,
    date: date.slice(0, 10),
    end_date: finalEndDate,
    start_time: hhmm(startTime),
    end_time: hhmm(endTime),
    startMs,
    endMs,
    kind,
  };
}

/**
 * Turn a proposal (+ its sessions) into the concrete room slots it occupies.
 *
 * - Sessions are authoritative when they describe the schedule (≥2 sessions,
 *   or 1 session on a single-day proposal). Rejected sessions free the room.
 * - Otherwise (legacy rows without sessions, or "1 buổi" spanning many days)
 *   a multi-day proposal books its daily time window on each day
 *   (e.g. 16:50–21:00 every day), never 24/7.
 * - Overnight windows (end time ≤ start time across days) stay continuous.
 */
export function deriveBookingSchedule(
  proposal: BookingProposalInput,
  sessions?: BookingSessionInput[] | null
): BookingSchedule {
  const startDate = proposal.start_date ? String(proposal.start_date).slice(0, 10) : '';
  const endDate = proposal.end_date ? String(proposal.end_date).slice(0, 10) : startDate;
  const startTime = hhmm(proposal.start_time);
  const endTime = hhmm(proposal.end_time);
  const multiDay = isDate(startDate) && isDate(endDate) && startDate !== endDate;

  const datedSessions = (Array.isArray(sessions) ? sessions : []).filter(
    (s) => s && isDate(s.session_date)
  );
  const validSessions = datedSessions.filter((s) => s.status !== 'rejected');

  // Decide on ALL sessions so rejecting one ca never widens the booking to the whole range
  const sessionsAreSchedule =
    datedSessions.length > 1 || (datedSessions.length === 1 && !multiDay);

  if (sessionsAreSchedule) {
    const anySessionRoom = validSessions.some((s) => hasRoom(s.room_id, s.room_name));
    const slots: BookingSlot[] = [];
    validSessions.forEach((s, idx) => {
      let roomId = s.room_id || null;
      let roomName = String(s.room_name || NO_ROOM);
      // Legacy sessions saved without rooms → fall back to the proposal's room
      if (!anySessionRoom && hasRoom(proposal.room_id, proposal.room_name)) {
        roomId = proposal.room_id || null;
        roomName = String(proposal.room_name || NO_ROOM);
      }
      if (!hasRoom(roomId, roomName)) return;
      const slot = buildSlot(
        s.id || `session_${idx + 1}`,
        s.name || `Buổi ${idx + 1}`,
        roomId,
        roomName,
        String(s.session_date),
        s.start_time || startTime || '08:00',
        s.end_time || endTime || '11:30',
        'session'
      );
      if (slot) slots.push(slot);
    });
    return { mode: 'sessions', slots };
  }

  // Fallback: single session (or none) → proposal-level window
  if (datedSessions.length === 1 && validSessions.length === 0) {
    return { mode: 'none', slots: [] };
  }
  const only = validSessions[0];
  const roomId = (only && hasRoom(only.room_id, only.room_name) ? only.room_id : proposal.room_id) || null;
  const roomName = String(
    (only && hasRoom(only.room_id, only.room_name) ? only.room_name : proposal.room_name) || NO_ROOM
  );
  if (!hasRoom(roomId, roomName) || !isDate(startDate)) {
    return { mode: 'none', slots: [] };
  }
  const key = only?.id || 'main';
  const label = only?.name || 'Buổi chính';

  if (multiDay && startTime && endTime && endTime > startTime) {
    const slots: BookingSlot[] = [];
    let day = startDate;
    let guard = 0;
    while (day <= endDate && guard < MAX_DAILY_SLOTS) {
      const slot = buildSlot(key, label, roomId, roomName, day, startTime, endTime, 'daily');
      if (slot) slots.push(slot);
      day = addDays(day, 1);
      guard++;
    }
    return { mode: 'daily', slots };
  }

  const slot = buildSlot(key, label, roomId, roomName, startDate, startTime || '08:00', endTime || '11:30', 'range', endDate);
  return { mode: 'range', slots: slot ? [slot] : [] };
}

function sameRoom(a: BookingSlot, b: BookingSlot): boolean {
  if (a.room_id && b.room_id) return a.room_id === b.room_id;
  return (
    a.room_name.trim().toLowerCase() !== '' &&
    a.room_name.trim().toLowerCase() === b.room_name.trim().toLowerCase()
  );
}

export interface InternalOverlap {
  a_key: string;
  a_label: string;
  b_key: string;
  b_label: string;
  room_name: string;
  date: string;
}

/**
 * Sessions of the SAME proposal that book the same room at overlapping times.
 * Different rooms at the same time are fine (e.g. 2 sân cùng lúc = 2 ca cùng giờ).
 */
export function findInternalOverlaps(slots: BookingSlot[]): InternalOverlap[] {
  const out: InternalOverlap[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.key === b.key) continue;
      if (sameRoom(a, b) && a.startMs < b.endMs && b.startMs < a.endMs) {
        out.push({ a_key: a.key, a_label: a.label, b_key: b.key, b_label: b.label, room_name: a.room_name, date: a.date });
      }
    }
  }
  return out;
}

export function describeInternalOverlap(o: InternalOverlap): string {
  return `Ca "${o.a_label}" và ca "${o.b_label}" cùng mượn ${o.room_name} trùng giờ ngày ${formatDateVN(o.date)}. Nếu cần nhiều sân cùng lúc, mỗi ca hãy chọn một sân khác nhau.`;
}

export interface ExistingBooking {
  proposal: BookingProposalInput & { id: string };
  slots: BookingSlot[];
}

/**
 * Compare the slots being requested against slots already held by other proposals.
 * Reports at most one overlapping slot per (requested slot, other proposal) pair
 * so long recurring bookings don't flood the message.
 */
export function findRoomConflicts(
  requested: BookingSlot[],
  existing: ExistingBooking[],
  excludeId?: string | null
): RoomConflict[] {
  const conflicts: RoomConflict[] = [];
  for (const slot of requested) {
    for (const booking of existing) {
      if (excludeId && booking.proposal.id === excludeId) continue;
      const hit = booking.slots.find(
        (other) => sameRoom(slot, other) && slot.startMs < other.endMs && other.startMs < slot.endMs
      );
      if (!hit) continue;
      conflicts.push({
        slot_key: slot.key,
        slot_label: slot.label,
        slot_date: slot.date,
        slot_start_time: slot.start_time,
        slot_end_time: slot.end_time,
        room_id: slot.room_id,
        room_name: slot.room_name,
        other_id: booking.proposal.id,
        other_title: booking.proposal.title || 'Chương trình khác',
        other_unit: booking.proposal.organization_unit || '',
        other_status: booking.proposal.status || 'pending',
        other_created_by: booking.proposal.created_by || '',
        other_slot_label: hit.label,
        other_slot_kind: hit.kind,
        other_slot_date: hit.date,
        other_slot_end_date: hit.end_date,
        other_slot_start_time: hit.start_time,
        other_slot_end_time: hit.end_time,
      });
    }
  }
  return conflicts;
}

export function formatDateVN(date: string): string {
  if (!isDate(date)) return date || '';
  const [y, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatDayMonth(date: string): string {
  if (!isDate(date)) return date || '';
  const [, m, d] = date.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export function describeOtherSlot(c: RoomConflict): string {
  if (c.other_slot_kind === 'range' && c.other_slot_end_date !== c.other_slot_date) {
    return `liên tục từ ${c.other_slot_start_time} ${formatDayMonth(c.other_slot_date)} đến ${c.other_slot_end_time} ${formatDayMonth(c.other_slot_end_date)}`;
  }
  return `${c.other_slot_start_time}–${c.other_slot_end_time} ngày ${formatDayMonth(c.other_slot_date)}`;
}

export function conflictStatusLabel(status: string): string {
  if (status === 'approved') return 'đã duyệt';
  if (status === 'pending') return 'đang chờ duyệt';
  return status;
}

/** One-line Vietnamese explanation of a conflict. */
export function describeConflict(c: RoomConflict): string {
  const unit = c.other_unit ? ` – ${c.other_unit}` : '';
  return `Ca "${c.slot_label}" (${c.slot_start_time}–${c.slot_end_time} ngày ${formatDayMonth(c.slot_date)}) tại ${c.room_name} trùng với "${c.other_title}"${unit} (${conflictStatusLabel(c.other_status)}), đang giữ phòng ${describeOtherSlot(c)}.`;
}

/** Human description of how a proposal books its room (for approvers). */
export function describeSchedule(proposal: BookingProposalInput, schedule: BookingSchedule): string {
  if (schedule.mode === 'none') return 'Không mượn phòng';
  if (schedule.mode === 'sessions') {
    const rooms = Array.from(new Set(schedule.slots.map((s) => s.room_name)));
    return `${schedule.slots.length} ca mượn phòng (${rooms.join(', ')})`;
  }
  const first = schedule.slots[0];
  if (!first) return 'Không mượn phòng';
  if (schedule.mode === 'daily') {
    const start = String(proposal.start_date || '').slice(0, 10);
    const end = String(proposal.end_date || '').slice(0, 10);
    return `${first.room_name}: khung ${first.start_time}–${first.end_time} MỖI NGÀY, từ ${formatDateVN(start)} đến ${formatDateVN(end)} (${schedule.slots.length} ngày)`;
  }
  if (first.end_date !== first.date) {
    return `${first.room_name}: LIÊN TỤC từ ${first.start_time} ${formatDateVN(first.date)} đến ${first.end_time} ${formatDateVN(first.end_date)}`;
  }
  return `${first.room_name}: ${first.start_time}–${first.end_time} ngày ${formatDateVN(first.date)}`;
}
