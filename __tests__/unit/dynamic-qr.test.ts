import { generateDynamicToken, verifyDynamicToken } from '@/lib/utils/dynamic-qr';

describe('Dynamic QR Token Utilities', () => {
  const eventId = 'ev-test-12345';

  test('generates valid token with countdown and role information', () => {
    const result = generateDynamicToken(eventId, 'volunteer');
    expect(result.token).toBeDefined();
    expect(result.token.startsWith(`${eventId}:`)).toBe(true);
    expect(result.role).toBe('volunteer');
    expect(result.expiresInSeconds).toBeGreaterThanOrEqual(0);
    expect(result.expiresInSeconds).toBeLessThanOrEqual(10);
  });

  test('verifies token generated in the current window successfully with role preservation', () => {
    const now = Date.now();
    const { token } = generateDynamicToken(eventId, 'organizer', now);
    const result = verifyDynamicToken(eventId, token, now);
    expect(result.valid).toBe(true);
    expect(result.role).toBe('organizer');
  });

  test('rejects token for a different eventId', () => {
    const now = Date.now();
    const { token } = generateDynamicToken(eventId, 'participant', now);
    const result = verifyDynamicToken('other-event-id', token, now);
    expect(result.valid).toBe(false);
  });

  test('rejects expired token after window tolerance expires', () => {
    const pastTime = Date.now() - 60000; // 60s in the past (more than 30s window tolerance)
    const { token } = generateDynamicToken(eventId, 'participant', pastTime);
    const result = verifyDynamicToken(eventId, token, Date.now());
    expect(result.valid).toBe(false);
  });

  test('handles malformed token and invalid signature length safely without throwing RangeError', () => {
    expect(verifyDynamicToken(eventId, '').valid).toBe(false);
    expect(verifyDynamicToken(eventId, 'invalid-token-format').valid).toBe(false);
    expect(verifyDynamicToken(eventId, 'ev:invalid:sig').valid).toBe(false);
    expect(verifyDynamicToken(eventId, `${eventId}:12345:participant:short`).valid).toBe(false);
    expect(verifyDynamicToken(eventId, `${eventId}:12345:participant:super-long-malicious-signature-string-attempting-buffer-overflow`).valid).toBe(false);
  });
});
