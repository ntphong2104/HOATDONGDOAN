import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getNextStage, getStageLabel } from '@/lib/utils/proposal-logic';
import { getStoredProposalById, saveProposalToStore, addStoredProposalLog } from '@/lib/constants/proposals-store';
import type { ProposalStage, EventProposal } from '@/lib/types';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let proposal: EventProposal | null = null;
  const supabase = await createAdminClient();

  try {
    const { data: dbProp } = await supabase
      .from('event_proposals')
      .select('*')
      .eq('id', resolvedParams.id)
      .single();
    if (dbProp) proposal = dbProp;
  } catch {}

  if (!proposal) {
    const stored = getStoredProposalById(resolvedParams.id);
    if (stored) proposal = stored;
  }

  if (!proposal) {
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
  let canApprove = auth.isSuperAdmin;
  if (currentStage === 'youth_union' && (auth.tier === 'youth_union' || auth.email.includes('doanthanhnien'))) {
    canApprove = true;
  } else if (currentStage === 'ctsv' && (auth.tier === 'ctsv' || auth.email.includes('ctsv'))) {
    canApprove = true;
  } else if (currentStage === 'facility' && (auth.tier === 'facility' || auth.email.includes('quantri') || auth.email.includes('tchc') || auth.email.includes('tchcqt') || auth.email.includes('csvc') || auth.email.includes('tochuc'))) {
    canApprove = true;
  }

  if (!canApprove) {
    return NextResponse.json({
      success: false,
      error: `Bạn không có thẩm quyền phê duyệt ở giai đoạn: ${getStageLabel(currentStage)}`,
    }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { notes = '' } = body;

  const nextStage = getNextStage(
    currentStage,
    proposal.requires_ctsv_approval,
    proposal.requires_facility_approval,
    proposal.organization_unit
  );

  const actorName = auth.email;

  // Try DB audit log
  try {
    await supabase.from('proposal_logs').insert({
      proposal_id: proposal.id,
      stage: currentStage,
      action: 'approved',
      actor_email: auth.email,
      actor_name: actorName,
      notes: notes || '',
    });
  } catch {}

  addStoredProposalLog({
    proposal_id: proposal.id,
    stage: currentStage,
    action: 'approved',
    actor_email: auth.email,
    actor_name: actorName,
    notes: notes || '',
  });

  // If Final Stage reached (Auto-create Event)
  if (nextStage === 'approved') {
    let newEventId = `ev-${Date.now()}`;
    try {
      const { data: newEvent } = await supabase
        .from('events')
        .insert({
          event_name: proposal.title,
          event_date: proposal.start_date,
          start_time: proposal.start_time,
          end_time: proposal.end_time,
          status: 'active',
          is_active: true,
          created_by: proposal.created_by,
          departments: (proposal as any).departments || [],
          target_scope: (proposal as any).target_scope || 'all',
        })
        .select()
        .single();

      if (newEvent?.event_id) {
        newEventId = newEvent.event_id;
        await supabase.from('event_roles').insert({
          event_id: newEventId,
          email: proposal.created_by,
          role_type: 'event_admin',
        });
      }
    } catch {}

    try {
      await supabase
        .from('event_proposals')
        .update({
          status: 'approved',
          current_stage: 'approved',
          created_event_id: newEventId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', proposal.id);
    } catch {}

    const updatedProposal = saveProposalToStore({
      ...proposal,
      status: 'approved',
      current_stage: 'approved',
      created_event_id: newEventId,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      data: updatedProposal,
      message: 'Kế hoạch đã được phê duyệt chung cuộc & Đã tự động tạo sự kiện thành công!',
    });
  }

  // Else, advance to next stage
  try {
    await supabase
      .from('event_proposals')
      .update({
        current_stage: nextStage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id);
  } catch {}

  const updatedProposal = saveProposalToStore({
    ...proposal,
    current_stage: nextStage,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    data: updatedProposal,
    message: `Đã duyệt giai đoạn ${getStageLabel(currentStage)}. Đã chuyển sang: ${getStageLabel(nextStage)}.`,
  });
}
