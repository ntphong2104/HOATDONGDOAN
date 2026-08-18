import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xóa toàn bộ sự kiện' }, { status: 403 });
    }

    const supabase = await createClient();

    // 1. Delete check_ins
    await supabase.from('check_ins').delete().neq('id', -999);

    // 2. Delete event_roles
    await supabase.from('event_roles').delete().neq('id', -999);

    // 3. Delete optional tables
    try { await supabase.from('event_ratings').delete().neq('id', -999); } catch {}
    try { await supabase.from('event_registrations').delete().neq('id', -999); } catch {}
    try { await supabase.from('event_proposals').delete().neq('id', 'dummy-never-matches'); } catch {}

    // 4. Delete events
    const { error } = await supabase.from('events').delete().neq('event_id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa toàn bộ sự kiện và dữ liệu liên quan thành công!',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
