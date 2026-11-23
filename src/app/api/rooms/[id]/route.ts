import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'facility') {
    return NextResponse.json(
      { success: false, error: 'Chỉ Super Admin hoặc Phòng TC-HC-QT mới có quyền chỉnh sửa phòng' },
      { status: 403 }
    );
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const body = await req.json();
  const { room_name, capacity, location } = body;

  const updatePayload: Record<string, any> = {};
  if (room_name && typeof room_name === 'string') updatePayload.room_name = room_name.trim();
  if (capacity !== undefined) updatePayload.capacity = Number(capacity);
  if (location !== undefined) updatePayload.location = String(location).trim();

  const { data: updatedRoom, error } = await supabase
    .from('rooms')
    .update(updatePayload)
    .eq('id', resolvedParams.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: 'Tên phòng/sân bãi này đã trùng với phòng khác' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: updatedRoom, message: 'Đã cập nhật thông tin phòng thành công' });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  if (!auth.isSuperAdmin && auth.tier !== 'super_admin' && auth.tier !== 'facility') {
    return NextResponse.json(
      { success: false, error: 'Chỉ Super Admin hoặc Phòng TC-HC-QT mới có quyền xóa phòng' },
      { status: 403 }
    );
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const { error } = await supabase
    .from('rooms')
    .delete()
    .eq('id', resolvedParams.id);

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Đã xóa phòng thành công' });
}
