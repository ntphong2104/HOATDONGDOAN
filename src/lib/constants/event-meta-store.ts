import fs from 'fs';
import path from 'path';
import { runSerializedByKey } from '@/lib/utils/concurrency-queue';
import { writeJsonFileAtomic, parseJsonWithRepair } from '@/lib/utils/atomic-file';
import { fetchAllRows } from '@/lib/supabase/pagination';

export interface DepartmentConfig {
  id: string;
  name: string;
  target_count: number;
  gender_requirement?: 'all' | 'male_only' | 'female_only';
  gender_req?: string;
  description?: string;
  note?: string;
  created_at?: string;
}

export interface EventSession {
  id: string;
  name: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
  room_id?: string | null;
  room_name?: string | null;
  session_type?: 'participant' | 'internal';
  is_main?: boolean;
  allowed_cohorts?: string[] | null;
  created_at?: string;
}

export interface SessionCheckIn {
  event_id: string;
  session_id: string;
  session_name: string;
  mssv: string;
  participate_role: 'participant' | 'volunteer' | 'organizer';
  checked_at: string;
  checked_by: string;
}

export interface EventMeta {
  departments?: DepartmentConfig[];
  is_recruitment_open?: boolean;
  require_registration?: boolean;
  target_scope?: string;
  /** Giới hạn Liên Chi Đoàn được đăng ký; [] / không có = Toàn Học viện */
  allowed_lcds?: string[];
  sessions?: EventSession[];
  max_participants?: number;
  max_volunteers?: number;
  /** Sự kiện hỗ trợ tạo nhanh bởi VPĐ/Đoàn HVCS (không mượn phòng, không qua CTSV) */
  is_support_event?: boolean;
  organization_unit?: string;
  description?: string;
  /** Chế độ sinh viên tự hủy tham gia: 'before_2h' (trước 2 tiếng) | 'disabled' (không thể hủy) */
  cancellation_policy?: 'before_2h' | 'disabled';
}

const META_DIR = path.join(process.cwd(), 'data');
const META_FILE = path.join(META_DIR, 'event-metadata.json');

function loadFromFile(): Record<string, EventMeta> {
  try {
    if (fs.existsSync(META_FILE)) {
      const raw = fs.readFileSync(META_FILE, 'utf-8');
      const res = parseJsonWithRepair<Record<string, EventMeta>>(raw);
      if (res?.value) return res.value;
    }
  } catch {}
  return {};
}

export function mergeEventMeta(
  dbMeta: EventMeta | null | undefined,
  fileMeta: EventMeta | null | undefined
): EventMeta {
  // Authoritative DB array (including empty `[]` after deleting last session/department) must NEVER be resurrected by stale local cache
  const departments = Array.isArray(dbMeta?.departments)
    ? dbMeta.departments
    : fileMeta?.departments || [];
  const sessions = Array.isArray(dbMeta?.sessions)
    ? dbMeta.sessions
    : fileMeta?.sessions || [];

  return {
    departments,
    sessions,
    is_recruitment_open: dbMeta?.is_recruitment_open ?? fileMeta?.is_recruitment_open ?? true,
    require_registration: dbMeta?.require_registration ?? fileMeta?.require_registration ?? true,
    target_scope: dbMeta?.target_scope ?? fileMeta?.target_scope ?? 'all',
    allowed_lcds: Array.isArray(dbMeta?.allowed_lcds)
      ? dbMeta.allowed_lcds
      : Array.isArray(fileMeta?.allowed_lcds)
      ? fileMeta.allowed_lcds
      : [],
    max_participants: dbMeta?.max_participants ?? fileMeta?.max_participants ?? 0,
    max_volunteers: dbMeta?.max_volunteers ?? fileMeta?.max_volunteers ?? 0,
    ...(dbMeta?.is_support_event !== undefined || fileMeta?.is_support_event !== undefined
      ? { is_support_event: dbMeta?.is_support_event ?? fileMeta?.is_support_event }
      : {}),
    ...(dbMeta?.organization_unit !== undefined || fileMeta?.organization_unit !== undefined
      ? { organization_unit: dbMeta?.organization_unit ?? fileMeta?.organization_unit }
      : {}),
    ...(dbMeta?.description !== undefined || fileMeta?.description !== undefined
      ? { description: dbMeta?.description ?? fileMeta?.description }
      : {}),
    ...(dbMeta?.cancellation_policy !== undefined || fileMeta?.cancellation_policy !== undefined
      ? { cancellation_policy: dbMeta?.cancellation_policy ?? fileMeta?.cancellation_policy }
      : {}),
  };
}

