import { cookies } from 'next/headers';
import { createClient, createAdminClient } from './server';
import { getStoredOfficerRoles, ROOT_SUPER_ADMIN } from '@/lib/constants/officers-store';
import type { UserTier } from '@/lib/types';
import { getOfficialTierForEmail } from '@/lib/auth/official-roles';
import crypto from 'crypto';

const COOKIE_SECRET = process.env.DEMO_COOKIE_SECRET || 'dev-cookie-secret';

export function parseDemoCookie(cookieVal: string): any | null {
  if (!cookieVal) return null;
  // SECURITY: Only honor demo sessions in development or if explicitly enabled
  const isDemoAllowed = process.env.ENABLE_DEMO_MODE === 'true' || process.env.NODE_ENV === 'development';
  if (!isDemoAllowed) return null;

  try {
    let str = cookieVal.trim();
    if (str.startsWith('"') && str.endsWith('"')) {
      str = str.slice(1, -1);
    }

    // Extract payload and signature — format: {json_payload}.{64-char-hex-hmac}
    const lastDot = str.lastIndexOf('.');
    if (lastDot === -1 || str.length - lastDot !== 65) {
      // Must have valid 64-character HMAC hex signature
      return null;
    }

    const payload = str.slice(0, lastDot);
    const signature = str.slice(lastDot + 1);

    // Verify HMAC signature before trusting the payload
    const expectedSig = crypto
      .createHmac('sha256', COOKIE_SECRET)
      .update(payload)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      // Invalid signature — cookie may have been tampered with
      return null;
    }

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

export interface AuthContext {
  email: string;
  isSuperAdmin: boolean;
  isEventAdmin: boolean;
  isChecker: boolean;
  isSecurity: boolean;
  /** Admin Văn phòng Đoàn (bao gồm cả Super Admin). */
  isOfficeAdmin?: boolean;
  tier: UserTier;
  managed_events?: any[];
}

// In-memory cache for AuthContext to avoid redundant DB queries on every request (TTL: 60s)
const MAX_AUTH_CTX_CACHE = 2000;
const MAX_VERIFIED_TOKEN_CACHE = 3000;
const VERIFIED_TOKEN_MAX_TTL_SEC = 300; // 5 minutes max (capped by JWT exp)

export interface VerifiedTokenCacheItem {
  email: string;
  id: string;
  exp: number; // Unix timestamp in seconds
  verifiedAt: number; // ms
}

const gAuth = globalThis as unknown as {
  __hddAuthContextCache?: Map<string, { ctx: AuthContext; expiresAt: number }>;
  __hddInflightAuthContext?: Map<string, Promise<AuthContext>>;
  __hddVerifiedTokenCache?: Map<string, VerifiedTokenCacheItem>;
  __hddInflightTokenVerify?: Map<string, Promise<{ email: string; id: string } | null>>;
};

const authContextCache =
  gAuth.__hddAuthContextCache || (gAuth.__hddAuthContextCache = new Map());
const inflightAuthContext =
  gAuth.__hddInflightAuthContext || (gAuth.__hddInflightAuthContext = new Map());
const verifiedTokenCache =
  gAuth.__hddVerifiedTokenCache || (gAuth.__hddVerifiedTokenCache = new Map());
const inflightTokenVerify =
  gAuth.__hddInflightTokenVerify || (gAuth.__hddInflightTokenVerify = new Map());

function setBoundedAuthContext(key: string, ctx: AuthContext, ttlMs = 60000) {
  const now = Date.now();
  if (!authContextCache.has(key) && authContextCache.size >= MAX_AUTH_CTX_CACHE) {
    for (const [k, v] of authContextCache.entries()) {
      if (v.expiresAt <= now) authContextCache.delete(k);
    }
    if (authContextCache.size >= MAX_AUTH_CTX_CACHE) {
      const oldestKey = authContextCache.keys().next().value;
      if (oldestKey !== undefined) authContextCache.delete(oldestKey);
    }
  }
  authContextCache.set(key, { ctx, expiresAt: now + ttlMs });
}

function setBoundedVerifiedToken(tokenHash: string, item: VerifiedTokenCacheItem) {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!verifiedTokenCache.has(tokenHash) && verifiedTokenCache.size >= MAX_VERIFIED_TOKEN_CACHE) {
    for (const [k, v] of verifiedTokenCache.entries()) {
      if (v.exp <= nowSec) verifiedTokenCache.delete(k);
    }
    if (verifiedTokenCache.size >= MAX_VERIFIED_TOKEN_CACHE) {
      const oldestKey = verifiedTokenCache.keys().next().value;
      if (oldestKey !== undefined) verifiedTokenCache.delete(oldestKey);
    }
  }
  verifiedTokenCache.set(tokenHash, item);
}

