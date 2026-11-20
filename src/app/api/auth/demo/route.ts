import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { signCookie, DEMO_PROFILES } from '@/lib/auth/demo-cookie';
export async function POST(req: Request) {
  const rateLimit = checkRateLimit('demo_login', 10, 60000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: `Thao tác quá nhanh, thử lại sau ${rateLimit.resetInSeconds} giây` },
      { status: 429, headers: { 'Retry-After': String(rateLimit.resetInSeconds) } }
    );
  }

  if (process.env.ENABLE_DEMO_MODE !== 'true') {
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
  // SECURITY: Block demo login in production
  if (process.env.ENABLE_DEMO_MODE !== 'true') {
    return NextResponse.json({ success: false, error: 'Demo mode is disabled' }, { status: 403 });
  }

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

  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  const baseOrigin =
    process.env.NODE_ENV === 'production'
      ? 'https://ptithcm.com'
      : forwardedHost && !forwardedHost.includes('127.0.0.1') && !forwardedHost.includes('localhost')
      ? `${forwardedProto}://${forwardedHost}`
      : new URL(req.url).origin;

  const res = NextResponse.redirect(new URL(redirectUrl, baseOrigin));
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
