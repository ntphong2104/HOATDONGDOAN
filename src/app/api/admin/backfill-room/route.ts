import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getEventMeta, saveEventMeta, getProposalMeta } from '@/lib/constants/event-meta-store';
import { getStoredProposalById } from '@/lib/constants/proposals-store';

/**
 * One-time migration endpoint to backfill room_name from proposal sessions
 * into event sessions that were created before the fix.
 * 
 * Only super_admin can run this.
 * DELETE this file after running once.
 */
export async function POST() {
  const auth = await getAuthContext();
  if (!auth || !auth.isSuperAdmin) {
    return NextResponse.json({ success: false, error: 'Chỉ Super Admin mới chạy được' }, { status: 403 });
  }

  const supabase = await createAdminClient();

  // Get all approved proposals that have created_event_id
  const { data: proposals, error } = await supabase
    .from('event_proposals')
    .select('id, title, room_name, created_event_id, sessions')
    .eq('status', 'approved')
    .not('created_event_id', 'is', null);

  if (error || !proposals) {
    return NextResponse.json({ success: false, error: 'Lỗi truy vấn proposals', detail: error?.message }, { status: 500 });
  }

  const results: any[] = [];

  for (const prop of proposals) {
    if (!prop.created_event_id) continue;

    try {
      // Get proposal sessions (with room_name) from proposal meta
      const propMeta = await getProposalMeta(supabase, prop.id);
      const stored = getStoredProposalById(prop.id);
      
      const proposalSessions: any[] =
        (propMeta.sessions && propMeta.sessions.length > 0)
          ? propMeta.sessions
          : prop.sessions || stored?.sessions || [];

      if (proposalSessions.length === 0) {
        results.push({ proposal: prop.title, status: 'skipped', reason: 'Không có sessions trong proposal' });
        continue;
      }

      // Get current event sessions
      const eventMeta = await getEventMeta(supabase, prop.created_event_id);
      const eventSessions = eventMeta.sessions || [];

      if (eventSessions.length === 0) {
        results.push({ proposal: prop.title, status: 'skipped', reason: 'Event chưa có sessions' });
        continue;
      }

      // Match and backfill room_name
      let updated = false;
      const updatedSessions = eventSessions.map((evSess: any) => {
        // Already has room_name? Skip
        if (evSess.room_name && evSess.room_name !== 'Không mượn') {
          return evSess;
        }

        // Try to find matching proposal session by id or name
        const matchById = proposalSessions.find((ps: any) => ps.id === evSess.id);
        const matchByName = proposalSessions.find((ps: any) => ps.name === evSess.name);
        const match = matchById || matchByName;

        if (match && match.room_name && match.room_name !== 'Không mượn') {
          updated = true;
          return {
            ...evSess,
            room_id: match.room_id || null,
            room_name: match.room_name,
          };
        }

        // Fallback: use proposal-level room_name
        if (prop.room_name && prop.room_name !== 'Không mượn') {
          updated = true;
          return {
            ...evSess,
            room_name: prop.room_name,
          };
        }

        return evSess;
      });

      if (updated) {
        await saveEventMeta(supabase, prop.created_event_id, {
          ...eventMeta,
          sessions: updatedSessions,
        });
        results.push({
          proposal: prop.title,
          event_id: prop.created_event_id,
          status: 'updated',
          sessions_count: updatedSessions.length,
        });
      } else {
        results.push({ proposal: prop.title, status: 'no_change', reason: 'Không có room_name nào cần cập nhật' });
      }
    } catch (err: any) {
      results.push({ proposal: prop.title, status: 'error', reason: err.message });
    }
  }

  return NextResponse.json({
    success: true,
    message: `Đã xử lý ${proposals.length} proposals`,
    results,
  });
}
