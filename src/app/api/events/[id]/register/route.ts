import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  const supabase = await createClient();

  // Fetch event details
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const registrationWindow = isRegistrationWindowOpen(
    event.event_date,
    event.start_time,
    event.status,
    event.is_registration_open
  );

  // Count total registrations
  const { count: totalRegistered } = await supabase
    .from('event_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', resolvedParams.id);

  let myRegistration = null;
  let penaltyStatus = null;

  if (auth?.email) {
    const mssv = extractMSSV(auth.email) || auth.email;

    // Check my registration
    const { data: reg } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', resolvedParams.id)
      .eq('email', auth.email)
      .single();

    myRegistration = reg;

    // Check penalty status
    const { data: penalty } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', mssv)
      .single();

    penaltyStatus = penalty;
  }

  // If Admin, fetch all registrations for this event
  let allRegistrations = undefined;
  if (auth?.isSuperAdmin || auth?.isEventAdmin) {
    const { data: list } = await supabase
      .from('event_registrations')
      .select('*')
      .eq('event_id', resolvedParams.id)
      .order('created_at', { ascending: false });

    allRegistrations = list || [];
  }

  return NextResponse.json({
    success: true,
    data: {
      event,
      registrationWindow,
      totalRegistered: totalRegistered || 0,
      myRegistration,
      penaltyStatus,
      allRegistrations,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Vui lòng đăng nhập để đăng ký' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(`event_register_${auth.email}`, 10, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: `Thao tác quá nhanh, thử lại sau ${rateLimit.resetInSeconds} giây` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
    );
  }

  const supabase = await createClient();

  // 1. Verify Event Exists and is Active
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .single();

  if (eventErr || !event) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const registrationWindow = isRegistrationWindowOpen(
    event.event_date,
    event.start_time,
    event.status,
    event.is_registration_open
  );
  if (!registrationWindow.isOpen) {
    return NextResponse.json({
      success: false,
      error: registrationWindow.reason || 'Cổng đăng ký đã đóng.',
    }, { status: 400 });
  }

  const mssv = extractMSSV(auth.email) || auth.email;

  // 2. CHECK BLACKLIST (Crucial requirement!)
  const { data: penalty } = await supabase
    .from('user_penalties')
    .select('*')
    .eq('mssv', mssv)
    .single();

  if (penalty?.is_blacklisted) {
    return NextResponse.json({
      success: false,
      error: `Tài khoản của bạn (${mssv}) đang bị KHÓA ĐĂNG KÝ (Blacklist) do vắng mặt ${penalty.missed_count} lần trong các sự kiện trước đó. Vui lòng liên hệ Văn phòng Đoàn để được xem xét mở khóa.`,
      is_blacklisted: true,
    }, { status: 403 });
  }

  // 3. Get User Profile info
  const { data: userProfile } = await supabase
    .from('users')
    .select('full_name, class_id, gender, phone')
    .eq('email', auth.email)
    .single();

  const body = await req.json().catch(() => ({}));
  const role_type = body.role_type === 'volunteer' ? 'volunteer' : 'participant';
  const gender = body.gender || userProfile?.gender || 'Nam';
  const phone = body.phone !== undefined ? body.phone : userProfile?.phone || '';
  const note = body.note || '';
  const department_id = body.department_id || null;
  let department_name = body.department_name || null;

  // Validate recruitment window and department quota if applying for CTV
  if (role_type === 'volunteer') {
    if (event.is_recruitment_open === false) {
      return NextResponse.json({
        success: false,
        error: 'Cổng tuyển dụng Ban chuyên trách & CTV đã đóng theo quyết định của Ban tổ chức.',
      }, { status: 400 });
    }

    // CTV recruitment closes 24h prior to event start
    if (event.event_date && event.start_time) {
      const eventStart = new Date(`${event.event_date}T${event.start_time}:00`);
      const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
      const hoursRemaining = (eventStart.getTime() - nowVN.getTime()) / (1000 * 60 * 60);
      if (hoursRemaining < 24 && event.status === 'active') {
        return NextResponse.json({
          success: false,
          error: 'Cổng tuyển dụng CTV đã đóng (quy định đóng trước 24 giờ để Ban tổ chức hoàn tất công tác tổ chức).',
        }, { status: 400 });
      }
    }

    if (department_id && Array.isArray(event.departments)) {
      const dept = event.departments.find((d: any) => d.id === department_id);
      if (dept) {
        department_name = dept.name;

        // Check gender requirement
        if (dept.gender_req === 'male' && gender === 'Nữ') {
          return NextResponse.json({
            success: false,
            error: `Vị trí "${dept.name}" ưu tiên ứng viên Nam. Bạn vui lòng chọn Ban khác phù hợp hơn nhé!`,
          }, { status: 400 });
        }
        if (dept.gender_req === 'female' && gender === 'Nam') {
          return NextResponse.json({
            success: false,
            error: `Vị trí "${dept.name}" ưu tiên ứng viên Nữ. Bạn vui lòng chọn Ban khác phù hợp hơn nhé!`,
          }, { status: 400 });
        }

        // Check department quota
        const { count: acceptedInDept } = await supabase
          .from('event_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', resolvedParams.id)
          .eq('department_id', department_id)
          .eq('review_status', 'accepted');

        if (dept.quota && (acceptedInDept || 0) >= dept.quota) {
          return NextResponse.json({
            success: false,
            error: `Vị trí "${dept.name}" đã đủ chỉ tiêu trúng tuyển (${acceptedInDept}/${dept.quota}). Bạn vui lòng chọn Ban khác còn chỗ nhé!`,
          }, { status: 400 });
        }
      }
    }
  }

  // Update user phone / gender in background
  if (body.gender || body.phone) {
    try {
      await supabase.from('users').update({
        gender,
        phone,
      }).eq('email', auth.email);
    } catch {}
  }

  // 4. Register for the event
  const { data: reg, error: regErr } = await supabase
    .from('event_registrations')
    .upsert(
      {
        event_id: resolvedParams.id,
        email: auth.email,
        mssv: mssv,
        full_name: userProfile?.full_name || auth.email,
        class_id: userProfile?.class_id || 'PTIT-HCM',
        role_type,
        department_id,
        department_name,
        gender,
        phone,
        note,
        review_status: role_type === 'volunteer' ? 'pending' : 'accepted',
        attended: false,
      },
      { onConflict: 'event_id,mssv' }
    )
    .select()
    .single();

  if (regErr) {
    console.error('Registration error:', regErr);
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: reg,
    message:
      role_type === 'volunteer'
        ? `Đã gửi đơn ứng tuyển vào "${department_name || 'Ban CTV'}" thành công! Ban tổ chức sẽ duyệt hồ sơ của bạn.`
        : 'Đăng ký tham gia sự kiện thành công!',
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();
  const mssv = extractMSSV(auth.email) || auth.email;

  const { error } = await supabase
    .from('event_registrations')
    .delete()
    .eq('event_id', resolvedParams.id)
    .eq('mssv', mssv);

  if (error) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Đã hủy đăng ký thành công' });
}
