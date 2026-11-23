import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { sanitizeRedirectPath, getTrustedOrigin } from '@/lib/security/redirect';

const ROOT_SUPER_ADMIN = 'n22dccn158@student.ptithcm.edu.vn';

function getDemoCookieSecret(): string | null {
  const envSecret = process.env.DEMO_COOKIE_SECRET;
  if (envSecret && envSecret.length >= 32) return envSecret;
  if (process.env.NODE_ENV === 'production') return null;
  return envSecret || 'dev-cookie-secret';
}

async function parseDemoCookie(cookieVal: string): Promise<any | null> {
  if (!cookieVal) return null;
  // SECURITY: Only allow demo mode in development or when explicitly enabled
  const isDemoAllowed = process.env.ENABLE_DEMO_MODE === 'true' || process.env.NODE_ENV === 'development';
  if (!isDemoAllowed) return null;

  const secret = getDemoCookieSecret();
  if (!secret) return null;

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
    const keyData = encoder.encode(secret);
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
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

function addSecurityHeaders(response: NextResponse): NextResponse {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

// Routes that need exact match (not prefix)
const PUBLIC_EXACT_ROUTES = ['/privacy', '/terms'];

// Routes that allow prefix matching for public sub-paths
const PUBLIC_PREFIX_ROUTES = [
  '/login',
  '/auth/callback',
  '/maintenance',
  '/api/auth/demo',
  '/api/auth/logout',
  '/events/', // /events/[id]/register & recruitment pages
];

const MAINTENANCE_EXEMPT_PREFIXES = [
  '/maintenance',
  '/login',
  '/auth/callback',
  '/api/auth/',
  '/api/admin/maintenance',
  '/api/cron/reconcile',
  '/privacy',
  '/terms',
];

function decodeBase64Safe(str: string): string {
  try {
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

interface SharedVerifiedTokenItem {
  email: string;
  id: string;
  exp: number;
  verifiedAt: number;
}

interface MaintenanceCacheState {
  enabled: boolean;
  timestamp: number;
}

const gMiddleware = globalThis as unknown as {
  __hddVerifiedTokenCache?: Map<string, SharedVerifiedTokenItem>;
  __hddInflightTokenVerify?: Map<string, Promise<{ email: string; id: string } | null>>;
  __hddMaintenanceCache?: MaintenanceCacheState;
  __hddInflightMaintenance?: Promise<boolean> | null;
};

const verifiedMiddlewareTokenCache =
  gMiddleware.__hddVerifiedTokenCache || (gMiddleware.__hddVerifiedTokenCache = new Map());
const inflightMiddlewareVerify =
  gMiddleware.__hddInflightTokenVerify || (gMiddleware.__hddInflightTokenVerify = new Map());

const MAX_MIDDLEWARE_TOKEN_CACHE = 3000;
const MIDDLEWARE_TOKEN_MAX_TTL_SEC = 300; // 5 minutes max
const MAINTENANCE_CACHE_TTL_MS = 30000;

function setBoundedMiddlewareToken(tokenHash: string, item: SharedVerifiedTokenItem) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!verifiedMiddlewareTokenCache.has(tokenHash) && verifiedMiddlewareTokenCache.size >= MAX_MIDDLEWARE_TOKEN_CACHE) {
    for (const [k, v] of verifiedMiddlewareTokenCache.entries()) {
      if (v.exp <= nowSec) verifiedMiddlewareTokenCache.delete(k);
    }
    if (verifiedMiddlewareTokenCache.size >= MAX_MIDDLEWARE_TOKEN_CACHE) {
      const oldestKey = verifiedMiddlewareTokenCache.keys().next().value;
      if (oldestKey !== undefined) verifiedMiddlewareTokenCache.delete(oldestKey);
    }
  }
  verifiedMiddlewareTokenCache.set(tokenHash, item);
}

async function hashTokenEdge(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyJwtLocallyEdge(rawToken: string): Promise<{ email: string; id: string; exp: number } | null> {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const parts = rawToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(decodeBase64Safe(headerB64));
    if (header?.alg !== 'HS256') return null;

    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const paddedSig = signatureB64.length % 4 === 0 ? signatureB64 : signatureB64 + '='.repeat(4 - (signatureB64.length % 4));
    const sigBinary = decodeBase64Safe(paddedSig);
    const sigBytes = new Uint8Array(sigBinary.length);
    for (let i = 0; i < sigBinary.length; i++) {
      sigBytes[i] = sigBinary.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      sigBytes,
      encoder.encode(`${headerB64}.${payloadB64}`)
    );
    if (!isValid) return null;

    const payload = JSON.parse(decodeBase64Safe(payloadB64));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > nowSec + 5) return null;
    if (payload.role !== 'authenticated') return null;
    if (payload.aud !== 'authenticated') return null;

    const email = typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : '';
    if (!email) return null;

    return {
      email,
      id: typeof payload.sub === 'string' ? payload.sub : '',
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

const SB_AUTH_COOKIE_RE = /^sb-[^-]+-auth-token(?:\.(\d+))?$/;

function extractRawTokenFromCookies(cookieList: Array<{ name: string; value: string }>): string | null {
  try {
    const authCookies = cookieList
      .map((c) => {
        const m = SB_AUTH_COOKIE_RE.exec(c.name);
        if (!m) return null;
        return { cookie: c, chunkIdx: m[1] !== undefined ? parseInt(m[1], 10) : -1 };
      })
      .filter((x): x is { cookie: { name: string; value: string }; chunkIdx: number } => x !== null)
      .sort((a, b) => a.chunkIdx - b.chunkIdx)
      .map((x) => x.cookie);

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

function parseMaintenanceEnabled(val: any): boolean {
  if (val === true || val === 'true') return true;
  if (val && typeof val === 'object') {
    return val.enabled === true || val.enabled === 'true' || val.maintenance_mode === true;
  }
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return parseMaintenanceEnabled(parsed);
    } catch {}
  }
  return false;
}

async function getCachedMaintenanceMode(supabase: any): Promise<boolean> {
  const now = Date.now();
  const cached = gMiddleware.__hddMaintenanceCache;
  if (cached && now - cached.timestamp < MAINTENANCE_CACHE_TTL_MS) {
    return cached.enabled;
  }

  if (gMiddleware.__hddInflightMaintenance) {
    return gMiddleware.__hddInflightMaintenance;
  }

  const task = (async () => {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      const isEnabled = parseMaintenanceEnabled(data?.value);
      gMiddleware.__hddMaintenanceCache = {
        enabled: isEnabled,
        timestamp: Date.now(),
      };
      return isEnabled;
    } catch {
      return gMiddleware.__hddMaintenanceCache?.enabled ?? false;
    } finally {
      gMiddleware.__hddInflightMaintenance = null;
    }
  })();

  gMiddleware.__hddInflightMaintenance = task;
  return task;
}

function createAnonSupabaseForReq(request: NextRequest, supabaseUrl: string, supabaseAnonKey: string) {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {},
    },
  });
}

