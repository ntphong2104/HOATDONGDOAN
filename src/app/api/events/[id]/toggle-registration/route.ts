import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  // 1. Fetch current event
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  // 2. Toggle registration state
  const currentOpen = event.is_registration_open !== false; // Default is true
  const newOpen = !currentOpen;

  const { data: updatedEvent, error: updateErr } = await supabase
    .from('events')
    .update({ is_registration_open: newOpen })
    .eq('event_id', resolvedParams.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: updatedEvent,
    is_registration_open: newOpen,
    message: newOpen
      ? 'Đã mở lại cổng đăng ký cho sinh viên!'
      : 'Đã đóng cổng đăng ký sự kiện thành công!',
  });
}
