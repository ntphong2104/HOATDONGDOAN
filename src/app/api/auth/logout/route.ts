import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import {
  extractRawTokenFromCookies,
  invalidateTokenCacheForUser,
  parseDemoCookie,
} from '@/lib/supabase/auth-helper';
import { invalidateMeResponseCache } from '@/lib/constants/user-profile-store';
import { getTrustedOrigin } from '@/lib/security/redirect';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const rawToken = extractRawTokenFromCookies(allCookies);
  const demoCookieVal = cookieStore.get('demo_session')?.value;
  const demoParsed = demoCookieVal ? parseDemoCookie(demoCookieVal) : null;
  const demoEmail = typeof demoParsed?.email === 'string' ? demoParsed.email : null;

  let signedOutEmail: string | null = demoEmail;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (data?.user?.email) {
      signedOutEmail = data.user.email;
    }
    await supabase.auth.signOut();
  } catch {
    // ignore
  }

  try {
    invalidateTokenCacheForUser(rawToken, signedOutEmail);
    if (signedOutEmail) {
      invalidateMeResponseCache(signedOutEmail);
    }
  } catch {}

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
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  // Also expire potential Supabase auth cookies in response
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
  const postResponse = await POST(req);
  const origin = getTrustedOrigin(req);
  const redirectRes = NextResponse.redirect(new URL('/login', origin));

  try {
    const setCookies = typeof postResponse?.headers?.getSetCookie === 'function'
      ? postResponse.headers.getSetCookie()
      : [];
    for (const sc of setCookies) {
      redirectRes.headers.append('set-cookie', sc);
    }
    const demoCookieHeader = postResponse?.headers?.get?.('set-cookie');
    if (setCookies.length === 0 && demoCookieHeader) {
      redirectRes.headers.set('set-cookie', demoCookieHeader);
    }
  } catch {}

  return redirectRes;
}
