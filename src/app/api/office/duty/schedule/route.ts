import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth, getDutyVolunteerRecord } from '@/lib/utils/office-auth';
import {
  extractClientIp,
  getOfficeDutyConfig,
  getTodayVN,
  getWeekWorkdays,
  isIpAllowedForOffice,
  isWeekday,
  type DutyShift,
} from '@/lib/utils/office-duty';
import { getMasterStudentByMssv } from '@/lib/utils/student-profile';
import { isValidMSSV } from '@/lib/utils/extract-mssv';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const isAdmin = isOfficeAdminAuth(auth);
    const volunteer = await getDutyVolunteerRecord(supabase, auth.email);

    if (!isAdmin && !volunteer) {
      return NextResponse.json(
        { success: false, error: 'Chỉ CTV trực văn phòng hoặc Admin VPĐ mới có quyền truy cập.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const weekStartParam = searchParams.get('week_of') || getTodayVN();
    const workdays = getWeekWorkdays(weekStartParam);
    const fromDate = workdays[0];
    const toDate = workdays[workdays.length - 1];
    const todayVN = getTodayVN();

    const cleanEmail = auth.email.trim().toLowerCase();
    const todayFilter = volunteer?.mssv ? `email.ilike.${cleanEmail},mssv.eq.${volunteer.mssv}` : null;

    const [config, { data: windows }, { data: weekRegs }, { data: todayRegs }, { data: todayAtt }, { data: allVolunteers }] =
      await Promise.all([
        getOfficeDutyConfig(supabase),
        supabase
          .from('office_duty_windows')
          .select('*')
          .eq('is_active', true)
          .order('apply_from', { ascending: true }),
        supabase
          .from('office_duty_registrations')
          .select('*')
          .gte('duty_date', fromDate)
          .lte('duty_date', toDate)
          .order('created_at', { ascending: true }),
        todayFilter
          ? supabase
              .from('office_duty_registrations')
              .select('*')
              .eq('duty_date', todayVN)
              .or(todayFilter)
          : supabase
              .from('office_duty_registrations')
              .select('*')
              .eq('duty_date', todayVN)
              .ilike('email', auth.email),
        todayFilter
          ? supabase
              .from('office_duty_attendance')
              .select('*')
              .eq('duty_date', todayVN)
              .or(todayFilter)
          : supabase
              .from('office_duty_attendance')
              .select('*')
              .eq('duty_date', todayVN)
              .ilike('email', auth.email),
        supabase
          .from('office_duty_volunteers')
          .select('mssv, email, full_name, class_id')
          .eq('is_active', true)
          .order('full_name', { ascending: true }),
      ]);

    const nowMs = Date.now();
    const openWindows = (windows || []).filter((w: any) => {
      const openMs = new Date(w.open_at).getTime();
      const closeMs = new Date(w.close_at).getTime();
      return nowMs >= openMs && nowMs <= closeMs;
    });

    const isDateOpenForReg = (dateStr: string) =>
      openWindows.some((w: any) => dateStr >= w.apply_from && dateStr <= w.apply_to);

    const clientIp = extractClientIp(req);
    const ipCheck = isIpAllowedForOffice(clientIp, config);

    const attByRegId = new Map<string, any>();
    for (const a of todayAtt || []) {
      attByRegId.set(a.registration_id, a);
    }

    const todayMyShifts = (todayRegs || []).map((r: any) => ({
      ...r,
      attendance: attByRegId.get(r.id) || null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        workdays,
        today_vn: todayVN,
        config: isAdmin ? config : { ...config, allowed_ips: [] },
        is_admin: isAdmin,
        volunteer,
        volunteers: allVolunteers || [],
        open_windows: openWindows,
        all_windows: windows || [],
        registrations: weekRegs || [],
        open_dates: workdays.filter(isDateOpenForReg),
        today_my_shifts: todayMyShifts,
        network: {
          client_ip: clientIp,
          allowed: ipCheck.allowed,
          reason: ipCheck.reason || null,
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi tải lịch trực văn phòng' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const isAdmin = isOfficeAdminAuth(auth);
    const selfVol = await getDutyVolunteerRecord(supabase, auth.email);

    if (!isAdmin && !selfVol) {
      return NextResponse.json(
        { success: false, error: 'Bạn không nằm trong danh sách CTV trực văn phòng.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const dutyDate = String(body?.duty_date || '').trim();
    const shift = String(body?.shift || '').trim() as DutyShift;

    if (!isWeekday(dutyDate)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ đăng ký trực vào các ngày hành chính Thứ 2 đến Thứ 6.' },
        { status: 400 }
      );
    }
    if (shift !== 'morning' && shift !== 'afternoon') {
      return NextResponse.json(
        { success: false, error: 'Ca trực không hợp lệ (chỉ có Ca Sáng hoặc Ca Chiều).' },
        { status: 400 }
      );
    }

    const config = await getOfficeDutyConfig(supabase);

    // Xác định CTV được đăng ký (Admin có thể gán tay cho MSSV bất kỳ; CTV tự đăng ký cho mình)
    let targetMssv = selfVol?.mssv || '';
    let targetEmail = selfVol?.email || auth.email.toLowerCase();
    let targetName = selfVol?.full_name || targetMssv;

    if (isAdmin && body?.mssv) {
      const m = String(body.mssv).trim().toUpperCase();
      if (!isValidMSSV(m)) {
        return NextResponse.json({ success: false, error: 'MSSV không hợp lệ.' }, { status: 400 });
      }
      const { data: volRow } = await supabase
        .from('office_duty_volunteers')
        .select('mssv, email, full_name')
        .eq('mssv', m)
        .maybeSingle();
      const master = getMasterStudentByMssv(m);
      targetMssv = m;
      targetEmail = (volRow?.email || `${m.toLowerCase()}@student.ptithcm.edu.vn`).toLowerCase();
      targetName = volRow?.full_name || master?.full_name || m;
    } else if (!selfVol) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng chọn MSSV CTV trực cần thêm vào ca.' },
        { status: 400 }
      );
    }

    // Nếu không phải Admin VPĐ, kiểm tra đợt mở đăng ký
    if (!isAdmin) {
      const nowIso = new Date().toISOString();
      const { data: matchingWindows } = await supabase
        .from('office_duty_windows')
        .select('id')
        .eq('is_active', true)
        .lte('open_at', nowIso)
        .gte('close_at', nowIso)
        .lte('apply_from', dutyDate)
        .gte('apply_to', dutyDate)
        .limit(1);

      if (!matchingWindows || matchingWindows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Hiện chưa mở đợt đăng ký cho ngày này hoặc đã hết hạn đăng ký.' },
          { status: 400 }
        );
      }
    }

    // Kiểm tra giới hạn tối đa N người/ca (mặc định 2)
    const { data: currentSlot } = await supabase
      .from('office_duty_registrations')
      .select('id, mssv')
      .eq('duty_date', dutyDate)
      .eq('shift', shift);

    if ((currentSlot || []).some((r: any) => r.mssv === targetMssv)) {
      return NextResponse.json(
        { success: false, error: 'CTV này đã đăng ký ca này rồi.' },
        { status: 400 }
      );
    }
    if ((currentSlot || []).length >= config.max_per_shift) {
      return NextResponse.json(
        { success: false, error: `Ca trực này đã đủ tối đa ${config.max_per_shift} người.` },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('office_duty_registrations')
      .insert({
        duty_date: dutyDate,
        shift,
        mssv: targetMssv,
        email: targetEmail,
        full_name: targetName,
        registered_by: auth.email,
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Đăng ký ${shift === 'morning' ? 'Ca Sáng' : 'Ca Chiều'} ngày ${dutyDate} thành công.`,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi đăng ký ca trực' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = (await createAdminClient()) || (await createClient());
    const isAdmin = isOfficeAdminAuth(auth);
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) {
      return NextResponse.json({ success: false, error: 'Thiếu ID lịch trực.' }, { status: 400 });
    }

    const { data: reg } = await supabase
      .from('office_duty_registrations')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!reg) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy lịch trực.' }, { status: 404 });
    }

    if (!isAdmin) {
      const selfVol = await getDutyVolunteerRecord(supabase, auth.email);
      const isOwnerByEmail = String(reg.email || '').toLowerCase() === auth.email.toLowerCase();
      const isOwnerByMssv = Boolean(
        selfVol?.mssv && String(reg.mssv || '').trim().toUpperCase() === selfVol.mssv.trim().toUpperCase()
      );
      if (!isOwnerByEmail && !isOwnerByMssv) {
        return NextResponse.json({ success: false, error: 'Bạn chỉ có thể hủy ca của chính mình.' }, { status: 403 });
      }
      // Chỉ cho CTV hủy khi đợt đăng ký cho ngày đó vẫn đang mở
      const nowIso = new Date().toISOString();
      const { data: openWin } = await supabase
        .from('office_duty_windows')
        .select('id')
        .eq('is_active', true)
        .lte('open_at', nowIso)
        .gte('close_at', nowIso)
        .lte('apply_from', reg.duty_date)
        .gte('apply_to', reg.duty_date)
        .limit(1);
      if (!openWin || openWin.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Đã hết thời gian mở đăng ký nên không thể tự hủy ca. Vui lòng liên hệ Admin VPĐ.' },
          { status: 400 }
        );
      }
    }

    const { error } = await supabase.from('office_duty_registrations').delete().eq('id', id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Đã hủy đăng ký ca trực.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi hủy ca trực' }, { status: 500 });
  }
}
