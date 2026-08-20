import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { getRegistrationExtras, getEventMeta } from '@/lib/constants/event-meta-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' }, { status: 401 });
    }

    const rawMssv = extractMSSV(auth.email) || auth.email.split('@')[0].toUpperCase();
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const { data: regs, error } = await supabase
      .from('event_registrations')
      .select(`
        id,
        event_id,
        mssv,
        role_type,
        attended,
        created_at,
        events (
          event_id,
          event_name,
          event_date,
          start_time,
          end_time,
          semester,
          status,
          is_active
        )
      `)
      .or(`email.ilike.${auth.email},mssv.ilike.${rawMssv}`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch student registrations error:', error);
      return NextResponse.json({ success: false, error: 'Lỗi tải danh sách đăng ký' }, { status: 500 });
    }

    const eventMetas = await getEventMeta(supabase);
    const enrichedList = await Promise.all(
      (regs || []).map(async (r: any) => {
        const ev = r.events || {};
        const regExtras = await getRegistrationExtras(supabase, r.event_id);
        const extra = regExtras[(r.mssv || '').toUpperCase()] || {};
        const evMeta = eventMetas[r.event_id] || {};

        return {
          id: r.id,
          event_id: r.event_id,
          event_name: ev.event_name || evMeta.title || 'Sự kiện Học Viện',
          event_date: ev.event_date || evMeta.event_date || null,
          start_time: ev.start_time || evMeta.start_time || null,
          end_time: ev.end_time || evMeta.end_time || null,
          semester: ev.semester || evMeta.semester || 'Học kỳ mới',
          status: ev.status || 'active',
          role_type: r.role_type || 'participant',
          department_name: extra.department_name || null,
          review_status: extra.review_status || (r.role_type === 'volunteer' ? 'pending' : 'accepted'),
          attended: Boolean(r.attended),
          registered_at: r.created_at,
          location: evMeta.location || null,
          description: evMeta.description || null,
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enrichedList,
    });
  } catch (err: any) {
    console.error('api/me/registrations error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
