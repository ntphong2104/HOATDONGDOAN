import {
  DEFAULT_OFFICE_DUTY_CONFIG,
  isWeekday,
  getWeekWorkdays,
  validateCheckInWindow,
  validateCheckOutWindow,
  isIpAllowedForOffice,
  computeBorrowLateDays,
} from '@/lib/utils/office-duty';

describe('Office Duty & Equipment Borrowing Business Logic', () => {
  it('identifies weekdays (Mon-Fri) accurately and rejects Sat/Sun', () => {
    expect(isWeekday('2026-11-16')).toBe(true); // Monday
    expect(isWeekday('2026-11-20')).toBe(true); // Friday
    expect(isWeekday('2026-11-21')).toBe(false); // Saturday
    expect(isWeekday('2026-11-22')).toBe(false); // Sunday
  });

  it('returns Mon-Fri 5 workdays for any date in that week', () => {
    const days = getWeekWorkdays('2026-11-19'); // Thursday
    expect(days).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
    ]);
  });

  it('allows check-in up to 30 mins early and rejects earlier or after shift end', () => {
    // Morning shift: 07:30 - 11:30 (VN +07:00)
    // 06:59 -> rejected (31 mins early)
    const tooEarly = validateCheckInWindow(
      '2026-11-20',
      'morning',
      DEFAULT_OFFICE_DUTY_CONFIG,
      new Date('2026-11-20T06:59:00+07:00')
    );
    expect(tooEarly.allowed).toBe(false);

    // 07:00 -> allowed (exactly 30 mins early, 0 late mins)
    const exactEarly = validateCheckInWindow(
      '2026-11-20',
      'morning',
      DEFAULT_OFFICE_DUTY_CONFIG,
      new Date('2026-11-20T07:00:00+07:00')
    );
    expect(exactEarly.allowed).toBe(true);
    expect(exactEarly.lateMinutes).toBe(0);

    // 07:45 -> allowed, 15 mins late
    const slightlyLate = validateCheckInWindow(
      '2026-11-20',
      'morning',
      DEFAULT_OFFICE_DUTY_CONFIG,
      new Date('2026-11-20T07:45:00+07:00')
    );
    expect(slightlyLate.allowed).toBe(true);
    expect(slightlyLate.lateMinutes).toBe(15);

    // 11:31 -> rejected (shift ended)
    const afterEnd = validateCheckInWindow(
      '2026-11-20',
      'morning',
      DEFAULT_OFFICE_DUTY_CONFIG,
      new Date('2026-11-20T11:31:00+07:00')
    );
    expect(afterEnd.allowed).toBe(false);
  });

  it('allows check-out up to 30 mins late after shift end and rejects past 30 mins', () => {
    // Afternoon shift: 13:00 - 17:00 (VN +07:00)
    // 17:30 -> allowed (exactly 30 mins late)
    const exactLate = validateCheckOutWindow(
      '2026-11-20',
      'afternoon',
      DEFAULT_OFFICE_DUTY_CONFIG,
      new Date('2026-11-20T17:30:00+07:00')
    );
    expect(exactLate.allowed).toBe(true);

    // 17:31 -> rejected (31 mins past end)
    const tooLate = validateCheckOutWindow(
      '2026-11-20',
      'afternoon',
      DEFAULT_OFFICE_DUTY_CONFIG,
      new Date('2026-11-20T17:31:00+07:00')
    );
    expect(tooLate.allowed).toBe(false);
  });

  it('validates office WiFi IP allowlist (exact, wildcard prefix, localhost, toggle)', () => {
    const cfg = {
      ...DEFAULT_OFFICE_DUTY_CONFIG,
      require_ip_check: true,
      allow_localhost: false,
      allowed_ips: ['113.161.72.10', '14.161.5.*'],
    };

    expect(isIpAllowedForOffice('113.161.72.10', cfg).allowed).toBe(true);
    expect(isIpAllowedForOffice('::ffff:113.161.72.10', cfg).allowed).toBe(true);
    expect(isIpAllowedForOffice('14.161.5.99', cfg).allowed).toBe(true);
    expect(isIpAllowedForOffice('118.69.10.2', cfg).allowed).toBe(false);
    expect(isIpAllowedForOffice('127.0.0.1', cfg).allowed).toBe(false);

    expect(
      isIpAllowedForOffice('118.69.10.2', { ...cfg, require_ip_check: false }).allowed
    ).toBe(true);
  });

  it('computes borrow late days accurately and flags >= 1 day late for auto-ban', () => {
    // Due 2026-11-20
    expect(computeBorrowLateDays('2026-11-20', new Date('2026-11-20T22:00:00+07:00'))).toBe(0);
    expect(computeBorrowLateDays('2026-11-20', new Date('2026-11-19T10:00:00+07:00'))).toBe(0);
    // Returned next morning -> 1 day late -> triggers ban!
    expect(computeBorrowLateDays('2026-11-20', new Date('2026-11-21T08:00:00+07:00'))).toBe(1);
    expect(computeBorrowLateDays('2026-11-20', new Date('2026-11-23T09:00:00+07:00'))).toBe(3);
  });
});
