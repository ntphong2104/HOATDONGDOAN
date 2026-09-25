import { cookies } from 'next/headers';
import { createClient, createAdminClient } from './server';
import { getStoredOfficerRoles, ROOT_SUPER_ADMIN } from '@/lib/constants/officers-store';
import type { UserTier } from '@/lib/types';
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
  tier: UserTier;
  managed_events?: any[];
}

// In-memory cache for AuthContext to avoid redundant DB queries on every request (TTL: 60s)
const authContextCache = new Map<string, { ctx: AuthContext; expiresAt: number }>();

export function invalidateAuthContextCache(email?: string) {
  if (email) {
    authContextCache.delete(email.toLowerCase().trim());
  } else {
    authContextCache.clear();
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

// In-memory cache for cryptographically verified tokens: tokenHash -> VerifiedUser
interface VerifiedTokenCacheItem {
  email: string;
  id: string;
  exp: number; // Unix timestamp in seconds
  verifiedAt: number; // ms
}

const verifiedTokenCache = new Map<string, VerifiedTokenCacheItem>();

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

  // 1. FAST-PATH: Check cryptographic verified token cache (instant sub-millisecond return!)
  const cached = verifiedTokenCache.get(tokenHash);
  if (cached) {
    if (cached.exp > nowSec + 5) {
      return { email: cached.email, id: cached.id };
    }
    verifiedTokenCache.delete(tokenHash);
  }

  // 2. CACHE-MISS: Verify token cryptographic signature with Supabase Auth
  try {
    const { data, error } = await supabase.auth.getUser(rawToken);
    if (!error && data?.user?.email) {
      const email = data.user.email.toLowerCase().trim();
      const id = data.user.id || '';

      // Determine expiration from token payload if available
      let exp = nowSec + 60;
      try {
        const parts = rawToken.split('.');
        if (parts.length >= 2) {
          const payload = JSON.parse(decodeBase64Safe(parts[1]));
          if (payload?.exp && typeof payload.exp === 'number') {
            exp = payload.exp;
          }
        }
      } catch {}

      // Cache verified token: TTL = min(token remaining, 60s)
      const ttlSec = Math.min(Math.max(exp - nowSec, 5), 60);
      verifiedTokenCache.set(tokenHash, {
        email,
        id,
        exp: nowSec + ttlSec,
        verifiedAt: Date.now(),
      });

      // Cleanup cache if too large
      if (verifiedTokenCache.size > 2000) {
        const nowMs = Date.now();
        for (const [k, v] of verifiedTokenCache.entries()) {
          if (v.exp * 1000 < nowMs) verifiedTokenCache.delete(k);
        }
      }

      return { email, id };
    }
  } catch (err) {
    console.error('Cryptographic token verification error:', err);
  }

  return null;
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
        const isCtsv = explicitTier === 'ctsv' || lowerEmail.includes('phongctsv');
        const isFacility = explicitTier === 'facility' || lowerEmail.includes('phongquantri') || lowerEmail.includes('quantri') || lowerEmail.includes('tchc') || lowerEmail.includes('csvc');
        const isSecurity = explicitTier === 'security' || lowerEmail.includes('baove') || lowerEmail.includes('security');
        const isEventAdmin = isSuperAdmin || isYouthUnion || isCtsv || isFacility || explicitTier === 'event_admin';
        const isChecker = isEventAdmin || isSecurity || explicitTier === 'checker';

        return {
          email: demoUser.email,
          isSuperAdmin,
          isEventAdmin,
          isChecker,
          isSecurity,
          tier: explicitTier,
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
    const isCtsv = explicitTier === 'ctsv' || lowerEmail.includes('phongctsv');
    const isFacility = explicitTier === 'facility' || lowerEmail.includes('phongquantri');
    const isSecurity = explicitTier === 'security' || lowerEmail.includes('baove') || lowerEmail.includes('security');
    const isEventAdmin = isSuperAdmin || isYouthUnion || isCtsv || isFacility || explicitTier === 'event_admin';
    const isChecker = isEventAdmin || isSecurity || explicitTier === 'checker';

    const ctx: AuthContext = {
      email,
      isSuperAdmin,
      isEventAdmin,
      isChecker,
      isSecurity,
      tier: explicitTier,
    };
    authContextCache.set(email.toLowerCase(), { ctx, expiresAt: Date.now() + 60000 });
    return ctx;
  }

  const adminClient = (typeof createAdminClient === 'function' ? await createAdminClient() : null) || supabase;
  const lowerEmail = email.toLowerCase();
  const isRegularStudent = lowerEmail.endsWith('@student.ptithcm.edu.vn') && lowerEmail !== ROOT_SUPER_ADMIN.toLowerCase();

  // Run all auth queries in parallel for performance (skip events/super_admins for plain students)
  const [superAdmin, assignedOfficerRole, eventRoles, hasCreatedEvents] = await Promise.all([
    // Check super_admins table
    (async () => {
      if (isRegularStudent) return null;
      try {
        const q = adminClient.from('super_admins').select('email');
        const { data } = typeof q.ilike === 'function'
          ? await q.ilike('email', email).maybeSingle()
          : await q.eq('email', email).maybeSingle();
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
    // Check event_roles table
    (async () => {
      try {
        const q = adminClient.from('event_roles').select('role_type');
        const { data } = typeof q.ilike === 'function'
          ? await q.ilike('email', email)
          : await q.eq('email', email);
        return data || [];
      } catch { return []; }
    })(),
    // Check if created any events (students never create events)
    (async () => {
      if (isRegularStudent) return false;
      try {
        const q = adminClient.from('events').select('event_id');
        const { data } = typeof q.ilike === 'function'
          ? await q.ilike('created_by', email).limit(1)
          : await q.eq('created_by', email).limit(1);
        return Boolean(data && data.length > 0);
      } catch { return false; }
    })(),
  ]);

  const isSubAdminUnit = lowerEmail.startsWith('lcd') || lowerEmail.startsWith('clb') || lowerEmail.startsWith('doi');

  const isSuperAdmin =
    lowerEmail === ROOT_SUPER_ADMIN.toLowerCase() ||
    !!superAdmin ||
    assignedOfficerRole?.role_tier === 'super_admin' ||
    explicitTier === 'super_admin';

  const isYouthUnion =
    lowerEmail.includes('bchdoan') ||
    assignedOfficerRole?.role_tier === 'youth_union' ||
    assignedOfficerRole?.unit_code === 'BCH_DOAN' ||
    explicitTier === 'youth_union';

  const isCtsv =
    lowerEmail.includes('phongctsv') ||
    lowerEmail.includes('ctsv') ||
    assignedOfficerRole?.role_tier === 'ctsv' ||
    assignedOfficerRole?.unit_code === 'PHONG_CTSV' ||
    explicitTier === 'ctsv';

  const isFacility =
    lowerEmail.includes('phongquantri') ||
    lowerEmail.includes('quantri') ||
    lowerEmail.includes('tchc') ||
    lowerEmail.includes('tchcqt') ||
    lowerEmail.includes('csvc') ||
    assignedOfficerRole?.role_tier === 'facility' ||
    assignedOfficerRole?.unit_code === 'PHONG_TCHCQT' ||
    explicitTier === 'facility';

  const isSecurity =
    lowerEmail.includes('baove') ||
    lowerEmail.includes('security') ||
    assignedOfficerRole?.role_tier === 'security' ||
    assignedOfficerRole?.unit_code === 'TO_BAO_VE' ||
    explicitTier === 'security';

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
  } else if (isChecker) {
    tier = 'checker';
  }

  const ctx: AuthContext = {
    email,
    isSuperAdmin,
    isEventAdmin,
    isChecker,
    isSecurity,
    tier,
  };

  authContextCache.set(email.toLowerCase(), { ctx, expiresAt: Date.now() + 60000 });
  return ctx;
}
