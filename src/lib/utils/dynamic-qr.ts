import crypto from 'crypto';

function getSecret(): string {
  const secret =
    process.env.DYNAMIC_QR_SECRET ||
    process.env.PERSONAL_QR_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DYNAMIC_QR_SECRET is required in production');
  }
  return 'dev-only-secret-key';
}

const WINDOW_SECONDS = 10; // Token changes every 10 seconds
const TOLERANCE_WINDOWS = 2; // Valid for current window and 2 previous windows (~30s total)

function signDynamicPayload(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex').substring(0, 16);
}

export function generateDynamicToken(
  eventId: string,
  role = 'participant',
  timestampMs = Date.now(),
  sessionId?: string
): { token: string; expiresInSeconds: number; window: number; role: string; sessionId?: string } {
  const currentWindow = Math.floor(timestampMs / 1000 / WINDOW_SECONDS);
  const cleanSessionId = (sessionId ? sessionId.trim() : 'main').replace(/:/g, '_');
  const signature = signDynamicPayload(`${eventId}:${currentWindow}:${role}:${cleanSessionId}`);
  const token = `${eventId}:${currentWindow}:${role}:${cleanSessionId}:${signature}`;

  const secondsIntoWindow = Math.floor((timestampMs / 1000) % WINDOW_SECONDS);
  const expiresInSeconds = WINDOW_SECONDS - secondsIntoWindow;

  return { token, expiresInSeconds, window: currentWindow, role, sessionId: cleanSessionId };
}

export function verifyDynamicToken(
  eventId: string,
  token: string,
  timestampMs = Date.now()
): { valid: boolean; role: 'participant' | 'volunteer' | 'organizer'; sessionId?: string } {
  if (!token || typeof token !== 'string') return { valid: false, role: 'participant' };

  const parts = token.split(':');

  // Format with role and session: [eventId, window, role, sessionId, signature]
  if (parts.length === 5) {
    const [tokenEventId, tokenWindowStr, tokenRole, tokenSessionId, tokenSignature] = parts;
    if (tokenEventId !== eventId) return { valid: false, role: 'participant' };

    const tokenWindow = parseInt(tokenWindowStr, 10);
    if (isNaN(tokenWindow)) return { valid: false, role: 'participant' };

    const currentWindow = Math.floor(timestampMs / 1000 / WINDOW_SECONDS);

    if (tokenWindow < currentWindow - TOLERANCE_WINDOWS || tokenWindow > currentWindow + 1) {
      return { valid: false, role: 'participant' };
    }

    const expectedSignature = signDynamicPayload(`${eventId}:${tokenWindow}:${tokenRole}:${tokenSessionId}`);

    const sigBuf = Buffer.from(tokenSignature);
    const expBuf = Buffer.from(expectedSignature);
    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    const verifiedRole = (tokenRole === 'volunteer' || tokenRole === 'organizer') ? tokenRole : 'participant';

    return { valid: isValid, role: verifiedRole, sessionId: tokenSessionId };
  }

  // Format with role: [eventId, window, role, signature]
  if (parts.length === 4) {
    const [tokenEventId, tokenWindowStr, tokenRole, tokenSignature] = parts;
    if (tokenEventId !== eventId) return { valid: false, role: 'participant' };

    const tokenWindow = parseInt(tokenWindowStr, 10);
    if (isNaN(tokenWindow)) return { valid: false, role: 'participant' };

    const currentWindow = Math.floor(timestampMs / 1000 / WINDOW_SECONDS);

    if (tokenWindow < currentWindow - TOLERANCE_WINDOWS || tokenWindow > currentWindow + 1) {
      return { valid: false, role: 'participant' };
    }

    const expectedSignature = signDynamicPayload(`${eventId}:${tokenWindow}:${tokenRole}`);

    const sigBuf = Buffer.from(tokenSignature);
    const expBuf = Buffer.from(expectedSignature);
    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    const verifiedRole = (tokenRole === 'volunteer' || tokenRole === 'organizer') ? tokenRole : 'participant';

    return { valid: isValid, role: verifiedRole, sessionId: 'main' };
  }

  // Backward compatibility: [eventId, window, signature]
  if (parts.length === 3) {
    const [tokenEventId, tokenWindowStr, tokenSignature] = parts;
    if (tokenEventId !== eventId) return { valid: false, role: 'participant' };

    const tokenWindow = parseInt(tokenWindowStr, 10);
    if (isNaN(tokenWindow)) return { valid: false, role: 'participant' };

    const currentWindow = Math.floor(timestampMs / 1000 / WINDOW_SECONDS);

    if (tokenWindow < currentWindow - TOLERANCE_WINDOWS || tokenWindow > currentWindow + 1) {
      return { valid: false, role: 'participant' };
    }

    const expectedSignature = signDynamicPayload(`${eventId}:${tokenWindow}`);

    const sigBuf = Buffer.from(tokenSignature);
    const expBuf = Buffer.from(expectedSignature);
    const isValid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    return { valid: isValid, role: 'participant', sessionId: 'main' };
  }

  return { valid: false, role: 'participant' };
}
