/**
 * Personal QR Code — Time-based anti-screenshot protection
 * 
 * ZERO API CALLS approach:
 * - Server derives a per-user clientKey on page load (sent once via SSR)
 * - Client computes QR tokens locally using clientKey + window number
 * - Screenshots expire after ~40 seconds
 * 
 * QR format: MSSV:window:signature
 */
import crypto from 'crypto';

const WINDOW_SECONDS = 10;
const TOLERANCE_WINDOWS = 3; // Valid for current + 3 previous windows (~30-40s max)

function getSecret(): string {
  const secret =
    process.env.PERSONAL_QR_SECRET ||
    process.env.DYNAMIC_QR_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.DEMO_COOKIE_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PERSONAL_QR_SECRET or DYNAMIC_QR_SECRET is required in production');
  }
  return 'dev-only-secret-key';
}

export function getPersonalQRWindow(timestampMs = Date.now()): number {
  return Math.floor(timestampMs / 1000 / WINDOW_SECONDS);
}

export function getPersonalQRExpiresIn(timestampMs = Date.now()): number {
  const secondsIntoWindow = Math.floor((timestampMs / 1000) % WINDOW_SECONDS);
  return WINDOW_SECONDS - secondsIntoWindow;
}

export { WINDOW_SECONDS };

/**
 * SERVER-SIDE: Derive a per-user client key (safe to send to browser)
 * Uses HMAC-SHA256 so raw key material cannot be forged via length extension.
 */
export function deriveClientKey(mssv: string): string {
  const cleanMssv = String(mssv || '').trim().toUpperCase();
  return crypto
    .createHmac('sha256', getSecret())
    .update(`personal-qr-client:${cleanMssv}`)
    .digest('hex')
    .substring(0, 24);
}

/**
 * SERVER-SIDE: Generate signed personal QR token
 */
export function generatePersonalQRToken(
  mssv: string,
  timestampMs = Date.now()
): { token: string; expiresInSeconds: number; window: number } {
  const cleanMssv = String(mssv || '').trim().toUpperCase();
  const currentWindow = getPersonalQRWindow(timestampMs);
  const clientKey = deriveClientKey(cleanMssv);
  const data = `${cleanMssv}:${currentWindow}:${clientKey}`;
  const signature = crypto.createHash('sha256').update(data).digest('hex').substring(0, 12);
  const token = `${cleanMssv}:${currentWindow}:${signature}`;

  return {
    token,
    expiresInSeconds: getPersonalQRExpiresIn(timestampMs),
    window: currentWindow,
  };
}

/**
 * SERVER-SIDE: Verify a personal QR token from scanner
 */
export function verifyPersonalQRToken(
  token: string,
  timestampMs = Date.now()
): { valid: boolean; mssv: string; expired?: boolean } {
  if (!token || typeof token !== 'string') return { valid: false, mssv: '' };

  const parts = token.split(':');
  if (parts.length !== 3) return { valid: false, mssv: '' };

  const [rawMssv, windowStr, rawSignature] = parts;
  const mssv = rawMssv.trim().toUpperCase();
  const tokenSignature = (rawSignature || '').trim().toLowerCase();
  const tokenWindow = parseInt(windowStr, 10);
  if (!mssv || !tokenSignature || isNaN(tokenWindow)) return { valid: false, mssv: '' };

  const currentWindow = getPersonalQRWindow(timestampMs);

  if (tokenWindow < currentWindow - TOLERANCE_WINDOWS || tokenWindow > currentWindow + 1) {
    return { valid: false, mssv, expired: true };
  }

  const clientKey = deriveClientKey(mssv);
  const expectedData = `${mssv}:${tokenWindow}:${clientKey}`;
  const expectedSignature = crypto.createHash('sha256').update(expectedData).digest('hex').substring(0, 12);

  const sigBuf = Buffer.from(tokenSignature);
  const expBuf = Buffer.from(expectedSignature);
  const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  return { valid: isValid, mssv };
}
