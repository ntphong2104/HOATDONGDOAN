import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

function parseDemoCookie(cookieVal: string): any | null {
  if (!cookieVal) return null;
  try {
    let str = cookieVal.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }
    const lastDot = str.lastIndexOf('.');
    if (lastDot !== -1 && str.length - lastDot === 65) {
      str = str.slice(0, lastDot);
    }

    for (let i = 0; i < 3; i++) {
      try {
        const parsed = JSON.parse(str);
        if (parsed && typeof parsed === 'object' && (parsed.email || parsed.tier)) {
          return parsed;
        }
      } catch {}
      try {
        const next = decodeURIComponent(str);
        if (next === str) break;
        str = next;
      } catch {
        break;
      }
    }
  } catch {}
  return null;
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=self, microphone=(), geolocation=()',
};

function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/auth/callback',
  '/maintenance',
  '/api/admin/maintenance',
  '/api/auth/demo',
  '/events',
  '/api/events',
];

function getValidUrl(url: string | undefined): string {
  if (!url) return 'https://placeholder.supabase.co';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url;
    }
  } catch {
    // invalid URL fallback
  }
  return 'https://placeholder.supabase.co';
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = pathname === '/' || PUBLIC_ROUTES.some((route) => route !== '/' && pathname.startsWith(route));
  const publicOrigin = getPublicOriginFromReq(request);

  // 1. Check Demo Session Cookie
  const demoCookie = request.cookies.get('demo_session');
  if (demoCookie?.value) {
    const demoUser = parseDemoCookie(demoCookie.value);
    if (demoUser?.email) {
      return addSecurityHeaders(NextResponse.next());
    }
  }

  // 2. Supabase Auth Session Handling
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'placeholder-anon-key';

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            supabaseResponse = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // If unauthenticated and accessing protected route -> redirect to login with target redirect
    if (!user && !isPublicRoute && !demoCookie?.value) {
      const loginUrl = new URL('/login', publicOrigin);
      if (pathname && pathname !== '/' && pathname !== '/login') {
        const fullTarget = request.nextUrl.search ? `${pathname}${request.nextUrl.search}` : pathname;
        loginUrl.searchParams.set('redirect', fullTarget);
      }
      return addSecurityHeaders(NextResponse.redirect(loginUrl));
    }

    // Maintenance Mode Check
    const { data: maintenanceSetting } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle();

    const isMaintenance = maintenanceSetting?.value === 'true';

    if (user) {
      // Check Super Admin status
      const { data: superAdmin } = await supabase
        .from('super_admins')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      const isSuperAdmin = !!superAdmin;

      if (isMaintenance && pathname !== '/maintenance' && !pathname.startsWith('/api/admin/maintenance')) {
        if (!isSuperAdmin) {
          return addSecurityHeaders(NextResponse.redirect(new URL('/maintenance', publicOrigin)));
        }
      }

    }
  } catch (err) {
    if (!isPublicRoute) {
      return addSecurityHeaders(NextResponse.redirect(new URL('/login', publicOrigin)));
    }
  }

  return addSecurityHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, icons, manifest etc
     */
    '/((?!_next/static|_next/image|favicon.ico|llms\\.txt|llms-full\\.txt|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
