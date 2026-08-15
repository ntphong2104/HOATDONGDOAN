import {
  normalizeUnitKey,
  isSameUnit,
  summarizeUnitRatings,
  getRatingDepartmentLabel,
  LOW_RATING_THRESHOLD,
} from '@/lib/utils/rating-logic';

describe('Rating Logic - normalizeUnitKey', () => {
  test('returns empty string for undefined/null/empty', () => {
    expect(normalizeUnitKey(undefined)).toBe('');
    expect(normalizeUnitKey('')).toBe('');
  });

  test('normalizes ITMC unit', () => {
    expect(normalizeUnitKey('CLB ITMC')).toBe('itmc');
    expect(normalizeUnitKey('clb.itmc@student.ptithcm.edu.vn')).toBe('itmc');
  });

  test('normalizes CNTT unit', () => {
    expect(normalizeUnitKey('LCĐ Khoa Công nghệ Thông tin')).toBe('cntt');
    expect(normalizeUnitKey('lcdcntt@student.ptithcm.edu.vn')).toBe('cntt');
  });

  test('normalizes CNDPT unit', () => {
    expect(normalizeUnitKey('cndpt@student.ptithcm.edu.vn')).toBe('cndpt');
    expect(normalizeUnitKey('LCĐ DPT')).toBe('cndpt');
  });

  test('normalizes ATTT unit - differentiates LCĐ vs CLB', () => {
    expect(normalizeUnitKey('LCĐ An toàn Thông tin')).toBe('lcd_attt');
    expect(normalizeUnitKey('CLB An toàn Thông tin')).toBe('clb_attt');
  });

  test('normalizes Viễn thông unit', () => {
    expect(normalizeUnitKey('LCĐ Viễn thông')).toBe('vt');
    expect(normalizeUnitKey('lcdvt@student.ptithcm.edu.vn')).toBe('vt');
  });

  test('normalizes Điện tử unit', () => {
    expect(normalizeUnitKey('lcddt@student.ptithcm.edu.vn')).toBe('dt');
  });

  test('normalizes business units', () => {
    expect(normalizeUnitKey('LCĐ Quản trị Kinh doanh')).toBe('qtkd');
    expect(normalizeUnitKey('LCĐ Marketing')).toBe('mkt');
    expect(normalizeUnitKey('LCĐ Kế toán')).toBe('ketoan');
  });

  test('normalizes CLB units', () => {
    expect(normalizeUnitKey('CLB Tiếng Anh')).toBe('tienganh');
    expect(normalizeUnitKey('Đội Văn Nghệ')).toBe('vannghe');
    expect(normalizeUnitKey('CLB Guitar')).toBe('guitar');
    expect(normalizeUnitKey('CLB Kết Nối')).toBe('ketnoi');
    expect(normalizeUnitKey('CLB CMC')).toBe('cmc');
    expect(normalizeUnitKey('CLB BMA')).toBe('bma');
    expect(normalizeUnitKey('CLB Bóng Rổ')).toBe('bongro');
    expect(normalizeUnitKey('CLB Vovinam')).toBe('vovinam');
    expect(normalizeUnitKey('CLB Cầu Lông')).toBe('caulong');
  });

  test('returns cleaned string for unknown units', () => {
    const result = normalizeUnitKey('Đơn Vị Mới');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('Rating Logic - isSameUnit', () => {
  test('returns false for null/undefined inputs', () => {
    expect(isSameUnit(undefined, 'CNTT')).toBe(false);
    expect(isSameUnit('CNTT', undefined)).toBe(false);
    expect(isSameUnit(undefined, undefined)).toBe(false);
  });

  test('matches exact same unit name (case insensitive)', () => {
    expect(isSameUnit('CLB ITMC', 'clb itmc')).toBe(true);
  });

  test('matches normalized unit keys across naming variations', () => {
    expect(isSameUnit('LCĐ Khoa CNTT', 'lcdcntt@student.ptithcm.edu.vn')).toBe(true);
    expect(isSameUnit('CLB Guitar', 'clb.guitar@student.ptithcm.edu.vn')).toBe(true);
  });

  test('returns false for different units', () => {
    expect(isSameUnit('CLB ITMC', 'CLB BMA')).toBe(false);
  });
});

describe('Rating Logic - summarizeUnitRatings', () => {
  test('returns default 5-star summary when no ratings exist', () => {
    const result = summarizeUnitRatings([], 'CLB ITMC');
    expect(result.average_stars).toBe(5);
    expect(result.total_reviews).toBe(0);
    expect(result.has_low_rating_warning).toBe(false);
    expect(result.recent_low_ratings).toEqual([]);
  });

  test('calculates correct average stars', () => {
    const ratings = [
      { organization_unit: 'CLB ITMC', stars: 5, created_at: '2026-08-01T00:00:00Z' },
      { organization_unit: 'CLB ITMC', stars: 4, created_at: '2026-08-02T00:00:00Z' },
      { organization_unit: 'CLB ITMC', stars: 3, created_at: '2026-08-03T00:00:00Z' },
    ] as any[];
    const result = summarizeUnitRatings(ratings, 'CLB ITMC');
    expect(result.average_stars).toBe(4);
    expect(result.total_reviews).toBe(3);
  });

  test('flags low rating warning when rating <= 3', () => {
    const ratings = [
      { organization_unit: 'CLB BMA', stars: 2, created_at: '2026-08-01T00:00:00Z' },
      { organization_unit: 'CLB BMA', stars: 5, created_at: '2026-08-02T00:00:00Z' },
    ] as any[];
    const result = summarizeUnitRatings(ratings, 'CLB BMA');
    expect(result.has_low_rating_warning).toBe(true);
    expect(result.recent_low_ratings.length).toBe(1);
  });

  test('filters ratings by matching unit only', () => {
    const ratings = [
      { organization_unit: 'CLB ITMC', stars: 5, created_at: '2026-08-01T00:00:00Z' },
      { organization_unit: 'CLB BMA', stars: 1, created_at: '2026-08-02T00:00:00Z' },
    ] as any[];
    const result = summarizeUnitRatings(ratings, 'CLB ITMC');
    expect(result.total_reviews).toBe(1);
    expect(result.has_low_rating_warning).toBe(false);
  });

  test('handles null ratings array gracefully', () => {
    const result = summarizeUnitRatings(null as any, 'CLB ITMC');
    expect(result.average_stars).toBe(5);
    expect(result.total_reviews).toBe(0);
  });
});

describe('Rating Logic - getRatingDepartmentLabel', () => {
  test('returns correct labels for all tier types', () => {
    expect(getRatingDepartmentLabel('youth_union')).toBe('Đoàn Học Viện');
    expect(getRatingDepartmentLabel('ctsv')).toBe('Phòng Công Tác Sinh Viên (CTSV)');
    expect(getRatingDepartmentLabel('facility')).toBe('Phòng Quản Trị CSVC & Tổ Chức');
    expect(getRatingDepartmentLabel('super_admin')).toBe('Super Admin Đoàn Trường');
    expect(getRatingDepartmentLabel('unknown_tier')).toBe('Cấp Phê Duyệt');
  });
});

describe('Rating Logic - LOW_RATING_THRESHOLD constant', () => {
  test('low rating threshold is 3', () => {
    expect(LOW_RATING_THRESHOLD).toBe(3);
  });
});
