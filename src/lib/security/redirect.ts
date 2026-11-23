/**
 * Edge-safe redirect, origin, URL, and spreadsheet sanitization helpers.
 * IMPORTANT: Must remain 100% free of Node.js `fs`/`path` imports so it can
 * be imported safely inside Next.js Middleware / Proxy (Edge runtime).
 */

const DEFAULT_PROD_ORIGIN = 'https://ptithcm.com';

/**
 * Validates a relative redirect path and prevents Open Redirect attacks
 * including protocol-relative URLs (`//evil.com`), backslash tricks (`/\evil.com`),
 * and control characters.
 */
export function sanitizeRedirectPath(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string') return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (/[\r\n\0]/.test(trimmed)) return fallback;
  if (!trimmed.startsWith('/')) return fallback;
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return fallback;
  if (trimmed === '/login' || trimmed.startsWith('/login?')) return fallback;

  try {
    const parsed = new URL(trimmed, 'https://ptithcm.local');
    if (parsed.origin !== 'https://ptithcm.local') return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

function isAllowedProdHostname(hostname: string): boolean {
  const clean = hostname.toLowerCase().split(':')[0];
  return (
    clean === 'ptithcm.com' ||
    clean.endsWith('.ptithcm.com') ||
    clean === 'ptithcm.edu.vn' ||
    clean.endsWith('.ptithcm.edu.vn')
  );
}

const STRICT_HOST_HEADER_RE = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

function parseStrictHostOrigin(proto: 'http' | 'https', rawHost: string): URL | null {
  if (!rawHost || !STRICT_HOST_HEADER_RE.test(rawHost)) return null;
  try {
    const parsed = new URL(`${proto}://${rawHost}`);
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Resolves the trusted public origin from an incoming request while
 * preventing Host / X-Forwarded-Host header poisoning in production.
 */
export function getTrustedOrigin(req: Request): string {
  const configuredAppUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL;
  let fallbackProdOrigin = DEFAULT_PROD_ORIGIN;
  if (configuredAppUrl) {
    try {
      const parsedApp = new URL(configuredAppUrl);
      if (parsedApp.protocol === 'http:' || parsedApp.protocol === 'https:') {
        fallbackProdOrigin = parsedApp.origin;
      }
    } catch {}
  }

  const forwardedHost = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '')
    .split(',')[0]
    .trim();
  const forwardedProtoRaw = (req.headers.get('x-forwarded-proto') || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const forwardedProto: 'http' | 'https' = forwardedProtoRaw === 'http' ? 'http' : 'https';

  if (process.env.NODE_ENV === 'production') {
    const parsed = parseStrictHostOrigin(forwardedProto, forwardedHost);
    if (parsed && isAllowedProdHostname(parsed.hostname)) {
      return parsed.origin;
    }
    return fallbackProdOrigin;
  }

  if (forwardedHost && !forwardedHost.includes('0.0.0.0')) {
    const parsed = parseStrictHostOrigin(forwardedProto, forwardedHost);
    if (parsed) return parsed.origin;
  }

  try {
    return new URL(req.url).origin;
  } catch {
    return fallbackProdOrigin;
  }
}

/**
 * Validates that an external link uses strictly `http:` or `https:` protocol,
 * blocking `javascript:`, `data:`, `vbscript:`, etc.
 */
export function isSafeExternalUrl(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Neutralizes CSV/Excel Formula Injection (CWE-1236) on untrusted cell values
 * by prefixing cells beginning with `=`, `+`, `-`, `@`, `\t`, or `\r` with `'`.
 */
export function sanitizeSpreadsheetCell<T>(val: T): T | string {
  if (typeof val !== 'string') return val;
  if (/^[\s\u0000]*[=+\-@\t\r]/.test(val) || /^[\t\r]/.test(val)) {
    return `'${val}`;
  }
  return val;
}
