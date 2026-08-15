import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getNextStage, getStageLabel } from '@/lib/utils/proposal-logic';
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
  let canApprove = auth.isSuperAdmin;
  if (currentStage === 'youth_union' && (auth.tier === 'youth_union' || auth.email.includes('doanthanhnien'))) {
    canApprove = true;
  } else if (currentStage === 'ctsv' && (auth.tier === 'ctsv' || auth.email.includes('ctsv'))) {
    canApprove = true;
  } else if (currentStage === 'facility' && (auth.tier === 'facility' || auth.email.includes('quantri') || auth.email.includes('csvc') || auth.email.includes('tochuc'))) {
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
    proposal.requires_facility_approval
  );

  const actorName = auth.email;

  // Insert approval audit log
  await supabase.from('proposal_logs').insert({
    proposal_id: proposal.id,
    stage: currentStage,
    action: 'approved',
    actor_email: auth.email,
    actor_name: actorName,
    notes: notes || `Đã phê duyệt giai đoạn: ${getStageLabel(currentStage)}`,
  });

  // If Final Stage reached (Auto-create Event)
  if (nextStage === 'approved') {
    // Create event record in events table (let Postgres auto-generate UUID event_id)
    const { data: newEvent, error: eventErr } = await supabase
      .from('events')
      .insert({
        event_name: proposal.title,
        event_date: proposal.start_date,
        start_time: proposal.start_time,
        end_time: proposal.end_time,
        status: 'active',
        is_active: true,
        created_by: proposal.created_by,
      })
      .select()
      .single();

    if (eventErr || !newEvent?.event_id) {
      return NextResponse.json({
        success: false,
        error: 'Lỗi hệ thống, vui lòng thử lại',
      }, { status: 500 });
    }

    const newEventId = newEvent.event_id;

    // Auto-assign creator as Event Admin for this event
    await supabase.from('event_roles').insert({
      event_id: newEventId,
      email: proposal.created_by,
      role_type: 'event_admin',
    });

    // Update proposal as approved
    const { data: updatedProposal, error: updateErr } = await supabase
      .from('event_proposals')
      .update({
        status: 'approved',
        current_stage: 'approved',
        created_event_id: newEventId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({
        success: false,
        error: 'Lỗi hệ thống, vui lòng thử lại',
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: updatedProposal,
      message: 'Kế hoạch đã được phê duyệt chung cuộc & Đã tự động tạo sự kiện thành công!',
    });
  }

  // Else, advance to next stage
  const { data: updatedProposal, error: updateErr } = await supabase
    .from('event_proposals')
    .update({
      current_stage: nextStage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposal.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({
      success: false,
      error: 'Lỗi hệ thống, vui lòng thử lại',
    }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: updatedProposal,
    message: `Đã duyệt giai đoạn ${getStageLabel(currentStage)}. Đã chuyển sang: ${getStageLabel(nextStage)}.`,
  });
}
