import fs from 'fs';
import path from 'path';
import {
  findUserProfileFromRegExtras,
  getAllRegExtrasProfilesMap,
} from '@/lib/constants/event-meta-store';
import { writeJsonFileAtomic, parseJsonWithRepair } from '@/lib/utils/atomic-file';

const PROFILE_DIR = path.join(process.cwd(), 'data');
const PROFILE_FILE = path.join(PROFILE_DIR, 'user-profiles.json');

export interface UserProfileExtra {
  gender?: string;
  phone?: string;
  updated_at?: string;
}

const MAX_ME_RESPONSE_CACHE = 2000;
const NEGATIVE_PROFILE_CACHE_TTL_MS = 5000;

const g = globalThis as unknown as {
  __hddUserProfiles?: Record<string, UserProfileExtra>;
  __hddUserProfilesMtime?: number;
  __hddUserProfilesStatAt?: number;
  __hddDirtyUserProfiles?: Record<string, UserProfileExtra>;
  __hddMeResponseCache?: Map<string, { data: any; expiresAt: number }>;
  __hddMissingProfileKeys?: Map<string, number>;
  __hddInflightProfileLookup?: Map<string, Promise<UserProfileExtra | null>>;
  __hddAllProfilesMapCache?: { map: Map<string, UserProfileExtra>; expiresAt: number };
  __hddInflightAllProfiles?: Promise<Map<string, UserProfileExtra>>;
};

export function getMeResponseCache(): Map<string, { data: any; expiresAt: number }> {
  return g.__hddMeResponseCache || (g.__hddMeResponseCache = new Map());
}

export function setBoundedMeResponseCache(emailKey: string, data: any, ttlMs = 15000): void {
  const cache = getMeResponseCache();
  const key = emailKey.trim().toLowerCase();
  const now = Date.now();
  if (!cache.has(key) && cache.size >= MAX_ME_RESPONSE_CACHE) {
    for (const [k, v] of cache.entries()) {
      if (v.expiresAt <= now) cache.delete(k);
    }
    if (cache.size >= MAX_ME_RESPONSE_CACHE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) cache.delete(oldestKey);
    }
  }
  cache.set(key, { data, expiresAt: now + ttlMs });
}

export function invalidateMeResponseCache(email?: string | null, mssv?: string | null): void {
  const cache = getMeResponseCache();
  const missingCache = g.__hddMissingProfileKeys;
  if (!email && !mssv) {
    cache.clear();
    missingCache?.clear();
    return;
  }
  if (email) {
    const cleanEmail = email.trim().toLowerCase();
    cache.delete(cleanEmail);
    missingCache?.delete(cleanEmail);
  }
  if (mssv) {
    const cleanMssv = mssv.trim().toLowerCase();
    cache.delete(`${cleanMssv}@student.ptithcm.edu.vn`);
    missingCache?.delete(cleanMssv);
    missingCache?.delete(`${cleanMssv}@student.ptithcm.edu.vn`);
  }
}

function readProfilesFromDisk(): { data: Record<string, UserProfileExtra>; mtimeMs: number } {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      const stat = fs.statSync(PROFILE_FILE);
      const res = parseJsonWithRepair<Record<string, UserProfileExtra>>(fs.readFileSync(PROFILE_FILE, 'utf-8'));
      if (res?.value) {
        return { data: res.value, mtimeMs: stat.mtimeMs };
      }
    }
  } catch {}
  return { data: {}, mtimeMs: 0 };
}

function loadProfiles(): Record<string, UserProfileExtra> {
  const now = Date.now();
  if (g.__hddUserProfiles) {
    if (!g.__hddUserProfilesStatAt || now - g.__hddUserProfilesStatAt >= 5000) {
      g.__hddUserProfilesStatAt = now;
      try {
        if (fs.existsSync(PROFILE_FILE)) {
          const stat = fs.statSync(PROFILE_FILE);
          if (stat.mtimeMs !== g.__hddUserProfilesMtime) {
            const disk = readProfilesFromDisk();
            const dirty = g.__hddDirtyUserProfiles || {};
            g.__hddUserProfiles = { ...disk.data, ...dirty };
            g.__hddUserProfilesMtime = disk.mtimeMs;
          }
        }
      } catch {}
    }
    return g.__hddUserProfiles;
  }
  const disk = readProfilesFromDisk();
  g.__hddUserProfiles = { ...disk.data, ...(g.__hddDirtyUserProfiles || {}) };
  g.__hddUserProfilesMtime = disk.mtimeMs;
  g.__hddUserProfilesStatAt = now;
  return g.__hddUserProfiles;
}

let profileWriteTimer: ReturnType<typeof setTimeout> | null = null;

