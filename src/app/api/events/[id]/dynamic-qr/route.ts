import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { getAuthContext, canScanEvent, canManageEvent } from '@/lib/supabase/auth-helper';
import { generateDynamicToken } from '@/lib/utils/dynamic-qr';

const ALLOWED_QR_ROLES = new Set(['participant', 'volunteer', 'organizer']);

export async function GET(
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

  const { data: event, error } = await supabase
    .from('events')
    .select('event_id, event_name, status, is_active, event_date, start_time, end_time, created_by')
    .eq('event_id', resolvedParams.id)
    .single();

  if (error || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const rawRole = (searchParams.get('role') || 'participant').trim().toLowerCase();
  if (!ALLOWED_QR_ROLES.has(rawRole)) {
    return NextResponse.json({ success: false, error: 'Vai trò điểm danh không hợp lệ' }, { status: 400 });
  }

  // Authorization:
  // - `participant`: super_admin, youth_union, creator/event_admin/checker of THIS event
  // - `volunteer` / `organizer`: must have event management permission (checker cannot mint CTV/BTC QR)
  const allowed =
    rawRole === 'participant'
      ? await canScanEvent(auth, resolvedParams.id, event.created_by ?? null, supabase)
      : await canManageEvent(auth, resolvedParams.id, event.created_by ?? null, supabase);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Forbidden', message: 'Bạn không có quyền tạo mã QR điểm danh cho vai trò/sự kiện này' },
      { status: 403 }
    );
  }

  const sessionId = searchParams.get('session_id') || searchParams.get('sessionId') || 'main';
  const tokenData = generateDynamicToken(event.event_id, rawRole, Date.now(), sessionId);

  return NextResponse.json({
    success: true,
    data: {
      event_id: event.event_id,
      event_name: event.event_name,
      status: event.status,
      role: tokenData.role,
      sessionId: tokenData.sessionId,
      token: tokenData.token,
      expiresInSeconds: tokenData.expiresInSeconds,
      windowSeconds: 10,
    },
  });
}
