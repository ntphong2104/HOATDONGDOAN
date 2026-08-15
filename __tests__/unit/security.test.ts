import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isValidMSSV, isValidSchoolEmailDomain, sanitizeInput } from '@/lib/security/sanitizer';

describe('Security Suite: Rate Limiting & Input Sanitization', () => {
  describe('Rate Limiter', () => {
    test('allows requests within threshold limit', () => {
      const id = 'test-client-allowed-' + Date.now();
      const r1 = checkRateLimit(id, 3, 5000);
      const r2 = checkRateLimit(id, 3, 5000);
      const r3 = checkRateLimit(id, 3, 5000);

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
      expect(r3.remaining).toBe(0);
    });

    test('blocks requests exceeding threshold limit', () => {
      const id = 'test-client-blocked-' + Date.now();
      checkRateLimit(id, 2, 5000);
      checkRateLimit(id, 2, 5000);
      const r3 = checkRateLimit(id, 2, 5000);

      expect(r3.allowed).toBe(false);
      expect(r3.remaining).toBe(0);
      expect(r3.resetInSeconds).toBeGreaterThan(0);
    });
  });

  describe('Sanitizer & Format Validation', () => {
    test('validates authentic PTIT student MSSV formats', () => {
      expect(isValidMSSV('N22DCCN158')).toBe(true);
      expect(isValidMSSV('B21DCCN001')).toBe(true);
      expect(isValidMSSV('n22dccn158')).toBe(true);
      expect(isValidMSSV('INVALID_MSSV')).toBe(false);
      expect(isValidMSSV("N22'; DROP TABLE users;--")).toBe(false);
    });

    test('validates PTIT student and faculty email domains', () => {
      expect(isValidSchoolEmailDomain('n22dccn158@student.ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmailDomain('giangvien@ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmailDomain('phongctsv@ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmailDomain('hacker@gmail.com')).toBe(false);
      expect(isValidSchoolEmailDomain('admin@ptit.edu.vn')).toBe(false);
    });

    test('sanitizes malicious script and HTML tags from user inputs', () => {
      const malicious = '<script>alert("XSS")</script>Hội thảo IT';
      const clean = sanitizeInput(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('</script>');
      expect(clean).toContain('alert("XSS")Hội thảo IT');
    });
  });
});
