import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';
import { getEventMeta, getRegistrationExtras, saveRegistrationExtra } from '@/lib/constants/event-meta-store';
import { getUserProfileExtra } from '@/lib/constants/user-profile-store';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  const supabase = await createClient();

  // Fetch event details
  const { data: rawEvent, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .maybeSingle();

  if (eventErr || !rawEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const meta = await getEventMeta(supabase, resolvedParams.id);
  const event = {
    ...rawEvent,
    departments: meta.departments || [],
    is_recruitment_open: meta.is_recruitment_open !== false,
    target_scope: meta.target_scope || 'all',
    max_participants: meta.max_participants || 0,
    max_volunteers: meta.max_volunteers || 0,
  };

  // Count total registrations
  const { count: totalRegistered } = await supabase
    .from('event_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('event_id', resolvedParams.id);

  let registrationWindow = isRegistrationWindowOpen(
    event.event_date,
    event.start_time,
    event.status,
    event.is_registration_open
  );

  if (event.is_registration_open === false || event.status !== 'active') {
    registrationWindow = {
      isOpen: false,
      reason: 'Sự kiện này không mở cổng đăng ký người tham gia (Chỉ dành cho Ban Tổ Chức & Cộng Tác Viên).',
    };
  } else if (event.max_participants > 0 && (totalRegistered || 0) >= event.max_participants) {
    registrationWindow = {
      isOpen: false,
      reason: `Sự kiện đã đủ số lượng sinh viên đăng ký (${totalRegistered}/${event.max_participants} sinh viên). Cổng đăng ký đã tự động đóng!`,
    };
  }

  const regExtras = await getRegistrationExtras(supabase, resolvedParams.id);

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
      .maybeSingle();

    if (reg) {
      const extra = regExtras[mssv.toUpperCase()] || {};
      myRegistration = {
        ...reg,
        department_id: extra.department_id || reg.department_id || null,
        department_name: extra.department_name || reg.department_name || null,
        gender: extra.gender || reg.gender || 'Nam',
        phone: extra.phone || reg.phone || '',
        note: extra.note || reg.note || '',
        review_status: extra.review_status || reg.review_status || (reg.role_type === 'volunteer' ? 'pending' : 'accepted'),
      };
    }

    // Check penalty status
    const { data: penalty } = await supabase
      .from('user_penalties')
      .select('*')
      .eq('mssv', mssv)
      .maybeSingle();

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

    const mssvList = (list || []).map((r) => r.mssv).filter(Boolean);
    const { data: userProfiles } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .in('mssv', mssvList);

    const userProfileMap = new Map((userProfiles || []).map((u) => [u.mssv.toUpperCase(), u]));

    allRegistrations = (list || []).map((r) => {
      const extra = regExtras[(r.mssv || '').toUpperCase()] || {};
      const uProfile = userProfileMap.get((r.mssv || '').toUpperCase());
      const realName = (uProfile?.full_name && !uProfile.full_name.includes('@'))
        ? uProfile.full_name
        : (r.full_name && !r.full_name.includes('@'))
        ? r.full_name
        : uProfile?.full_name || r.full_name || r.mssv;

      const realClass = uProfile?.class_id || r.class_id || 'PTIT-HCM';

      return {
        ...r,
        full_name: realName,
        class_id: realClass,
        department_id: extra.department_id || r.department_id || null,
        department_name: extra.department_name || r.department_name || null,
        gender: extra.gender || r.gender || 'Nam',
        phone: extra.phone || r.phone || '',
        note: extra.note || r.note || '',
        review_status: extra.review_status || r.review_status || (r.role_type === 'volunteer' ? 'pending' : 'accepted'),
      };
    });
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
  const { data: rawEvent, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('event_id', resolvedParams.id)
    .maybeSingle();

  if (eventErr || !rawEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const meta = await getEventMeta(supabase, resolvedParams.id);
  const event = {
    ...rawEvent,
    departments: meta.departments || [],
    is_recruitment_open: meta.is_recruitment_open !== false,
    target_scope: meta.target_scope || 'all',
  };

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
    .maybeSingle();

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
    .or(`email.ilike.${auth.email},mssv.ilike.${mssv}`)
    .maybeSingle();

  let resolvedFullName = (userProfile?.full_name && !userProfile.full_name.includes('@'))
    ? userProfile.full_name
    : null;

  if (!resolvedFullName) {
    const rawName = (auth as any).user_metadata?.full_name || (auth as any).user_metadata?.name;
    if (rawName) {
      const match = rawName.match(/^([A-Z]\d{2}[A-Z0-9-]+)\s+(.+)$/i);
      resolvedFullName = match ? match[2].trim() : rawName;
    }
  }

  const finalFullName = resolvedFullName || mssv;
  const finalClassId = userProfile?.class_id || 'PTIT-HCM';

  const body = await req.json().catch(() => ({}));
  const role_type = body.role_type === 'volunteer' ? 'volunteer' : 'participant';
  const gender = body.gender || userProfile?.gender || 'Nam';
  const phone = body.phone !== undefined ? body.phone : userProfile?.phone || '';
  const note = body.note || '';
  const department_id = body.department_id || null;
  let department_name = body.department_name || null;

  // Check phone number from profile store as fallback
  const profileExtra = getUserProfileExtra(auth.email) || getUserProfileExtra(mssv);
  const resolvedPhone = phone || profileExtra?.phone || '';

  // Require phone number for registration
  if (!resolvedPhone || resolvedPhone.trim().length < 8) {
    return NextResponse.json({
      success: false,
      error: 'Bạn chưa cập nhật Số Điện Thoại / Zalo. Vui lòng cập nhật SĐT trong hồ sơ cá nhân trước khi đăng ký sự kiện.',
      require_phone: true,
    }, { status: 400 });
  }

  // Validate participant registration availability
  if (role_type === 'participant') {
    if (event.is_registration_open === false || event.status !== 'active') {
      return NextResponse.json({
        success: false,
        error: 'Sự kiện này không mở cổng đăng ký người tham gia / khán giả.',
      }, { status: 400 });
    }

    if (event.max_participants && event.max_participants > 0) {
      const { count: currentParticipantCount } = await supabase
        .from('event_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', resolvedParams.id)
        .eq('role_type', 'participant');

      if ((currentParticipantCount || 0) >= event.max_participants) {
        return NextResponse.json({
          success: false,
          error: `Sự kiện đã đủ số lượng sinh viên tham gia quy định (${currentParticipantCount}/${event.max_participants} sinh viên). Cổng đăng ký đã tự động đóng!`,
        }, { status: 400 });
      }
    }
  }

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

  // 4. Register for the event (Insert standard Postgres columns safely)
  const review_status = role_type === 'volunteer' ? 'pending' : 'accepted';

  const { data: reg, error: regErr } = await supabase
    .from('event_registrations')
    .upsert(
      {
        event_id: resolvedParams.id,
        email: auth.email,
        mssv: mssv,
        full_name: finalFullName,
        class_id: finalClassId,
        role_type,
        attended: false,
      },
      { onConflict: 'event_id,mssv' }
    )
    .select()
    .maybeSingle();

  if (regErr) {
    console.error('Registration database error:', regErr);
    return NextResponse.json({ success: false, error: 'Lỗi đăng ký trong cơ sở dữ liệu' }, { status: 500 });
  }

  // Save extra attributes (departments, review status, notes) in persistent meta store
  await saveRegistrationExtra(supabase, resolvedParams.id, mssv, {
    department_id,
    department_name,
    gender,
    phone,
    note,
    review_status,
  });

  const responseData = {
    ...(reg || {}),
    department_id,
    department_name,
    gender,
    phone,
    note,
    review_status,
  };

  return NextResponse.json({
    success: true,
    data: responseData,
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
