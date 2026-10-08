import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { getNextStage, getStageLabel } from '@/lib/utils/proposal-logic';
import { getStoredProposalById, saveProposalToStore, addStoredProposalLog } from '@/lib/constants/proposals-store';
import { saveEventMeta, getProposalMeta, saveProposalMeta } from '@/lib/constants/event-meta-store';
import { OFFICIAL_UNITS } from '@/lib/constants/units';
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

  // Department-specific permission check (tier is resolved server-side from
  // exact-email allowlist or officer_roles — never from email substrings)
  let canApprove = auth.isSuperAdmin;
  if (currentStage === 'youth_union' && auth.tier === 'youth_union') {
    canApprove = true;
  } else if (currentStage === 'ctsv' && auth.tier === 'ctsv') {
    canApprove = true;
  } else if (currentStage === 'facility' && auth.tier === 'facility') {
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

  // Sessions are stored in proposal meta (system_settings), NOT in the event_proposals row.
  // Load them from there so per-session decisions are actually persisted.
  const propMetaInitial = await getProposalMeta(supabase, proposal.id);
  const storedInitial = getStoredProposalById(proposal.id);
  let workingSessions: any[] =
    (propMetaInitial.sessions && propMetaInitial.sessions.length > 0)
      ? propMetaInitial.sessions.map((s: any) => ({ ...s }))
      : (Array.isArray(proposal.sessions) && proposal.sessions.length > 0)
      ? proposal.sessions.map((s: any) => ({ ...s }))
      : (storedInitial?.sessions || []).map((s: any) => ({ ...s }));

  const hasSessionDecisions =
    session_decisions && typeof session_decisions === 'object' && Object.keys(session_decisions).length > 0;

  if (workingSessions.length > 0 && hasSessionDecisions) {
    workingSessions = workingSessions.map((sess: any) => {
      const decision = session_decisions[sess.id];
      if (!decision) return sess;
      return {
        ...sess,
        status: decision.status || sess.status,
        rejection_reason: decision.status === 'rejected'
          ? (decision.rejection_reason || sess.rejection_reason || '')
          : '',
        reviewed_stage: currentStage,
        reviewed_by: auth.email,
        reviewed_at: new Date().toISOString(),
      };
    });
  }
  proposal.sessions = workingSessions;

  const nextStage = getNextStage(
    currentStage,
    proposal.requires_ctsv_approval,
    proposal.requires_facility_approval,
    proposal.organization_unit
  );

  const actorName = auth.email;

  // Audit log — only written AFTER the stage change is persisted successfully
  const writeApprovalLog = async () => {
    const { error: logErr } = await supabase.from('proposal_logs').insert({
      proposal_id: proposal!.id,
      stage: currentStage,
      action: 'approved',
      actor_email: auth.email,
      actor_name: actorName,
      notes: notes || '',
    });
    if (logErr) {
      console.error('[approve] Failed to insert proposal log:', logErr);
    }
    addStoredProposalLog({
      proposal_id: proposal!.id,
      stage: currentStage,
      action: 'approved',
      actor_email: auth.email,
      actor_name: actorName,
      notes: notes || '',
    });
  };

  // If Final Stage reached (Auto-create Event)
  if (nextStage === 'approved') {
    let newEventId: string | null = null;
    let createFailureReason = '';
    try {
      const participantCount = Number(proposal.participant_count) || 0;
      const volunteerCount = Number((proposal as any).volunteer_count) || 0;

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
          is_registration_open: participantCount > 0,
        })
        .select()
        .maybeSingle();

      if (createEventErr) {
        console.error('[approve] Failed to create event:', createEventErr);
        createFailureReason = createEventErr.message || 'Không thể tạo sự kiện';
      }

      if (newEvent?.event_id) {
        newEventId = newEvent.event_id;

        // Decisions were already merged into workingSessions above
        const availableSessions: any[] = workingSessions;

        // When proposal is approved, mark all non-rejected sessions as approved
        for (const s of availableSessions) {
          if (s.status !== 'rejected') {
            s.status = 'approved';
          }
        }
        await saveProposalMeta(supabase, proposal.id, { sessions: availableSessions }).catch(() => {});

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
              room_id: s.room_id || null,
              room_name: s.room_name || null,
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
          is_recruitment_open: volunteerCount > 0 || Boolean((proposal as any).departments && (proposal as any).departments.length > 0),
          max_participants: participantCount,
          max_volunteers: volunteerCount,
        });

        await supabase.from('event_roles').insert({
          event_id: newEventId,
          email: proposal.created_by,
          role_type: 'event_admin',
        });

        // Also assign the managing unit (LCĐ/CLB) as event_admin so they can see the event
        if (proposal.organization_unit) {
          const matchedUnit = OFFICIAL_UNITS.find(
            (u) => u.name === proposal.organization_unit
          );
          if (matchedUnit?.email && matchedUnit.email.toLowerCase() !== proposal.created_by.toLowerCase()) {
            await supabase.from('event_roles').insert({
              event_id: newEventId,
              email: matchedUnit.email,
              role_type: 'event_admin',
            });
          }
        }
      }
    } catch (createErr) {
      console.error('Error auto-creating event from proposal:', createErr);
    }

    if (!newEventId) {
      return NextResponse.json({
        success: false,
        error: `Không thể tạo sự kiện từ kế hoạch nên chưa ghi nhận phê duyệt. ${createFailureReason}`.trim(),
      }, { status: 500 });
    }

    const { data: finalRows, error: finalUpdateErr } = await supabase
      .from('event_proposals')
      .update({
        status: 'approved',
        current_stage: 'approved',
        created_event_id: newEventId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', proposal.id)
      .select('id');

    if (finalUpdateErr || !finalRows || finalRows.length === 0) {
      console.error('[approve] Final update not persisted:', finalUpdateErr, 'rows:', finalRows?.length);
      return NextResponse.json({
        success: false,
        error: 'Đã tạo sự kiện nhưng không lưu được trạng thái phê duyệt vào cơ sở dữ liệu. Vui lòng liên hệ Super Admin.',
      }, { status: 500 });
    }

    await writeApprovalLog();

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

  // Else, advance to next stage — and VERIFY the row was really updated.
  // Supabase does not throw on RLS-blocked updates; it just affects 0 rows.
  const { data: stageRows, error: stageUpdateErr } = await supabase
    .from('event_proposals')
    .update({
      current_stage: nextStage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposal.id)
    .eq('current_stage', currentStage) // guard against double-approval races
    .select('id, current_stage');

  if (stageUpdateErr || !stageRows || stageRows.length === 0) {
    console.error('[approve] Stage update not persisted:', stageUpdateErr, 'rows:', stageRows?.length);
    return NextResponse.json({
      success: false,
      error: stageUpdateErr
        ? `Không lưu được kết quả duyệt: ${stageUpdateErr.message}`
        : 'Không lưu được kết quả duyệt (kế hoạch có thể đã được người khác xử lý hoặc tài khoản chưa được cấp quyền ghi). Vui lòng tải lại trang.',
    }, { status: 500 });
  }

  // Persist per-session decisions made at this stage
  if (hasSessionDecisions && workingSessions.length > 0) {
    await saveProposalMeta(supabase, proposal.id, { sessions: workingSessions }).catch((e) => {
      console.error('[approve] Failed to save session decisions:', e);
    });
  }

  await writeApprovalLog();

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
