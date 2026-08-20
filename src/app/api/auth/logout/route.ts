import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (e) {
    // ignore
  }

  const cookieStore = await cookies();
  cookieStore.delete('demo_session');
  cookieStore.set('demo_session', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  const response = NextResponse.json({ success: true, message: 'Đã đăng xuất an toàn' });
  response.cookies.set('demo_session', '', {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });

  // Also expire potential Supabase auth cookies in response
  const allCookies = cookieStore.getAll();
  for (const c of allCookies) {
    if (c.name.startsWith('sb-') || c.name.includes('auth')) {
      cookieStore.delete(c.name);
      response.cookies.set(c.name, '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      });
    }
  }

  return response;
}

export async function GET(req: Request) {
  await POST(req);
  const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const forwardedProto = req.headers.get('x-forwarded-proto') || 'https';
  let origin = 'https://ptithcm.com';
  if (
    forwardedHost &&
    !forwardedHost.includes('127.0.0.1') &&
    !forwardedHost.includes('localhost')
  ) {
    origin = `${forwardedProto}://${forwardedHost}`;
  } else if (process.env.NODE_ENV !== 'production') {
    origin = new URL(req.url).origin;
  }
  return NextResponse.redirect(`${origin}/login`);
}
