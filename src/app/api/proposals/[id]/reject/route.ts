import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getStageLabel } from '@/lib/utils/proposal-logic';
import type { ProposalStage } from '@/lib/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  const { data: proposal, error: propErr } = await supabase
    .from('event_proposals')
    .select('*')
    .eq('id', resolvedParams.id)
    .single();

  if (propErr || !proposal) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy kế hoạch' }, { status: 404 });
  }

  if (proposal.status === 'approved' || proposal.status === 'rejected') {
    return NextResponse.json({
      success: false,
      error: `Kế hoạch này đã ở trạng thái ${proposal.status === 'approved' ? 'Đã duyệt' : 'Đã từ chối'}`,
    }, { status: 400 });
  }

  const currentStage = proposal.current_stage as ProposalStage;

  // Department-specific permission check
  let canReject = auth.isSuperAdmin;
  if (currentStage === 'youth_union' && (auth.tier === 'youth_union' || auth.email.includes('doanthanhnien'))) {
    canReject = true;
  } else if (currentStage === 'ctsv' && (auth.tier === 'ctsv' || auth.email.includes('ctsv'))) {
    canReject = true;
  } else if (currentStage === 'facility' && (auth.tier === 'facility' || auth.email.includes('quantri') || auth.email.includes('csvc'))) {
    canReject = true;
  }

  if (!canReject) {
    return NextResponse.json({
      success: false,
      error: `Bạn không có thẩm quyền từ chối ở giai đoạn: ${getStageLabel(currentStage)}`,
    }, { status: 403 });
  }

  const body = await req.json();
  const { reason = 'Chưa đạt yêu cầu' } = body;

  const actorName = auth.email;

  // Insert rejection log
  await supabase.from('proposal_logs').insert({
    proposal_id: proposal.id,
    stage: currentStage,
    action: 'rejected',
    actor_email: auth.email,
    actor_name: actorName,
    notes: `Đã từ chối tại ${getStageLabel(currentStage)}. Lý do: ${reason}`,
  });

  // Update proposal status
  const { data: updatedProposal, error: updateErr } = await supabase
    .from('event_proposals')
    .update({
      status: 'rejected',
      current_stage: 'rejected',
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposal.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: updatedProposal,
    message: 'Đã từ chối kế hoạch',
  });
}
