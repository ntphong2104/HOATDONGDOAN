/**
 * Single source of truth for built-in approver/official accounts.
 *
 * SECURITY: Roles are resolved by EXACT email match only — never by substring.
 * Previously an email merely *containing* "ctsv", "quantri", "tchc", "csvc", "bchdoan", "baove"...
 * was granted approver privileges (e.g. a "Quản trị kinh doanh" unit email containing "quantri"
 * would be treated as Phòng TC-HC-QT). Any additional approver account must be granted
 * explicitly by a Super Admin via the `officer_roles` table (tab "Cán bộ").
 */
import type { UserTier } from '@/lib/types';

export type OfficialTier = Extract<UserTier, 'youth_union' | 'ctsv' | 'facility' | 'security'>;

export const OFFICIAL_ROLE_EMAILS: Readonly<Record<string, OfficialTier>> = Object.freeze({
  'bchdoan@ptithcm.edu.vn': 'youth_union',
  'ctsv@ptithcm.edu.vn': 'ctsv',
  'phongctsv@ptithcm.edu.vn': 'ctsv',
  'quantri@ptithcm.edu.vn': 'facility',
  'phongquantri@ptithcm.edu.vn': 'facility',
  'baove@ptithcm.edu.vn': 'security',
});

/** Returns the built-in official tier for an email (exact match), or null. */
export function getOfficialTierForEmail(email?: string | null): OfficialTier | null {
  if (!email) return null;
  return OFFICIAL_ROLE_EMAILS[email.trim().toLowerCase()] || null;
}

/** Tiers allowed to act as proposal approvers / reviewers. */
export const APPROVER_TIERS: ReadonlyArray<UserTier> = ['super_admin', 'youth_union', 'ctsv', 'facility'];
