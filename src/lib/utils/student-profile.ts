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

// ─── Parsing / validation / persistence of a student's own profile ───

/**
 * PTIT Google account display names look like "D22CQCN02-N NGUYEN THANH PHONG".
 * Returns the class prefix and the real name when present.
 */
export function parseGoogleStudentName(raw?: string | null): { full_name: string | null; class_id: string | null } {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s || s.includes('@')) return { full_name: null, class_id: null };
  const match = s.match(/^([A-Z]\d{2}[A-Z0-9-]+)\s+(.+)$/i);
  if (match) {
    return { full_name: match[2].trim(), class_id: match[1].toUpperCase() };
  }
  return { full_name: s, class_id: null };
}

/** Normalises and validates a student-entered full name. Returns null when invalid. */
export function normalizeStudentFullName(input: unknown): string | null {
  const s = String(input ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (s.length < 4 || s.length > 60) return null;
  if (!/^[\p{L}][\p{L}\s.'-]*$/u.test(s)) return null; // letters, spaces, . ' - only
  if (s.split(' ').length < 2) return null; // at least family + given name
  return s;
}

/** Normalises and validates a class code like "D25CQMR02-N". Returns null when invalid. */
export function normalizeStudentClassId(input: unknown): string | null {
  const s = String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z]\d{2}[A-Z0-9-]{2,15}$/.test(s)) return null;
  if (s === PLACEHOLDER_CLASS) return null;
  return s;
}

/**
 * Persists a student's real name/class to `users` and back-fills this student's
 * event_registrations rows that still hold placeholder values.
 */
export async function saveStudentProfile(
  supabase: any,
  params: { mssv: string; email: string; full_name?: string | null; class_id?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const mssv = String(params.mssv || '').trim().toUpperCase();
  const email = String(params.email || '').trim().toLowerCase();
  if (!supabase || !mssv || !email) return { ok: false, error: 'missing_identity' };

  const patch: Record<string, string> = {};
  if (params.full_name) patch.full_name = params.full_name;
  if (params.class_id) patch.class_id = params.class_id;
  if (Object.keys(patch).length === 0) return { ok: true };

  try {
    // Update existing row (imported rows are keyed by MSSV)
    const { data: updated, error: updErr } = await supabase
      .from('users')
      .update(patch)
      .ilike('mssv', mssv)
      .select('mssv');
    if (updErr) return { ok: false, error: updErr.message };

    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabase.from('users').upsert(
        {
          mssv,
          email,
          full_name: patch.full_name || mssv,
          class_id: patch.class_id || PLACEHOLDER_CLASS,
        },
        { onConflict: 'email' }
      );
      if (insErr) return { ok: false, error: insErr.message };
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'save_failed' };
  }

  // Best-effort back-fill of placeholder registration rows for this student
  try {
    if (patch.full_name) {
      await supabase
        .from('event_registrations')
        .update({ full_name: patch.full_name })
        .ilike('mssv', mssv)
        .or(`full_name.is.null,full_name.eq.,full_name.ilike.${mssv}`);
    }
    if (patch.class_id) {
      await supabase
        .from('event_registrations')
        .update({ class_id: patch.class_id })
        .ilike('mssv', mssv)
        .or(`class_id.is.null,class_id.eq.,class_id.eq.${PLACEHOLDER_CLASS}`);
    }
  } catch {}

  return { ok: true };
}
