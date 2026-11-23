import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { summarizeUnitRatings } from '@/lib/utils/rating-logic';
import { getStoredProposalById, getStoredProposalLogs, deleteProposalFromStore } from '@/lib/constants/proposals-store';
import { getProposalMeta } from '@/lib/constants/event-meta-store';
import { deriveBookingSchedule } from '@/lib/utils/room-booking';
import { checkRoomConflicts } from '@/lib/utils/room-booking-server';

function canViewProposal(auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>, proposal: any): {
  allowed: boolean;
  isSuperAdmin: boolean;
  isApprover: boolean;
  isCreator: boolean;
} {
  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
  const isApprover = isSuperAdmin || ['youth_union', 'ctsv', 'facility'].includes(auth.tier);
  const isCreator = Boolean(
    proposal?.created_by &&
      auth.email &&
      String(proposal.created_by).toLowerCase().trim() === auth.email.toLowerCase().trim()
  );
  const isSecurityApproved = auth.tier === 'security' && proposal?.status === 'approved';
  return {
    allowed: isSuperAdmin || isApprover || isCreator || isSecurityApproved,
    isSuperAdmin,
    isApprover,
    isCreator,
  };
}

function sanitizeLogsForViewer(logs: any[], isSuperAdmin: boolean, isApprover: boolean) {
  if (isSuperAdmin) return logs;
  return (logs || [])
    .filter((l: any) => {
      if (isApprover) return true;
      const action = String(l?.action || '').toLowerCase().trim();
      return action === 'approve' || action === 'approved' || action === 'reject' || action === 'rejected';
    })
    .map((l: any) => ({
      ...l,
      actor_email: undefined,
      actor_name: undefined,
    }));
}

function sanitizeRatingsForViewer(ratingSummary: any, eventRatings: any[], isSuperAdmin: boolean) {
  if (isSuperAdmin) return { ratingSummary, eventRatings };
  return {
    ratingSummary: {
      ...ratingSummary,
      recent_low_ratings: (ratingSummary?.recent_low_ratings || []).map((r: any) => ({
        ...r,
        rater_email: undefined,
      })),
    },
    eventRatings: (eventRatings || []).map((r: any) => ({
      ...r,
      rater_email: undefined,
    })),
  };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createAdminClient();

    const { data: proposal, error: proposalErr } = await supabase
      .from('event_proposals')
      .select('*')
      .eq('id', resolvedParams.id)
      .single();

    if (!proposalErr && proposal) {
      const access = canViewProposal(auth, proposal);
      if (!access.allowed) {
        return NextResponse.json(
          { success: false, error: 'Bạn không có quyền xem kế hoạch này' },
          { status: 403 }
        );
      }

      // Run all sub-queries in parallel for faster loading
      const [
        { data: logs },
        { data: allRatings },
        eventRatingsResult,
        propMeta,
      ] = await Promise.all([
        supabase
          .from('proposal_logs')
          .select('*')
          .eq('proposal_id', proposal.id)
          .order('created_at', { ascending: true }),
        supabase
          .from('unit_ratings')
          .select('*'),
        proposal.created_event_id
          ? supabase
              .from('unit_ratings')
              .select('*')
              .eq('event_id', proposal.created_event_id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
        getProposalMeta(supabase, resolvedParams.id),
      ]);

      const rawSummary = summarizeUnitRatings(
        allRatings || [],
        proposal.organization_unit || 'Đơn vị tổ chức'
      );

      const rawEventRatings = eventRatingsResult?.data || [];
      const stored = getStoredProposalById(resolvedParams.id);
      const proposalSessions =
        propMeta.sessions && propMeta.sessions.length > 0
          ? propMeta.sessions
          : proposal.sessions || stored?.sessions || [];

      // Per-session room conflicts with other active proposals (shown to approvers & creator)
      let roomConflicts: any[] = [];
      if (proposal.status !== 'rejected' && proposal.status !== 'deleted') {
        try {
          const schedule = deriveBookingSchedule(proposal, proposalSessions);
          roomConflicts = await checkRoomConflicts(supabase, schedule.slots, proposal.id, proposal.created_by);
        } catch {}
      }

      const { ratingSummary, eventRatings } = sanitizeRatingsForViewer(
        rawSummary,
        rawEventRatings,
        access.isSuperAdmin
      );

      return NextResponse.json({
        success: true,
        data: {
          ...proposal,
          description: proposal.description || propMeta.description || stored?.description || '',
          plan_url: proposal.plan_url || propMeta.plan_url || stored?.plan_url || '',
          sessions: proposalSessions,
          allowed_cohorts: Array.isArray(propMeta.allowed_cohorts) ? propMeta.allowed_cohorts : [],
          allowed_lcds: Array.isArray(propMeta.allowed_lcds) ? propMeta.allowed_lcds : [],
          room_conflicts: roomConflicts,
          logs: sanitizeLogsForViewer(logs || [], access.isSuperAdmin, access.isApprover),
          ratingSummary,
          eventRatings,
        },
      });
    }
  } catch {}

  // Fallback to local store
  const storedProp = getStoredProposalById(resolvedParams.id);
  if (!storedProp) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy kế hoạch' }, { status: 404 });
  }

  const access = canViewProposal(auth, storedProp);
  if (!access.allowed) {
    return NextResponse.json(
      { success: false, error: 'Bạn không có quyền xem kế hoạch này' },
      { status: 403 }
    );
  }

  const storedLogs = getStoredProposalLogs(storedProp.id);
  return NextResponse.json({
    success: true,
    data: {
      ...storedProp,
      logs: sanitizeLogsForViewer(storedLogs, access.isSuperAdmin, access.isApprover),
      ratingSummary: summarizeUnitRatings([], storedProp.organization_unit || 'Đơn vị tổ chức'),
      eventRatings: [],
    },
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth || (!auth.isSuperAdmin && auth.tier !== 'youth_union')) {
    return NextResponse.json(
      { success: false, error: 'Chỉ Super Admin hoặc Đoàn Học Viện mới có quyền xóa kế hoạch' },
      { status: 403 }
    );
  }

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  try {
    // Delete proposal logs
    await supabase.from('proposal_logs').delete().eq('proposal_id', resolvedParams.id);

    // Mark status as deleted (works even when RLS blocks hard delete)
    await supabase
      .from('event_proposals')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', resolvedParams.id);

    // Also attempt hard delete
    await supabase.from('event_proposals').delete().eq('id', resolvedParams.id);
  } catch {}

  try {
    deleteProposalFromStore(resolvedParams.id);
  } catch {}

  return NextResponse.json({ success: true, message: 'Đã xóa kế hoạch thành công' });
}
