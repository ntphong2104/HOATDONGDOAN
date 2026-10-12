/**
 * Server-side loader for existing room bookings (event_proposals + proposal meta sessions).
 */
import {
  deriveBookingSchedule,
  findRoomConflicts,
  type BookingProposalInput,
  type BookingSessionInput,
  type BookingSlot,
  type ExistingBooking,
  type RoomConflict,
} from '@/lib/utils/room-booking';

const DAY_MS = 24 * 60 * 60 * 1000;
const META_PREFIX = 'proposal_meta_';

function parseMeta(value: unknown): { sessions?: BookingSessionInput[] } {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? (parsed as any) : {};
  } catch {
    return {};
  }
}

/**
 * Load every active (pending/approved) proposal that could overlap [fromMs, toMs]
 * together with its sessions, already expanded into concrete room slots.
 */
export async function loadExistingBookings(
  supabase: any,
  fromMs: number,
  toMs: number,
  excludeId?: string | null
): Promise<ExistingBooking[]> {
  if (!supabase || !isFinite(fromMs) || !isFinite(toMs)) return [];

  // Sessions may sit slightly outside the proposal's own range, so widen the window.
  const windowStart = new Date(fromMs - 60 * DAY_MS).toISOString();
  const windowEnd = new Date(toMs + 60 * DAY_MS).toISOString();

  let query = supabase
    .from('event_proposals')
    .select('id, title, organization_unit, status, created_by, start_date, start_time, end_date, end_time, room_id, room_name')
    .neq('status', 'rejected')
    .neq('status', 'deleted')
    .gt('end_datetime', windowStart)
    .lt('start_datetime', windowEnd);
  if (excludeId) query = query.neq('id', excludeId);

  const { data: rows, error } = await query;
  if (error || !Array.isArray(rows) || rows.length === 0) return [];

  const metaById = new Map<string, BookingSessionInput[]>();
  const keys = rows.map((r: any) => `${META_PREFIX}${r.id}`);
  for (let i = 0; i < keys.length; i += 80) {
    const chunk = keys.slice(i, i + 80);
    const { data: metas } = await supabase.from('system_settings').select('key, value').in('key', chunk);
    for (const m of metas || []) {
      const sessions = parseMeta(m.value).sessions;
      if (Array.isArray(sessions)) metaById.set(String(m.key).slice(META_PREFIX.length), sessions);
    }
  }

  return rows.map((row: any) => {
    const proposal = row as BookingProposalInput & { id: string };
    const schedule = deriveBookingSchedule(proposal, metaById.get(row.id) || []);
    return { proposal, slots: schedule.slots };
  });
}

/** Check requested slots against everything already booked. */
export async function checkRoomConflicts(
  supabase: any,
  requested: BookingSlot[],
  excludeId?: string | null
): Promise<RoomConflict[]> {
  const withRoom = requested.filter((s) => s.room_id || s.room_name);
  if (withRoom.length === 0) return [];
  const fromMs = Math.min(...withRoom.map((s) => s.startMs));
  const toMs = Math.max(...withRoom.map((s) => s.endMs));
  const existing = await loadExistingBookings(supabase, fromMs, toMs, excludeId);
  return findRoomConflicts(withRoom, existing, excludeId);
}
