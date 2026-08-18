import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

const DEFAULT_ROOMS = [
  { id: 'room-2a08', room_name: 'Hội trường 2A08', capacity: 350, location: 'Tầng 2 - Tòa A' },
  { id: 'room-2b12', room_name: 'Phòng Hội Thảo 2B12', capacity: 120, location: 'Tầng 2 - Tòa B' },
  { id: 'room-3a01', room_name: 'Phòng Đa Năng 3A01', capacity: 80, location: 'Tầng 3 - Tòa A' },
  { id: 'room-sanbong', room_name: 'Sân Thể Thao Học Viện', capacity: 500, location: 'Khu thể thao phức hợp cơ sở TP.HCM' },
];

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .order('room_name', { ascending: true });

    if (error || !rooms || rooms.length === 0) {
      return NextResponse.json({ success: true, data: DEFAULT_ROOMS });
    }

    return NextResponse.json({ success: true, data: rooms });
  } catch {
    return NextResponse.json({ success: true, data: DEFAULT_ROOMS });
  }
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
