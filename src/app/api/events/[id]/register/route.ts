import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { extractMSSV, isValidMSSV } from '@/lib/utils/extract-mssv';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';
import { getEventMeta, getRegistrationExtras, saveRegistrationExtra } from '@/lib/constants/event-meta-store';
import { getUserProfileExtraWithFallback } from '@/lib/constants/user-profile-store';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const auth = await getAuthContext();
  const supabase = await createClient();

  const mssv = auth?.email ? extractMSSV(auth.email) || auth.email : null;
  const isAdmin = auth?.isSuperAdmin || auth?.isEventAdmin;

  // Parallelize all independent queries
  const [
    { data: rawEvent, error: eventErr },
    meta,
    { count: totalRegistered },
    regExtras,
    { data: reg },
    { data: penalty },
    { data: list },
    { data: checkinList }
  ] = await Promise.all([
    supabase.from('events').select('*').eq('event_id', resolvedParams.id).maybeSingle(),
    getEventMeta(supabase, resolvedParams.id),
    supabase.from('event_registrations').select('*', { count: 'exact', head: true }).eq('event_id', resolvedParams.id),
    getRegistrationExtras(supabase, resolvedParams.id),
    auth?.email
      ? supabase.from('event_registrations').select('*').eq('event_id', resolvedParams.id).eq('email', auth.email).maybeSingle()
      : Promise.resolve({ data: null }),
    mssv
      ? supabase.from('user_penalties').select('*').eq('mssv', mssv).maybeSingle()
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from('event_registrations').select('*').eq('event_id', resolvedParams.id).order('created_at', { ascending: false })
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from('check_ins').select('mssv').eq('event_id', resolvedParams.id)
      : Promise.resolve({ data: null })
  ]);

  if (eventErr || !rawEvent) {
    return NextResponse.json({ success: false, error: 'Không tìm thấy sự kiện' }, { status: 404 });
  }

  const event = {
    ...rawEvent,
    departments: meta.departments || [],
    is_recruitment_open: meta.is_recruitment_open !== false,
    target_scope: meta.target_scope || 'all',
    max_participants: meta.max_participants || 0,
    max_volunteers: meta.max_volunteers || 0,
  };

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

  let myRegistration = null;
  let penaltyStatus = penalty || null;

  if (auth?.email && mssv && reg) {
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

  // If Admin, fetch all registrations for this event
  let allRegistrations = undefined;
  if (isAdmin && list) {
    const mssvList = list.map((r: any) => r.mssv).filter(Boolean);
    const { data: userProfiles } = await supabase
      .from('users')
      .select('mssv, full_name, class_id')
      .in('mssv', mssvList);

    const userProfileMap = new Map((userProfiles || []).map((u) => [u.mssv.toUpperCase(), u]));

    const checkInMssvSet = new Set((checkinList || []).map((c: any) => (c.mssv || '').toUpperCase().trim()));
    const needsAttendedUpdate: string[] = [];

    allRegistrations = (list || []).map((r) => {
      const extra = regExtras[(r.mssv || '').toUpperCase()] || {};
      const uProfile = userProfileMap.get((r.mssv || '').toUpperCase());
      const realName = (uProfile?.full_name && !uProfile.full_name.includes('@'))
        ? uProfile.full_name
        : (r.full_name && !r.full_name.includes('@'))
        ? r.full_name
        : uProfile?.full_name || r.full_name || r.mssv;

      const realClass = uProfile?.class_id || r.class_id || 'PTIT-HCM';
      const cleanMssv = (r.mssv || '').toUpperCase().trim();
      const isAttended = Boolean(r.attended || checkInMssvSet.has(cleanMssv));

      if (isAttended && !r.attended) {
        needsAttendedUpdate.push(r.mssv);
      }

      return {
        ...r,
        attended: isAttended,
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

    if (needsAttendedUpdate.length > 0) {
      Promise.resolve(
        supabase
          .from('event_registrations')
          .update({ attended: true })
          .eq('event_id', resolvedParams.id)
          .in('mssv', needsAttendedUpdate)
      ).catch(() => {});
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      event,
      registrationWindow,
      totalRegistered: totalRegistered || 0,
      myRegistration,
      penaltyStatus,
      allRegistrations: allRegistrations
        ? allRegistrations.filter((r: any) => isValidMSSV(r.mssv || ''))
        : undefined,
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
    max_participants: meta.max_participants || rawEvent.max_participants || 0,
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

  // Check phone number from profile store with Supabase fallback
  const profileExtra = await getUserProfileExtraWithFallback(supabase, auth.email, mssv);
  const resolvedPhone = phone || profileExtra?.phone || '';

  // Require phone number for registration
  if (!resolvedPhone || resolvedPhone.trim().length < 8) {
    return NextResponse.json({
      success: false,
      error: '📱 Bạn chưa cập nhật Số Điện Thoại / Zalo!\n\n👉 Cách cập nhật:\n1. Bấm vào ảnh đại diện (góc trên bên phải)\n2. Chọn "Hồ Sơ Cá Nhân"\n3. Nhập Số Điện Thoại / Zalo của bạn\n4. Bấm "Lưu"\n5. Quay lại đăng ký sự kiện\n\n⚠️ SĐT là bắt buộc để BTC liên hệ bạn khi cần.',
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

  const getSupabase = typeof createAdminClient === 'function' ? createAdminClient : createClient;
  const supabase = (await getSupabase()) || (await createClient());

  const isSuperAdmin = Boolean(auth.isSuperAdmin || auth.tier === 'super_admin');
  const isYouthUnion = auth.tier === 'youth_union';
  const isEventAdmin = auth.isEventAdmin || auth.tier === 'event_admin';

  let isCreator = false;
  let eventRecord: any = null;
  try {
    const { data: event } = await supabase
      .from('events')
      .select('event_id, event_date, end_time, status, created_by')
      .eq('event_id', resolvedParams.id)
      .maybeSingle();
    eventRecord = event;
    isCreator = !!(event?.created_by && auth.email && event.created_by.toLowerCase() === auth.email.toLowerCase());
  } catch {}

  if (eventRecord && isEventLockedPast3Days(eventRecord) && !isSuperAdmin) {
    return NextResponse.json(
      {
        success: false,
        error: 'Sự kiện đã kết thúc quá 3 ngày và đã được chốt sổ. Chỉ Super Admin mới có quyền xóa đăng ký.',
      },
      { status: 403 }
    );
  }

  const canManage = isSuperAdmin || isYouthUnion || isEventAdmin || isCreator;

  try {
    const body = await req.json().catch(() => ({}));

    // 1. Bulk delete by array of MSSVs
    if (canManage && Array.isArray(body.mssvs) && body.mssvs.length > 0) {
      const cleanMssvs = body.mssvs.map((m: any) => String(m).trim().toUpperCase());
      const { error, count } = await supabase
        .from('event_registrations')
        .delete({ count: 'exact' })
        .eq('event_id', resolvedParams.id)
        .in('mssv', cleanMssvs);

      if (error) {
        return NextResponse.json({ success: false, error: 'Lỗi khi xóa hàng loạt đăng ký' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        count: count ?? cleanMssvs.length,
        message: `Đã xóa thành công ${count ?? cleanMssvs.length} sinh viên khỏi danh sách đăng ký!`,
      });
    }

    // 2. Rollback a batch created after a specific timestamp
    if (canManage && body.created_after) {
      const { error, count } = await supabase
        .from('event_registrations')
        .delete({ count: 'exact' })
        .eq('event_id', resolvedParams.id)
        .gte('created_at', body.created_after);

      if (error) {
        return NextResponse.json({ success: false, error: 'Lỗi khi khứ hồi đợt đăng ký' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        count: count ?? 0,
        message: `Đã khứ hồi xóa ${count ?? 0} sinh viên vừa nạp!`,
      });
    }

    // 3. Single delete
    let targetMssv = extractMSSV(auth.email) || auth.email;
    if (body.mssv && canManage) {
      targetMssv = String(body.mssv).trim().toUpperCase();
    }

    const { error } = await supabase
      .from('event_registrations')
      .delete()
      .eq('event_id', resolvedParams.id)
      .eq('mssv', targetMssv);

    if (error) {
      return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Đã xóa đăng ký thành công' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi xử lý yêu cầu' }, { status: 500 });
  }
}