export function invalidateAuthContextCache(email?: string) {
  if (email) {
    const k = email.toLowerCase().trim();
    authContextCache.delete(k);
    inflightAuthContext.delete(k);
  } else {
    authContextCache.clear();
    inflightAuthContext.clear();
  }
}

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

/**
 * Local HMAC-SHA256 JWT verification when SUPABASE_JWT_SECRET is configured.
 * Eliminates network round-trips to Supabase GoTrue under high concurrency.
 */
function verifySupabaseJwtLocally(rawToken: string): { email: string; id: string; exp: number } | null {
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (!jwtSecret) return null;

  try {
    const parts = rawToken.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(decodeBase64Safe(headerB64));
    if (header?.alg !== 'HS256') return null;

    const expectedSigB64Url = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const sigBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSigB64Url);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(decodeBase64Safe(payloadB64));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowSec) {
      return null;
    }

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

export function extractRawTokenFromCookies(cookieList: Array<{ name: string; value: string }>): string | null {
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

export async function getVerifiedUserFromCookies(
  supabase: any,
  cookieList: Array<{ name: string; value: string }>
): Promise<{ email: string; id: string } | null> {
  const rawToken = extractRawTokenFromCookies(cookieList);
  if (!rawToken || !rawToken.includes('.')) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  // 1. FAST-PATH: Check shared cryptographic verified token cache (instant sub-millisecond return!)
  const cached = verifiedTokenCache.get(tokenHash);
  if (cached) {
    if (cached.exp > nowSec + 5) {
      return { email: cached.email, id: cached.id };
    }
    verifiedTokenCache.delete(tokenHash);
  }

  // 2. ZERO-NETWORK FAST-PATH: Local HMAC-SHA256 verification when SUPABASE_JWT_SECRET is set
  const localVerified = verifySupabaseJwtLocally(rawToken);
  if (localVerified) {
    const ttlSec = Math.min(Math.max(localVerified.exp - nowSec, 5), VERIFIED_TOKEN_MAX_TTL_SEC);
    setBoundedVerifiedToken(tokenHash, {
      email: localVerified.email,
      id: localVerified.id,
      exp: nowSec + ttlSec,
      verifiedAt: Date.now(),
    });
    return { email: localVerified.email, id: localVerified.id };
  }

  // 3. IN-FLIGHT DEDUPLICATION: Coalesce concurrent verifications of the same token
  const existingInflight = inflightTokenVerify.get(tokenHash);
  if (existingInflight) {
    return existingInflight;
  }

  // 4. CACHE-MISS: Verify token cryptographic signature with Supabase Auth
  const verifyPromise = (async (): Promise<{ email: string; id: string } | null> => {
    try {
      const { data, error } = await supabase.auth.getUser(rawToken);
      if (!error && data?.user?.email) {
        const email = data.user.email.toLowerCase().trim();
        const id = data.user.id || '';

        let exp = nowSec + VERIFIED_TOKEN_MAX_TTL_SEC;
        try {
          const parts = rawToken.split('.');
          if (parts.length >= 2) {
            const payload = JSON.parse(decodeBase64Safe(parts[1]));
            if (payload?.exp && typeof payload.exp === 'number') {
              exp = payload.exp;
            }
          }
        } catch {}

        const ttlSec = Math.min(Math.max(exp - nowSec, 5), VERIFIED_TOKEN_MAX_TTL_SEC);
        setBoundedVerifiedToken(tokenHash, {
          email,
          id,
          exp: nowSec + ttlSec,
          verifiedAt: Date.now(),
        });

        return { email, id };
      }
    } catch (err) {
      console.error('Cryptographic token verification error:', err);
    } finally {
      inflightTokenVerify.delete(tokenHash);
    }
    return null;
  })();

  inflightTokenVerify.set(tokenHash, verifyPromise);
  return verifyPromise;
}

// Backwards-compatible safe wrapper: only returns user if token was cryptographically verified
export function extractUserFromCookies(cookieList: Array<{ name: string; value: string }>): { email: string; id: string; exp: number } | null {
  try {
    const rawToken = extractRawTokenFromCookies(cookieList);
    if (!rawToken) return null;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const cached = verifiedTokenCache.get(tokenHash);
    if (cached && cached.exp > Math.floor(Date.now() / 1000)) {
      return { email: cached.email, id: cached.id, exp: cached.exp };
    }
  } catch {}
  return null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  let email: string | null = null;
  let explicitTier: UserTier | null = null;

  const supabase = await createClient();

  try {
    const cookieStore = await cookies();
    const demoCookie = cookieStore.get('demo_session');
    if (demoCookie?.value) {
      const demoUser = parseDemoCookie(demoCookie.value);
      if (demoUser?.email) {
        const lowerEmail = demoUser.email.toLowerCase();
        const explicitTier = (demoUser.tier || 'user') as UserTier;
        const isSuperAdmin = explicitTier === 'super_admin' || lowerEmail === 'n22dccn158@student.ptithcm.edu.vn';
        const isYouthUnion = explicitTier === 'youth_union';
        const demoOfficialTier = getOfficialTierForEmail(lowerEmail);
        const isCtsv = explicitTier === 'ctsv' || demoOfficialTier === 'ctsv';
        const isFacility = explicitTier === 'facility' || demoOfficialTier === 'facility';
        const isSecurity = explicitTier === 'security' || demoOfficialTier === 'security';
        const isEventAdmin = isSuperAdmin || isYouthUnion || isCtsv || isFacility || explicitTier === 'event_admin';
        const isChecker = isEventAdmin || isSecurity || explicitTier === 'checker';

        return {
          email: demoUser.email,
          isSuperAdmin,
          isEventAdmin,
          isChecker,
          isSecurity,
          tier: explicitTier,
          managed_events: Array.isArray(demoUser.managed_events) ? demoUser.managed_events : undefined,
        };
      }
    }

    // Cryptographic Token Verification with High-Speed Verified Token Cache
    const verifiedUser = await getVerifiedUserFromCookies(supabase, cookieStore.getAll());
    if (verifiedUser?.email) {
      email = verifiedUser.email;
    }
  } catch {}

  // If email is already extracted, check in-memory cache first (TTL: 60 seconds)
  if (email) {
    const cached = authContextCache.get(email.toLowerCase());
    if (cached && cached.expiresAt > Date.now()) {
      return cached.ctx;
    }
  }

  if (!email) {
    try {
      if (supabase.auth?.getSession) {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user?.email) {
          email = data.session.user.email;
        }
      }
    } catch {}

    if (!email) {
      try {
        if (supabase.auth?.getUser) {
          const { data } = await supabase.auth.getUser();
          if (data?.user?.email) {
            email = data.user.email;
          }
        }
      } catch {}
    }
  }

  if (!email) {
    return null;
  }

  // Check cache again after fallback retrieval
  const cached = authContextCache.get(email.toLowerCase());
  if (cached && cached.expiresAt > Date.now()) {
    return cached.ctx;
  }

  if (explicitTier) {
    const lowerEmail = email.toLowerCase();
    const isSuperAdmin = explicitTier === 'super_admin' || lowerEmail === 'n22dccn158@student.ptithcm.edu.vn';
    const isYouthUnion = explicitTier === 'youth_union';
    const explicitOfficialTier = getOfficialTierForEmail(lowerEmail);
    const isCtsv = explicitTier === 'ctsv' || explicitOfficialTier === 'ctsv';
    const isFacility = explicitTier === 'facility' || explicitOfficialTier === 'facility';
    const isSecurity = explicitTier === 'security' || explicitOfficialTier === 'security';
    const isEventAdmin = isSuperAdmin || isYouthUnion || isCtsv || isFacility || explicitTier === 'event_admin';
    const isChecker = isEventAdmin || isSecurity || explicitTier === 'checker';

    const ctx: AuthContext = {
      email,
      isSuperAdmin,
      isEventAdmin,
      isChecker,
      isSecurity,
      isOfficeAdmin: isSuperAdmin || explicitTier === 'office_admin',
      tier: explicitTier,
    };
    setBoundedAuthContext(email.toLowerCase(), ctx, 60000);
    return ctx;
  }

  const lowerEmail = email.toLowerCase().trim();

  // In-flight deduplication for concurrent getAuthContext calls of the same user
  const existingCtxInflight = inflightAuthContext.get(lowerEmail);
  if (existingCtxInflight) {
    return existingCtxInflight;
  }

  const resolveCtxPromise = (async (): Promise<AuthContext> => {
    try {
      const adminClient = (typeof createAdminClient === 'function' ? await createAdminClient() : null) || supabase;
      const isRegularStudent = lowerEmail.endsWith('@student.ptithcm.edu.vn') && lowerEmail !== ROOT_SUPER_ADMIN.toLowerCase();

      // Run all auth queries in parallel for performance (use .eq on lowerEmail to hit B-tree indexes!)
      const [superAdmin, assignedOfficerRole, eventRoles, hasCreatedEvents] = await Promise.all([
        // Check super_admins table
        (async () => {
          if (isRegularStudent) return null;
          try {
            const q = adminClient.from('super_admins').select('email');
            const { data } = typeof q.eq === 'function'
              ? await q.eq('email', lowerEmail).maybeSingle()
              : await q.ilike('email', lowerEmail).maybeSingle();
            return data;
          } catch { return null; }
        })(),
        // Check dynamic officer_roles via persistent store
        (async () => {
          try {
            const roles = await getStoredOfficerRoles(adminClient);
            return roles.find((r) => r.email.toLowerCase() === lowerEmail) || null;
          } catch { return null; }
        })(),
        // Check event_roles table (use B-tree index idx_event_roles_email via .eq)
        (async () => {
          try {
            const q = adminClient.from('event_roles').select('event_id, role_type');
            const { data } = typeof q.eq === 'function'
              ? await q.eq('email', lowerEmail)
              : await q.ilike('email', lowerEmail);
            return data || [];
          } catch { return []; }
        })(),
        // Check if created any events (students never create events)
        (async () => {
          if (isRegularStudent) return false;
          try {
            const q = adminClient.from('events').select('event_id');
            const { data } = typeof q.eq === 'function'
              ? await q.eq('created_by', lowerEmail).limit(1)
              : await q.ilike('created_by', lowerEmail).limit(1);
            return Boolean(data && data.length > 0);
          } catch { return false; }
        })(),
      ]);

      const isSubAdminUnit = lowerEmail.startsWith('lcd') || lowerEmail.startsWith('clb') || lowerEmail.startsWith('doi');

      // SECURITY: exact-match allowlist only (no substring matching on email)
      const officialTier = getOfficialTierForEmail(lowerEmail);

      const isSuperAdmin =
        lowerEmail === ROOT_SUPER_ADMIN.toLowerCase() ||
        !!superAdmin ||
        assignedOfficerRole?.role_tier === 'super_admin' ||
        explicitTier === 'super_admin';

      const isYouthUnion =
        officialTier === 'youth_union' ||
        assignedOfficerRole?.role_tier === 'youth_union' ||
        explicitTier === 'youth_union';

      const isCtsv =
        officialTier === 'ctsv' ||
        assignedOfficerRole?.role_tier === 'ctsv' ||
        explicitTier === 'ctsv';

      const isFacility =
        officialTier === 'facility' ||
        assignedOfficerRole?.role_tier === 'facility' ||
        explicitTier === 'facility';

      const isSecurity =
        officialTier === 'security' ||
        assignedOfficerRole?.role_tier === 'security' ||
        explicitTier === 'security';

      const isOfficeAdmin =
        isSuperAdmin ||
        assignedOfficerRole?.role_tier === 'office_admin' ||
        explicitTier === 'office_admin';

      const isEventAdmin =
        isSuperAdmin ||
        isYouthUnion ||
        isCtsv ||
        isFacility ||
        isSubAdminUnit ||
        hasCreatedEvents ||
        assignedOfficerRole?.role_tier === 'event_admin' ||
        (eventRoles?.some((r: any) => r.role_type === 'event_admin') ?? false) ||
        explicitTier === 'event_admin';

      const isChecker =
        isSuperAdmin ||
        isSecurity ||
        assignedOfficerRole?.role_tier === 'checker' ||
        (eventRoles?.some((r: any) => r.role_type === 'checker' || r.role_type === 'event_admin') ?? false) ||
        explicitTier === 'checker';

      let tier: UserTier = explicitTier || 'user';
      if (isSuperAdmin) {
        tier = 'super_admin';
      } else if (isYouthUnion) {
        tier = 'youth_union';
      } else if (isCtsv) {
        tier = 'ctsv';
      } else if (isFacility) {
        tier = 'facility';
      } else if (isSecurity) {
        tier = 'security';
      } else if (isEventAdmin) {
        tier = 'event_admin';
      } else if (isOfficeAdmin) {
        tier = 'office_admin';
      } else if (isChecker) {
        tier = 'checker';
      }

      const managed_events = Array.isArray(eventRoles)
        ? eventRoles
            .filter((r: any) => r && (r.event_id || r.role_type))
            .map((r: any) => ({
              event_id: r.event_id,
              role_type: r.role_type,
            }))
        : [];

      const ctx: AuthContext = {
        email,
        isSuperAdmin,
        isEventAdmin,
        isChecker,
        isSecurity,
        isOfficeAdmin,
        tier,
        managed_events,
      };

      setBoundedAuthContext(lowerEmail, ctx, 60000);
      return ctx;
    } finally {
      inflightAuthContext.delete(lowerEmail);
    }
  })();

  inflightAuthContext.set(lowerEmail, resolveCtxPromise);
  return resolveCtxPromise;
}
