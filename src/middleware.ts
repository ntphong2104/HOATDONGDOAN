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
  '/api/auth/logout',
  '/api/events/public',
  '/api/rooms',
  '/api/admin/units',
];

// Routes that need exact match (not prefix)
const PUBLIC_EXACT_ROUTES = [
  '/api/events/public',
  '/api/rooms',
  '/api/admin/units',
];

// Routes that allow prefix matching for public sub-paths
const PUBLIC_PREFIX_ROUTES = [
  '/login',
  '/auth/callback',
  '/maintenance',
  '/api/admin/maintenance',
  '/api/auth/demo',
  '/api/auth/logout',
  '/events/',          // /events/[id]/register page (public registration)
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

function getPublicOriginFromReq(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (
    forwardedHost &&
    !forwardedHost.includes('127.0.0.1') &&
    !forwardedHost.includes('localhost') &&
    !forwardedHost.includes('0.0.0.0')
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://ptithcm.com';
  }
  return request.nextUrl.origin;
}

// In-memory cache for maintenance mode to prevent hammering the database on every single request
let maintenanceCache = {
  enabled: false,
  timestamp: 0,
};

function decodeBase64Safe(str: string): string {
  try {
    // Pad base64 string if needed
    const padded = str.length % 4 === 0 ? str : str + '='.repeat(4 - (str.length % 4));
    const base64Standard = padded.replace(/-/g, '+').replace(/_/g, '/');
    if (typeof atob === 'function') {
      return atob(base64Standard);
    }
    return Buffer.from(base64Standard, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

// Fast in-memory extraction of user email and expiration from Supabase session cookies
function extractUserFromCookies(cookieList: Array<{ name: string; value: string }>): { email: string; id: string; exp: number } | null {
  try {
    const authCookies = cookieList
      .filter((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (authCookies.length === 0) return null;

    let combined = authCookies.map((c) => c.value).join('');
    if (combined.startsWith('base64-')) {
      combined = decodeBase64Safe(combined.slice(7));
    }

    let parsed: any = null;
    try {
      parsed = JSON.parse(combined);
    } catch {
      try {
        parsed = JSON.parse(decodeURIComponent(combined));
      } catch {}
    }

    if (!parsed) return null;

    let token = '';
    let email = '';
    let id = '';

    if (Array.isArray(parsed)) {
      token = parsed[0] || '';
    } else if (typeof parsed === 'object') {
      token = parsed.access_token || '';
      if (parsed.user) {
        email = parsed.user.email || '';
        id = parsed.user.id || '';
      }
    }

    if (token && token.includes('.')) {
      const parts = token.split('.');
      if (parts.length >= 2) {
        const payloadStr = decodeBase64Safe(parts[1]);
        if (payloadStr) {
          const payload = JSON.parse(payloadStr);
          if (payload) {
            const exp = Number(payload.exp || 0);
            const nowSec = Math.floor(Date.now() / 1000);
            // Accept token if valid and not expired (with 30s grace window)
            if (exp > nowSec - 30) {
              return {
                email: (payload.email || email).toLowerCase().trim(),
                id: payload.sub || id,
                exp,
              };
            }
          }
        }
      }
    }

    if (email) {
      return { email: email.toLowerCase().trim(), id, exp: 0 };
    }
  } catch {}
  return null;
}

async function getCachedMaintenanceMode(supabase: any): Promise<boolean> {
  const now = Date.now();
  if (now - maintenanceCache.timestamp < 30000) {
    return maintenanceCache.enabled;
  }
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'maintenance_mode')
      .maybeSingle();

    const isEnabled = data?.value === 'true' || data?.value === true;
    maintenanceCache = {
      enabled: isEnabled,
      timestamp: now,
    };
    return isEnabled;
  } catch {
    return maintenanceCache.enabled;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = pathname === '/' || 
    PUBLIC_PREFIX_ROUTES.some((route) => pathname.startsWith(route)) ||
    PUBLIC_EXACT_ROUTES.some((route) => pathname === route) ||
    // Allow public event detail pages and registration pages
    /^\/events\/[^/]+\/register/.test(pathname) ||
    // Allow public event detail API (GET only, auth checked inside)
    /^\/api\/events\/[^/]+$/.test(pathname) ||
    /^\/api\/events\/[^/]+\/register$/.test(pathname) ||
    /^\/api\/events\/[^/]+\/ratings$/.test(pathname);
  const publicOrigin = getPublicOriginFromReq(request);

  // 1. FAST-PATH FOR PUBLIC ROUTES:
  // Under high concurrency (hundreds of students at once), public routes must NEVER
  // block on Supabase Auth network calls. Return immediately!
  if (isPublicRoute) {
    // If accessing maintenance directly, pass through
    if (pathname === '/maintenance') {
      return addSecurityHeaders(NextResponse.next());
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // 2. Check Demo Session Cookie (Instant local check)
  const demoCookie = request.cookies.get('demo_session');
  if (demoCookie?.value) {
    const demoUser = parseDemoCookie(demoCookie.value);
    if (demoUser?.email) {
      return addSecurityHeaders(NextResponse.next());
    }
  }

  // 3. FAST-PATH TOKEN PARSING:
  // Check if unexpired JWT exists in cookies without making a remote HTTP call to Supabase
  const allCookies = request.cookies.getAll();
  const fastUser = extractUserFromCookies(allCookies);

  let authenticatedEmail = fastUser?.email || null;

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'placeholder-anon-key';

  // Fallback: If local fast token check did not find an active session, try Supabase SDK
  if (!authenticatedEmail) {
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

      const { data } = await supabase.auth.getSession();
      if (data?.session?.user?.email) {
        authenticatedEmail = data.session.user.email.toLowerCase().trim();
      } else {
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.email) {
          authenticatedEmail = userData.user.email.toLowerCase().trim();
        }
      }
    } catch {}
  }

  // 4. UNATHENTICATED ON PROTECTED ROUTE:
  if (!authenticatedEmail) {
    // If request is an API call, return JSON 401 instead of HTML 307 redirect
    // (Redirecting API calls breaks fetch clients and causes syntax errors)
    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' },
          { status: 401 }
        )
      );
    }

    // For web pages, redirect to login
    const loginUrl = new URL('/login', publicOrigin);
    if (pathname && pathname !== '/' && pathname !== '/login') {
      const fullTarget = request.nextUrl.search ? `${pathname}${request.nextUrl.search}` : pathname;
      loginUrl.searchParams.set('redirect', fullTarget);
    }
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // 5. CACHED MAINTENANCE MODE CHECK:
  // Only check database once every 30 seconds instead of on every request
  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll() {},
      },
    });

    const isMaintenance = await getCachedMaintenanceMode(supabase);

    // If maintenance mode is ON, verify if user is Super Admin
    if (isMaintenance && pathname !== '/maintenance' && !pathname.startsWith('/api/admin/maintenance')) {
      const isRootSuper = authenticatedEmail === 'n22dccn158@student.ptithcm.edu.vn';
      if (!isRootSuper) {
        const { data: superAdmin } = await supabase
          .from('super_admins')
          .select('email')
          .eq('email', authenticatedEmail)
          .maybeSingle();

        if (!superAdmin) {
          return addSecurityHeaders(NextResponse.redirect(new URL('/maintenance', publicOrigin)));
        }
      }
    }
  } catch {}

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