let metaWriteTimer: ReturnType<typeof setTimeout> | null = null;

async function flushMetaToDisk(): Promise<void> {
  if (metaWriteTimer) {
    clearTimeout(metaWriteTimer);
    metaWriteTimer = null;
  }
  await runSerializedByKey('disk_flush_event_meta', async () => {
    const updates = dirtyMetaUpdates;
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    g.__hddDirtyMetaUpdates = {};
    dirtyMetaUpdates = g.__hddDirtyMetaUpdates;

    const diskData = loadFromFile();
    const mergedDisk = { ...diskData, ...updates };
    await writeJsonFileAtomic(META_FILE, mergedDisk);
  }).catch(() => {});
}

function scheduleSaveMetaToFile(eventId: string, updated: EventMeta) {
  dirtyMetaUpdates[eventId] = updated;
  if (metaWriteTimer) return;
  metaWriteTimer = setTimeout(() => {
    metaWriteTimer = null;
    void flushMetaToDisk();
  }, 300);
  if (typeof metaWriteTimer === 'object' && metaWriteTimer && 'unref' in metaWriteTimer && typeof metaWriteTimer.unref === 'function') {
    metaWriteTimer.unref();
  }
}

// ── Cache eviction helper: prevent unbounded memory growth ──
const MAX_CACHE_ENTRIES = 50; // max events to keep in memory

function evictOldest<T>(cache: Record<string, T>, maxEntries: number): void {
  const keys = Object.keys(cache);
  if (keys.length > maxEntries) {
    // Remove oldest entries (first inserted = first keys)
    const toRemove = keys.slice(0, keys.length - maxEntries);
    for (const key of toRemove) {
      delete cache[key];
    }
  }
}

const g = globalThis as unknown as {
  __hddInMemoryMeta?: Record<string, EventMeta>;
  __hddInMemoryMetaExpiry?: Record<string, number>;
  __hddDirtyMetaUpdates?: Record<string, EventMeta>;
  __hddInflightMeta?: Map<string, Promise<EventMeta>>;
  __hddEventResponseCache?: Map<string, { data: any; ts: number }>;
  __hddInMemoryRegExtras?: Record<string, Record<string, RegistrationExtra>>;
  __hddInMemoryRegExtrasExpiry?: Record<string, number>;
  __hddDirtyRegUpdates?: Record<string, Record<string, RegistrationExtra>>;
  __hddInflightRegExtras?: Map<string, Promise<Record<string, RegistrationExtra>>>;
};

let dirtyMetaUpdates: Record<string, EventMeta> = g.__hddDirtyMetaUpdates || (g.__hddDirtyMetaUpdates = {});
let dirtyRegUpdates: Record<string, Record<string, RegistrationExtra>> =
  g.__hddDirtyRegUpdates || (g.__hddDirtyRegUpdates = {});

const inMemoryMeta: Record<string, EventMeta> = g.__hddInMemoryMeta || (g.__hddInMemoryMeta = loadFromFile());
const inMemoryMetaExpiry: Record<string, number> = g.__hddInMemoryMetaExpiry || (g.__hddInMemoryMetaExpiry = {});
const inflightMeta: Map<string, Promise<EventMeta>> = g.__hddInflightMeta || (g.__hddInflightMeta = new Map());
const eventResponseCache: Map<string, { data: any; ts: number }> =
  g.__hddEventResponseCache || (g.__hddEventResponseCache = new Map());

const META_CACHE_TTL_MS = 5000; // 5s TTL, invalidated immediately on any write

export function getCachedEventResponse(eventId: string, ttlMs = 5000): any | null {
  const cached = eventResponseCache.get(eventId);
  if (cached && Date.now() - cached.ts < ttlMs) {
    return cached.data;
  }
  return null;
}

