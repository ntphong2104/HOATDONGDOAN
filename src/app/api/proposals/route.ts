import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { calculateProposalStages } from '@/lib/utils/proposal-logic';
import { sanitizeInput } from '@/lib/security/sanitizer';
import { resolveUnitForUser } from '@/lib/constants/units';
import { summarizeUnitRatings } from '@/lib/utils/rating-logic';
import { getStoredProposals, saveProposalToStore, addStoredProposalLog } from '@/lib/constants/proposals-store';
import { getHandoverRegistryFromDb } from '@/lib/constants/handover-store';
import { saveEventMeta, saveProposalMeta } from '@/lib/constants/event-meta-store';
import type { EventProposal } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const status = searchParams.get('status');

  const isSuperAdmin = auth.isSuperAdmin;
  const isApprover =
    isSuperAdmin ||
    auth.tier === 'youth_union' ||
    auth.tier === 'ctsv' ||
    auth.tier === 'facility' ||
    auth.tier === 'security' ||
    auth.email.includes('ctsv') ||
    auth.email.includes('quantri') ||
    auth.email.includes('tchc') ||
    auth.email.includes('tchcqt') ||
    auth.email.includes('csvc') ||
    auth.email.includes('baove') ||
    auth.email.includes('security');

  try {
    const supabase = await createAdminClient();

    let query = supabase
      .from('event_proposals')
      .select('*')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    if (!isApprover) {
      query = query.eq('created_by', auth.email);
    }

    if (stage) {
      query = query.eq('current_stage', stage);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const [
      { data: proposals, error },
      handoverDbResult,
      { data: allRatings }
    ] = await Promise.all([
      query,
      getHandoverRegistryFromDb(supabase).catch(() => ({})),
      supabase.from('unit_ratings').select('*')
    ]);

    if (!error && proposals) {
      let handoverDb: any = handoverDbResult;

      // Auto-heal: Ensure every approved proposal has an active event in events table
      for (const prop of proposals) {
        if (prop.status === 'approved' || prop.current_stage === 'approved') {
          try {
            let eventExists = false;
            if (prop.created_event_id && !prop.created_event_id.startsWith('ev-')) {
              const { data: ev } = await supabase
                .from('events')
                .select('event_id')
                .eq('event_id', prop.created_event_id)
                .maybeSingle();
              if (ev?.event_id) eventExists = true;
            }

            if (!eventExists) {
              const participantCount = Number(prop.participant_count) || 0;
              const volunteerCount = Number((prop as any).volunteer_count) || 0;
              const { data: newEv } = await supabase
                .from('events')
                .insert({
                  event_name: prop.title,
                  event_date: prop.start_date,
                  start_time: prop.start_time,
                  end_time: prop.end_time,
                  status: 'active',
                  is_active: true,
                  created_by: prop.created_by,
                  semester: prop.semester || 'Chưa xếp kỳ',
                  is_registration_open: participantCount > 0,
                })
                .select()
                .maybeSingle();

              if (newEv?.event_id) {
                prop.created_event_id = newEv.event_id;
                await saveEventMeta(supabase, newEv.event_id, {
                  departments: (prop as any).departments || [],
                  target_scope: (prop as any).target_scope || 'all',
                  is_recruitment_open: volunteerCount > 0 || Boolean((prop as any).departments && (prop as any).departments.length > 0),
                  max_participants: participantCount,
                  max_volunteers: volunteerCount,
                });
                await supabase.from('event_roles').insert({
                  event_id: newEv.event_id,
                  email: prop.created_by,
                  role_type: 'event_admin',
                });
                await supabase
                  .from('event_proposals')
                  .update({ created_event_id: newEv.event_id })
                  .eq('id', prop.id);
              }
            }
          } catch (healErr) {
            console.error('Auto-heal proposal event error:', healErr);
          }
        }
      }

      const stored = getStoredProposals();
      const storedMap = new Map(stored.map(s => [s.id, s]));

      const proposalsWithRatings = proposals.map((prop) => {
        const local = storedMap.get(prop.id);
        const dbHandover = handoverDb[prop.id];
        const summary = summarizeUnitRatings(allRatings || [], prop.organization_unit || 'Đơn vị tổ chức');
        return {
          ...prop,
          key_status: dbHandover?.key_status || prop.key_status || local?.key_status || 'pending',
          key_handed_at: dbHandover?.key_handed_at || prop.key_handed_at || local?.key_handed_at || null,
          key_handed_by: dbHandover?.key_handed_by || prop.key_handed_by || local?.key_handed_by || null,
          key_returned_at: dbHandover?.key_returned_at || prop.key_returned_at || local?.key_returned_at || null,
          key_returned_by: dbHandover?.key_returned_by || prop.key_returned_by || local?.key_returned_by || null,
          ratingSummary: summary,
        };
      });
      return NextResponse.json({ success: true, data: proposalsWithRatings });
    }
  } catch {}

  // Fallback to local proposals store
  let stored = getStoredProposals().filter(p => p.status !== ('deleted' as any));
  if (!isApprover) {
    stored = stored.filter(p => p.created_by.toLowerCase() === auth.email.toLowerCase());
  }
  if (stage) {
    stored = stored.filter(p => p.current_stage === stage);
  }
  if (status) {
    stored = stored.filter(p => p.status === status);
  }

  const mapped = stored.map((prop) => ({
    ...prop,
    ratingSummary: summarizeUnitRatings([], prop.organization_unit || 'Đơn vị tổ chức'),
  }));

  return NextResponse.json({ success: true, data: mapped });
}

