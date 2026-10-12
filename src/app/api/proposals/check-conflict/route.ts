import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { deriveBookingSchedule, describeConflict, NO_ROOM } from '@/lib/utils/room-booking';
import { checkRoomConflicts } from '@/lib/utils/room-booking-server';

/**
 * Per-session room conflict check.
 *
 * POST body (same shape the proposal form submits):
 *   { start_date, start_time, end_date, end_time, room_id, room_name, sessions, exclude_id }
 * Response: { conflict, conflicts: RoomConflict[], messages: string[], mode }
 */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    start_date,
    start_time,
    end_date,
    end_time,
    room_id = null,
    room_name = NO_ROOM,
    sessions = [],
    exclude_id = null,
  } = body || {};

  const schedule = deriveBookingSchedule(
    { start_date, start_time, end_date, end_time, room_id, room_name },
    Array.isArray(sessions) ? sessions : []
  );

  if (schedule.slots.length === 0) {
    return NextResponse.json({ success: true, conflict: false, conflicts: [], messages: [], mode: schedule.mode });
  }

  try {
    const supabase = await createAdminClient();
    const conflicts = await checkRoomConflicts(supabase, schedule.slots, exclude_id, auth.email);
    return NextResponse.json({
      success: true,
      conflict: conflicts.length > 0,
      conflicts,
      messages: conflicts.map(describeConflict),
      mode: schedule.mode,
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}

/** Legacy query-string variant: one continuous window in one room. */
export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const roomId = searchParams.get('room_id');
  const startStr = searchParams.get('start');
  const endStr = searchParams.get('end');
  const excludeId = searchParams.get('exclude_id');

  if (!roomId || !startStr || !endStr) {
    return NextResponse.json({ success: true, conflict: false });
  }

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate >= endDate) {
    return NextResponse.json({ success: true, conflict: false });
  }

  const supabase = await createAdminClient();
  const conflicts = await checkRoomConflicts(
    supabase,
    [
      {
        key: 'main',
        label: 'Buổi chính',
        room_id: roomId,
        room_name: '',
        date: startDate.toISOString().slice(0, 10),
        end_date: endDate.toISOString().slice(0, 10),
        start_time: '',
        end_time: '',
        startMs: startDate.getTime(),
        endMs: endDate.getTime(),
        kind: 'range',
      },
    ],
    excludeId,
    auth.email
  );

  if (conflicts.length > 0) {
    const first = conflicts[0];
    return NextResponse.json({
      success: true,
      conflict: true,
      conflicts,
      conflictingProposal: {
        id: first.other_id,
        title: first.other_title,
        organization_unit: first.other_unit,
        status: first.other_status,
      },
      message: `Phòng này đã có chương trình "${first.other_title}" mượn trong khoảng thời gian này!`,
    });
  }

  return NextResponse.json({ success: true, conflict: false, message: 'Phòng trống, có thể mượn!' });
}
