import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { summarizeUnitRatings } from '@/lib/utils/rating-logic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: proposal, error: proposalErr } = await supabase
    .from('event_proposals')
    .select('*')
    .eq('id', resolvedParams.id)
    .single();

  if (proposalErr || !proposal) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy kế hoạch' }, { status: 404 });
  }

  // Fetch proposal logs
  const { data: logs } = await supabase
    .from('proposal_logs')
    .select('*')
    .eq('proposal_id', proposal.id)
    .order('created_at', { ascending: true });

  // Fetch ratings for this organization unit (historical performance)
  const { data: allRatings } = await supabase
    .from('unit_ratings')
    .select('*');

  const ratingSummary = summarizeUnitRatings(
    allRatings || [],
    proposal.organization_unit || 'Đơn vị tổ chức'
  );

  // Fetch ratings specifically for the created event if it exists
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

  // Delete proposal logs first
  await supabase.from('proposal_logs').delete().eq('proposal_id', resolvedParams.id);

  // Delete proposal
  const { error } = await supabase.from('event_proposals').delete().eq('id', resolvedParams.id);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Đã xóa kế hoạch thành công' });
}

