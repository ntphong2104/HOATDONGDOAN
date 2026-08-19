import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = auth.isSuperAdmin || auth.tier === 'super_admin';
  const isYouthUnion = auth.tier === 'youth_union' || auth.email.includes('doanthanhnien');

  if (!isSuperAdmin && !isYouthUnion && auth.tier !== 'event_admin') {
    const { data: eventRole } = await supabase
      .from('event_roles')
      .select('role_type')
      .eq('email', auth.email)
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    const { data: event } = await supabase
      .from('events')
      .select('created_by')
      .eq('event_id', resolvedParams.id)
      .maybeSingle();

    const isCreator = event?.created_by && event.created_by.toLowerCase() === auth.email.toLowerCase();

    if (!eventRole && !isCreator) {
      return NextResponse.json({ success: false, error: 'Bạn không có quyền quản lý sự kiện này' }, { status: 403 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { is_recruitment_open } = body;

    const { data: currentEvent, error: fetchErr } = await supabase
      .from('events')
      .select('is_recruitment_open')
      .eq('event_id', resolvedParams.id)
      .single();

    if (fetchErr || !currentEvent) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
    }

    const nextState =
      is_recruitment_open !== undefined
        ? Boolean(is_recruitment_open)
        : currentEvent.is_recruitment_open === false
        ? true
        : false;

    const { data: updated, error: updateErr } = await supabase
      .from('events')
      .update({ is_recruitment_open: nextState })
      .eq('event_id', resolvedParams.id)
      .select()
      .single();

    if (updateErr) {
      console.error('Toggle recruitment error:', updateErr);
      return NextResponse.json({ success: false, error: 'Lỗi cập nhật trạng thái cổng tuyển dụng' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: updated,
      message: nextState ? 'Đã MỞ lại cổng tuyển dụng CTV!' : 'Đã ĐÓNG cổng tuyển dụng CTV sớm!',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
