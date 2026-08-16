import { sanitizeInput, isValidMSSV, isValidSchoolEmailDomain } from '@/lib/security/sanitizer';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { isEventPastDeadline, getEffectiveEventStatus } from '@/lib/utils/event-logic';
import { getNextStage, calculateProposalStages, getStageLabel } from '@/lib/utils/proposal-logic';
import { evaluatePenaltyStanding, reconcileAttendance } from '@/lib/utils/blacklist-logic';

describe('Comprehensive Security & Business Logic Audit Suite', () => {
  describe('Input Sanitization & Injection Prevention', () => {
    test('strips HTML and script tags completely', () => {
      const malicious = '<script>alert("xss")</script>Sự kiện chào tân sinh viên';
      const clean = sanitizeInput(malicious);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('</script>');
      expect(clean).toBe('alert("xss")Sự kiện chào tân sinh viên');
    });

    test('strips javascript: pseudo-protocol', () => {
      const payload = 'javascript:alert(1)';
      expect(sanitizeInput(payload)).toBe('alert(1)');
    });

    test('strips inline event handler injections like onerror and onload', () => {
      const payload = '<img src=x onerror=alert(document.cookie)>Chào mừng';
      expect(sanitizeInput(payload)).toBe('Chào mừng');
    });

    test('enforces strict max length', () => {
      const longInput = 'A'.repeat(500);
      expect(sanitizeInput(longInput, 100).length).toBe(100);
    });

    test('validates standard PTIT MSSV format', () => {
      expect(isValidMSSV('N22DCCN001')).toBe(true);
      expect(isValidMSSV('B21DCVT999')).toBe(true);
      expect(isValidMSSV('n20dcat050')).toBe(true); // Case-insensitive
      expect(isValidMSSV('ADMIN')).toBe(false);
      expect(isValidMSSV('123456789')).toBe(false);
      expect(isValidMSSV('DROP TABLE users;')).toBe(false);
    });

    test('validates school email domain', () => {
      expect(isValidSchoolEmailDomain('n22dccn001@student.ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmailDomain('doanthanhnien@ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmailDomain('attacker@gmail.com')).toBe(false);
      expect(isValidSchoolEmailDomain('fake@ptit.edu.vn.attacker.com')).toBe(false);
    });
  });

  describe('Sliding-Window Rate Limiter Security', () => {
    test('allows requests within limit and blocks when exceeded', () => {
      const id = `test-ip-${Date.now()}`;
      for (let i = 0; i < 5; i++) {
        const result = checkRateLimit(id, 5, 5000);
        expect(result.allowed).toBe(true);
      }
      // 6th request must be blocked
      const blocked = checkRateLimit(id, 5, 5000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
      expect(blocked.resetInSeconds).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Proposal Multi-Department Approval Stage Progression', () => {
    test('progresses through CTSV, Facility, and Approved stages correctly', () => {
      // 1. Initial stage: youth_union -> CTSV
      expect(getNextStage('youth_union', true, true)).toBe('ctsv');
      
      // 2. CTSV -> Facility (if room requested)
      expect(getNextStage('ctsv', true, true)).toBe('facility');
      
      // 3. Facility -> Approved (Final event creation)
      expect(getNextStage('facility', true, true)).toBe('approved');
    });

    test('skips Facility if not borrowing a room', () => {
      // If Facility not required: CTSV -> Approved directly
      expect(getNextStage('ctsv', true, false)).toBe('approved');
    });

    test('calculates required stages based on room borrowing', () => {
      const withRoom = calculateProposalStages(100, 'r-1', 'Hội trường 2A08');
      expect(withRoom.requiresCtsv).toBe(true);
      expect(withRoom.requiresFacility).toBe(true);

      const noRoom = calculateProposalStages(50, null, 'Không mượn');
      expect(noRoom.requiresCtsv).toBe(true);
      expect(noRoom.requiresFacility).toBe(false);
    });

    test('returns accurate stage labels in Vietnamese', () => {
      expect(getStageLabel('ctsv')).toContain('Phòng Công Tác Sinh Viên (CTSV)');
      expect(getStageLabel('facility')).toContain('Phòng Tổ Chức Hành Chính');
      expect(getStageLabel('approved')).toBe('Đã duyệt toàn bộ & Đã tạo sự kiện');
    });
  });

  describe('3-Strike Attendance Blacklist Rules', () => {
    test('identifies student as blacklisted after 3 unexcused absences', () => {
      const standing = evaluatePenaltyStanding(3);
      expect(standing.isBlacklisted).toBe(true);
      expect(standing.strikesLeft).toBe(0);
      expect(standing.statusLabel).toContain('Blacklist');
    });

    test('allows student with fewer than 3 missed events with warnings', () => {
      const standing = evaluatePenaltyStanding(1);
      expect(standing.isBlacklisted).toBe(false);
      expect(standing.strikesLeft).toBe(2);
      expect(standing.statusLabel).toContain('Cảnh báo nhẹ');

      const warningStanding = evaluatePenaltyStanding(2);
      expect(warningStanding.isBlacklisted).toBe(false);
      expect(warningStanding.strikesLeft).toBe(1);
      expect(warningStanding.statusLabel).toContain('Cảnh báo nguy cấp');
    });

    test('reconciles attendance list properly', () => {
      const registrations = [
        { mssv: 'N22DCCN001', email: 'an@student.ptit.edu.vn' },
        { mssv: 'N22DCCN002', email: 'binh@student.ptit.edu.vn' },
      ];
      const checkIns = [{ mssv: 'N22DCCN001' }];

      const result = reconcileAttendance(registrations, checkIns);
      expect(result.attended.length).toBe(1);
      expect(result.attended[0].mssv).toBe('N22DCCN001');
      expect(result.absent.length).toBe(1);
      expect(result.absent[0].mssv).toBe('N22DCCN002');
    });
  });

  describe('Event Lifecycle & 1-Hour Auto-Close Window', () => {
    test('accurately identifies active vs auto-closed event state', () => {
      const event = {
        event_date: '2026-08-14',
        start_time: '08:00:00',
        end_time: '10:00:00',
        status: 'active',
      };

      // 10:45 AM (45 mins after end) -> Still within 1h grace
      const timeAt1045 = new Date(2026, 7, 14, 10, 45, 0).getTime();
      expect(isEventPastDeadline(event, timeAt1045)).toBe(false);
      expect(getEffectiveEventStatus(event, timeAt1045)).toBe('active');

      // 11:05 AM (65 mins after end) -> Past 1h deadline -> Closed!
      const timeAt1105 = new Date(2026, 7, 14, 11, 5, 0).getTime();
      expect(isEventPastDeadline(event, timeAt1105)).toBe(true);
      expect(getEffectiveEventStatus(event, timeAt1105)).toBe('closed');
    });
  });
});
