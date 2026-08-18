import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { summarizeUnitRatings } from '@/lib/utils/rating-logic';
import { getStoredProposalById, getStoredProposalLogs, deleteProposalFromStore } from '@/lib/constants/proposals-store';

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
      const { data: logs } = await supabase
        .from('proposal_logs')
        .select('*')
        .eq('proposal_id', proposal.id)
        .order('created_at', { ascending: true });

      const { data: allRatings } = await supabase
        .from('unit_ratings')
        .select('*');

      const ratingSummary = summarizeUnitRatings(
        allRatings || [],
        proposal.organization_unit || 'Đơn vị tổ chức'
      );

      let eventRatings: any[] = [];
      if (proposal.created_event_id) {
        const { data: evRatings } = await supabase
          .from('unit_ratings')
          .select('*')
          .eq('event_id', proposal.created_event_id)
          .order('created_at', { ascending: false });
        eventRatings = evRatings || [];
      }

      return NextResponse.json({
        success: true,
        data: {
          ...proposal,
          logs: logs || [],
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

  const storedLogs = getStoredProposalLogs(storedProp.id);
  return NextResponse.json({
    success: true,
    data: {
      ...storedProp,
      logs: storedLogs,
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

  const supabase = await createClient();

  // Delete proposal logs
  await supabase.from('proposal_logs').delete().eq('proposal_id', resolvedParams.id);

  // Mark status as deleted (works even when RLS blocks hard delete)
  await supabase
    .from('event_proposals')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', resolvedParams.id);

  // Also attempt hard delete
  await supabase.from('event_proposals').delete().eq('id', resolvedParams.id);

  return NextResponse.json({ success: true, message: 'Đã xóa kế hoạch thành công' });
}

