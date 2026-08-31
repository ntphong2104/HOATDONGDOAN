import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, saveEventMeta, getSessionCheckIns, type EventSession } from '@/lib/constants/event-meta-store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const [
      { data: event },
      meta,
      sessionCheckins
    ] = await Promise.all([
      supabase
        .from('events')
        .select('event_id, event_name, event_date, start_time, end_time, status')
        .eq('event_id', resolvedParams.id)
        .maybeSingle(),
      getEventMeta(supabase, resolvedParams.id),
      getSessionCheckIns(supabase, resolvedParams.id)
    ]);

    if (!event) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
    }

    let sessions: EventSession[] = meta.sessions || [];

    // Default to at least 1 session if none configured yet
    if (sessions.length === 0) {
      sessions = [
        {
          id: 'main',
          name: 'Buổi chính',
          session_date: event.event_date || new Date().toISOString().split('T')[0],
          start_time: event.start_time || '07:30',
          end_time: event.end_time || '11:30',
          created_at: new Date().toISOString(),
        },
      ];
    }

    // Calculate count per session
    const sessionsWithStats = sessions.map((s) => {
      const count = sessionCheckins.filter((c) => c.session_id === s.id).length;
      return {
        ...s,
        checkedInCount: count,
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          sessions: sessionsWithStats,
          totalSessionCheckins: sessionCheckins.length,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (err: any) {
    console.error('GET /api/events/[id]/sessions error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin && auth.tier === 'user')) {
      return NextResponse.json({ success: false, error: 'Chỉ Ban Tổ Chức mới có quyền quản lý ca sự kiện' }, { status: 403 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const body = await req.json();
    const { session, sessions: bulkSessions } = body;

    const meta = await getEventMeta(supabase, resolvedParams.id);
    let currentSessions = meta.sessions || [];

    if (bulkSessions && Array.isArray(bulkSessions)) {
      currentSessions = bulkSessions;
    } else if (session && session.name) {
      const newSession: EventSession = {
        id: session.id || `session_${Date.now()}`,
        name: session.name.trim(),
        session_date: session.session_date || new Date().toISOString().split('T')[0],
        start_time: session.start_time || '07:30',
        end_time: session.end_time || '11:30',
        created_at: session.created_at || new Date().toISOString(),
      };

      const existingIndex = currentSessions.findIndex((s) => s.id === newSession.id);
      if (existingIndex >= 0) {
        currentSessions[existingIndex] = newSession;
      } else {
        currentSessions.push(newSession);
      }
    }

    await saveEventMeta(supabase, resolvedParams.id, {
      sessions: currentSessions,
    });

    return NextResponse.json({
      success: true,
      data: currentSessions,
      message: 'Cập nhật danh sách ca/buổi thành công',
    });
  } catch (err: any) {
    console.error('POST /api/events/[id]/sessions error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const auth = await getAuthContext();
    if (!auth || (!auth.isSuperAdmin && !auth.isEventAdmin && auth.tier === 'user')) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Thiếu session_id' }, { status: 400 });
    }

    const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
    const supabase = (await getSupabase()) || (await createClient());

    const meta = await getEventMeta(supabase, resolvedParams.id);
    const updatedSessions = (meta.sessions || []).filter((s) => s.id !== sessionId);

    await saveEventMeta(supabase, resolvedParams.id, {
      sessions: updatedSessions,
    });

    return NextResponse.json({
      success: true,
      data: updatedSessions,
      message: 'Đã xóa ca điểm danh thành công',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
