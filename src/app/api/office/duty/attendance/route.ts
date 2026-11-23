import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth, getDutyVolunteerRecord } from '@/lib/utils/office-auth';
import {
  extractClientIp,
  getOfficeDutyConfig,
  isIpAllowedForOffice,
  validateCheckInWindow,
  validateCheckOutWindow,
  type DutyShift,
} from '@/lib/utils/office-duty';

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
    const vol = await getDutyVolunteerRecord(supabase, auth.email);

    if (!isAdmin && !vol) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let q = supabase
      .from('office_duty_attendance')
      .select('*')
      .order('duty_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (!isAdmin) {
      if (vol?.mssv) {
        q = q.or(`email.ilike.${auth.email.trim().toLowerCase()},mssv.eq.${vol.mssv}`);
      } else {
        q = q.ilike('email', auth.email);
      }
    }
    if (from) q = q.gte('duty_date', from);
    if (to) q = q.lte('duty_date', to);

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Lỗi tải chấm công' }, { status: 500 });
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
    const vol = await getDutyVolunteerRecord(supabase, auth.email);

    if (!isAdmin && !vol) {
      return NextResponse.json(
        { success: false, error: 'Bạn không thuộc danh sách CTV trực văn phòng.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const registrationId = String(body?.registration_id || '').trim();
    const action = String(body?.action || '').trim(); // 'check_in' | 'check_out'

    if (!registrationId || (action !== 'check_in' && action !== 'check_out')) {
      return NextResponse.json({ success: false, error: 'Yêu cầu chấm công không hợp lệ.' }, { status: 400 });
    }

    const { data: reg } = await supabase
      .from('office_duty_registrations')
      .select('*')
      .eq('id', registrationId)
      .maybeSingle();

    if (!reg) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy lịch trực tương ứng.' }, { status: 404 });
    }

    const isOwnerByEmail = String(reg.email || '').toLowerCase() === auth.email.toLowerCase();
    const isOwnerByMssv = Boolean(
      vol?.mssv && String(reg.mssv || '').trim().toUpperCase() === vol.mssv.trim().toUpperCase()
    );
    if (!isAdmin && !isOwnerByEmail && !isOwnerByMssv) {
      return NextResponse.json({ success: false, error: 'Không thể chấm công hộ người khác.' }, { status: 403 });
    }

    const config = await getOfficeDutyConfig(supabase);
    const clientIp = extractClientIp(req);

    // 1. Kiểm tra mạng WiFi Văn phòng Đoàn (KHÔNG cần quét QR)
    const ipCheck = isIpAllowedForOffice(clientIp, config);
    if (!ipCheck.allowed) {
      return NextResponse.json(
        { success: false, error: ipCheck.reason || 'Không đúng mạng WiFi Văn phòng Đoàn.' },
        { status: 403 }
      );
    }

    const shift = reg.shift as DutyShift;
    const now = new Date();

    const { data: existingAtt } = await supabase
      .from('office_duty_attendance')
      .select('*')
      .eq('registration_id', registrationId)
      .maybeSingle();

    // 2. Xử lý CHECK-IN (sớm tối đa 30 phút trước giờ ca)
    if (action === 'check_in') {
      if (existingAtt?.check_in_at) {
        return NextResponse.json({ success: false, error: 'Bạn đã check-in ca này rồi.' }, { status: 400 });
      }

      const timeCheck = validateCheckInWindow(reg.duty_date, shift, config, now);
      if (!timeCheck.allowed) {
        return NextResponse.json({ success: false, error: timeCheck.reason }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('office_duty_attendance')
        .insert({
          registration_id: registrationId,
          duty_date: reg.duty_date,
          shift,
          mssv: reg.mssv,
          email: reg.email,
          full_name: reg.full_name,
          check_in_at: now.toISOString(),
          check_in_ip: clientIp,
          late_minutes: timeCheck.lateMinutes || 0,
          worked_minutes: 0,
          status: 'checked_in',
        })
        .select('*')
        .single();

      if (error) {
        return NextResponse.json(
          {
            success: false,
            error: error.message.includes('row-level security')
              ? 'Lỗi quyền RLS bảng chấm công — vui lòng cấu hình SUPABASE_SERVICE_ROLE_KEY trên server.'
              : error.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message:
          (timeCheck.lateMinutes || 0) > 0
            ? `Check-in thành công (trễ ${timeCheck.lateMinutes} phút) • IP: ${clientIp}`
            : `Check-in đúng giờ thành công • IP: ${clientIp}`,
        data,
      });
    }

    // 3. Xử lý CHECK-OUT (trễ tối đa 30 phút sau giờ kết thúc ca)
    if (!existingAtt?.check_in_at) {
      return NextResponse.json(
        { success: false, error: 'Bạn cần Check-in trước khi Check-out.' },
        { status: 400 }
      );
    }
    if (existingAtt.check_out_at) {
      return NextResponse.json({ success: false, error: 'Bạn đã Check-out ca này rồi.' }, { status: 400 });
    }

    const outCheck = validateCheckOutWindow(reg.duty_date, shift, config, now);
    if (!outCheck.allowed) {
      return NextResponse.json({ success: false, error: outCheck.reason }, { status: 400 });
    }

    const checkInMs = new Date(existingAtt.check_in_at).getTime();
    const workedMinutes = Math.max(0, Math.round((now.getTime() - checkInMs) / 60_000));

    const { data, error } = await supabase
      .from('office_duty_attendance')
      .update({
        check_out_at: now.toISOString(),
        check_out_ip: clientIp,
        worked_minutes: workedMinutes,
        status: 'completed',
      })
      .eq('id', existingAtt.id)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Check-out thành công (${workedMinutes} phút trực) • IP: ${clientIp}`,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi chấm công ca trực' },
      { status: 500 }
    );
  }
}
