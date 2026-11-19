import {
  LCD_DEFINITIONS,
  resolveStudentLcd,
  normalizeLcdCode,
  normalizeAllowedLcds,
  checkLcdEligibility,
  describeLcdBlock,
  formatLcdsLabel,
} from '@/lib/utils/lcd';
import { resolveDelegateExpiry } from '@/lib/utils/lcd-auth';

describe('LCĐ Classification & Registration Scope (8 Official PTIT HCM LCĐs)', () => {
  it('defines all 8 official Liên Chi Đoàn', () => {
    expect(LCD_DEFINITIONS).toHaveLength(8);
    expect(LCD_DEFINITIONS.map((d) => d.code)).toEqual([
      'LCD_CNTT',
      'LCD_ATTT',
      'LCD_CNDPT',
      'LCD_VT',
      'LCD_DT',
      'LCD_QTKD',
      'LCD_MKT',
      'LCD_KT',
    ]);
  });

  it.each([
    // LCĐ CNTT
    ['D22CQCN02-N', 'N22DCCN158', 'LCD_CNTT'],
    ['E25CQCE01-N', 'N25DECE018', 'LCD_CNTT'],
    ['D25CQTN01-N', 'N25DCTN001', 'LCD_CNTT'],
    ['D23VHCN01-N', 'N23DVCN002', 'LCD_CNTT'],
    // LCĐ ATTT
    ['D25CQAT01-N', 'N25DCAT012', 'LCD_ATTT'],
    ['D25CQAE01-N', 'N25DCAE005', 'LCD_ATTT'],
    // LCĐ CNDPT
    ['D24CQPT01-N', 'N24DCPT033', 'LCD_CNDPT'],
    ['D25CQPTTK01-N', 'N25DCPT088', 'LCD_CNDPT'],
    ['D25CQPTUD01-N', 'N25DCPT099', 'LCD_CNDPT'],
    ['D25CQTT01-N', 'N25DCTT010', 'LCD_CNDPT'],
    // LCĐ Viễn thông
    ['D23CQVT01-N', 'N23DCVT042', 'LCD_VT'],
    ['D24CQCVT01-N', 'N24DTCV011', 'LCD_VT'],
    ['D25CQCI01-N', 'N25DCCI004', 'LCD_VT'],
    ['D25CQKD01-N', 'N25DCKD009', 'LCD_VT'],
    // LCĐ Điện tử
    ['D24CQDT01-N', 'N24DCDT015', 'LCD_DT'],
    ['D25CQDK01-N', 'N25DCDK003', 'LCD_DT'],
    ['D25CQVM01-N', 'N25DCVM007', 'LCD_DT'],
    // LCĐ QTKD
    ['D24CQQT02-N', 'N24DCQT055', 'LCD_QTKD'],
    // LCĐ Marketing
    ['D24CQMR01-N', 'N24DCMR020', 'LCD_MKT'],
    ['E25CQME01-N', 'N25DEME014', 'LCD_MKT'],
    ['D25CQMEO01-N', 'N25DCME019', 'LCD_MKT'],
    // LCĐ Kế toán
    ['D24CQKT01-N', 'N24DCKT028', 'LCD_KT'],
    ['D26CQTC01-N', 'N26DCTC002', 'LCD_KT'],
  ])('classifies (%s, %s) -> %s', (classId, mssv, expected) => {
    const res = resolveStudentLcd(classId, mssv);
    expect(res?.code).toBe(expected);
  });

  it('falls back to MSSV when class_id is placeholder PTIT-HCM', () => {
    expect(resolveStudentLcd('PTIT-HCM', 'N22DCCN158')?.code).toBe('LCD_CNTT');
    expect(resolveStudentLcd('', 'N25DCAT001')?.code).toBe('LCD_ATTT');
    expect(resolveStudentLcd(null, 'N25DEME011')?.code).toBe('LCD_MKT');
  });

  it('prioritizes class_id over MSSV when a student transfers majors', () => {
    expect(resolveStudentLcd('D24CQMR01-N', 'N24DCCN001')?.code).toBe('LCD_MKT');
  });

  it('normalizes unit names, emails, and codes to LcdCode', () => {
    expect(normalizeLcdCode('LCĐ Khoa Công nghệ Thông tin')).toBe('LCD_CNTT');
    expect(normalizeLcdCode('lcdattt@student.ptithcm.edu.vn')).toBe('LCD_ATTT');
    expect(normalizeLcdCode('LCĐ Marketing')).toBe('LCD_MKT');
    expect(normalizeLcdCode('CLB VOVINAM')).toBeNull();
  });

  it('enforces LCĐ registration eligibility accurately', () => {
    // Open to all
    const openAll = checkLcdEligibility([], 'D22CQCN02-N', 'N22DCCN158');
    expect(openAll.restricted).toBe(false);
    expect(openAll.eligible).toBe(true);

    // Restricted to LCD_CNTT
    const cnttAllowed = checkLcdEligibility(['LCD_CNTT'], 'D22CQCN02-N', 'N22DCCN158');
    expect(cnttAllowed.restricted).toBe(true);
    expect(cnttAllowed.eligible).toBe(true);
    expect(cnttAllowed.myLcd?.code).toBe('LCD_CNTT');

    // Student from LCD_VT blocked from LCD_CNTT event
    const vtBlocked = checkLcdEligibility(['LCD_CNTT'], 'D23CQVT01-N', 'N23DCVT042');
    expect(vtBlocked.restricted).toBe(true);
    expect(vtBlocked.eligible).toBe(false);
    expect(vtBlocked.myLcd?.code).toBe('LCD_VT');
    expect(describeLcdBlock(vtBlocked, 'N23DCVT042')).toContain('LCĐ Khoa Công nghệ Thông tin');
    expect(describeLcdBlock(vtBlocked, 'N23DCVT042')).toContain('LCĐ Khoa Viễn thông');

    // Multi-LCĐ joint event
    const joint = checkLcdEligibility(['LCD_CNTT', 'LCD_ATTT'], 'D25CQAT01-N', 'N25DCAT012');
    expect(joint.eligible).toBe(true);
    expect(formatLcdsLabel(joint.allowed)).toBe('LCĐ CNTT, LCĐ ATTT');
    expect(formatLcdsLabel([])).toBe('Toàn Học viện');
    expect(normalizeAllowedLcds(['LCD_CNTT', 'invalid', 'lcd_cntt'])).toEqual(['LCD_CNTT']);
  });

  it('computes delegate term expiry accurately', () => {
    const now = Date.now();
    // Default = 365 days (1 term)
    const defaultExp = resolveDelegateExpiry();
    const diffDays = Math.round((defaultExp.getTime() - now) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(364);
    expect(diffDays).toBeLessThanOrEqual(366);

    // Explicit future YYYY-MM-DD date
    const nextYear = new Date().getFullYear() + 1;
    const termDate = `${nextYear}-06-30`;
    const explicitExp = resolveDelegateExpiry({ expires_at: termDate });
    expect(explicitExp.getFullYear()).toBe(nextYear);

    // Custom duration_days = 180
    const semExp = resolveDelegateExpiry({ duration_days: 180 });
    const semDiff = Math.round((semExp.getTime() - now) / (1000 * 60 * 60 * 24));
    expect(semDiff).toBeGreaterThanOrEqual(179);
    expect(semDiff).toBeLessThanOrEqual(181);
  });
});
