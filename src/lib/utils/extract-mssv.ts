export function getSchoolDomains(): string[] {
  const envDomain = process.env.NEXT_PUBLIC_SCHOOL_DOMAIN;
  const defaults = ['student.ptithcm.edu.vn', 'ptithcm.edu.vn'];
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

export function extractMSSV(email: string): string | null {
  if (!email || typeof email !== 'string') return null;
  const lower = email.trim().toLowerCase();
  
  if (!isValidSchoolEmail(lower)) return null;

  const username = lower.split('@')[0];
  // Check if username matches standard PTIT MSSV format (e.g., N22DCCN158, B21DCCN001)
  const isMSSVFormat = /^[A-Z]\d{2}[A-Z]{4}\d{3}$/i.test(username);
  if (isMSSVFormat || lower.includes('@student.')) {
    return username.toUpperCase();
  }
  
  return null;
}
