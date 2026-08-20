import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { generateDynamicToken } from '@/lib/utils/dynamic-qr';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role') || 'participant';
  const sessionId = searchParams.get('session_id') || searchParams.get('sessionId') || 'main';

  const supabase = await createClient();
  const { data: event, error } = await supabase
    .from('events')
    .select('event_id, event_name, status, is_active, event_date, start_time, end_time')
    .eq('event_id', resolvedParams.id)
    .single();

  if (error || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  // Generate real-time expiring token for specific role and session
  const tokenData = generateDynamicToken(event.event_id, role, Date.now(), sessionId);

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
