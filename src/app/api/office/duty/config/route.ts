import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/supabase/auth-helper';
import { isOfficeAdminAuth, getDutyVolunteerRecord } from '@/lib/utils/office-auth';
import {
  extractClientIp,
  getOfficeDutyConfig,
  isIpAllowedForOffice,
  saveOfficeDutyConfig,
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
    if (!isAdmin) {
      const vol = await getDutyVolunteerRecord(supabase, auth.email);
      if (!vol) {
        return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
      }
    }

    const config = await getOfficeDutyConfig(supabase);
    const clientIp = extractClientIp(req);
    const ipCheck = isIpAllowedForOffice(clientIp, config);

    return NextResponse.json({
      success: true,
      data: {
        config: isAdmin ? config : { ...config, allowed_ips: [] },
        client_ip: clientIp,
        ip_allowed: ipCheck.allowed,
        ip_reason: ipCheck.reason || null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi tải cấu hình Văn phòng Đoàn' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!isOfficeAdminAuth(auth)) {
      return NextResponse.json(
        { success: false, error: 'Chỉ Admin Văn phòng Đoàn hoặc Super Admin mới có quyền cấu hình.' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const supabase = (await createAdminClient()) || (await createClient());
    const { ok, config } = await saveOfficeDutyConfig(supabase, body, auth!.email);
    if (!ok) {
      return NextResponse.json({ success: false, error: 'Không thể lưu cấu hình.' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Đã lưu cấu hình mạng & ca trực Văn phòng Đoàn.',
      data: config,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Lỗi lưu cấu hình' },
      { status: 500 }
    );
  }
}
