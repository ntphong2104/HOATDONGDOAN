// ═══════════════════════════════════════════════════════════════════════════
// Giới hạn khóa sinh viên (D22, D23, ...)
// - Danh sách khóa được tự động sinh theo năm hiện tại (không cần sửa code mỗi năm)
// - allowed_cohorts rỗng / null = KHÔNG giới hạn (tất cả khóa)
// ═══════════════════════════════════════════════════════════════════════════

/** Số khóa đang học hiển thị để chọn (khóa mới nhất và 4 khóa trước đó). */
const ACTIVE_COHORT_COUNT = 5;

/** Khóa mới nhập học từ tháng này trở đi (tháng 8). */
const NEW_COHORT_MONTH = 8;

/** Năm/tháng theo giờ Việt Nam (UTC+7). */
function vnYearMonth(now: Date): { year: number; month: number } {
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return { year: vn.getUTCFullYear(), month: vn.getUTCMonth() + 1 };
}

/**
 * Danh sách khóa để chọn, tự động theo năm học.
 * VD: 10/2026 → D22, D23, D24, D25, D26. Sang 8/2027 tự có thêm D27.
 * Các khóa đã được chọn trước đó (kể cả khóa cũ) vẫn được giữ trong danh sách.
 */
export function getSelectableCohorts(extra: string[] = [], now: Date = new Date()): string[] {
  const { year, month } = vnYearMonth(now);
  const latest = (month >= NEW_COHORT_MONTH ? year : year - 1) % 100;
  const list: string[] = [];
  for (let yy = latest - ACTIVE_COHORT_COUNT + 1; yy <= latest; yy++) {
    list.push(`D${String(yy).padStart(2, '0')}`);
  }
  for (const c of extra || []) {
    const norm = normalizeCohort(c);
    if (norm && !list.includes(norm)) list.push(norm);
  }
  return list.sort();
}

export function normalizeCohort(value: string | null | undefined): string | null {
  const m = String(value || '').trim().toUpperCase().match(/^D?(\d{2})$/);
  return m ? `D${m[1]}` : null;
}

/** MSSV N22DCCN158 → D22. Email/tài khoản không phải MSSV → null. */
export function getCohortFromMssv(mssv: string | null | undefined): string | null {
  const m = String(mssv || '').trim().match(/^N(\d{2})/i);
  return m ? `D${m[1]}` : null;
}

/** Danh sách khóa giới hạn đã chuẩn hóa; [] = không giới hạn. */
export function normalizeAllowedCohorts(allowed: unknown): string[] {
  if (!Array.isArray(allowed)) return [];
  const out: string[] = [];
  for (const c of allowed) {
    const norm = normalizeCohort(String(c));
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out.sort();
}

export interface CohortEligibility {
  restricted: boolean;
  allowed: string[];
  myCohort: string | null;
  eligible: boolean;
}

export function checkCohortEligibility(allowed: unknown, mssv: string | null | undefined): CohortEligibility {
  const list = normalizeAllowedCohorts(allowed);
  const myCohort = getCohortFromMssv(mssv);
  if (list.length === 0) {
    return { restricted: false, allowed: [], myCohort, eligible: true };
  }
  return { restricted: true, allowed: list, myCohort, eligible: !!myCohort && list.includes(myCohort) };
}

/** Thông báo khi SV không nằm trong khóa được đăng ký. */
export function describeCohortBlock(e: CohortEligibility, mssv?: string | null, target = 'Sự kiện này'): string {
  const who = mssv ? `Tài khoản của bạn (${mssv})` : 'Tài khoản của bạn';
  const mine = e.myCohort ? `thuộc khóa ${e.myCohort}` : 'không xác định được khóa (không phải MSSV sinh viên)';
  return `Bạn không nằm trong khóa được đăng ký. ${target} chỉ dành cho sinh viên khóa ${e.allowed.join(', ')}; ${who} ${mine}.`;
}
