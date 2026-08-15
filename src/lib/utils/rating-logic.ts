// ════════════════════════════════════════════════════════════════
// src/lib/utils/rating-logic.ts — Post-Event Rating & Warning Logic
// ════════════════════════════════════════════════════════════════

import type { UnitRating, UnitRatingSummary } from '@/lib/types';

export const LOW_RATING_THRESHOLD = 3;

/**
 * Normalizes any unit name or email to a canonical unit key.
 */
export function normalizeUnitKey(name?: string): string {
  if (!name) return '';
  const clean = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove Vietnamese diacritics
    .replace(/[^a-z0-9]/g, ''); // alphanumeric only

  // Map known unit keywords
  if (clean.includes('itmc')) return 'itmc';
  if (clean.includes('cntt') || clean.includes('congnghethongtin')) return 'cntt';
  if (clean.includes('cndpt') || clean.includes('dpt') || clean.includes('daphuongtien')) return 'cndpt';
  if (clean.includes('attt') || clean.includes('antoanthongtin')) {
    if (clean.includes('clb')) return 'clb_attt';
    return 'lcd_attt';
  }
  if (clean.includes('vienthong') || clean.includes('lcdvt')) return 'vt';
  if (clean.includes('dientu') || clean.includes('lcddt')) return 'dt';
  if (clean.includes('qtkd') || clean.includes('quantri')) return 'qtkd';
  if (clean.includes('mkt') || clean.includes('marketing')) return 'mkt';
  if (clean.includes('ketoan')) return 'ketoan';
  if (clean.includes('tienganh')) return 'tienganh';
  if (clean.includes('vannghe')) return 'vannghe';
  if (clean.includes('guitar')) return 'guitar';
  if (clean.includes('tinhnguyen')) return 'tinhnguyen';
  if (clean.includes('ketnoi')) return 'ketnoi';
  if (clean.includes('cmc')) return 'cmc';
  if (clean.includes('37do')) return '37do';
  if (clean.includes('bma')) return 'bma';
  if (clean.includes('bongchuyen')) return 'bongchuyen';
  if (clean.includes('bongda')) return 'bongda';
  if (clean.includes('bongro')) return 'bongro';
  if (clean.includes('vovinam')) return 'vovinam';
  if (clean.includes('clbco') || clean.includes('covua')) return 'co';
  if (clean.includes('caulong')) return 'caulong';

  return clean;
}

/**
 * Checks if two unit names/emails represent the same LCĐ or CLB entity.
 */
export function isSameUnit(unitA?: string, unitB?: string): boolean {
  if (!unitA || !unitB) return false;
  if (unitA.trim().toLowerCase() === unitB.trim().toLowerCase()) return true;
  const keyA = normalizeUnitKey(unitA);
  const keyB = normalizeUnitKey(unitB);
  return keyA === keyB && keyA.length > 0;
}

/**
 * Summarizes all ratings for an organization unit and determines if a low-rating warning should be flagged.
 */
export function summarizeUnitRatings(ratings: UnitRating[], unit: string): UnitRatingSummary {
  const matchedRatings = (ratings || []).filter((r) =>
    isSameUnit(r.organization_unit, unit)
  );

  if (!matchedRatings || matchedRatings.length === 0) {
    return {
      organization_unit: unit,
      average_stars: 5,
      total_reviews: 0,
      has_low_rating_warning: false,
      recent_low_ratings: [],
    };
  }

  const total = matchedRatings.length;
  const sum = matchedRatings.reduce((acc, curr) => acc + curr.stars, 0);
  const average_stars = Number((sum / total).toFixed(1));

  // Any rating of 1, 2, or 3 stars triggers the warning flag
  const recent_low_ratings = matchedRatings
    .filter((r) => r.stars <= LOW_RATING_THRESHOLD)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const has_low_rating_warning = recent_low_ratings.length > 0;

  return {
    organization_unit: unit,
    average_stars,
    total_reviews: total,
    has_low_rating_warning,
    recent_low_ratings,
  };
}

/**
 * Returns human-readable Department Label for a rater tier.
 */
export function getRatingDepartmentLabel(tier: string): string {
  switch (tier) {
    case 'youth_union':
      return 'Đoàn Học Viện';
    case 'ctsv':
      return 'Phòng Công Tác Sinh Viên (CTSV)';
    case 'facility':
      return 'Phòng Quản Trị CSVC & Tổ Chức';
    case 'super_admin':
      return 'Super Admin Đoàn Trường';
    default:
      return 'Cấp Phê Duyệt';
  }
}
