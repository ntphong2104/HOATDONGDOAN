import { createClient, createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const { data } = await supabase
      .from('event_roles')
      .select('id, email, role_type, created_at')
      .eq('event_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthContext();
    if (!auth) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const { data: eventData } = await supabase
      .from('events')
      .select('event_id, event_date, end_time, status, created_by')
      .eq('event_id', id)
      .maybeSingle();

    if (eventData && isEventLockedPast3Days(eventData) && !isSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền gán vai trò.',
        },
        { status: 403 }
      );
    }

    // Authorization: only super_admin, youth_union, or event creator/admin can assign roles
    const isSuperOrPrivileged = isSuperAdmin || auth.tier === 'youth_union';
    const isEventAdmin = auth.isEventAdmin || auth.tier === 'event_admin';
    
    if (!isSuperOrPrivileged && !isEventAdmin) {
      const isCreator = eventData?.created_by === auth.email;
      if (!isCreator) {
        return NextResponse.json({ success: false, error: 'Forbidden', message: 'Bạn không có quyền gán vai trò cho sự kiện này' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { email, role_type } = body;
    if (!email || !['event_admin', 'checker'].includes(role_type)) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('event_roles')
      .insert({ event_id: id, email, role_type })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'duplicate', message: 'Quyền đã được gán' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại', message: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}