function saveProfiles(data: Record<string, UserProfileExtra>) {
  // Update shared globalThis cache immediately across all Next.js route bundles
  g.__hddUserProfiles = data;
  if (profileWriteTimer) return;
  profileWriteTimer = setTimeout(() => {
    profileWriteTimer = null;
    const dirty = g.__hddDirtyUserProfiles || {};
    g.__hddDirtyUserProfiles = {};
    const disk = readProfilesFromDisk();
    const merged = { ...disk.data, ...dirty };
    g.__hddUserProfiles = merged;
    writeJsonFileAtomic(PROFILE_FILE, merged)
      .then(() => {
        try {
          if (fs.existsSync(PROFILE_FILE)) {
            g.__hddUserProfilesMtime = fs.statSync(PROFILE_FILE).mtimeMs;
          }
        } catch {}
      })
      .catch(() => {});
  }, 300);
  if (typeof profileWriteTimer === 'object' && profileWriteTimer && 'unref' in profileWriteTimer && typeof profileWriteTimer.unref === 'function') {
    profileWriteTimer.unref();
  }
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
  mssv?: string,
  bypassMissingCache = false
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

  // Check negative cache (short 5s TTL; bypassed on write-critical paths so cross-worker saves take effect immediately)
  const missingCache = g.__hddMissingProfileKeys || (g.__hddMissingProfileKeys = new Map());
  const lookupKey = cleanEmail || cleanMssv.toLowerCase();
  const missingUntil = !bypassMissingCache && lookupKey ? missingCache.get(lookupKey) : undefined;
  if (missingUntil && missingUntil > Date.now()) {
    return fromLocal;
  }

  // In-flight deduplication
  const inflightMap = g.__hddInflightProfileLookup || (g.__hddInflightProfileLookup = new Map());
  if (lookupKey && inflightMap.has(lookupKey)) {
    return inflightMap.get(lookupKey)!;
  }

  const lookupTask = (async (): Promise<UserProfileExtra | null> => {
    try {
      // 2. Fallback: check Supabase system_settings in a single query (.in) instead of sequential loop
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

          if (candidateKeys.length === 1) {
            const { data } = await supabase
              .from('system_settings')
              .select('value')
              .eq('key', candidateKeys[0])
              .maybeSingle();

            if (data?.value) {
              const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
              if (parsed?.phone && String(parsed.phone).trim().length >= 8) {
                if (cleanEmail) saveUserProfileExtra(cleanEmail, parsed);
                if (cleanMssv) saveUserProfileExtra(cleanMssv, parsed);
                return parsed;
              }
            }
          } else if (candidateKeys.length > 1) {
            const settingsQuery = supabase.from('system_settings').select('key, value');
            const rows = typeof settingsQuery.in === 'function'
              ? (await settingsQuery.in('key', candidateKeys)).data
              : null;

            if (Array.isArray(rows)) {
              for (const row of rows) {
                if (!row?.value) continue;
                const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                if (parsed?.phone && String(parsed.phone).trim().length >= 8) {
                  if (cleanEmail) saveUserProfileExtra(cleanEmail, parsed);
                  if (cleanMssv) saveUserProfileExtra(cleanMssv, parsed);
                  return parsed;
                }
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

      if (lookupKey) {
        if (missingCache.size > 3000) missingCache.clear();
        missingCache.set(lookupKey, Date.now() + NEGATIVE_PROFILE_CACHE_TTL_MS);
      }
      return fromLocal;
    } finally {
      if (lookupKey) inflightMap.delete(lookupKey);
    }
  })();

  if (lookupKey) {
    inflightMap.set(lookupKey, lookupTask);
  }
  return lookupTask;
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
    ...(extra.phone !== undefined
      ? String(extra.phone).trim() !== ''
        ? { phone: String(extra.phone).trim() }
        : { phone: '' }
      : current.phone
      ? { phone: current.phone }
      : {}),
    updated_at: new Date().toISOString(),
  };
  all[lower] = updated;
  all[upper] = updated;
  if (!g.__hddDirtyUserProfiles) g.__hddDirtyUserProfiles = {};
  g.__hddDirtyUserProfiles[lower] = updated;
  g.__hddDirtyUserProfiles[upper] = updated;
  g.__hddAllProfilesMapCache = undefined;
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
  g.__hddAllProfilesMapCache = undefined;

  const merged =
    (cleanEmail ? getUserProfileExtra(cleanEmail) : null) ||
    (cleanMssv ? getUserProfileExtra(cleanMssv) : null) ||
    extra;

  if (supabase && (merged?.phone !== undefined || merged?.gender)) {
    const payload = {
      gender: merged.gender || 'Nam',
      phone: merged.phone !== undefined ? String(merged.phone).trim() : '',
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

const ALL_PROFILES_CACHE_TTL_MS = 30_000;

function mergeProfileEntry(
  map: Map<string, UserProfileExtra>,
  key: string,
  incoming: UserProfileExtra
) {
  if (!key) return;
  const prev = map.get(key) || {};
  const nextPhone =
    incoming.phone !== undefined ? String(incoming.phone).trim() : prev.phone;
  const nextGender = incoming.gender ? String(incoming.gender).trim() : prev.gender;
  map.set(key, {
    ...prev,
    ...(nextPhone !== undefined ? { phone: nextPhone } : {}),
    ...(nextGender ? { gender: nextGender } : {}),
    ...(incoming.updated_at ? { updated_at: incoming.updated_at } : {}),
  });
}

/**
 * Tải toàn bộ hồ sơ phụ (SĐT, giới tính) từ reg_extras, file user-profiles.json và
 * Supabase system_settings (`user_profile_%`), cache 30 giây để phục vụ bảng Quản lý SV & tìm ngược theo SĐT.
 */
export async function getAllUserProfilesMap(supabase: any): Promise<Map<string, UserProfileExtra>> {
  const now = Date.now();
  if (g.__hddAllProfilesMapCache && g.__hddAllProfilesMapCache.expiresAt > now) {
    return g.__hddAllProfilesMapCache.map;
  }
  if (g.__hddInflightAllProfiles) {
    return g.__hddInflightAllProfiles;
  }

  const task = (async (): Promise<Map<string, UserProfileExtra>> => {
    try {
      const map = new Map<string, UserProfileExtra>();

      // 1. Nguồn registration-extras (SĐT SV từng điền khi ĐK sự kiện / CTV)
      try {
        const regMap = getAllRegExtrasProfilesMap();
        for (const [mssv, entry] of regMap.entries()) {
          mergeProfileEntry(map, mssv, entry);
          mergeProfileEntry(map, `${mssv.toLowerCase()}@student.ptithcm.edu.vn`, entry);
        }
      } catch {}

      // 2. Nguồn RAM + data/user-profiles.json
      try {
        const localAll = loadProfiles();
        for (const [rawKey, entry] of Object.entries(localAll)) {
          if (!entry || typeof entry !== 'object') continue;
          const k = rawKey.trim();
          if (!k) continue;
          if (k.includes('@')) {
            const lower = k.toLowerCase();
            mergeProfileEntry(map, lower, entry);
            const prefix = lower.split('@')[0]?.toUpperCase();
            if (prefix) mergeProfileEntry(map, prefix, entry);
          } else {
            const upper = k.toUpperCase();
            mergeProfileEntry(map, upper, entry);
            mergeProfileEntry(map, `${upper.toLowerCase()}@student.ptithcm.edu.vn`, entry);
          }
        }
      } catch {}

      // 3. Nguồn Supabase system_settings (`user_profile_%`) — quyền tác giả cao nhất
      if (supabase && typeof supabase.from === 'function') {
        try {
          const settingsTable = supabase.from('system_settings');
          const selectRes =
            settingsTable && typeof settingsTable.select === 'function'
              ? settingsTable.select('key, value')
              : null;

          if (selectRes && typeof selectRes.like === 'function') {
            const pageSize = 1000;
            let page = 0;
            while (page < 20) {
              const start = page * pageSize;
              const end = start + pageSize - 1;
              let q = supabase
                .from('system_settings')
                .select('key, value')
                .like('key', 'user_profile_%');
              if (typeof q.order === 'function') q = q.order('key', { ascending: true });
              if (typeof q.range === 'function') q = q.range(start, end);
              const { data: rows, error } = await q;
              if (error || !Array.isArray(rows) || rows.length === 0) break;

              for (const row of rows) {
                const rawKey = String(row?.key || '');
                if (!rawKey.startsWith('user_profile_') || !row?.value) continue;
                let parsed: any = row.value;
                if (typeof parsed === 'string') {
                  try {
                    parsed = JSON.parse(parsed);
                  } catch {
                    continue;
                  }
                }
                if (!parsed || typeof parsed !== 'object') continue;
                const cleanKey = rawKey.slice('user_profile_'.length).trim();
                if (!cleanKey) continue;
                const entry: UserProfileExtra = {
                  ...(parsed.phone !== undefined ? { phone: String(parsed.phone).trim() } : {}),
                  ...(parsed.gender ? { gender: String(parsed.gender).trim() } : {}),
                  ...(parsed.updated_at ? { updated_at: String(parsed.updated_at) } : {}),
                };
                if (cleanKey.includes('@')) {
                  const lower = cleanKey.toLowerCase();
                  mergeProfileEntry(map, lower, entry);
                  const prefix = lower.split('@')[0]?.toUpperCase();
                  if (prefix) mergeProfileEntry(map, prefix, entry);
                } else {
                  const upper = cleanKey.toUpperCase();
                  mergeProfileEntry(map, upper, entry);
                  mergeProfileEntry(map, `${upper.toLowerCase()}@student.ptithcm.edu.vn`, entry);
                }
              }

              if (rows.length < pageSize) break;
              page++;
            }
          }
        } catch {}
      }

      g.__hddAllProfilesMapCache = {
        map,
        expiresAt: Date.now() + ALL_PROFILES_CACHE_TTL_MS,
      };
      return map;
    } finally {
      g.__hddInflightAllProfiles = undefined;
    }
  })();

  g.__hddInflightAllProfiles = task;
  return task;
}
