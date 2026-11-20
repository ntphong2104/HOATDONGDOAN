export function getSchoolDomains(): string[] {
  const envDomain = process.env.NEXT_PUBLIC_SCHOOL_DOMAIN;
  const defaults = [
    'student.ptithcm.edu.vn',
    'ptithcm.edu.vn',
    'ptit.edu.vn',
    'stu.ptit.edu.vn',
  ];
  if (envDomain && !defaults.includes(envDomain.toLowerCase())) {
    return [envDomain.toLowerCase(), ...defaults];
  }
  return defaults;
}

export function isValidSchoolEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const lower = email.trim().toLowerCase();
  const domains = getSchoolDomains();
  return domains.some((domain) => lower.endsWith(`@${domain}`));
}

export function extractMSSV(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();

  // If input contains @ (email address)
  if (lower.includes('@')) {
    if (isValidSchoolEmail(lower)) {
      const username = lower.split('@')[0];
      const isUnitEmail = username.startsWith('lcd') || username.startsWith('clb') || username.startsWith('doi');
      const isMSSVFormat = /^[A-Z]\d{2}[A-Z0-9]{3,5}\d{3}$/i.test(username);
      if (!isUnitEmail && isMSSVFormat) {
        return username.toUpperCase();
      }
    }
    return null;
  }

  // 1. Direct MSSV format (e.g., N22DCCN158, B21DCCN001)
  const directMatch = trimmed.match(/^([A-Z]\d{2}[A-Z]{4}\d{3})$/i);
  if (directMatch) {
    return directMatch[1].toUpperCase();
  }

  // 2. MSSV embedded in barcode string (e.g., barcode scan prefixes)
  const embeddedMatch = trimmed.match(/([A-Z]\d{2}[A-Z]{4}\d{3})/i);
  if (embeddedMatch) {
    return embeddedMatch[1].toUpperCase();
  }

  return null;
}

/**
 * Nhận diện tài khoản đơn vị / chức năng (LCĐ, CLB, Đội, Phòng ban, Cán bộ cấp trường).
 * Các tài khoản này KHÔNG PHẢI là sinh viên cá nhân, không có mã QR tích lũy ĐRL.
 */
export function isUnitAccount(
  account?: { mssv?: string | null; email?: string | null } | string | null
): boolean {
  if (!account) return false;
  const rawEmail = typeof account === 'string' ? (account.includes('@') ? account : '') : (account.email || '');
  const rawMssv = typeof account === 'string' ? (!account.includes('@') ? account : '') : (account.mssv || '');
  const m = String(rawMssv || '').trim().toUpperCase();
  const e = String(rawEmail || '').trim().toLowerCase();

  return (
    m.startsWith('LCD_') ||
    m.startsWith('CLB_') ||
    m.startsWith('DOI_') ||
    m.startsWith('PHONG_') ||
    m.startsWith('DOAN_') ||
    m.startsWith('SUPER_') ||
    m.startsWith('LCD') ||
    m.startsWith('BCH') ||
    e.startsWith('lcd') ||
    e.startsWith('clb') ||
    e.startsWith('doi') ||
    e.startsWith('bch') ||
    e.startsWith('doan') ||
    e.includes('ctsv') ||
    e.includes('quantri') ||
    e.includes('superadmin') ||
    e.includes('bchdoan') ||
    e.includes('baove')
  );
}

/**
 * Kiểm tra tài khoản có phải là tài khoản sinh viên cá nhân (có MSSV cá nhân thật, không phải tài khoản đơn vị).
 */
export function isStudentPersonalAccount(
  account?: { mssv?: string | null; email?: string | null } | string | null
): boolean {
  if (!account) return false;
  if (isUnitAccount(account)) return false;
  const rawEmail = typeof account === 'string' ? (account.includes('@') ? account : '') : (account.email || '');
  const rawMssv = typeof account === 'string' ? (!account.includes('@') ? account : '') : (account.mssv || '');
  const extracted = rawEmail ? extractMSSV(rawEmail) : null;
  if (extracted) return true;
  if (rawMssv && isValidMSSV(rawMssv)) return true;
  return false;
}

/**
 * Validates whether a string looks like a legitimate PTIT MSSV.
 * 
 * Accepted MSSV patterns:
 * - Standard: N22DCCN158, B21DCAT007, N23DCDT005 (letter + 2 digits + 4 letters + 3 digits)
 * - Extended: N22DCCN07823 (letter + 2 digits + 4 letters + 3-5 digits — some older formats)
 * - Class-style: D22CQCN01-N, D23CQVT01-N (letter + 2 digits + 2-4 letters + 2-4 letters + 2 digits + dash + letter)
 * - Legacy/other: up to 15 chars, must start with a letter followed by digits, then alpha-numeric
 * 
 * Rejected patterns:
 * - Too short (< 8) or too long (> 15)
 * - Doesn't start with a letter
 * - Contains spaces or special chars (except dash)
 * - Looks like concatenated values (e.g., N22DCDK097N22DCAT014)
 */
export function isValidMSSV(mssv: string): boolean {
  if (!mssv || typeof mssv !== 'string') return false;
  const s = mssv.trim().toUpperCase();

  // Length check: PTIT MSSVs are 8-15 characters
  if (s.length < 8 || s.length > 15) return false;

  // Must start with a letter followed by 2 digits (year)
  if (!/^[A-Z]\d{2}/.test(s)) return false;

  // Standard PTIT MSSV: Letter + 2 digits + 2-6 alpha + 1-5 digits + optional suffix (-X)
  // Examples: N22DCCN158, B21DCAT007, N23DCCN191
  const MSSV_REGEX = /^[A-Z]\d{2}[A-Z]{2,6}\d{1,5}(-[A-Z0-9]{1,3})?$/;
  if (!MSSV_REGEX.test(s)) return false;

  // Reject class IDs & mistyped D-prefix MSSVs (D24CQCN01-N, D26DCCN102, etc.)
  // PTIT student MSSVs start with N / B / E, never D (D is reserved for class codes)
  if (/^D\d{2}/i.test(s)) return false;
  if (/^[A-Z]\d{2}CQ/i.test(s)) return false;

  // Reject if it looks like 2 MSSVs concatenated
  // Look for a SECOND occurrence of the MSSV start pattern (letter + 2digits + 2+ letters) after position 0
  // e.g., N22DCDK097N22DCAT014 → has "N22DC" appearing twice
  const concatPattern = /[A-Z]\d{2}[A-Z]{2}/g;
  const concatMatches: number[] = [];
  let m;
  while ((m = concatPattern.exec(s)) !== null) {
    concatMatches.push(m.index);
  }
  if (concatMatches.length > 1) return false;

  return true;
}
