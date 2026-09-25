import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

async function parseDemoCookie(cookieVal: string): Promise<any | null> {
  if (!cookieVal) return null;
  // SECURITY: Only allow demo mode in development or when explicitly enabled
  const isDemoAllowed = process.env.ENABLE_DEMO_MODE === 'true' || process.env.NODE_ENV === 'development';
  if (!isDemoAllowed) return null;

  try {
    let str = cookieVal.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }
    const lastDot = str.lastIndexOf('.');
    if (lastDot === -1 || str.length - lastDot !== 65) {
      return null;
    }

    const payload = str.slice(0, lastDot);
    const signature = str.slice(lastDot + 1);

    // Verify HMAC-SHA256 signature using standard Web Crypto API (Edge-compatible)
    const encoder = new TextEncoder();
    const keyData = encoder.encode(COOKIE_SECRET);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(
      signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );
    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      encoder.encode(payload)
    );

    if (!isValid) return null;

    str = payload;
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

// In-memory cache for middleware verified tokens: tokenHash -> { email, exp }
const verifiedMiddlewareTokenCache = new Map<string, { email: string; exp: number }>();

async function hashTokenEdge(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function extractRawTokenFromCookies(cookieList: Array<{ name: string; value: string }>): string | null {
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

    if (Array.isArray(parsed) && typeof parsed[0] === 'string') {
      return parsed[0];
    }
    if (typeof parsed === 'object' && typeof parsed.access_token === 'string') {
      return parsed.access_token;
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

  // 2. Check Demo Session Cookie (Instant cryptographically verified check)
  const demoCookie = request.cookies.get('demo_session');
  if (demoCookie?.value) {
    const demoUser = await parseDemoCookie(demoCookie.value);
    if (demoUser?.email) {
      return addSecurityHeaders(NextResponse.next());
    }
  }

  // 3. CRYPTOGRAPHIC TOKEN VERIFICATION WITH IN-MEMORY VERIFIED TOKEN CACHE:
  const allCookies = request.cookies.getAll();
  const rawToken = extractRawTokenFromCookies(allCookies);

  let authenticatedEmail: string | null = null;
  let tokenHash: string | null = null;

  if (rawToken && rawToken.includes('.')) {
    try {
      tokenHash = await hashTokenEdge(rawToken);
      const cached = verifiedMiddlewareTokenCache.get(tokenHash);
      const nowSec = Math.floor(Date.now() / 1000);
      if (cached && cached.exp > nowSec + 5) {
        // Fast-path: Token signature was ALREADY cryptographically verified! Sub-millisecond return!
        authenticatedEmail = cached.email;
      } else if (cached) {
        verifiedMiddlewareTokenCache.delete(tokenHash);
      }
    } catch {}
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'placeholder-anon-key';

  // 4. Cache-miss: Cryptographically verify token with Supabase Auth SDK
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

      const { data, error } = rawToken
        ? await supabase.auth.getUser(rawToken)
        : await supabase.auth.getUser();

      if (!error && data?.user?.email) {
        authenticatedEmail = data.user.email.toLowerCase().trim();

        // If we have tokenHash, cache this verified session for 60s
        if (tokenHash) {
          const nowSec = Math.floor(Date.now() / 1000);
          let exp = nowSec + 60;
          try {
            const parts = rawToken!.split('.');
            if (parts.length >= 2) {
              const payload = JSON.parse(decodeBase64Safe(parts[1]));
              if (payload?.exp && typeof payload.exp === 'number') {
                exp = payload.exp;
              }
            }
          } catch {}

          const ttlSec = Math.min(Math.max(exp - nowSec, 5), 60);
          verifiedMiddlewareTokenCache.set(tokenHash, {
            email: authenticatedEmail,
            exp: nowSec + ttlSec,
          });

          // Cleanup stale cache
          if (verifiedMiddlewareTokenCache.size > 2000) {
            for (const [k, v] of verifiedMiddlewareTokenCache.entries()) {
              if (v.exp < nowSec) verifiedMiddlewareTokenCache.delete(k);
            }
          }
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
