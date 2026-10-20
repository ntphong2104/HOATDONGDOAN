import fs from 'fs';
import path from 'path';
import { findUserProfileFromRegExtras } from '@/lib/constants/event-meta-store';

const PROFILE_DIR = path.join(process.cwd(), 'data');
const PROFILE_FILE = path.join(PROFILE_DIR, 'user-profiles.json');

export interface UserProfileExtra {
  gender?: string;
  phone?: string;
  updated_at?: string;
}

const g = globalThis as unknown as {
  __hddUserProfiles?: Record<string, UserProfileExtra>;
  __hddMeResponseCache?: Map<string, { data: any; expiresAt: number }>;
};

export function getMeResponseCache(): Map<string, { data: any; expiresAt: number }> {
  return g.__hddMeResponseCache || (g.__hddMeResponseCache = new Map());
}

export function invalidateMeResponseCache(email?: string | null, mssv?: string | null): void {
  const cache = getMeResponseCache();
  if (email) {
    cache.delete(email.trim().toLowerCase());
  }
  if (mssv) {
    const cleanMssv = mssv.trim().toLowerCase();
    cache.delete(`${cleanMssv}@student.ptithcm.edu.vn`);
  }
}

function loadProfiles(): Record<string, UserProfileExtra> {
  if (g.__hddUserProfiles) return g.__hddUserProfiles;
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      g.__hddUserProfiles = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
      return g.__hddUserProfiles!;
    }
  } catch {}
  g.__hddUserProfiles = {};
  return g.__hddUserProfiles;
}

function saveProfiles(data: Record<string, UserProfileExtra>) {
  // Update shared globalThis cache immediately across all Next.js route bundles
  g.__hddUserProfiles = data;
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }
    fs.promises.writeFile(PROFILE_FILE, JSON.stringify(data, null, 2), 'utf-8').catch(() => {});
  } catch {}
}

export function getUserProfileExtra(key: string): UserProfileExtra | null {
  if (!key) return null;
  const all = loadProfiles();
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const direct = all[lower] || all[upper] || null;
  if (direct?.phone && String(direct.phone).trim().length >= 8) {
    return direct;
  }
  // If key is an email like n23dccn001@student..., also check MSSV prefix
  if (lower.includes('@')) {
    const prefix = lower.split('@')[0];
    const byPrefix = all[prefix] || all[prefix.toUpperCase()] || null;
    if (byPrefix?.phone && String(byPrefix.phone).trim().length >= 8) {
      return byPrefix;
    }
  } else {
    const studentEmail = `${lower}@student.ptithcm.edu.vn`;
    const byEmail = all[studentEmail] || all[studentEmail.toUpperCase()] || null;
    if (byEmail?.phone && String(byEmail.phone).trim().length >= 8) {
      return byEmail;
    }
  }
  return direct;
}

/**
 * Get profile with Supabase + registration-extras fallback — use this when checking phone/gender
 * so that data persists across server restarts, logins, and route bundles.
 */
export async function getUserProfileExtraWithFallback(
  supabase: any,
  email: string,
  mssv?: string
): Promise<UserProfileExtra | null> {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanMssv = (mssv || (cleanEmail.includes('@') ? cleanEmail.split('@')[0] : '')).trim().toUpperCase();

  // 1. Try shared in-memory / file store first (fastest)
  const fromLocal =
    getUserProfileExtra(cleanEmail) ||
    (cleanMssv ? getUserProfileExtra(cleanMssv) : null);
  if (fromLocal?.phone && String(fromLocal.phone).trim().length >= 8) {
    return fromLocal;
  }

  // 2. Fallback: check Supabase system_settings (both email key and student email key)
  if (supabase && (cleanEmail || cleanMssv)) {
    try {
      const candidateKeys = Array.from(
        new Set(
          [
            cleanEmail ? `user_profile_${cleanEmail}` : '',
            cleanMssv ? `user_profile_${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn` : '',
          ].filter(Boolean)
        )
      );

      for (const profileKey of candidateKeys) {
        const { data } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', profileKey)
          .maybeSingle();

        if (data?.value) {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          if (parsed?.phone && String(parsed.phone).trim().length >= 8) {
            if (cleanEmail) saveUserProfileExtra(cleanEmail, parsed);
            if (cleanMssv) saveUserProfileExtra(cleanMssv, parsed);
            return parsed;
          }
        }
      }
    } catch {}
  }

  // 3. Fallback: check registration-extras history (for students who entered phone in CTV/event registration)
  if (cleanMssv) {
    const fromRegs = findUserProfileFromRegExtras(cleanMssv);
    if (fromRegs?.phone) {
      await saveUserProfileExtraWithSync(supabase, cleanEmail, cleanMssv, fromRegs);
      return fromRegs;
    }
  }

  return fromLocal;
}

export function saveUserProfileExtra(key: string, extra: Partial<UserProfileExtra>) {
  if (!key) return;
  const all = loadProfiles();
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase();
  const upper = trimmed.toUpperCase();
  const current = all[lower] || all[upper] || {};
  const updated: UserProfileExtra = {
    ...current,
    ...(extra.gender ? { gender: extra.gender } : {}),
    ...(extra.phone !== undefined && String(extra.phone).trim() !== ''
      ? { phone: String(extra.phone).trim() }
      : current.phone
      ? { phone: current.phone }
      : {}),
    updated_at: new Date().toISOString(),
  };
  all[lower] = updated;
  all[upper] = updated;
  saveProfiles(all);
}

/**
 * Lưu đồng bộ SĐT & giới tính vào cả RAM (globalThis), file data/user-profiles.json,
 * và bảng system_settings trên Supabase (dùng service_role client để không bị RLS chặn).
 */
export async function saveUserProfileExtraWithSync(
  supabase: any,
  email?: string | null,
  mssv?: string | null,
  extra?: Partial<UserProfileExtra>
): Promise<UserProfileExtra | null> {
  if (!extra) return null;
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanMssv = (mssv || (cleanEmail.includes('@') ? cleanEmail.split('@')[0] : '')).trim().toUpperCase();
  const studentEmail = cleanMssv ? `${cleanMssv.toLowerCase()}@student.ptithcm.edu.vn` : '';

  if (cleanEmail) saveUserProfileExtra(cleanEmail, extra);
  if (cleanMssv) saveUserProfileExtra(cleanMssv, extra);
  if (studentEmail && studentEmail !== cleanEmail) saveUserProfileExtra(studentEmail, extra);
  invalidateMeResponseCache(cleanEmail, cleanMssv);

  const merged =
    (cleanEmail ? getUserProfileExtra(cleanEmail) : null) ||
    (cleanMssv ? getUserProfileExtra(cleanMssv) : null) ||
    extra;

  if (supabase && merged?.phone) {
    const payload = {
      gender: merged.gender || 'Nam',
      phone: String(merged.phone).trim(),
      updated_at: new Date().toISOString(),
    };
    const keysToSync = Array.from(
      new Set([
        cleanEmail ? `user_profile_${cleanEmail}` : '',
        studentEmail ? `user_profile_${studentEmail}` : '',
      ].filter(Boolean))
    );
    for (const key of keysToSync) {
      try {
        await supabase.from('system_settings').upsert(
          {
            key,
            value: payload,
            updated_at: payload.updated_at,
          },
          { onConflict: 'key' }
        );
      } catch {}
    }
  }

  return merged;
}
