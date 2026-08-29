import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';
import { isEventScheduleExpired } from '@/lib/utils/event-logic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin && auth.tier !== 'youth_union')) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const isPrivileged = auth.isSuperAdmin || auth.tier === 'youth_union';

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

  const currentWindow = isRegistrationWindowOpen(
    event.event_date,
    event.start_time,
    event.status,
    event.is_registration_open
  );

  const body = await req.json().catch(() => ({}));
  const newOpen = typeof body.open === 'boolean' ? body.open : !currentWindow.isOpen;

  // If reopening registration on an expired event, only Super Admin & Đoàn TN can do it
  if (newOpen) {
    const isExpired = isEventScheduleExpired(event);
    if (isExpired && !isPrivileged) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Chương trình đã kết thúc quá 1 giờ và tự động đóng. Cán bộ đơn vị trực thuộc không được phép mở lại cổng đăng ký. Vui lòng liên hệ Super Admin hoặc Đoàn Thanh Niên.',
        },
        { status: 403 }
      );
    }
  }

  const { data: updatedEvent, error: updateErr } = await supabase
    .from('events')
    .update({ is_registration_open: newOpen })
    .eq('event_id', resolvedParams.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
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

