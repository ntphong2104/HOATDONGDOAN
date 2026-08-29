import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, saveEventMeta } from '@/lib/constants/event-meta-store';

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
  const isYouthUnion = auth.tier === 'youth_union';

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

    const currentMeta = await getEventMeta(supabase, resolvedParams.id);
    const nextState =
      is_recruitment_open !== undefined
        ? Boolean(is_recruitment_open)
        : currentMeta.is_recruitment_open === false
        ? true
        : false;

    const updatedMeta = await saveEventMeta(supabase, resolvedParams.id, {
      is_recruitment_open: nextState,
    });

    return NextResponse.json({
      success: true,
      data: updatedMeta,
      is_recruitment_open: nextState,
      message: nextState ? 'Đã MỞ lại cổng tuyển dụng CTV!' : 'Đã ĐÓNG cổng tuyển dụng CTV thành công!',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống' }, { status: 500 });
  }
}
