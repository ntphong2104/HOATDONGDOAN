import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import type { SessionUser } from '@/lib/types';
import crypto from 'crypto';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

export function signCookie(payload: string): string {
  const enc = encodeURIComponent(payload);
  const hmac = crypto.createHmac('sha256', COOKIE_SECRET).update(enc).digest('hex');
  return `${enc}.${hmac}`;
}

export function verifyCookie(signed: string): string | null {
  const lastDot = signed.lastIndexOf('.');
  if (lastDot === -1) return null;
  const enc = signed.slice(0, lastDot);
  const signature = signed.slice(lastDot + 1);
  const expectedSignature = crypto.createHmac('sha256', COOKIE_SECRET).update(enc).digest('hex');
  if (signature === expectedSignature) {
    try {
      return decodeURIComponent(enc);
    } catch {
      return null;
    }
  }
  return null;
}

export const DEMO_PROFILES: Record<string, SessionUser> = {
  user: {
    mssv: 'N22DCCN001',
    email: 'n22dccn001@student.ptithcm.edu.vn',
    full_name: 'Nguyễn Văn An',
    class_id: 'D22CQCN01-N',
    tier: 'user',
    managed_events: [],
  },
  checker: {
    mssv: 'N21DCCN999',
    email: 'checker@student.ptithcm.edu.vn',
    full_name: 'Trần Văn Quét (CTV Điểm Danh)',
    class_id: 'D21CQCN02-N',
    tier: 'checker',
    managed_events: [
      {
        event_id: 'ev-demo-01',
        event_name: 'Ngày Hội Sinh Viên & Việc Làm 2026',
        role_type: 'checker',
      },
    ],
  },
  event_admin: {
    mssv: 'LCD_CNTT',
    email: 'lcdcntt@student.ptithcm.edu.vn',
    full_name: 'LCĐ Khoa Công nghệ Thông tin',
    class_id: 'LCD-CNTT',
    tier: 'event_admin',
    managed_events: [],
  },

  // ──── 8 Liên Chi Đoàn (LCĐ) ────
  'lcdcntt': {
    mssv: 'LCD_CNTT',
    email: 'lcdcntt@student.ptithcm.edu.vn',
    full_name: 'LCĐ Khoa Công nghệ Thông tin',
    class_id: 'LCD-CNTT',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcdcndpt': {
    mssv: 'LCD_CNDPT',
    email: 'lcdcndpt@student.ptithcm.edu.vn',
    full_name: 'LCĐ Công nghệ Đa phương tiện',
    class_id: 'LCD-CNDPT',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcdattt': {
    mssv: 'LCD_ATTT',
    email: 'lcdattt@student.ptithcm.edu.vn',
    full_name: 'LCĐ An toàn Thông tin',
    class_id: 'LCD-ATTT',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcdvt': {
    mssv: 'LCD_VT',
    email: 'lcdvt@student.ptithcm.edu.vn',
    full_name: 'LCĐ Khoa Viễn thông',
    class_id: 'LCD-VT',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcddt': {
    mssv: 'LCD_DT',
    email: 'lcddt@student.ptithcm.edu.vn',
    full_name: 'LCĐ Khoa Điện tử',
    class_id: 'LCD-DT',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcdqtkd': {
    mssv: 'LCD_QTKD',
    email: 'lcdqtkd@student.ptithcm.edu.vn',
    full_name: 'LCĐ Khoa Quản trị Kinh doanh',
    class_id: 'LCD-QTKD',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcdmkt': {
    mssv: 'LCD_MKT',
    email: 'lcdmkt@student.ptithcm.edu.vn',
    full_name: 'LCĐ Marketing',
    class_id: 'LCD-MKT',
    tier: 'event_admin',
    managed_events: [],
  },
  'lcdketoan': {
    mssv: 'LCD_KETOAN',
    email: 'lcdketoan@student.ptithcm.edu.vn',
    full_name: 'LCĐ Kế toán',
    class_id: 'LCD-KETOAN',
    tier: 'event_admin',
    managed_events: [],
  },

  // ──── 16 Câu lạc bộ / Đội / Nhóm ────
  'clb.itmc': {
    mssv: 'CLB_ITMC',
    email: 'clb.itmc@student.ptithcm.edu.vn',
    full_name: 'CLB ITMC',
    class_id: 'CLB-ITMC',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.antoanthongtin': {
    mssv: 'CLB_ATTT',
    email: 'clb.antoanthongtin@student.ptithcm.edu.vn',
    full_name: 'CLB An toàn Thông tin',
    class_id: 'CLB-ATTT',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.tienganh': {
    mssv: 'CLB_TIENGANH',
    email: 'clb.tienganh@student.ptithcm.edu.vn',
    full_name: 'CLB Tiếng Anh',
    class_id: 'CLB-TIENGANH',
    tier: 'event_admin',
    managed_events: [],
  },
  'doivannghe': {
    mssv: 'DOI_VANNGHE',
    email: 'doivannghe@student.ptithcm.edu.vn',
    full_name: 'Đội Văn Nghệ',
    class_id: 'DOI-VANNGHE',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.guitar': {
    mssv: 'CLB_GUITAR',
    email: 'clb.guitar@student.ptithcm.edu.vn',
    full_name: 'CLB Guitar',
    class_id: 'CLB-GUITAR',
    tier: 'event_admin',
    managed_events: [],
  },
  'doisinhvientinhnguyen': {
    mssv: 'DOI_SVTN',
    email: 'doisinhvientinhnguyen@student.ptithcm.edu.vn',
    full_name: 'Đội Sinh Viên Tình Nguyện',
    class_id: 'DOI-SVTN',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.ketnoi': {
    mssv: 'CLB_KETNOI',
    email: 'clb.ketnoi@student.ptithcm.edu.vn',
    full_name: 'CLB Kết Nối',
    class_id: 'CLB-KETNOI',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.truyenthongcmc': {
    mssv: 'CLB_CMC',
    email: 'clb.truyenthongcmc@student.ptithcm.edu.vn',
    full_name: 'CLB C.MC',
    class_id: 'CLB-CMC',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.37dosinhvien': {
    mssv: 'CLB_37DO',
    email: 'clb.37dosinhvien@student.ptithcm.edu.vn',
    full_name: 'CLB 37 Độ Sinh viên',
    class_id: 'CLB-37DO',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.bma': {
    mssv: 'CLB_BMA',
    email: 'clb.bma@student.ptithcm.edu.vn',
    full_name: 'CLB BMA',
    class_id: 'CLB-BMA',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.bongchuyen': {
    mssv: 'CLB_BONGCHUYEN',
    email: 'clb.bongchuyen@student.ptithcm.edu.vn',
    full_name: 'CLB Bóng Chuyền',
    class_id: 'CLB-BONGCHUYEN',
    tier: 'event_admin',
    managed_events: [],
  },
  'clbbongda': {
    mssv: 'CLB_BONGDA',
    email: 'clbbongda@student.ptithcm.edu.vn',
    full_name: 'CLB Bóng Đá',
    class_id: 'CLB-BONGDA',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.bongro': {
    mssv: 'CLB_BONGRO',
    email: 'clb.bongro@student.ptithcm.edu.vn',
    full_name: 'CLB Bóng Rổ',
    class_id: 'CLB-BONGRO',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.vovinam': {
    mssv: 'CLB_VOVINAM',
    email: 'clb.vovinam@student.ptithcm.edu.vn',
    full_name: 'CLB VOVINAM',
    class_id: 'CLB-VOVINAM',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.co': {
    mssv: 'CLB_CO',
    email: 'clb.co@student.ptithcm.edu.vn',
    full_name: 'CLB Cờ',
    class_id: 'CLB-CO',
    tier: 'event_admin',
    managed_events: [],
  },
  'clb.caulong': {
    mssv: 'CLB_CAULONG',
    email: 'clb.caulong@student.ptithcm.edu.vn',
    full_name: 'CLB Cầu Lông',
    class_id: 'CLB-CAULONG',
    tier: 'event_admin',
    managed_events: [],
  },

  // ──── Cấp Phê Duyệt ────
  youth_union: {
    mssv: 'DOAN-HV',
    email: 'doanthanhnien@ptithcm.edu.vn',
    full_name: 'Thanh Nien Doan (Đoàn Học Viện)',
    class_id: 'BCH-DOAN',
    tier: 'youth_union',
    managed_events: [],
  },
  ctsv: {
    mssv: 'PHONG-CTSV',
    email: 'phongctsv@ptithcm.edu.vn',
    full_name: 'Phòng Công Tác Sinh Viên (CTSV)',
    class_id: 'PHONG-BAN',
    tier: 'ctsv',
    managed_events: [],
  },
  facility: {
    mssv: 'PHONG-TCHCQT',
    email: 'phongquantri@ptithcm.edu.vn',
    full_name: 'Phòng. TC-HC-QT',
    class_id: 'PHONG-BAN',
    tier: 'facility',
    managed_events: [],
  },
  khoa_cntt: {
    mssv: 'KHOA-CNTT',
    email: 'khoacntt@ptithcm.edu.vn',
    full_name: 'Khoa Công Nghệ Thông Tin',
    class_id: 'KHOA-DAOTAO',
    tier: 'event_admin',
    unit_name: 'Khoa Công Nghệ Thông Tin',
    unit_code: 'KHOA_CNTT',
    managed_events: [],
  },
  khoa_dt: {
    mssv: 'KHOA-DT',
    email: 'khoadt@ptithcm.edu.vn',
    full_name: 'Khoa Điện Tử',
    class_id: 'KHOA-DAOTAO',
    tier: 'event_admin',
    unit_name: 'Khoa Điện Tử',
    unit_code: 'KHOA_DT',
    managed_events: [],
  },
  khoa_cb: {
    mssv: 'KHOA-CB',
    email: 'khoacoban@ptithcm.edu.vn',
    full_name: 'Khoa Cơ Bản',
    class_id: 'KHOA-DAOTAO',
    tier: 'event_admin',
    unit_name: 'Khoa Cơ Bản',
    unit_code: 'KHOA_CB',
    managed_events: [],
  },
  khoa_qtkd: {
    mssv: 'KHOA-QTKD',
    email: 'khoaqtkd@ptithcm.edu.vn',
    full_name: 'Khoa Quản Trị Kinh Doanh',
    class_id: 'KHOA-DAOTAO',
    tier: 'event_admin',
    unit_name: 'Khoa Quản Trị Kinh Doanh',
    unit_code: 'KHOA_QTKD',
    managed_events: [],
  },
  security: {
    mssv: 'TO-BAOVE',
    email: 'baove@ptithcm.edu.vn',
    full_name: 'Tổ Bảo Vệ & Quản Lý Chìa Khóa',
    class_id: 'TO-BAO-VE',
    tier: 'security',
    isSecurity: true,
    managed_events: [],
  },
  super_admin: {
    mssv: 'ADMIN001',
    email: 'superadmin@student.ptithcm.edu.vn',
    full_name: 'Super Admin Đoàn Trường PTIT',
    class_id: 'BCH-DOAN',
    tier: 'super_admin',
    managed_events: [],
  },
};

