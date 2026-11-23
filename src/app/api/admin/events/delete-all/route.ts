import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { fetchAllRows, chunkArray } from '@/lib/supabase/pagination';

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && auth.tier !== 'super_admin')) {
      return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới có quyền xóa toàn bộ sự kiện' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'DELETE_ALL_EVENTS') {
      return NextResponse.json(
        { success: false, error: 'Vui lòng gửi mã xác nhận confirm: "DELETE_ALL_EVENTS" để xóa toàn bộ sự kiện' },
        { status: 400 }
      );
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    // 1. Fetch all event_ids from database (paginated)
    const { data: allEvs } = await fetchAllRows<any>(() => supabase.from('events').select('event_id'));
    const ids = (allEvs || []).map((e: any) => e.event_id).filter(Boolean);

    if (ids.length > 0) {
      for (const chunk of chunkArray(ids, 100)) {
        const metaKeys = chunk.flatMap((id: string) => [
          `event_meta_${id}`,
          `event_regs_${id}`,
          `event_session_checkins_${id}`,
        ]);
        await Promise.allSettled([
          supabase.from('check_ins').delete().in('event_id', chunk),
          supabase.from('session_checkins').delete().in('event_id', chunk),
          supabase.from('event_roles').delete().in('event_id', chunk),
          supabase.from('unit_ratings').delete().in('event_id', chunk),
          supabase.from('event_registrations').delete().in('event_id', chunk),
          supabase.from('event_proposals').delete().in('created_event_id', chunk),
          supabase.from('system_settings').delete().in('key', metaKeys),
        ]);

        const { error: delErr } = await supabase.from('events').delete().in('event_id', chunk);
        if (delErr) {
          console.error('Delete all events chunk error:', delErr);
          return NextResponse.json({ success: false, error: 'Lỗi xóa sự kiện, vui lòng thử lại' }, { status: 500 });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Đã xóa toàn bộ sự kiện và dữ liệu liên quan thành công!',
    });
  } catch (err: any) {
    console.error('Delete all events error:', err);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}
