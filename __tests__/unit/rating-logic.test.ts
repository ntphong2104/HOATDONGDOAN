import {
  summarizeUnitRatings,
  getRatingDepartmentLabel,
  isSameUnit,
  normalizeUnitKey,
  LOW_RATING_THRESHOLD,
} from '@/lib/utils/rating-logic';
import type { UnitRating } from '@/lib/types';

describe('Unit Rating & Low-Rating Warning Business Logic', () => {
  test('correctly normalizes unit aliases (e.g. Liên Chi Đoàn CNTT vs LCĐ Khoa Công nghệ Thông tin)', () => {
    expect(isSameUnit('Liên Chi Đoàn CNTT', 'LCĐ Khoa Công nghệ Thông tin')).toBe(true);
    expect(isSameUnit('lcdcntt@student.ptithcm.edu.vn', 'LCĐ Khoa Công nghệ Thông tin')).toBe(true);
    expect(isSameUnit('CLB ITMC', 'clb.itmc@student.ptithcm.edu.vn')).toBe(true);
    expect(isSameUnit('CLB ITMC', 'LCĐ Khoa Công nghệ Thông tin')).toBe(false);
  });

  test('returns 5 stars and no warning when unit has no reviews', () => {
    const summary = summarizeUnitRatings([], 'LCĐ Khoa Công nghệ Thông tin');
    expect(summary.total_reviews).toBe(0);
    expect(summary.has_low_rating_warning).toBe(false);
    expect(summary.recent_low_ratings.length).toBe(0);
  });

  test('matches aliases and flags low rating warning (1-3 stars)', () => {
    const ratings: UnitRating[] = [
      {
        id: '1',
        event_id: 'ev-1',
        organization_unit: 'Liên Chi Đoàn CNTT',
        rater_email: 'phongctsv@ptithcm.edu.vn',
        rater_tier: 'ctsv',
        stars: 1,
        feedback: 'lỏ',
        created_at: '2026-08-14T15:42:54Z',
      },
    ];

    // Tested against proposal with formal name 'LCĐ Khoa Công nghệ Thông tin'
    const summary = summarizeUnitRatings(ratings, 'LCĐ Khoa Công nghệ Thông tin');
    expect(summary.total_reviews).toBe(1);
    expect(summary.average_stars).toBe(1);
    expect(summary.has_low_rating_warning).toBe(true);
    expect(summary.recent_low_ratings.length).toBe(1);
    expect(summary.recent_low_ratings[0].stars).toBe(1);
    expect(summary.recent_low_ratings[0].feedback).toBe('lỏ');
  });

  test('returns normal standing when all reviews are 4 or 5 stars', () => {
    const ratings: UnitRating[] = [
      {
        id: '1',
        event_id: 'ev-1',
        organization_unit: 'CLB ITMC',
        rater_email: 'doanthanhnien@ptithcm.edu.vn',
        rater_tier: 'youth_union',
        stars: 5,
        feedback: 'Tổ chức rất tốt',
        created_at: '2026-08-10T10:00:00Z',
      },
      {
        id: '2',
        event_id: 'ev-2',
        organization_unit: 'CLB ITMC',
        rater_email: 'phongctsv@ptithcm.edu.vn',
        rater_tier: 'ctsv',
        stars: 4,
        feedback: 'Ổn định, đúng giờ',
        created_at: '2026-08-12T10:00:00Z',
      },
    ];

    const summary = summarizeUnitRatings(ratings, 'CLB ITMC');
    expect(summary.total_reviews).toBe(2);
    expect(summary.average_stars).toBe(4.5);
    expect(summary.has_low_rating_warning).toBe(false);
    expect(summary.recent_low_ratings.length).toBe(0);
  });

  test('correctly maps Vietnamese department labels', () => {
    expect(getRatingDepartmentLabel('youth_union')).toBe('Đoàn Học Viện');
    expect(getRatingDepartmentLabel('ctsv')).toBe('Phòng Công Tác Sinh Viên (CTSV)');
    expect(getRatingDepartmentLabel('facility')).toBe('Phòng Quản Trị CSVC & Tổ Chức');
    expect(getRatingDepartmentLabel('super_admin')).toBe('Super Admin Đoàn Trường');
  });
});
