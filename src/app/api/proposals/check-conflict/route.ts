import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

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

  const supabase = await createClient();

  // Find any active or pending proposal overlapping in this room
  let query = supabase
    .from('event_proposals')
    .select('id, title, start_datetime, end_datetime, organization_unit, status')
    .eq('room_id', roomId)
    .neq('status', 'rejected')
    .neq('status', 'deleted')
    .lt('start_datetime', endDate.toISOString())
    .gt('end_datetime', startDate.toISOString());

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data: conflicts, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  if (conflicts && conflicts.length > 0) {
    const firstConflict = conflicts[0];
    return NextResponse.json({
      success: true,
      conflict: true,
      conflictingProposal: {
        id: firstConflict.id,
        title: firstConflict.title,
        start_datetime: firstConflict.start_datetime,
        end_datetime: firstConflict.end_datetime,
        organization_unit: firstConflict.organization_unit,
        status: firstConflict.status,
      },
      message: `Phòng này đã có chương trình "${firstConflict.title}" mượn trong khoảng thời gian này!`,
    });
  }

  return NextResponse.json({
    success: true,
    conflict: false,
    message: 'Phòng trống, có thể mượn!',
  });
}