export function setCachedEventResponse(eventId: string, data: any): void {
  eventResponseCache.set(eventId, { data, ts: Date.now() });
  if (eventResponseCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of eventResponseCache) {
      if (now - v.ts > 60000) eventResponseCache.delete(k);
    }
  }
}

export function invalidateEventCache(eventId: string): void {
  eventResponseCache.delete(eventId);
  delete inMemoryMetaExpiry[eventId];
}

export async function getEventMeta(supabase: any, eventId: string): Promise<EventMeta> {
  const now = Date.now();
  if (inMemoryMeta[eventId] && (inMemoryMetaExpiry[eventId] || 0) > now) {
    return inMemoryMeta[eventId];
  }

  const existingInflight = inflightMeta.get(eventId);
  if (existingInflight) {
    return existingInflight;
  }

  const fetchTask = (async (): Promise<EventMeta> => {
    try {
      const metaKey = `event_meta_${eventId}`;
      let fileMeta = dirtyMetaUpdates[eventId] || inMemoryMeta[eventId] || null;

      // 1. Try Supabase system_settings (authoritative source of truth)
      let dbMeta: EventMeta | null = null;
      if (supabase) {
        try {
          const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', metaKey)
            .maybeSingle();

          if (data?.value) {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            if (parsed && typeof parsed === 'object') {
              dbMeta = parsed;
            }
          }
        } catch {}
      }

      if (!fileMeta && !dbMeta) {
        const disk = loadFromFile();
        if (disk[eventId]) {
          fileMeta = disk[eventId];
        }
      }

      const merged = mergeEventMeta(dbMeta, fileMeta);

      inMemoryMeta[eventId] = merged;
      inMemoryMetaExpiry[eventId] = Date.now() + META_CACHE_TTL_MS;
      evictOldest(inMemoryMeta, MAX_CACHE_ENTRIES);

      return merged;
    } finally {
      inflightMeta.delete(eventId);
    }
  })();

  inflightMeta.set(eventId, fetchTask);
  return fetchTask;
}

export interface RegistrationExtra {
  event_id: string;
  mssv: string;
  department_id?: string | null;
  department_name?: string | null;
  session_id?: string | null;
  session_name?: string | null;
  gender?: string;
  phone?: string;
  note?: string;
  review_status?: 'pending' | 'accepted' | 'rejected';
  imported_by?: string;
  imported_at?: string;
}

const REG_FILE = path.join(META_DIR, 'registration-extras.json');

function loadRegFromFile(): Record<string, Record<string, RegistrationExtra>> {
  try {
    if (fs.existsSync(REG_FILE)) {
      const raw = fs.readFileSync(REG_FILE, 'utf-8');
      const res = parseJsonWithRepair<Record<string, Record<string, RegistrationExtra>>>(raw);
      if (res?.value) return res.value;
    }
  } catch {}
  return {};
}

let regWriteTimer: ReturnType<typeof setTimeout> | null = null;

async function flushRegToDisk(): Promise<void> {
  if (regWriteTimer) {
    clearTimeout(regWriteTimer);
    regWriteTimer = null;
  }
  await runSerializedByKey('disk_flush_event_regs', async () => {
    const updates = dirtyRegUpdates;
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    g.__hddDirtyRegUpdates = {};
    dirtyRegUpdates = g.__hddDirtyRegUpdates;

    const diskData = loadRegFromFile();
    const mergedDisk = { ...diskData, ...updates };
    await writeJsonFileAtomic(REG_FILE, mergedDisk);
  }).catch(() => {});
}

export async function flushEventMetaStoresNow(): Promise<void> {
  await Promise.all([flushMetaToDisk(), flushRegToDisk()]);
}

function scheduleSaveRegToFile(eventId: string, eventRegs: Record<string, RegistrationExtra>) {
  dirtyRegUpdates[eventId] = eventRegs;
  if (regWriteTimer) return;
  regWriteTimer = setTimeout(() => {
    regWriteTimer = null;
    void flushRegToDisk();
  }, 300);
  if (typeof regWriteTimer === 'object' && regWriteTimer && 'unref' in regWriteTimer && typeof regWriteTimer.unref === 'function') {
    regWriteTimer.unref();
  }
}

