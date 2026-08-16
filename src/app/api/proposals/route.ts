import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { calculateProposalStages } from '@/lib/utils/proposal-logic';
import { sanitizeInput } from '@/lib/security/sanitizer';

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
    auth.email.includes('doanthanhnien') ||
    auth.email.includes('ctsv') ||
    auth.email.includes('quantri') ||
    auth.email.includes('csvc');

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

  const { summarizeUnitRatings } = await import('@/lib/utils/rating-logic');

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

    // ── Server-side: enforce organization_unit for non-super-admin ──
    const EMAIL_TO_UNIT: Record<string, string> = {
      'doanthanhnien@ptithcm.edu.vn': 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
      'lcdcntt@student.ptithcm.edu.vn': 'LCĐ Khoa Công nghệ Thông tin',
      'lcdcndpt@student.ptithcm.edu.vn': 'LCĐ Công nghệ Đa phương tiện',
      'lcdattt@student.ptithcm.edu.vn': 'LCĐ An toàn Thông tin',
      'lcdvt@student.ptithcm.edu.vn': 'LCĐ Khoa Viễn thông',
      'lcddt@student.ptithcm.edu.vn': 'LCĐ Khoa Điện tử',
      'lcdqtkd@student.ptithcm.edu.vn': 'LCĐ Khoa Quản trị Kinh doanh',
      'lcdmkt@student.ptithcm.edu.vn': 'LCĐ Marketing',
      'lcdketoan@student.ptithcm.edu.vn': 'LCĐ Kế toán',
      'clb.itmc@student.ptithcm.edu.vn': 'CLB ITMC',
      'clb.antoanthongtin@student.ptithcm.edu.vn': 'CLB An toàn Thông tin',
      'clb.tienganh@student.ptithcm.edu.vn': 'CLB Tiếng Anh',
      'doivannghe@student.ptithcm.edu.vn': 'Đội Văn Nghệ',
      'clb.guitar@student.ptithcm.edu.vn': 'CLB Guitar',
      'doisinhvientinhnguyen@student.ptithcm.edu.vn': 'Đội Sinh Viên Tình Nguyện',
      'clb.ketnoi@student.ptithcm.edu.vn': 'CLB Kết Nối',
      'clb.truyenthongcmc@student.ptithcm.edu.vn': 'CLB C.MC',
      'clb.37dosinhvien@student.ptithcm.edu.vn': 'CLB 37 Độ Sinh viên',
      'clb.bma@student.ptithcm.edu.vn': 'CLB BMA',
      'clb.bongchuyen@student.ptithcm.edu.vn': 'CLB Bóng Chuyền',
      'clbbongda@student.ptithcm.edu.vn': 'CLB Bóng Đá',
      'clb.bongro@student.ptithcm.edu.vn': 'CLB Bóng Rổ',
      'clb.vovinam@student.ptithcm.edu.vn': 'CLB VOVINAM',
      'clb.covua@student.ptithcm.edu.vn': 'CLB Cờ',
      'clb.caulong@student.ptithcm.edu.vn': 'CLB Cầu Lông',
    };

    const isPrivileged =
      auth.isSuperAdmin ||
      auth.tier === 'youth_union' ||
      auth.email.toLowerCase().includes('doanthanhnien');

    let finalOrganizationUnit = organization_unit;
    if (!isPrivileged) {
      const userUnit = EMAIL_TO_UNIT[auth.email.toLowerCase()];
      if (userUnit) {
        // Force to the user's own unit regardless of what was sent
        finalOrganizationUnit = userUnit;
      }
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

    if (endDatetime <= startDatetime) {
      return NextResponse.json({ success: false, error: 'Thời gian kết thúc phải sau thời gian bắt đầu' }, { status: 400 });
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
    const { data: newProposal, error: insertErr } = await supabase
      .from('event_proposals')
      .insert({
        title: sanitizedTitle,
        created_by: auth.email,
        organization_unit: sanitizeInput(finalOrganizationUnit) || 'Liên Chi Đoàn',
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
      })
      .select()
      .single();

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