export async function POST(req: Request) {
  const rateLimit = checkRateLimit('demo_login', 10, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: `Thao tác quá nhanh, thử lại sau ${rateLimit.resetInSeconds} giây` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
    );
  }

  if (process.env.ENABLE_DEMO_MODE === 'false') {
    return NextResponse.json({ success: false, error: 'Chế độ demo đã tắt' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const role = body?.role || 'user';
    let profile = DEMO_PROFILES[role];

    if (!profile && (role.startsWith('lcd') || role.startsWith('clb') || role.startsWith('doi'))) {
      profile = {
        mssv: role.toUpperCase().replace(/\./g, '_'),
        email: `${role.toLowerCase()}@student.ptithcm.edu.vn`,
        full_name: `Đơn vị ${role.toUpperCase()}`,
        class_id: 'DONVI-PTIT',
        tier: 'event_admin',
        managed_events: [],
      };
    }

    if (!profile) profile = DEMO_PROFILES.user;

    const cookieStore = await cookies();
    cookieStore.set('demo_session', signCookie(JSON.stringify(profile)), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    const targetRedirect = body.redirect || body.next;
    let redirectUrl =
      targetRedirect && typeof targetRedirect === 'string' && targetRedirect.startsWith('/')
        ? targetRedirect
        : '/';

    if (!targetRedirect || targetRedirect === '/') {
      if (profile.tier === 'checker') redirectUrl = '/scanner';
      if (profile.tier === 'security') redirectUrl = '/security';
      if (profile.tier === 'event_admin') redirectUrl = '/admin/proposals';
      if (profile.tier === 'youth_union' || profile.tier === 'ctsv' || profile.tier === 'facility') {
        redirectUrl = '/admin/proposals';
      }
      if (profile.tier === 'super_admin') redirectUrl = '/super-admin';
    }

    const response = NextResponse.json(
      { success: true, profile, redirectUrl },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );

    response.cookies.set('demo_session', signCookie(JSON.stringify(profile)), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ success: false, error: 'Lỗi hệ thống, vui lòng thử lại'}, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role') || 'super_admin';
  const targetRedirect = searchParams.get('redirect') || searchParams.get('next');

  let profile = DEMO_PROFILES[role];
  if (!profile && (role.startsWith('lcd') || role.startsWith('clb') || role.startsWith('doi'))) {
    profile = {
      mssv: role.toUpperCase().replace(/\./g, '_'),
      email: `${role.toLowerCase()}@student.ptithcm.edu.vn`,
      full_name: `Đơn vị ${role.toUpperCase()}`,
      class_id: 'DONVI-PTIT',
      tier: 'event_admin',
      managed_events: [],
    };
  }
  if (!profile) profile = DEMO_PROFILES.super_admin;

  let redirectUrl =
    targetRedirect && typeof targetRedirect === 'string' && targetRedirect.startsWith('/')
      ? targetRedirect
      : '/';

  if (!targetRedirect || targetRedirect === '/') {
    if (profile.tier === 'checker') redirectUrl = '/scanner';
    if (profile.tier === 'security') redirectUrl = '/security';
    if (profile.tier === 'event_admin') redirectUrl = '/admin';
    if (profile.tier === 'youth_union' || profile.tier === 'ctsv' || profile.tier === 'facility') {
      redirectUrl = '/admin/proposals';
    }
    if (profile.tier === 'super_admin') redirectUrl = '/super-admin';
  }

  const res = NextResponse.redirect(new URL(redirectUrl, req.url));
  res.cookies.set('demo_session', signCookie(JSON.stringify(profile)), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('demo_session');
  cookieStore.set('demo_session', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  const response = NextResponse.json(
    { success: true },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );

  response.cookies.set('demo_session', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
