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

export interface EventMeta {
  departments?: DepartmentConfig[];
  is_recruitment_open?: boolean;
  target_scope?: string;
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

  // 1. Try Supabase system_settings
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
          inMemoryMeta[eventId] = parsed;
          return parsed;
        }
      }
    } catch {}
  }

  // 2. Fallback in-memory & file
  if (inMemoryMeta[eventId]) {
    return inMemoryMeta[eventId];
  }

  const fromFile = loadFromFile();
  if (fromFile[eventId]) {
    inMemoryMeta[eventId] = fromFile[eventId];
    return fromFile[eventId];
  }

  return {
    departments: [],
    is_recruitment_open: true,
    target_scope: 'all',
  };
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
