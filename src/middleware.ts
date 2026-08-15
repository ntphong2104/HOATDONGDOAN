import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

function parseDemoCookie(cookieVal: string): any | null {
  if (!cookieVal) return null;
  try {
    let raw = cookieVal.trim();
    // Only strip signature if it matches .[64-hex-chars] at the very end
    const sigMatch = raw.match(/^(.+)\.[0-9a-fA-F]{64}$/);
    if (sigMatch) {
      raw = sigMatch[1];
    }
    try {
      const user = JSON.parse(decodeURIComponent(raw));
      if (user && user.email) return user;
    } catch {
      const user = JSON.parse(raw);
      if (user && user.email) return user;
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

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/maintenance', '/api/admin/maintenance', '/api/auth/demo'];

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
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // 1. Check Demo Session Cookie
  const demoCookie = request.cookies.get('demo_session');
  if (demoCookie?.value) {
    const demoUser = parseDemoCookie(demoCookie.value);
    if (demoUser) {
      if (pathname === '/login') {
        return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
      }

      // Role authorization checks
      if (pathname.startsWith('/super-admin') && demoUser.tier !== 'super_admin') {
        return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
      }
      if (
        pathname.startsWith('/admin') &&
        demoUser.tier !== 'super_admin' &&
        demoUser.tier !== 'event_admin' &&
        demoUser.tier !== 'youth_union' &&
        demoUser.tier !== 'ctsv' &&
        demoUser.tier !== 'facility'
      ) {
        return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
      }
      if (
        pathname.startsWith('/scanner') &&
        demoUser.tier !== 'super_admin' &&
        demoUser.tier !== 'event_admin' &&
        demoUser.tier !== 'checker'
      ) {
        return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
      }

      return addSecurityHeaders(NextResponse.next());
    }
  }

  // 2. Supabase Auth Session Handling
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = getValidUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
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
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
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

    // If unauthenticated and accessing protected route -> redirect to login
    if (!user && !isPublicRoute) {
      const loginUrl = new URL('/login', request.url);
      return addSecurityHeaders(NextResponse.redirect(loginUrl));
    }

    // If authenticated and on /login -> redirect to home
    if (user && pathname === '/login') {
      return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
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
          return addSecurityHeaders(NextResponse.redirect(new URL('/maintenance', request.url)));
        }
      }

      // Restrict /super-admin to real super admins
      if (pathname.startsWith('/super-admin') && !isSuperAdmin) {
        return addSecurityHeaders(NextResponse.redirect(new URL('/', request.url)));
      }
    }
  } catch (err) {
    if (!isPublicRoute) {
      return addSecurityHeaders(NextResponse.redirect(new URL('/login', request.url)));
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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