const inMemoryRegExtras: Record<string, Record<string, RegistrationExtra>> =
  g.__hddInMemoryRegExtras || (g.__hddInMemoryRegExtras = loadRegFromFile());
const inMemoryRegExtrasExpiry: Record<string, number> =
  g.__hddInMemoryRegExtrasExpiry || (g.__hddInMemoryRegExtrasExpiry = {});
const inflightRegExtras: Map<string, Promise<Record<string, RegistrationExtra>>> =
  g.__hddInflightRegExtras || (g.__hddInflightRegExtras = new Map());
const REG_EXTRAS_CACHE_TTL_MS = 5000;

/**
 * Tìm SĐT / giới tính của sinh viên từ lịch sử đăng ký sự kiện (registration-extras.json)
 * để khôi phục nếu hồ sơ cá nhân bị thiếu.
 */
export function findUserProfileFromRegExtras(mssv: string): { phone?: string; gender?: string } | null {
  if (!mssv) return null;
  const key = mssv.trim().toUpperCase();
  for (const eventRegs of Object.values(inMemoryRegExtras)) {
    if (!eventRegs || typeof eventRegs !== 'object') continue;
    const entry = eventRegs[key];
    if (entry?.phone && String(entry.phone).trim().length >= 8) {
      return { phone: String(entry.phone).trim(), gender: entry.gender || 'Nam' };
    }
  }
  return null;
}

/**
 * Xây dựng Map<MSSV, { phone, gender }> từ toàn bộ registration-extras để tra cứu hàng loạt.
 */
export function getAllRegExtrasProfilesMap(): Map<string, { phone?: string; gender?: string }> {
  const result = new Map<string, { phone?: string; gender?: string }>();
  const source =
    Object.keys(inMemoryRegExtras).length > 0 ? inMemoryRegExtras : loadRegFromFile();
  for (const eventRegs of Object.values(source)) {
    if (!eventRegs || typeof eventRegs !== 'object') continue;
    for (const [rawMssv, entry] of Object.entries(eventRegs)) {
      if (!entry || typeof entry !== 'object') continue;
      const phone = entry.phone ? String(entry.phone).trim() : '';
      const gender = entry.gender ? String(entry.gender).trim() : '';
      if (phone.length < 8 && !gender) continue;
      const key = rawMssv.trim().toUpperCase();
      const prev = result.get(key);
      if (!prev || (!prev.phone && phone.length >= 8)) {
        result.set(key, {
          ...(phone.length >= 8 ? { phone } : prev?.phone ? { phone: prev.phone } : {}),
          ...(gender ? { gender } : prev?.gender ? { gender: prev.gender } : {}),
        });
      }
    }
  }
  return result;
}

export async function getRegistrationExtras(
  supabase: any,
  eventId: string
): Promise<Record<string, RegistrationExtra>> {
  const now = Date.now();
  if (inMemoryRegExtras[eventId] && (inMemoryRegExtrasExpiry[eventId] || 0) > now) {
    return inMemoryRegExtras[eventId];
  }

  const existingInflight = inflightRegExtras.get(eventId);
  if (existingInflight) {
    return existingInflight;
  }

  const fetchTask = (async (): Promise<Record<string, RegistrationExtra>> => {
    try {
      const regKey = `event_regs_${eventId}`;
      const localRegs =
        dirtyRegUpdates[eventId] ||
        inMemoryRegExtras[eventId] ||
        (!supabase ? loadRegFromFile()[eventId] : undefined) ||
        {};

      if (supabase) {
        try {
          const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', regKey)
            .maybeSingle();

          if (data?.value) {
            const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            if (parsed && typeof parsed === 'object') {
              // DB is authoritative across PM2 workers; only keep local entries not yet present in DB
              const merged: Record<string, RegistrationExtra> = { ...localRegs, ...parsed };
              for (const [m, dbEntry] of Object.entries(parsed as Record<string, RegistrationExtra>)) {
                const localEntry = localRegs[m];
                if (localEntry && dbEntry) {
                  merged[m] = {
                    ...localEntry,
                    ...dbEntry,
                    phone: dbEntry.phone || localEntry.phone,
                    gender: dbEntry.gender || localEntry.gender,
                    department_id: dbEntry.department_id !== undefined ? dbEntry.department_id : localEntry.department_id,
                    department_name: dbEntry.department_name !== undefined ? dbEntry.department_name : localEntry.department_name,
                    review_status: dbEntry.review_status || localEntry.review_status,
                  };
                }
              }
              inMemoryRegExtras[eventId] = merged;
              inMemoryRegExtrasExpiry[eventId] = Date.now() + REG_EXTRAS_CACHE_TTL_MS;
              evictOldest(inMemoryRegExtras, MAX_CACHE_ENTRIES);
              return merged;
            }
          }
        } catch {}
      }

      inMemoryRegExtrasExpiry[eventId] = Date.now() + REG_EXTRAS_CACHE_TTL_MS;
      if (Object.keys(localRegs).length > 0) {
        inMemoryRegExtras[eventId] = localRegs;
      } else if (!inMemoryRegExtras[eventId]) {
        const diskEntry = loadRegFromFile()[eventId];
        if (diskEntry) {
          inMemoryRegExtras[eventId] = diskEntry;
          return diskEntry;
        }
      }
      return localRegs;
    } finally {
      inflightRegExtras.delete(eventId);
    }
  })();

  inflightRegExtras.set(eventId, fetchTask);
  return fetchTask;
}

