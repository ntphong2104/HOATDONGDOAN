import fs from 'fs';
import path from 'path';

const PROFILE_DIR = path.join(process.cwd(), 'data');
const PROFILE_FILE = path.join(PROFILE_DIR, 'user-profiles.json');

export interface UserProfileExtra {
  gender?: string;
  phone?: string;
  updated_at?: string;
}

// ── In-memory cache to avoid read-after-write race condition ──
let inMemoryProfiles: Record<string, UserProfileExtra> | null = null;

function loadProfiles(): Record<string, UserProfileExtra> {
  if (inMemoryProfiles) return inMemoryProfiles;
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      inMemoryProfiles = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
      return inMemoryProfiles!;
    }
  } catch {}
  inMemoryProfiles = {};
  return inMemoryProfiles;
}

function saveProfiles(data: Record<string, UserProfileExtra>) {
  // Update in-memory cache immediately
  inMemoryProfiles = data;
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
  const lower = key.toLowerCase();
  const upper = key.toUpperCase();
  return all[lower] || all[upper] || null;
}

/**
 * Get profile with Supabase fallback - use this when checking phone/gender
 * so that data persists across server restarts
 */
export async function getUserProfileExtraWithFallback(
  supabase: any,
  email: string,
  mssv?: string
): Promise<UserProfileExtra | null> {
  // 1. Try in-memory/file first (fastest)
  const fromLocal = getUserProfileExtra(email) || (mssv ? getUserProfileExtra(mssv) : null);
  if (fromLocal?.phone && fromLocal.phone.trim().length >= 8) {
    return fromLocal;
  }

  // 2. Fallback: check Supabase
  if (supabase && email) {
    try {
      const profileKey = `user_profile_${email.toLowerCase()}`;
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', profileKey)
        .maybeSingle();

      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (parsed?.phone) {
          // Sync back to in-memory cache
          saveUserProfileExtra(email, parsed);
          if (mssv) saveUserProfileExtra(mssv, parsed);
          return parsed;
        }
      }
    } catch {}
  }

  return fromLocal;
}

export function saveUserProfileExtra(key: string, extra: Partial<UserProfileExtra>) {
  if (!key) return;
  const all = loadProfiles();
  const lower = key.toLowerCase();
  const upper = key.toUpperCase();
  const current = all[lower] || all[upper] || {};
  const updated = {
    ...current,
    ...extra,
    updated_at: new Date().toISOString(),
  };
  all[lower] = updated;
  all[upper] = updated;
  saveProfiles(all);
}