async function resolveAuthenticatedIdentity(
  request: NextRequest,
  supabaseUrl: string,
  supabaseAnonKey: string
): Promise<{
  email: string | null;
  demoTier: string | null;
  response: NextResponse;
}> {
  let response = NextResponse.next({ request });

  const demoCookie = request.cookies.get('demo_session');
  if (demoCookie?.value) {
    const demoUser = await parseDemoCookie(demoCookie.value);
    if (demoUser?.email) {
      return {
        email: String(demoUser.email).toLowerCase().trim(),
        demoTier: typeof demoUser.tier === 'string' ? demoUser.tier : null,
        response,
      };
    }
  }

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
        authenticatedEmail = cached.email;
      } else {
        if (cached) {
          verifiedMiddlewareTokenCache.delete(tokenHash);
        }
        const localVerified = await verifyJwtLocallyEdge(rawToken);
        if (localVerified) {
          authenticatedEmail = localVerified.email;
          const ttlSec = Math.min(Math.max(localVerified.exp - nowSec, 5), MIDDLEWARE_TOKEN_MAX_TTL_SEC);
          setBoundedMiddlewareToken(tokenHash, {
            email: localVerified.email,
            id: localVerified.id,
            exp: nowSec + ttlSec,
            verifiedAt: Date.now(),
          });
        }
      }
    } catch {}
  }

  if (!authenticatedEmail) {
    try {
      const existingInflight = tokenHash ? inflightMiddlewareVerify.get(tokenHash) : null;
      if (existingInflight) {
        const res = await existingInflight;
        if (res?.email) authenticatedEmail = res.email;
      } else {
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
              response = NextResponse.next({ request });
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        });

        const verifyTask = (async (): Promise<{ email: string; id: string } | null> => {
          try {
            const { data, error } = await supabase.auth.getUser();
            if (!error && data?.user?.email) {
              const email = data.user.email.toLowerCase().trim();
              const id = data.user.id || '';

              if (tokenHash && rawToken) {
                const nowSec = Math.floor(Date.now() / 1000);
                let exp = nowSec + MIDDLEWARE_TOKEN_MAX_TTL_SEC;
                try {
                  const parts = rawToken.split('.');
                  if (parts.length >= 2) {
                    const payload = JSON.parse(decodeBase64Safe(parts[1]));
                    if (payload?.exp && typeof payload.exp === 'number') {
                      exp = payload.exp;
                    }
                  }
                } catch {}

                if (exp > nowSec + 5) {
                  const ttlSec = Math.min(exp - nowSec, MIDDLEWARE_TOKEN_MAX_TTL_SEC);
                  setBoundedMiddlewareToken(tokenHash, {
                    email,
                    id,
                    exp: nowSec + ttlSec,
                    verifiedAt: Date.now(),
                  });
                }
              }

              return { email, id };
            }
          } finally {
            if (tokenHash) inflightMiddlewareVerify.delete(tokenHash);
          }
          return null;
        })();

        if (tokenHash) {
          inflightMiddlewareVerify.set(tokenHash, verifyTask);
        }
        const verified = await verifyTask;
        if (verified?.email) {
          authenticatedEmail = verified.email;
        }
      }
    } catch {}
  }

  return { email: authenticatedEmail, demoTier: null, response };
}

