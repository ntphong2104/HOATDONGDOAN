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

    // 1. Fetch all event_ids from database
    const { data: allEvs } = await supabase.from('events').select('event_id');
    const ids = (allEvs || []).map((e: any) => e.event_id).filter(Boolean);

    if (ids.length > 0) {
      // Delete check_ins for these events first
      await supabase.from('check_ins').delete().in('event_id', ids);
      
      // Delete event_roles for these events
      await supabase.from('event_roles').delete().in('event_id', ids);
      
      // Delete optional dependent records
      try { await supabase.from('event_ratings').delete().in('event_id', ids); } catch {}
      try { await supabase.from('event_registrations').delete().in('event_id', ids); } catch {}
      try { await supabase.from('event_proposals').delete().in('created_event_id', ids); } catch {}
      
      // Finally delete events
      const { error: delErr } = await supabase.from('events').delete().in('event_id', ids);
      if (delErr) {
        return NextResponse.json({ success: false, error: delErr.message }, { status: 500 });
      }
    } else {
      try { await supabase.from('check_ins').delete().gte('id', 0); } catch {}
      try { await supabase.from('event_roles').delete().gte('id', 0); } catch {}
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa toàn bộ sự kiện và dữ liệu liên quan thành công!',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
