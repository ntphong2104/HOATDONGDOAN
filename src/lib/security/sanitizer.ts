/**
 * Input sanitization and anti-injection utility
 */

// Strict regex pattern for Student ID (MSSV) e.g., N22DCCN158, B21DCCN001
const MSSV_PATTERN = /^[A-Z]\d{2}[A-Z]{4}\d{3}$/i;

// Strict PTIT school email regex pattern: supports both @student.ptithcm.edu.vn (students) and @ptithcm.edu.vn (faculty/teachers)
const SCHOOL_EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@(student\.)?ptithcm\.edu\.vn$/i;

/**
 * Validates whether string conforms to valid MSSV format
 */
export function isValidMSSV(mssv: string): boolean {
  if (!mssv || typeof mssv !== 'string') return false;
  return MSSV_PATTERN.test(mssv.trim().toUpperCase());
}

/**
 * Validates whether email belongs to school domain (@student.ptithcm.edu.vn or @ptithcm.edu.vn)
 */
export function isValidSchoolEmailDomain(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  return SCHOOL_EMAIL_PATTERN.test(email.trim().toLowerCase());
}

/**
 * Sanitizes generic user text to prevent XSS payloads and script injection
 */
export function sanitizeInput(input: string, maxLength = 255): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/<[^>]*>/g, '') // Strip full HTML tags like <script>...</script>
    .replace(/javascript:/gi, '')
    .replace(/data:\s*text\/html/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .substring(0, maxLength);
}
