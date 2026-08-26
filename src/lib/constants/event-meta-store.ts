import fs from 'fs';
import path from 'path';

export interface DepartmentConfig {
  id: string;
  name: string;
  target_count: number;
  gender_requirement?: 'all' | 'male_only' | 'female_only';
  note?: string;
  created_at?: string;
}

export interface EventSession {
  id: string;
  name: string;
  session_date?: string;
  start_time?: string;
  end_time?: string;
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
    fs.writeFileSync(META_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {}
}

let inMemoryMeta: Record<string, EventMeta> = loadFromFile();

export async function getEventMeta(supabase: any, eventId: string): Promise<EventMeta> {
  const metaKey = `event_meta_${eventId}`;
  const fromFile = loadFromFile();
  const fileMeta = fromFile[eventId] || inMemoryMeta[eventId] || null;

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

  inMemoryMeta[eventId] = merged;
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
    fs.writeFileSync(REG_FILE, JSON.stringify(data, null, 2), 'utf-8');
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
          return parsed;
        }
      }
    } catch {}
  }

  if (inMemoryRegExtras[eventId]) return inMemoryRegExtras[eventId];
  const fromFile = loadRegFromFile();
  if (fromFile[eventId]) {
    inMemoryRegExtras[eventId] = fromFile[eventId];
    return fromFile[eventId];
  }
  return {};
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
// ═══════════════════════════════════════════════════════════════════════════

const inMemorySessionCheckins: Record<string, SessionCheckIn[]> = {};

function getSessionCheckinsFile(eventId: string): string {
  return path.join(META_DIR, `session-checkins-${eventId}.json`);
}

function loadSessionCheckinsFromFile(eventId: string): SessionCheckIn[] {
  try {
    const fPath = getSessionCheckinsFile(eventId);
    if (fs.existsSync(fPath)) {
      const raw = fs.readFileSync(fPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch {}
  return [];
}

function saveSessionCheckinsToFile(eventId: string, checkins: SessionCheckIn[]) {
  try {
    if (!fs.existsSync(META_DIR)) {
      fs.mkdirSync(META_DIR, { recursive: true });
    }
    fs.writeFileSync(getSessionCheckinsFile(eventId), JSON.stringify(checkins, null, 2), 'utf-8');
  } catch {}
}

export async function getSessionCheckIns(supabase: any, eventId: string): Promise<SessionCheckIn[]> {
  const sessionKey = `event_session_checkins_${eventId}`;

  if (supabase) {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', sessionKey)
        .maybeSingle();

      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (Array.isArray(parsed)) {
          inMemorySessionCheckins[eventId] = parsed;
          return parsed;
        }
      }
    } catch {}
  }

  if (inMemorySessionCheckins[eventId]) {
    return inMemorySessionCheckins[eventId];
  }

  const fromFile = loadSessionCheckinsFromFile(eventId);
  inMemorySessionCheckins[eventId] = fromFile;
  return fromFile;
}

export async function saveSessionCheckIn(supabase: any, checkIn: SessionCheckIn): Promise<SessionCheckIn[]> {
  const eventId = checkIn.event_id;
  const current = await getSessionCheckIns(supabase, eventId);

  // Check if already checked in for THIS session
  const exists = current.some(
    (c) => c.session_id === checkIn.session_id && c.mssv.toUpperCase() === checkIn.mssv.toUpperCase()
  );

  if (exists) {
    return current;
  }

  const updated = [checkIn, ...current];
  inMemorySessionCheckins[eventId] = updated;
  saveSessionCheckinsToFile(eventId, updated);

  const sessionKey = `event_session_checkins_${eventId}`;
  if (supabase) {
    try {
      await supabase.from('system_settings').upsert({
        key: sessionKey,
        value: JSON.stringify(updated),
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  return updated;
}
