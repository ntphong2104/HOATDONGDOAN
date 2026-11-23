import { getCohortFromMssv, normalizeCohort } from '@/lib/utils/cohort';
import { LCD_DEFINITIONS, normalizeLcdCode, resolveStudentLcd, type LcdCode } from '@/lib/utils/lcd';

export const GRADUATED_COHORTS_SETTING_KEY = 'graduated_cohorts_config';
const CACHE_TTL_MS = 60_000;

export interface GraduatedCohortRule {
  lcd_code: LcdCode;
  cohort: string; // e.g. 'D20', 'D21', 'D22'
}

export interface GraduatedCohortsConfig {
  rules: GraduatedCohortRule[];
  deleted_cohorts: string[];
}

const gGrad = globalThis as unknown as {
  __hddGraduatedCache?: { rules: GraduatedCohortRule[]; deleted_cohorts: string[]; expiresAt: number };
};

export function invalidateGraduatedCohortsCache(): void {
  gGrad.__hddGraduatedCache = undefined;
}

export function normalizeDeletedCohorts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<string>();
  for (const item of raw) {
    const norm = normalizeCohort(String(item || ''));
    if (norm) set.add(norm);
  }
  return Array.from(set).sort();
}

export function normalizeGraduatedRules(raw: unknown): GraduatedCohortRule[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: GraduatedCohortRule[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const lcdCode = normalizeLcdCode(String(obj.lcd_code || ''));
    const cohort = normalizeCohort(String(obj.cohort || ''));
    if (!lcdCode || !cohort) continue;

    const key = `${lcdCode}::${cohort}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lcd_code: lcdCode, cohort });
  }

  return out.sort((a, b) => {
    if (a.cohort !== b.cohort) return a.cohort.localeCompare(b.cohort);
    return a.lcd_code.localeCompare(b.lcd_code);
  });
}

export async function getGraduatedCohortsConfig(
  supabase: any,
  forceRefresh = false
): Promise<GraduatedCohortsConfig> {
  const now = Date.now();
  if (!forceRefresh && gGrad.__hddGraduatedCache && gGrad.__hddGraduatedCache.expiresAt > now) {
    return {
      rules: gGrad.__hddGraduatedCache.rules,
      deleted_cohorts: gGrad.__hddGraduatedCache.deleted_cohorts,
    };
  }

  if (!supabase) return { rules: [], deleted_cohorts: [] };

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', GRADUATED_COHORTS_SETTING_KEY)
      .maybeSingle();

    if (!error && data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      const rules = normalizeGraduatedRules(parsed?.rules ?? parsed);
      const deleted_cohorts = normalizeDeletedCohorts(parsed?.deleted_cohorts);
      gGrad.__hddGraduatedCache = { rules, deleted_cohorts, expiresAt: now + CACHE_TTL_MS };
      return { rules, deleted_cohorts };
    }
  } catch {
    // Fallback to empty
  }

  gGrad.__hddGraduatedCache = { rules: [], deleted_cohorts: [], expiresAt: now + CACHE_TTL_MS };
  return { rules: [], deleted_cohorts: [] };
}

export async function getGraduatedCohorts(
  supabase: any,
  forceRefresh = false
): Promise<GraduatedCohortRule[]> {
  const cfg = await getGraduatedCohortsConfig(supabase, forceRefresh);
  return cfg.rules;
}

export async function saveGraduatedCohorts(
  supabase: any,
  rules: GraduatedCohortRule[],
  deletedCohorts?: string[]
): Promise<{ success: boolean; rules: GraduatedCohortRule[]; deleted_cohorts: string[]; error?: string }> {
  const existing = deletedCohorts === undefined ? await getGraduatedCohortsConfig(supabase, true) : null;
  const finalDeleted = normalizeDeletedCohorts(deletedCohorts ?? existing?.deleted_cohorts ?? []);

  // Ensure any deleted cohort stays marked as graduated across all 8 LCĐs
  const mergedRules = [...rules];
  for (const dc of finalDeleted) {
    for (const lcd of LCD_DEFINITIONS) {
      mergedRules.push({ lcd_code: lcd.code, cohort: dc });
    }
  }
  const normalized = normalizeGraduatedRules(mergedRules);

  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: GRADUATED_COHORTS_SETTING_KEY,
        value: JSON.stringify({
          rules: normalized,
          deleted_cohorts: finalDeleted,
          updated_at: new Date().toISOString(),
        }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (error) {
    return { success: false, rules: normalized, deleted_cohorts: finalDeleted, error: error.message };
  }

  gGrad.__hddGraduatedCache = {
    rules: normalized,
    deleted_cohorts: finalDeleted,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return { success: true, rules: normalized, deleted_cohorts: finalDeleted };
}

/**
 * Extracts student cohort from MSSV (N21DCCN001 -> D21) or fallback from class_id (D21CQCN01-N -> D21).
 */
export function resolveStudentCohort(
  mssv?: string | null,
  classId?: string | null
): string | null {
  const fromMssv = getCohortFromMssv(mssv);
  if (fromMssv) return fromMssv;
  const clsMatch = String(classId || '').trim().toUpperCase().match(/^[A-Z](\d{2})/);
  return clsMatch ? `D${clsMatch[1]}` : null;
}

/**
 * Returns true if the student belongs to an (LCĐ + Cohort) marked as graduated.
 */
export function isStudentGraduated(
  mssv: string | null | undefined,
  classId: string | null | undefined,
  rules: GraduatedCohortRule[]
): boolean {
  if (!rules || rules.length === 0) return false;
  const cohort = resolveStudentCohort(mssv, classId);
  if (!cohort) return false;
  const lcd = resolveStudentLcd(classId, mssv);
  if (!lcd) return false;
  return rules.some((r) => r.lcd_code === lcd.code && r.cohort === cohort);
}

/**
 * Returns a human-readable Vietnamese block reason if the student is graduated, or null otherwise.
 */
export function getGraduatedBlockReason(
  mssv: string | null | undefined,
  classId: string | null | undefined,
  rules: GraduatedCohortRule[]
): string | null {
  if (!rules || rules.length === 0) return null;
  const cohort = resolveStudentCohort(mssv, classId);
  if (!cohort) return null;
  const lcd = resolveStudentLcd(classId, mssv);
  if (!lcd) return null;
  const matched = rules.some((r) => r.lcd_code === lcd.code && r.cohort === cohort);
  if (!matched) return null;
  return `Tài khoản thuộc khóa ${cohort} (${lcd.shortName}) đã được đánh dấu tốt nghiệp, không thể đăng ký tham gia chương trình mới. Bạn vẫn có thể xem lại lịch sử tham gia trước đây.`;
}

export function isStudentInDeletedCohort(
  mssv: string | null | undefined,
  classId: string | null | undefined,
  deletedCohorts: string[]
): boolean {
  if (!deletedCohorts || deletedCohorts.length === 0) return false;
  const cohort = resolveStudentCohort(mssv, classId);
  if (!cohort) return false;
  return deletedCohorts.includes(cohort);
}

export interface CohortGraduationStatus {
  isFullyGraduated: boolean;
  graduatedCount: number;
  totalLcds: number;
  missingLcds: string[];
}

/**
 * Checks whether every LCĐ in LCD_DEFINITIONS has been marked graduated for a cohort.
 */
export function getCohortGraduationStatus(
  cohort: string,
  rules: GraduatedCohortRule[]
): CohortGraduationStatus {
  const totalLcds = LCD_DEFINITIONS.length;
  const normalized = normalizeCohort(cohort);
  if (!normalized || totalLcds === 0) {
    return {
      isFullyGraduated: false,
      graduatedCount: 0,
      totalLcds,
      missingLcds: LCD_DEFINITIONS.map((lcd) => lcd.shortName),
    };
  }

  const graduatedLcds = new Set<LcdCode>();
  for (const r of rules || []) {
    if (normalizeCohort(r.cohort) === normalized) {
      graduatedLcds.add(r.lcd_code);
    }
  }

  const missingLcds = LCD_DEFINITIONS.filter((lcd) => !graduatedLcds.has(lcd.code)).map(
    (lcd) => lcd.shortName
  );
  const graduatedCount = totalLcds - missingLcds.length;

  return {
    isFullyGraduated: missingLcds.length === 0 && totalLcds > 0,
    graduatedCount,
    totalLcds,
    missingLcds,
  };
}

export function isCohortFullyGraduated(
  cohort: string,
  rules: GraduatedCohortRule[]
): boolean {
  return getCohortGraduationStatus(cohort, rules).isFullyGraduated;
}

/**
 * Returns default list of cohorts to show in the Super Admin graduation matrix
 * (e.g., D19 through latest cohort), excluding cohorts deleted from the system.
 */
export function getGraduationMatrixCohorts(
  existingRules: GraduatedCohortRule[] = [],
  now: Date = new Date(),
  deletedCohorts: string[] = []
): string[] {
  const deletedSet = new Set(deletedCohorts);
  const vn = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const year = vn.getUTCFullYear();
  const month = vn.getUTCMonth() + 1;
  const latest = (month >= 8 ? year : year - 1) % 100;
  const set = new Set<string>();
  for (let yy = Math.max(18, latest - 7); yy <= latest; yy++) {
    set.add(`D${String(yy).padStart(2, '0')}`);
  }
  for (const r of existingRules) {
    if (r.cohort) set.add(r.cohort);
  }
  return Array.from(set)
    .filter((c) => !deletedSet.has(c))
    .sort();
}

export { LCD_DEFINITIONS };