async function isSuperAdminInMaintenance(
  supabase: any,
  email: string | null,
  demoTier: string | null
): Promise<boolean> {
  if (!email) return false;
  const cleanEmail = email.toLowerCase().trim();
  if (cleanEmail === ROOT_SUPER_ADMIN || demoTier === 'super_admin') {
    return true;
  }
  try {
    const [{ data: superAdmin }, { data: officerSuper }] = await Promise.all([
      supabase.from('super_admins').select('email').eq('email', cleanEmail).maybeSingle(),
      supabase
        .from('officer_roles')
        .select('email')
        .eq('email', cleanEmail)
        .eq('role_tier', 'super_admin')
        .maybeSingle(),
    ]);
    return Boolean(superAdmin || officerSuper);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isGet = request.method === 'GET' || request.method === 'HEAD';
  const publicOrigin = getTrustedOrigin(request);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    'placeholder-anon-key';

  // Cron endpoint verifies Bearer CRON_SECRET directly inside handler
  if (pathname === '/api/cron/reconcile') {
    return addSecurityHeaders(NextResponse.next());
  }

  const isMaintenanceExempt = MAINTENANCE_EXEMPT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  const isPublicRoute =
    pathname === '/' ||
    PUBLIC_PREFIX_ROUTES.some((route) => pathname.startsWith(route)) ||
    PUBLIC_EXACT_ROUTES.some((route) => pathname === route) ||
    (isGet &&
      (pathname === '/api/events/public' ||
        pathname === '/api/rooms' ||
        pathname === '/api/admin/maintenance' ||
        pathname === '/api/admin/units' ||
        /^\/api\/events\/[^/]+$/.test(pathname) ||
        /^\/api\/events\/[^/]+\/ratings$/.test(pathname))) ||
    /^\/events\/[^/]+\/register/.test(pathname) ||
    /^\/api\/events\/[^/]+\/register$/.test(pathname);

  // Check cached maintenance mode (coalesced across concurrent requests; 30s TTL)
  const anonSupabase = createAnonSupabaseForReq(request, supabaseUrl, supabaseAnonKey);
  const isMaintenance = isMaintenanceExempt ? false : await getCachedMaintenanceMode(anonSupabase);

  // 1. FAST-PATH FOR PUBLIC ROUTES (when NOT in maintenance mode)
  if (isPublicRoute && !isMaintenance) {
    if (pathname === '/') {
      const homeCookies = request.cookies.getAll();
      const homeRawToken = extractRawTokenFromCookies(homeCookies);
      if (homeRawToken && homeRawToken.includes('.')) {
        let needsRefresh = false;
        try {
          const parts = homeRawToken.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(decodeBase64Safe(parts[1]));
            const nowSec = Math.floor(Date.now() / 1000);
            if (!payload?.exp || typeof payload.exp !== 'number' || payload.exp <= nowSec + 120) {
              needsRefresh = true;
            }
          }
        } catch {
          needsRefresh = true;
        }

        if (needsRefresh) {
          let homeResponse = NextResponse.next({ request });
          try {
            const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
              cookies: {
                getAll() {
                  return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                  homeResponse = NextResponse.next({ request });
                  cookiesToSet.forEach(({ name, value, options }) =>
                    homeResponse.cookies.set(name, value, options)
                  );
                },
              },
            });
            await supabase.auth.getUser();
          } catch {}
          return addSecurityHeaders(homeResponse);
        }
      }
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // 2. Resolve identity (Demo cookie OR cryptographically verified Supabase JWT)
  const {
    email: authenticatedEmail,
    demoTier,
    response: supabaseResponse,
  } = await resolveAuthenticatedIdentity(request, supabaseUrl, supabaseAnonKey);

  // 3. Enforce Maintenance Mode BEFORE allowing access (for both protected and student-facing public routes)
  if (isMaintenance && !isMaintenanceExempt) {
    const authSupabase = createAnonSupabaseForReq(request, supabaseUrl, supabaseAnonKey);
    const allowedSuperAdmin = await isSuperAdminInMaintenance(
      authSupabase,
      authenticatedEmail,
      demoTier
    );
    if (!allowedSuperAdmin) {
      if (pathname.startsWith('/api/')) {
        return addSecurityHeaders(
          NextResponse.json(
            {
              success: false,
              error: 'Maintenance',
              message: 'Hệ thống đang bảo trì, vui lòng quay lại sau.',
            },
            { status: 503 }
          )
        );
      }
      return addSecurityHeaders(NextResponse.redirect(new URL('/maintenance', publicOrigin)));
    }
  }

  // If this was a public route during maintenance and user IS Super Admin, let them through
  if (isPublicRoute) {
    return addSecurityHeaders(supabaseResponse);
  }

  // 4. UNAUTHENTICATED ON PROTECTED ROUTE:
  if (!authenticatedEmail) {
    if (pathname.startsWith('/api/')) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: false, error: 'Unauthorized', message: 'Vui lòng đăng nhập' },
          { status: 401 }
        )
      );
    }

    const loginUrl = new URL('/login', publicOrigin);
    if (pathname && pathname !== '/' && pathname !== '/login') {
      const fullTarget = request.nextUrl.search ? `${pathname}${request.nextUrl.search}` : pathname;
      const safeTarget = sanitizeRedirectPath(fullTarget, '');
      if (safeTarget) {
        loginUrl.searchParams.set('redirect', safeTarget);
      }
    }
    return addSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return addSecurityHeaders(supabaseResponse);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|llms\\.txt|llms-full\\.txt|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
