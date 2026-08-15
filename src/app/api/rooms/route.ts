import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function GET() {
  const supabase = await createClient();
  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('*')
    .order('room_name', { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({ success: true, data: rooms || [] });
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  
  // Verify super admin
  const { data: superAdmin } = await supabase
    .from('super_admins')
    .select('email')
    .eq('email', auth.email)
    .single();

  if (!superAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền thêm phòng' }, { status: 403 });
  }

  const body = await req.json();
  const { room_name, capacity = 100, location = '' } = body;

  if (!room_name || typeof room_name !== 'string' || !room_name.trim()) {
    return NextResponse.json({ success: false, error: 'Tên phòng không được để trống' }, { status: 400 });
  }

  const { data: newRoom, error } = await supabase
    .from('rooms')
    .insert({
      room_name: room_name.trim(),
      capacity: Number(capacity) || 100,
      location: location.trim(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: 'Tên phòng/sân bãi này đã tồn tại' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({ success: true, data: newRoom });
}