export async function saveRegistrationExtra(
  supabase: any,
  eventId: string,
  mssv: string,
  extra: Partial<RegistrationExtra>
): Promise<RegistrationExtra> {
  return runSerializedByKey(`event_regs_${eventId}`, async () => {
    delete inMemoryRegExtrasExpiry[eventId];
    const currentEventRegs = await getRegistrationExtras(supabase, eventId);
    const normalizedMssv = mssv.toUpperCase().trim();
    const existing = currentEventRegs[normalizedMssv] || { event_id: eventId, mssv: normalizedMssv };

    const updated: RegistrationExtra = {
      ...existing,
      ...extra,
      event_id: eventId,
      mssv: normalizedMssv,
    };

    currentEventRegs[normalizedMssv] = updated;
    inMemoryRegExtras[eventId] = currentEventRegs;
    inMemoryRegExtrasExpiry[eventId] = Date.now() + REG_EXTRAS_CACHE_TTL_MS;
    evictOldest(inMemoryRegExtras, MAX_CACHE_ENTRIES);

    // Debounced non-blocking file write (never clobbers evicted on-disk entries)
    scheduleSaveRegToFile(eventId, currentEventRegs);

    const regKey = `event_regs_${eventId}`;
    if (supabase) {
      try {
        await supabase.from('system_settings').upsert({
          key: regKey,
          value: JSON.stringify(currentEventRegs),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    return updated;
  });
}

export async function saveRegistrationExtrasBulk(
  supabase: any,
  eventId: string,
  extrasMap: Record<string, Partial<RegistrationExtra>>
): Promise<Record<string, RegistrationExtra>> {
  return runSerializedByKey(`event_regs_${eventId}`, async () => {
    delete inMemoryRegExtrasExpiry[eventId];
    const currentEventRegs = await getRegistrationExtras(supabase, eventId);

    for (const [mssv, extra] of Object.entries(extrasMap)) {
      const normalizedMssv = mssv.toUpperCase().trim();
      const existing = currentEventRegs[normalizedMssv] || { event_id: eventId, mssv: normalizedMssv };
      currentEventRegs[normalizedMssv] = {
        ...existing,
        ...extra,
        event_id: eventId,
        mssv: normalizedMssv,
      };
    }

    inMemoryRegExtras[eventId] = currentEventRegs;
    inMemoryRegExtrasExpiry[eventId] = Date.now() + REG_EXTRAS_CACHE_TTL_MS;
    evictOldest(inMemoryRegExtras, MAX_CACHE_ENTRIES);

    scheduleSaveRegToFile(eventId, currentEventRegs);

    const regKey = `event_regs_${eventId}`;
    if (supabase) {
      try {
        await supabase.from('system_settings').upsert({
          key: regKey,
          value: JSON.stringify(currentEventRegs),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    return currentEventRegs;
  });
}

export async function saveEventMeta(
  supabase: any,
  eventId: string,
  metaUpdate: Partial<EventMeta>
): Promise<EventMeta> {
  return runSerializedByKey(`event_meta_${eventId}`, async () => {
    delete inMemoryMetaExpiry[eventId];
    const current = await getEventMeta(supabase, eventId);
    const updated: EventMeta = {
      ...current,
      ...metaUpdate,
    };

    inMemoryMeta[eventId] = updated;
    inMemoryMetaExpiry[eventId] = Date.now() + META_CACHE_TTL_MS;
    eventResponseCache.delete(eventId);
    evictOldest(inMemoryMeta, MAX_CACHE_ENTRIES);
    scheduleSaveMetaToFile(eventId, updated);

    const metaKey = `event_meta_${eventId}`;
    if (supabase) {
      try {
        await supabase.from('system_settings').upsert({
          key: metaKey,
          value: JSON.stringify(updated),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    eventResponseCache.delete(eventId);
    return updated;
  });
}

export async function saveRegistrationMeta(
  supabase: any,
  eventId: string,
  metaUpdate: Partial<EventMeta>
): Promise<EventMeta> {
  return saveEventMeta(supabase, eventId, metaUpdate);
}

export interface ProposalMeta {
  sessions?: any[];
  departments?: any[];
  plan_url?: string;
  description?: string;
  target_scope?: string;
  /** Giới hạn khóa SV được đăng ký; [] / không có = tất cả khóa */
  allowed_cohorts?: string[];
  /** Giới hạn Liên Chi Đoàn được đăng ký; [] / không có = Toàn Học viện */
  allowed_lcds?: string[];
}

export async function getProposalMeta(supabase: any, proposalId: string): Promise<ProposalMeta> {
  const metaKey = `proposal_meta_${proposalId}`;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', metaKey)
        .maybeSingle();

      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {}
  }
  return {};
}

export async function saveProposalMeta(
  supabase: any,
  proposalId: string,
  metaUpdate: Partial<ProposalMeta>
): Promise<ProposalMeta> {
  return runSerializedByKey(`proposal_meta_${proposalId}`, async () => {
    const current = await getProposalMeta(supabase, proposalId);
    const updated: ProposalMeta = {
      ...current,
      ...metaUpdate,
    };

    const metaKey = `proposal_meta_${proposalId}`;
    if (supabase) {
      try {
        await supabase.from('system_settings').upsert({
          key: metaKey,
          value: JSON.stringify(updated),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    return updated;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Session-based Check-In Storage (Tracks attendance per individual session)
// Uses dedicated `session_checkins` PostgreSQL table for concurrent safety.
// Fallback to old JSON method if table doesn't exist yet.
// ═══════════════════════════════════════════════════════════════════════════

let useSessionTable = true; // Will be set to false if table doesn't exist

export async function getSessionCheckIns(supabase: any, eventId: string): Promise<SessionCheckIn[]> {
  if (!supabase) return [];

  // Try the dedicated session_checkins table first
  if (useSessionTable) {
    try {
      const { data, error } = await fetchAllRows<SessionCheckIn>(() =>
        supabase
          .from('session_checkins')
          .select('event_id, session_id, session_name, mssv, participate_role, checked_at, checked_by')
          .eq('event_id', eventId)
          .order('checked_at', { ascending: false })
      );

      if (!error && data) {
        return data;
      }

      const errObj = error as { code?: string; message?: string } | null;
      // Only disable session_checkins table if Postgres explicitly reports relation missing (42P01)
      if (errObj?.code === '42P01') {
        useSessionTable = false;
      } else if (errObj) {
        return [];
      }
    } catch {
      return [];
    }
  }

  // Fallback: old JSON method in system_settings
  const sessionKey = `event_session_checkins_${eventId}`;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', sessionKey)
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}

  return [];
}

export async function saveSessionCheckIn(supabase: any, checkIn: SessionCheckIn): Promise<SessionCheckIn[]> {
  if (!supabase) return [];

  const eventId = checkIn.event_id;

  // Try the dedicated session_checkins table first
  if (useSessionTable) {
    try {
      const { error } = await supabase
        .from('session_checkins')
        .insert({
          event_id: checkIn.event_id,
          session_id: checkIn.session_id,
          session_name: checkIn.session_name,
          mssv: checkIn.mssv.toUpperCase(),
          participate_role: checkIn.participate_role,
          checked_at: checkIn.checked_at,
          checked_by: checkIn.checked_by,
        });

      // Duplicate or success — return immediately without scanning all session_checkins rows
      if (!error || error?.code === '23505') {
        return [checkIn];
      }

      // Only fall back to legacy JSON when relation is missing (42P01)
      if (error?.code === '42P01') {
        useSessionTable = false;
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }

  // Fallback: old JSON method (serialized per event to prevent lost-update overwrites)
  return runSerializedByKey(`event_session_checkins_${eventId}`, async () => {
    const current = await getSessionCheckIns(supabase, eventId);
    const exists = current.some(
      (c) => c.session_id === checkIn.session_id && c.mssv.toUpperCase() === checkIn.mssv.toUpperCase()
    );
    if (exists) return current;

    const updated = [checkIn, ...current];
    const sessionKey = `event_session_checkins_${eventId}`;
    try {
      await supabase.from('system_settings').upsert({
        key: sessionKey,
        value: JSON.stringify(updated),
        updated_at: new Date().toISOString(),
      });
    } catch {}

    return updated;
  });
}

/**
 * Atomic check-in via PostgreSQL RPC.
 * Checks capacity + duplicate + inserts in a single DB transaction.
 * Returns { success, is_duplicate?, error?, session_id?, mssv? }
 */
export async function checkinAtomic(
  supabase: any,
  params: {
    event_id: string;
    session_id: string;
    session_name: string;
    mssv: string;
    role?: string;
    checked_by?: string;
    max_participants?: number;
  }
): Promise<{ success: boolean; is_duplicate?: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'No database connection' };

  try {
    const { data, error } = await supabase.rpc('checkin_atomic', {
      p_event_id: params.event_id,
      p_session_id: params.session_id,
      p_session_name: params.session_name,
      p_mssv: params.mssv.toUpperCase(),
      p_role: params.role || 'participant',
      p_checked_by: params.checked_by || 'System',
      p_max_participants: params.max_participants || 0,
    });

    if (error) {
      // RPC doesn't exist yet — caller should fall back to old method
      if (error.message?.includes('function') || error.code === '42883') {
        return { success: false, error: 'RPC_NOT_AVAILABLE' };
      }
      return { success: false, error: error.message };
    }

    return data as { success: boolean; is_duplicate?: boolean; error?: string };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown RPC error' };
  }
}

export async function getEventMetaBatch(
  supabase: any,
  eventIds: string[]
): Promise<Record<string, EventMeta>> {
  const uniqueIds = Array.from(new Set(eventIds.filter(Boolean)));
  const result: Record<string, EventMeta> = {};
  if (uniqueIds.length === 0) return result;

  const now = Date.now();
  const uncachedIds: string[] = [];

  for (const id of uniqueIds) {
    if (inMemoryMeta[id] && (inMemoryMetaExpiry[id] || 0) > now) {
      result[id] = inMemoryMeta[id];
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length > 0) {
    const dbMetaByEventId: Record<string, EventMeta> = {};
    if (supabase) {
      try {
        const metaKeys = uncachedIds.map((id) => `event_meta_${id}`);
        const chunks = [];
        for (let i = 0; i < metaKeys.length; i += 100) {
          chunks.push(metaKeys.slice(i, i + 100));
        }
        const chunkResults = await Promise.all(
          chunks.map((chunk) =>
            supabase.from('system_settings').select('key, value').in('key', chunk)
          )
        );
        for (const { data } of chunkResults) {
          if (Array.isArray(data)) {
            for (const row of data) {
              if (!row?.key || !row?.value) continue;
              const eventId = String(row.key).replace(/^event_meta_/, '');
              try {
                const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
                if (parsed && typeof parsed === 'object') {
                  dbMetaByEventId[eventId] = parsed;
                }
              } catch {}
            }
          }
        }
      } catch {}
    }

    let diskFallback: Record<string, EventMeta> | null = null;
    for (const eventId of uncachedIds) {
      const dbMeta = dbMetaByEventId[eventId] || null;
      let fileMeta = dirtyMetaUpdates[eventId] || inMemoryMeta[eventId] || null;
      if (!fileMeta && !dbMeta) {
        if (!diskFallback) diskFallback = loadFromFile();
        fileMeta = diskFallback[eventId] || null;
      }
      const merged = mergeEventMeta(dbMeta, fileMeta);
      inMemoryMeta[eventId] = merged;
      inMemoryMetaExpiry[eventId] = Date.now() + META_CACHE_TTL_MS;
      result[eventId] = merged;
    }
    evictOldest(inMemoryMeta, MAX_CACHE_ENTRIES);
  }

  return result;
}

export async function enrichHistoryWithSessionCounts<
  T extends {
    event_id?: string;
    participate_role?: string;
  }
>(
  supabase: any,
  mssv: string,
  historyItems: T[]
): Promise<
  Array<
    T & {
      session_count: number;
      total_sessions: number;
      session_ratio: string;
      session_names: string;
      sessions: Array<{ session_id: string; session_name: string; checked_at?: string }>;
    }
  >
> {
  if (!Array.isArray(historyItems) || historyItems.length === 0) return [];

  const cleanMssv = (mssv || '').trim().toUpperCase();
  const eventIds = Array.from(
    new Set(historyItems.map((item) => item.event_id).filter((id): id is string => Boolean(id)))
  );

  const sessionRowsByEvent = new Map<
    string,
    Array<{ session_id: string; session_name: string; checked_at?: string }>
  >();

  let metaMap: Record<string, EventMeta> = {};

  if (eventIds.length > 0) {
    const [fetchedMetaMap, sessionQueryRes] = await Promise.all([
      getEventMetaBatch(supabase, eventIds),
      supabase && cleanMssv
        ? supabase
            .from('session_checkins')
            .select('event_id, session_id, session_name, participate_role, checked_at')
            .ilike('mssv', cleanMssv)
            .in('event_id', eventIds)
            .order('checked_at', { ascending: true })
        : Promise.resolve({ data: null, error: null }),
    ]);

    metaMap = fetchedMetaMap;

    const rows = sessionQueryRes?.data;
    if (Array.isArray(rows)) {
      for (const r of rows) {
        if (!r?.event_id) continue;
        const list = sessionRowsByEvent.get(r.event_id) || [];
        const sid = String(r.session_id || r.session_name || 'main');
        if (!list.some((x) => x.session_id === sid)) {
          list.push({
            session_id: sid,
            session_name: r.session_name || r.session_id || 'Buổi chính',
            checked_at: r.checked_at,
          });
        }
        sessionRowsByEvent.set(r.event_id, list);
      }
    }
  }

  return historyItems.map((item) => {
    const eventId = item.event_id || '';
    const meta = eventId ? metaMap[eventId] : undefined;
    const allSessions = Array.isArray(meta?.sessions) ? meta!.sessions! : [];
    const role = item.participate_role || 'participant';

    // For regular participants, only count non-internal sessions (unless all sessions are internal)
    let applicableSessions = allSessions;
    if (role === 'participant' && allSessions.length > 0) {
      const publicSessions = allSessions.filter((s) => s.session_type !== 'internal');
      if (publicSessions.length > 0) {
        applicableSessions = publicSessions;
      }
    }

    const mySessions = (eventId && sessionRowsByEvent.get(eventId)) || [];
    const sessionCount = mySessions.length > 0 ? mySessions.length : 1;
    const configuredTotal = applicableSessions.length > 0 ? applicableSessions.length : 1;
    const totalSessions = Math.max(configuredTotal, sessionCount);

    const sessionNamesList =
      mySessions.length > 0
        ? mySessions.map((s) => s.session_name || s.session_id)
        : applicableSessions.length === 1 && applicableSessions[0]?.name
        ? [applicableSessions[0].name]
        : ['Buổi chính'];

    return {
      ...item,
      session_count: sessionCount,
      total_sessions: totalSessions,
      session_ratio: `${sessionCount}/${totalSessions} buổi`,
      session_names: sessionNamesList.join(', '),
      sessions: mySessions,
    };
  });
}
