import fs from 'fs';
import path from 'path';

const PROFILE_DIR = path.join(process.cwd(), 'data');
const PROFILE_FILE = path.join(PROFILE_DIR, 'user-profiles.json');

export interface UserProfileExtra {
  gender?: string;
  phone?: string;
  updated_at?: string;
}

function loadProfiles(): Record<string, UserProfileExtra> {
  try {
    if (fs.existsSync(PROFILE_FILE)) {
      return JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveProfiles(data: Record<string, UserProfileExtra>) {
  try {
    if (!fs.existsSync(PROFILE_DIR)) {
      fs.mkdirSync(PROFILE_DIR, { recursive: true });
    }
    fs.writeFileSync(PROFILE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

export function getUserProfileExtra(key: string): UserProfileExtra | null {
  if (!key) return null;
  const all = loadProfiles();
  const lower = key.toLowerCase();
  const upper = key.toUpperCase();
  return all[lower] || all[upper] || null;
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
