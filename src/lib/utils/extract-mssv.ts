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
      const isMSSVFormat = /^[A-Z]\d{2}[A-Z]{4}\d{3}$/i.test(username);
      if (isMSSVFormat || lower.includes('@student.')) {
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
