// ═══════════════════════════════════════════════════════════════════════════
// src/lib/utils/student-profile.ts
// Resolve the best-known real name / class for students.
//
// Students imported by MSSV only (bulk "Nạp danh sách MSSV") get placeholder
// profiles: full_name = MSSV, class_id = 'PTIT-HCM'. The same student often
// typed their real name/class when registering for another event, so we look
// across `users` AND all `event_registrations` and pick the first real value.
// ═══════════════════════════════════════════════════════════════════════════

export const PLACEHOLDER_CLASS = 'PTIT-HCM';

/** True if `name` is empty, an email, or just the MSSV itself. */
export function isPlaceholderName(name: string | null | undefined, mssv?: string | null): boolean {
  const n = String(name || '').trim();
  if (!n) return true;
  if (n.includes('@')) return true;
  if (mssv && n.toUpperCase() === String(mssv).trim().toUpperCase()) return true;
  return false;
}

/** True if `classId` is empty or the generic placeholder class. */
export function isPlaceholderClass(classId: string | null | undefined): boolean {
  const c = String(classId || '').trim();
  return !c || c.toUpperCase() === PLACEHOLDER_CLASS;
}

export interface ResolvedStudentProfile {
  full_name: string | null;
  class_id: string | null;
}

/**
 * Returns a map MSSV(UPPERCASE) -> best real { full_name, class_id } (null when unknown).
 * Preference: users table first, then the most recent event_registrations entry.
 */
export async function resolveStudentProfiles(
  supabase: any,
  mssvs: string[]
): Promise<Map<string, ResolvedStudentProfile>> {
  const result = new Map<string, ResolvedStudentProfile>();
  const ids = [...new Set((mssvs || []).map((m) => String(m || '').trim().toUpperCase()).filter(Boolean))];
  if (!supabase || ids.length === 0) return result;

  for (const id of ids) result.set(id, { full_name: null, class_id: null });

  const apply = (rows: any[] | null | undefined) => {
    for (const r of rows || []) {
      const key = String(r?.mssv || '').trim().toUpperCase();
      const cur = result.get(key);
      if (!cur) continue;
      if (!cur.full_name && !isPlaceholderName(r.full_name, key)) cur.full_name = String(r.full_name).trim();
      if (!cur.class_id && !isPlaceholderClass(r.class_id)) cur.class_id = String(r.class_id).trim();
    }
  };

  const CHUNK_SIZE = 200;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    try {
      const { data } = await supabase.from('users').select('mssv, full_name, class_id').in('mssv', chunk);
      apply(data);
    } catch {}
  }

  // Only look up registrations for students still missing a real name or class
  const missing = ids.filter((id) => {
    const p = result.get(id)!;
    return !p.full_name || !p.class_id;
  });
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    try {
      const { data } = await supabase
        .from('event_registrations')
        .select('mssv, full_name, class_id, created_at')
        .in('mssv', chunk)
        .order('created_at', { ascending: false });
      apply(data);
    } catch {}
  }

  return result;
}
