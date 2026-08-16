import fs from 'fs';
import path from 'path';
import type { UserTier } from '@/lib/types';

export const ROOT_SUPER_ADMIN = 'n22dccn158@student.ptithcm.edu.vn';

export interface OfficerRoleItem {
  id: string;
  email: string;
  role_tier: UserTier;
  unit_code?: string;
  unit_name?: string;
  full_name?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
}

const DEFAULT_OFFICERS: OfficerRoleItem[] = [
  {
    id: 'root-1',
    email: ROOT_SUPER_ADMIN,
    role_tier: 'super_admin',
    unit_code: 'BCH_DOAN',
    unit_name: 'Ban Quản Trị Toàn Trường',
    full_name: 'Nguyễn Thanh Phong',
    notes: 'Super Admin Gốc (Root Admin)',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'default-youth-union',
    email: 'doanthanhnien@ptithcm.edu.vn',
    role_tier: 'youth_union',
    unit_code: 'BCH_DOAN',
    unit_name: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
    full_name: 'Đoàn Thanh Niên Học Viện',
    notes: 'Tài khoản chức năng Đoàn Học Viện',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'default-ctsv',
    email: 'ctsv@ptithcm.edu.vn',
    role_tier: 'ctsv',
    unit_code: 'PHONG_CTSV',
    unit_name: 'Phòng Công Tác Sinh Viên (CTSV)',
    full_name: 'Phòng CTSV',
    notes: 'Tài khoản chức năng Phòng CTSV',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'default-csvc',
    email: 'quantri@ptithcm.edu.vn',
    role_tier: 'facility',
    unit_code: 'PHONG_CSVC',
    unit_name: 'Phòng Quản Trị CSVC & Tổ Chức',
    full_name: 'Phòng Quản Trị CSVC',
    notes: 'Tài khoản chức năng Phòng CSVC',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
];

// In-memory runtime cache
let inMemoryOfficers: OfficerRoleItem[] | null = null;

function getStoreFilePath(): string {
  try {
    return path.join(process.cwd(), 'data', 'officer-roles.json');
  } catch {
    return '/tmp/officer-roles.json';
  }
}

function loadFromFile(): OfficerRoleItem[] | null {
  try {
    const filePath = getStoreFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function saveToFile(list: OfficerRoleItem[]) {
  try {
    const filePath = getStoreFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
  } catch {}
}

export async function getStoredOfficerRoles(supabase?: any): Promise<OfficerRoleItem[]> {
  // 1. Try Supabase officer_roles table first if available
  if (supabase) {
    try {
      const { data: tableData, error } = await supabase
        .from('officer_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && tableData && Array.isArray(tableData)) {
        // Table exists and query was successful!
        const mapped = tableData.map((d: any) => ({
          id: String(d.id),
          email: d.email.toLowerCase(),
          role_tier: d.role_tier as UserTier,
          unit_code: d.unit_code || 'BCH_DOAN',
          unit_name: d.unit_name || 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
          full_name: d.full_name || '',
          notes: d.notes || '',
          created_by: d.created_by || 'Super Admin',
          created_at: d.created_at || new Date().toISOString(),
        }));

        // Always ensure Root Super Admin is present
        if (!mapped.some((m) => m.email === ROOT_SUPER_ADMIN)) {
          mapped.unshift(DEFAULT_OFFICERS[0]);
        }

        // Cache in memory and file
        inMemoryOfficers = mapped;
        saveToFile(mapped);
        return mapped;
      }
    } catch {}
  }

  // 2. Try in-memory cache
  if (inMemoryOfficers && inMemoryOfficers.length > 0) {
    return inMemoryOfficers;
  }

  // 3. Try reading from server local file storage
  const fromFile = loadFromFile();
  if (fromFile && Array.isArray(fromFile)) {
    inMemoryOfficers = fromFile;
    return fromFile;
  }

  // 4. Initial seed
  const initial = [...DEFAULT_OFFICERS];
  inMemoryOfficers = initial;
  saveToFile(initial);
  return initial;
}

export async function saveOfficerRole(officer: OfficerRoleItem, supabase?: any): Promise<void> {
  const current = await getStoredOfficerRoles(supabase);
  const updated = [
    officer,
    ...current.filter((o) => !(o.email === officer.email && o.role_tier === officer.role_tier)),
  ];

  inMemoryOfficers = updated;
  saveToFile(updated);

  if (supabase) {
    try {
      await supabase.from('officer_roles').upsert({
        email: officer.email,
        role_tier: officer.role_tier,
        unit_code: officer.unit_code,
        unit_name: officer.unit_name,
        full_name: officer.full_name,
        notes: officer.notes,
        created_by: officer.created_by,
      });
    } catch {}
  }
}

export async function removeOfficerRole(email: string, roleTier?: string, id?: string, supabase?: any): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const current = await getStoredOfficerRoles(supabase);

  const updated = current.filter((o) => {
    if (id && o.id === id) return false;
    if (o.email.toLowerCase() === normalizedEmail) {
      if (roleTier && o.role_tier !== roleTier) return true;
      return false; // Matched email + roleTier => Remove!
    }
    return true;
  });

  // Ensure root admin cannot be deleted
  if (!updated.some((o) => o.email.toLowerCase() === ROOT_SUPER_ADMIN)) {
    updated.unshift(DEFAULT_OFFICERS[0]);
  }

  inMemoryOfficers = updated;
  saveToFile(updated);

  if (supabase) {
    try {
      if (id && !id.startsWith('off-') && !id.startsWith('root-') && !id.startsWith('default-')) {
        await supabase.from('officer_roles').delete().eq('id', id);
      } else {
        let q = supabase.from('officer_roles').delete().ilike('email', normalizedEmail);
        if (roleTier) q = q.eq('role_tier', roleTier);
        await q;
      }
    } catch {}
  }
}
