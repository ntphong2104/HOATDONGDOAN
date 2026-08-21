import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getNextStage, getStageLabel } from '@/lib/utils/proposal-logic';
import { getStoredProposalById, saveProposalToStore, addStoredProposalLog } from '@/lib/constants/proposals-store';
import { saveEventMeta, getProposalMeta } from '@/lib/constants/event-meta-store';
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
  const { notes = '', session_decisions = {} } = body;

  // Update session statuses if decisions were provided
  if (proposal.sessions && Array.isArray(proposal.sessions) && Object.keys(session_decisions).length > 0) {
    proposal.sessions = proposal.sessions.map((sess: any) => {
      const decision = session_decisions[sess.id];
      if (decision) {
        return {
          ...sess,
          status: decision.status || sess.status,
          rejection_reason: decision.rejection_reason || sess.rejection_reason || '',
        };
      }
      return sess;
    });
  }

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
    let newEventId: string | null = null;
    try {
      const { data: newEvent, error: createEventErr } = await supabase
        .from('events')
        .insert({
          event_name: proposal.title,
          event_date: proposal.start_date,
          start_time: proposal.start_time,
          end_time: proposal.end_time,
          status: 'active',
          is_active: true,
          created_by: proposal.created_by,
          semester: proposal.semester || 'Chưa xếp kỳ',
          is_registration_open: true,
        })
        .select()
        .maybeSingle();

      if (newEvent?.event_id) {
        newEventId = newEvent.event_id;

        const propMeta = await getProposalMeta(supabase, proposal.id);
        const stored = getStoredProposalById(proposal.id);
        const availableSessions: any[] =
          (proposal.sessions && proposal.sessions.length > 0)
            ? proposal.sessions
            : (propMeta.sessions && propMeta.sessions.length > 0)
            ? propMeta.sessions
            : stored?.sessions || [];

        // Apply session_decisions if provided
        if (body.session_decisions && typeof body.session_decisions === 'object') {
          for (const s of availableSessions) {
            const dec = body.session_decisions[s.id];
            if (dec) {
              s.status = dec.status;
              s.rejection_reason = dec.rejection_reason;
            }
          }
        }

        // Auto-generate or filter sessions for event
        let finalSessions: any[] = [];
        if (availableSessions && availableSessions.length > 0) {
          // Use only non-rejected sessions
          finalSessions = availableSessions
            .filter((s: any) => s.status !== 'rejected')
            .map((s: any, idx: number) => ({
              id: s.id || `session_${idx + 1}`,
              name: s.name,
              session_date: s.session_date,
              start_time: s.start_time,
              end_time: s.end_time,
              created_at: new Date().toISOString(),
            }));
        }

        if (finalSessions.length === 0) {
          if (proposal.start_date && proposal.end_date && proposal.start_date !== proposal.end_date) {
            const startDateObj = new Date(proposal.start_date);
            const endDateObj = new Date(proposal.end_date);
            let currentDay = new Date(startDateObj);
            let dayIndex = 1;

            while (currentDay <= endDateObj && dayIndex <= 30) {
              const dateStr = currentDay.toISOString().split('T')[0];
              const vnDateFormatted = currentDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
              finalSessions.push({
                id: `session_day_${dayIndex}`,
                name: `Buổi ${dayIndex} (${vnDateFormatted})`,
                session_date: dateStr,
                start_time: proposal.start_time || '08:00',
                end_time: proposal.end_time || '11:30',
                created_at: new Date().toISOString(),
              });
              currentDay.setDate(currentDay.getDate() + 1);
              dayIndex++;
            }
          } else {
            finalSessions.push({
              id: 'session_1',
              name: 'Buổi 1 (Buổi chính)',
              session_date: proposal.start_date || new Date().toISOString().split('T')[0],
              start_time: proposal.start_time || '08:00',
              end_time: proposal.end_time || '11:30',
              created_at: new Date().toISOString(),
            });
          }
        }

        // Save departments, target scope, and sessions into event meta store
        await saveEventMeta(supabase, newEvent.event_id, {
          departments: (proposal as any).departments || [],
          target_scope: (proposal as any).target_scope || 'all',
          sessions: finalSessions,
          is_recruitment_open: true,
        });

        await supabase.from('event_roles').insert({
          event_id: newEventId,
          email: proposal.created_by,
          role_type: 'event_admin',
        });
      }
    } catch (createErr) {
      console.error('Error auto-creating event from proposal:', createErr);
    }

    if (newEventId) {
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
    }

    const updatedProposal = saveProposalToStore({
      ...proposal,
      status: 'approved',
      current_stage: 'approved',
      created_event_id: newEventId || proposal.created_event_id || proposal.id,
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
