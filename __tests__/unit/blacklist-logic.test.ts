import {
  evaluatePenaltyStanding,
  reconcileAttendance,
  isRegistrationWindowOpen,
  MAX_MISSED_STRIKES,
} from '@/lib/utils/blacklist-logic';

describe('Blacklist & No-Show Business Logic', () => {
  describe('evaluatePenaltyStanding', () => {
    test('standing with 0 missed strikes is normal', () => {
      const res = evaluatePenaltyStanding(0);
      expect(res.isBlacklisted).toBe(false);
      expect(res.missedCount).toBe(0);
      expect(res.strikesLeft).toBe(3);
      expect(res.statusLabel).toBe('Bình thường');
    });

    test('standing with 1 missed strike shows light warning', () => {
      const res = evaluatePenaltyStanding(1);
      expect(res.isBlacklisted).toBe(false);
      expect(res.missedCount).toBe(1);
      expect(res.strikesLeft).toBe(2);
      expect(res.statusLabel).toContain('Vắng 1/3');
    });

    test('standing with 2 missed strikes shows critical warning', () => {
      const res = evaluatePenaltyStanding(2);
      expect(res.isBlacklisted).toBe(false);
      expect(res.missedCount).toBe(2);
      expect(res.strikesLeft).toBe(1);
      expect(res.statusLabel).toContain('Vắng 2/3');
    });

    test('standing with 3 or more missed strikes triggers automatic blacklist', () => {
      const res = evaluatePenaltyStanding(3);
      expect(res.isBlacklisted).toBe(true);
      expect(res.missedCount).toBe(3);
      expect(res.strikesLeft).toBe(0);
      expect(res.statusLabel).toContain('Blacklist');

      const res4 = evaluatePenaltyStanding(4);
      expect(res4.isBlacklisted).toBe(true);
    });

    test('manual blacklist flag forces blacklist regardless of strikes', () => {
      const res = evaluatePenaltyStanding(0, true);
      expect(res.isBlacklisted).toBe(true);
    });
  });

  describe('reconcileAttendance', () => {
    const registrations = [
      { mssv: 'N22DCCN001', email: 'an@ptit.edu.vn', full_name: 'Nguyen Van An' },
      { mssv: 'N22DCCN002', email: 'binh@ptit.edu.vn', full_name: 'Tran Van Binh' },
      { mssv: 'N22DCCN003', email: 'chi@ptit.edu.vn', full_name: 'Le Thi Chi' },
    ];

    test('correctly splits attended and absent students', () => {
      const checkIns = [
        { mssv: 'N22DCCN001' },
        { mssv: 'n22dccn003' }, // Case insensitive
      ];

      const { attended, absent } = reconcileAttendance(registrations, checkIns);

      expect(attended.length).toBe(2);
      expect(attended.map((a) => a.mssv)).toEqual(['N22DCCN001', 'N22DCCN003']);

      expect(absent.length).toBe(1);
      expect(absent[0].mssv).toBe('N22DCCN002');
      expect(absent[0].full_name).toBe('Tran Van Binh');
    });

    test('handles empty check-ins where all registered students are absent', () => {
      const { attended, absent } = reconcileAttendance(registrations, []);
      expect(attended.length).toBe(0);
      expect(absent.length).toBe(3);
    });
  });

  describe('isRegistrationWindowOpen (Registration window & organizer manual toggle)', () => {
    test('open when event is in the future before start time', () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = isRegistrationWindowOpen(futureDate, '08:00:00', 'active', true);
      expect(res.isOpen).toBe(true);
    });

    test('closed when organizer manually toggles registration off', () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = isRegistrationWindowOpen(futureDate, '08:00:00', 'active', false);
      expect(res.isOpen).toBe(false);
      expect(res.reason).toContain('Ban tổ chức đã chủ động đóng');
    });

    test('closed when event is explicitly closed or rejected', () => {
      const futureDate = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = isRegistrationWindowOpen(futureDate, '08:00:00', 'closed', true);
      expect(res.isOpen).toBe(false);
      expect(res.reason).toContain('đã kết thúc hoặc đã đóng');
    });

    test('closed when event start time has already passed', () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = isRegistrationWindowOpen(pastDate, '08:00:00', 'active', true);
      expect(res.isOpen).toBe(false);
      expect(res.reason).toContain('đã bắt đầu');
    });

    test('auto-closed when event is within 12h before start time by default', () => {
      const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const soonDate = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
      const soonTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}:00`;
      const res = isRegistrationWindowOpen(soonDate, soonTime, 'active', undefined);
      expect(res.isOpen).toBe(false);
      expect(res.reason).toContain('12 tiếng');
    });

    test('re-opened when organizer explicitly opens registration within 12h', () => {
      const soon = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const soonDate = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`;
      const soonTime = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}:00`;
      const res = isRegistrationWindowOpen(soonDate, soonTime, 'active', true);
      expect(res.isOpen).toBe(true);
    });
  });
});