export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(`proposal_create_${auth.email}`, 5, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: `Thao tác quá nhanh, thử lại sau ${rateLimit.resetInSeconds} giây` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
    );
  }

  try {
    const body = await req.json();
    const {
      title,
      organization_unit = 'Liên Chi Đoàn',
      description = '',
      plan_url = '',
      start_date,
      start_time,
      end_date,
      end_time,
      participant_count = 0,
      volunteer_count = 0,
      organizer_count = 0,
      room_id = null,
      room_name = 'Không mượn',
      sessions = [],
    } = body;

    // Sanitize description and plan_url
    const sanitizedDescription = description ? sanitizeInput(String(description).slice(0, 5000)) : null;
    let sanitizedPlanUrl: string | null = null;
    if (plan_url && typeof plan_url === 'string' && plan_url.trim()) {
      let rawUrl = plan_url.trim();
      if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
        rawUrl = `https://${rawUrl}`;
      }
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          sanitizedPlanUrl = parsed.toString();
        }
      } catch {}
    }

    // ── Server-side: enforce organization_unit for non-super-admin ──
    const isPrivileged =
      auth.isSuperAdmin ||
      auth.tier === 'youth_union' ||
      auth.email.toLowerCase().includes('bchdoan');

    let finalOrganizationUnit = organization_unit;
    if (!isPrivileged) {
      const resolved = resolveUnitForUser(auth);
      finalOrganizationUnit = resolved.unitName;
    }

    const sanitizedTitle = sanitizeInput(title);
    if (!sanitizedTitle) {
      return NextResponse.json({ success: false, error: 'Tên chương trình không được để trống' }, { status: 400 });
    }

    // Block automated security scanner fuzzing / injection payloads
    const suspiciousPatterns = [
      /jndi:/i,
      /prbly/i,
      /file_get_contents/i,
      /sleep\(/i,
      /bindec\(/i,
      /eval\(/i,
      /<script/i,
      /global\.process/i,
      /require\(/i,
      /\ufffd/,
      /\$\{/,
    ];
    if (suspiciousPatterns.some((pattern) => pattern.test(title) || pattern.test(finalOrganizationUnit) || pattern.test(room_name))) {
      return NextResponse.json({ success: false, error: 'Phát hiện ký tự hoặc cú pháp không hợp lệ' }, { status: 400 });
    }

    if (!start_date || !start_time || !end_date || !end_time) {
      return NextResponse.json({ success: false, error: 'Vui lòng nhập đầy đủ thời gian bắt đầu và kết thúc' }, { status: 400 });
    }

    const startDatetime = new Date(`${start_date}T${start_time}`);
    const endDatetime = new Date(`${end_date}T${end_time}`);

    if (isNaN(startDatetime.getTime()) || isNaN(endDatetime.getTime())) {
      return NextResponse.json({ success: false, error: 'Định dạng ngày giờ không hợp lệ' }, { status: 400 });
    }

    // Reject past date events (allow 10 min buffer for server clock differences)
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    if (startDatetime < tenMinutesAgo) {
      return NextResponse.json({
        success: false,
        error: '🚫 Thời gian bắt đầu sự kiện không thể ở trong quá khứ! Vui lòng chọn ngày và giờ hiện tại hoặc tương lai.'
      }, { status: 400 });
    }

    if (endDatetime <= startDatetime) {
      return NextResponse.json({ success: false, error: '🚫 Thời gian kết thúc phải diễn ra sau thời gian bắt đầu' }, { status: 400 });
    }

    const participants = Math.max(0, parseInt(String(participant_count), 10) || 0);
    const volunteers = Math.max(0, parseInt(String(volunteer_count), 10) || 0);
    const organizers = Math.max(0, parseInt(String(organizer_count), 10) || 0);
    const totalCount = participants + volunteers + organizers;

    const supabase = await createAdminClient();

    // Server-side Conflict Check for main room and all individual sessions
    if (room_id && room_name !== 'Không mượn') {
      const { data: conflicts } = await supabase
        .from('event_proposals')
        .select('id, title, start_datetime, end_datetime')
        .eq('room_id', room_id)
        .neq('status', 'rejected')
        .neq('status', 'deleted')
        .lt('start_datetime', endDatetime.toISOString())
        .gt('end_datetime', startDatetime.toISOString());

      if (conflicts && conflicts.length > 0) {
        return NextResponse.json({
          success: false,
          error: `Phòng "${room_name}" đã bị trùng lịch với chương trình "${conflicts[0].title}". Vui lòng chọn phòng hoặc thời gian khác!`,
        }, { status: 409 });
      }
    }

    // Validate sessions conflicts
    const normalizedSessions: any[] = [];
    if (Array.isArray(sessions) && sessions.length > 0) {
      for (const sess of sessions) {
        if (!sess.name || !sess.session_date) continue;
        const sessStart = sess.start_time || '08:00';
        const sessEnd = sess.end_time || '11:30';
        const sessStartDt = new Date(`${sess.session_date}T${sessStart}`);
        const sessEndDt = new Date(`${sess.session_date}T${sessEnd}`);

        if (sess.room_id && sess.room_name && sess.room_name !== 'Không mượn' && !isNaN(sessStartDt.getTime()) && !isNaN(sessEndDt.getTime())) {
          const { data: conflicts } = await supabase
            .from('event_proposals')
            .select('id, title')
            .eq('room_id', sess.room_id)
            .neq('status', 'rejected')
            .neq('status', 'deleted')
            .lt('start_datetime', sessEndDt.toISOString())
            .gt('end_datetime', sessStartDt.toISOString());

          if (conflicts && conflicts.length > 0) {
            return NextResponse.json({
              success: false,
              error: `Phòng "${sess.room_name}" trong ca "${sess.name}" (${sess.session_date}) đã bị trùng lịch với chương trình "${conflicts[0].title}". Vui lòng chọn phòng hoặc thời gian khác!`,
            }, { status: 409 });
          }
        }

        normalizedSessions.push({
          id: sess.id || `sess_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: sess.name.trim(),
          session_date: sess.session_date,
          start_time: sessStart,
          end_time: sessEnd,
          room_id: sess.room_id || null,
          room_name: sess.room_name || 'Không mượn',
          participant_count: Number(sess.participant_count) || participants,
          purpose: sess.purpose || '',
          status: 'pending',
        });
      }
    }

    // Calculate smart stages (Khoa pushes directly to Phòng. TC-HC-QT)
    const { requiresCtsv, requiresFacility, initialStage, isDirectFaculty } = calculateProposalStages(
      participants,
      room_id,
      room_name,
      finalOrganizationUnit,
      normalizedSessions
    );

    // Insert proposal
    let insertPayload: any = {
      title: sanitizedTitle,
      created_by: auth.email,
      organization_unit: sanitizeInput(finalOrganizationUnit) || 'Liên Chi Đoàn',
      description: sanitizedDescription,
      plan_url: sanitizedPlanUrl,
      start_date,
      start_time,
      end_date,
      end_time,
      start_datetime: startDatetime.toISOString(),
      end_datetime: endDatetime.toISOString(),
      participant_count: participants,
      volunteer_count: volunteers,
      organizer_count: organizers,
      total_count: totalCount,
      room_id: room_id || null,
      room_name: room_name || 'Không mượn',
      requires_ctsv_approval: requiresCtsv,
      requires_facility_approval: requiresFacility,
      current_stage: initialStage,
      status: 'pending',
    };

    let newProposal: any = null;

    try {
      let { data: createdProp, error: insertErr } = await supabase
        .from('event_proposals')
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr && (insertErr.message?.includes('description') || insertErr.message?.includes('plan_url'))) {
        delete insertPayload.description;
        delete insertPayload.plan_url;
        const retry = await supabase
          .from('event_proposals')
          .insert(insertPayload)
          .select()
          .single();
        createdProp = retry.data;
        insertErr = retry.error;
      }

      if (!insertErr && createdProp) {
        newProposal = {
          ...createdProp,
          sessions: normalizedSessions,
          description: sanitizedDescription,
          plan_url: sanitizedPlanUrl,
        };

        // Persist proposal sessions and metadata into Supabase system_settings
        await saveProposalMeta(supabase, createdProp.id, {
          sessions: normalizedSessions,
          description: sanitizedDescription,
          plan_url: sanitizedPlanUrl,
        });
        saveProposalToStore(newProposal);

        try {
          await supabase.from('proposal_logs').insert({
            proposal_id: newProposal.id,
            stage: initialStage,
            action: 'comment',
            actor_email: auth.email,
            actor_name: auth.email,
            notes: isDirectFaculty
              ? `Đơn vị ${finalOrganizationUnit} nộp đơn mượn địa điểm "${sanitizedTitle}". Đã chuyển thẳng đến Phòng. TC-HC-QT phê duyệt cấp phòng: ${room_name}.`
              : `Đã nộp kế hoạch "${sanitizedTitle}". Dự kiến quy mô: ${totalCount} người (${participants} SV, ${volunteers} CTV, ${organizers} BTC). Địa điểm: ${room_name}.`,
          });
        } catch {}
      }
    } catch {}

    // If Supabase unavailable or returned no data, persist to local store
    if (!newProposal) {
      const generatedId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      newProposal = {
        ...insertPayload,
        id: generatedId,
        sessions: normalizedSessions,
        description: sanitizedDescription,
        plan_url: sanitizedPlanUrl,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await saveProposalMeta(supabase, generatedId, {
        sessions: normalizedSessions,
        description: sanitizedDescription,
        plan_url: sanitizedPlanUrl,
      });
      saveProposalToStore(newProposal);
      addStoredProposalLog({
        proposal_id: generatedId,
        stage: initialStage,
        action: 'comment',
        actor_email: auth.email,
        actor_name: auth.email,
        notes: isDirectFaculty
          ? `Đơn vị ${finalOrganizationUnit} nộp đơn mượn địa điểm "${sanitizedTitle}". Đã chuyển thẳng đến Phòng. TC-HC-QT phê duyệt cấp phòng: ${room_name}.`
          : `Đã nộp kế hoạch "${sanitizedTitle}". Dự kiến quy mô: ${totalCount} người (${participants} SV, ${volunteers} CTV, ${organizers} BTC). Địa điểm: ${room_name}.`,
      });
    }

    return NextResponse.json({
      success: true,
      data: newProposal,
      message: isDirectFaculty
        ? `Đã gửi đơn mượn phòng thành công! Hồ sơ đã được chuyển thẳng đến Phòng. TC-HC-QT để thẩm định và cấp phòng: ${room_name}.`
        : 'Đã gửi kế hoạch thành công! Đang chờ Đoàn TNCS Học Viện phê duyệt.',
    });
  } catch (err: any) {
    console.error('Error in POST /api/proposals:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}
