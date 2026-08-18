import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { calculateProposalStages } from '@/lib/utils/proposal-logic';
import { sanitizeInput } from '@/lib/security/sanitizer';
import { resolveUnitForUser } from '@/lib/constants/units';
import { summarizeUnitRatings } from '@/lib/utils/rating-logic';

export async function GET(req: Request) {
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get('stage');
  const status = searchParams.get('status');

  const supabase = await createClient();

  // Check if super admin
  const isSuperAdmin = auth.isSuperAdmin;
  const isApprover =
    isSuperAdmin ||
    auth.tier === 'youth_union' ||
    auth.tier === 'ctsv' ||
    auth.tier === 'facility' ||
    auth.tier === 'security' ||
    auth.email.includes('doanthanhnien') ||
    auth.email.includes('ctsv') ||
    auth.email.includes('quantri') ||
    auth.email.includes('csvc') ||
    auth.email.includes('baove') ||
    auth.email.includes('security');

  let query = supabase
    .from('event_proposals')
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false });

  // Only filter by created_by if regular student or event admin
  if (!isApprover) {
    query = query.eq('created_by', auth.email);
  }

  if (stage) {
    query = query.eq('current_stage', stage);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data: proposals, error } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  // Fetch all unit ratings to compute warnings
  const { data: allRatings } = await supabase
    .from('unit_ratings')
    .select('*');

  const proposalsWithRatings = (proposals || []).map((prop) => {
    const summary = summarizeUnitRatings(allRatings || [], prop.organization_unit || 'Đơn vị tổ chức');
    return {
      ...prop,
      ratingSummary: summary,
    };
  });

  return NextResponse.json({ success: true, data: proposalsWithRatings });
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
      auth.email.toLowerCase().includes('doanthanhnien') ||
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

    const supabase = await createClient();

    // Server-side Conflict Check if borrowing room
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

    // Calculate smart stages
    const { requiresCtsv, requiresFacility } = calculateProposalStages(
      participants,
      room_id,
      room_name
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
      current_stage: 'youth_union',
      status: 'pending',
    };

    let { data: newProposal, error: insertErr } = await supabase
      .from('event_proposals')
      .insert(insertPayload)
      .select()
      .single();

    // Fallback if schema doesn't yet have description/plan_url columns in live DB
    if (insertErr && (insertErr.message?.includes('description') || insertErr.message?.includes('plan_url'))) {
      delete insertPayload.description;
      delete insertPayload.plan_url;
      const retry = await supabase
        .from('event_proposals')
        .insert(insertPayload)
        .select()
        .single();
      newProposal = retry.data;
      insertErr = retry.error;
    }

    if (insertErr) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
    }

    // Insert initial audit log
    await supabase.from('proposal_logs').insert({
      proposal_id: newProposal.id,
      stage: 'ctsv',
      action: 'comment',
      actor_email: auth.email,
      actor_name: auth.email,
      notes: `Đã nộp kế hoạch "${sanitizedTitle}". Dự kiến quy mô: ${totalCount} người (${participants} SV, ${volunteers} CTV, ${organizers} BTC). Địa điểm: ${room_name}.`,
    });

    return NextResponse.json({
      success: true,
      data: newProposal,
      message: 'Đã gửi kế hoạch thành công! Đang chờ Phòng Công Tác Sinh Viên (CTSV) phê duyệt.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }
}
