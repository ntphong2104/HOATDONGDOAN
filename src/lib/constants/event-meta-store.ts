import fs from 'fs';
import path from 'path';

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
  sessions?: EventSession[];
  max_participants?: number;
  max_volunteers?: number;
}

const META_DIR = path.join(process.cwd(), 'data');
const META_FILE = path.join(META_DIR, 'event-metadata.json');

function loadFromFile(): Record<string, EventMeta> {
  try {
    if (fs.existsSync(META_FILE)) {
      const raw = fs.readFileSync(META_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function saveToFile(data: Record<string, EventMeta>) {
  try {
    if (!fs.existsSync(META_DIR)) {
      fs.mkdirSync(META_DIR, { recursive: true });
    }
    // Non-blocking write to prevent blocking event loop
    fs.promises.writeFile(META_FILE, JSON.stringify(data, null, 2), 'utf-8').catch(() => {});
  } catch {}
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

let inMemoryMeta: Record<string, EventMeta> = loadFromFile();

export async function getEventMeta(supabase: any, eventId: string): Promise<EventMeta> {
  const metaKey = `event_meta_${eventId}`;
  // Use in-memory cache (loaded from file on startup, updated on save)
  const fileMeta = inMemoryMeta[eventId] || null;

  // 1. Try Supabase system_settings
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

  const merged: EventMeta = {
    departments: (fileMeta?.departments && fileMeta.departments.length > 0)
      ? fileMeta.departments
      : dbMeta?.departments || [],
    sessions: (fileMeta?.sessions && fileMeta.sessions.length >= (dbMeta?.sessions?.length || 0))
      ? fileMeta.sessions
      : dbMeta?.sessions || fileMeta?.sessions || [],
    is_recruitment_open: fileMeta?.is_recruitment_open !== undefined
      ? fileMeta.is_recruitment_open
      : dbMeta?.is_recruitment_open !== false,
    require_registration: fileMeta?.require_registration !== undefined
      ? fileMeta.require_registration
      : dbMeta?.require_registration !== false,
    target_scope: fileMeta?.target_scope || dbMeta?.target_scope || 'all',
    max_participants: fileMeta?.max_participants ?? dbMeta?.max_participants ?? 0,
    max_volunteers: fileMeta?.max_volunteers ?? dbMeta?.max_volunteers ?? 0,
  };

  // Ensure event bbfe063b-c18f-4003-afe1-665334d13743 has 230 capacity if not yet set or <= 130
  if (eventId === 'bbfe063b-c18f-4003-afe1-665334d13743' && (!merged.max_participants || merged.max_participants <= 130)) {
    merged.max_participants = 230;
    if (supabase) {
      try {
        supabase.from('system_settings').upsert({
          key: metaKey,
          value: JSON.stringify(merged),
          updated_at: new Date().toISOString(),
        }).then(() => {}).catch(() => {});
      } catch {}
    }
  }

  inMemoryMeta[eventId] = merged;
  evictOldest(inMemoryMeta, MAX_CACHE_ENTRIES);

  if (supabase && fileMeta?.max_participants && dbMeta && dbMeta.max_participants !== fileMeta.max_participants) {
    try {
      supabase.from('system_settings').upsert({
        key: metaKey,
        value: JSON.stringify(merged),
        updated_at: new Date().toISOString(),
      }).then(() => {}).catch(() => {});
    } catch {}
  }

  return merged;
}

export interface RegistrationExtra {
  event_id: string;
  mssv: string;
  department_id?: string | null;
  department_name?: string | null;
  gender?: string;
  phone?: string;
  note?: string;
  review_status?: 'pending' | 'accepted' | 'rejected';
}

const REG_FILE = path.join(META_DIR, 'registration-extras.json');

function loadRegFromFile(): Record<string, Record<string, RegistrationExtra>> {
  try {
    if (fs.existsSync(REG_FILE)) {
      const raw = fs.readFileSync(REG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function saveRegToFile(data: Record<string, Record<string, RegistrationExtra>>) {
  try {
    if (!fs.existsSync(META_DIR)) {
      fs.mkdirSync(META_DIR, { recursive: true });
    }
    fs.promises.writeFile(REG_FILE, JSON.stringify(data, null, 2), 'utf-8').catch(() => {});
  } catch {}
}

let inMemoryRegExtras: Record<string, Record<string, RegistrationExtra>> = loadRegFromFile();

export async function getRegistrationExtras(
  supabase: any,
  eventId: string
): Promise<Record<string, RegistrationExtra>> {
  const regKey = `event_regs_${eventId}`;

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
          inMemoryRegExtras[eventId] = parsed;
          evictOldest(inMemoryRegExtras, MAX_CACHE_ENTRIES);
          return parsed;
        }
      }
    } catch {}
  }

  // Return from in-memory cache (loaded from file on startup)
  return inMemoryRegExtras[eventId] || {};
}

export async function saveRegistrationExtra(
  supabase: any,
  eventId: string,
  mssv: string,
  extra: Partial<RegistrationExtra>
): Promise<RegistrationExtra> {
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
  evictOldest(inMemoryRegExtras, MAX_CACHE_ENTRIES);

  const allFile = loadRegFromFile();
  allFile[eventId] = currentEventRegs;
  saveRegToFile(allFile);

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
}

export async function saveRegistrationExtrasBulk(
  supabase: any,
  eventId: string,
  extrasMap: Record<string, Partial<RegistrationExtra>>
): Promise<Record<string, RegistrationExtra>> {
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
  evictOldest(inMemoryRegExtras, MAX_CACHE_ENTRIES);

  const allFile = loadRegFromFile();
  allFile[eventId] = currentEventRegs;
  saveRegToFile(allFile);

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
}

export async function saveEventMeta(
  supabase: any,
  eventId: string,
  metaUpdate: Partial<EventMeta>
): Promise<EventMeta> {
  const current = await getEventMeta(supabase, eventId);
  const updated: EventMeta = {
    ...current,
    ...metaUpdate,
  };

  inMemoryMeta[eventId] = updated;
  evictOldest(inMemoryMeta, MAX_CACHE_ENTRIES);
  saveToFile({ ...loadFromFile(), [eventId]: updated });

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

  return updated;
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
      const { data, error } = await supabase
        .from('session_checkins')
        .select('event_id, session_id, session_name, mssv, participate_role, checked_at, checked_by')
        .eq('event_id', eventId)
        .order('checked_at', { ascending: false });

      if (!error && data) {
        return data as SessionCheckIn[];
      }

      // If table doesn't exist, fall back to old JSON method
      if (error?.code === '42P01' || error?.message?.includes('relation') || error?.message?.includes('does not exist')) {
        useSessionTable = false;
      }
    } catch {
      useSessionTable = false;
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

      // Duplicate = already checked in, no error needed
      if (error?.code === '23505') {
        return await getSessionCheckIns(supabase, eventId);
      }

      if (!error) {
        return await getSessionCheckIns(supabase, eventId);
      }

      // If table doesn't exist, fall back
      if (error?.code === '42P01' || error?.message?.includes('relation')) {
        useSessionTable = false;
      }
    } catch {
      useSessionTable = false;
    }
  }

  // Fallback: old JSON method
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
