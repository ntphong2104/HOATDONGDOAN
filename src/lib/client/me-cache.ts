'use client';

/**
 * Client-side deduplicator & short-lived cache for `GET /api/me`.
 *
 * When a page mounts, multiple components (ProfileCompletionGate, UserMenuDropdown,
 * StudentDashboardClient, EventRegisterPage, etc.) may call `/api/me` simultaneously.
 * This helper coalesces all concurrent calls into 1 HTTP request and caches the result
 * briefly in memory so we never trigger a request storm per user login.
 */

interface CachedMeResponse {
  ok: boolean;
  status: number;
  json: any;
  expiresAt: number;
}

const CLIENT_ME_TTL_MS = 15000;

let cachedMe: CachedMeResponse | null = null;
let inflightMePromise: Promise<CachedMeResponse> | null = null;
let lastFetchFnRef: typeof fetch | null = null;

export function invalidateClientMeCache(): void {
  cachedMe = null;
  inflightMePromise = null;
}

export function primeClientMeCache(userData: any): void {
  if (!userData || typeof userData !== 'object') return;
  if (typeof window !== 'undefined') {
    lastFetchFnRef = window.fetch;
  }
  cachedMe = {
    ok: true,
    status: 200,
    json: { success: true, data: userData },
    expiresAt: Date.now() + CLIENT_ME_TTL_MS,
  };
}

export async function fetchMeCached(options?: { force?: boolean }): Promise<CachedMeResponse> {
  const currentFetch = typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch : fetch;

  // Reset cache automatically in unit tests when global.fetch is replaced with a fresh jest.fn()
  if (lastFetchFnRef && lastFetchFnRef !== currentFetch) {
    cachedMe = null;
    inflightMePromise = null;
  }
  lastFetchFnRef = currentFetch;

  const now = Date.now();
  if (!options?.force && cachedMe && cachedMe.expiresAt > now) {
    return cachedMe;
  }

  if (!options?.force && inflightMePromise) {
    return inflightMePromise;
  }

  let p: Promise<CachedMeResponse> | null = null;
  p = (async (): Promise<CachedMeResponse> => {
    try {
      const res = await currentFetch('/api/me');
      const ok = res?.ok !== undefined ? Boolean(res.ok) : true;
      const status = typeof res?.status === 'number' ? res.status : (ok ? 200 : 500);
      const json = typeof res?.json === 'function' ? await res.json() : {};
      const entry: CachedMeResponse = {
        ok: ok && Boolean(json?.success),
        status,
        json,
        expiresAt: Date.now() + (ok && json?.success ? CLIENT_ME_TTL_MS : 2000),
      };
      cachedMe = entry;
      return entry;
    } finally {
      if (inflightMePromise === p) {
        inflightMePromise = null;
      }
    }
  })();

  inflightMePromise = p;
  return p;
}
