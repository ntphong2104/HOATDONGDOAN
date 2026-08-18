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

export const DEFAULT_OFFICERS: OfficerRoleItem[] = [
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
    id: 'off-dyu',
    email: 'doanthanhnien@ptithcm.edu.vn',
    role_tier: 'youth_union',
    unit_code: 'BCH_DOAN',
    unit_name: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
    full_name: 'Đoàn Thanh Niên Học Viện',
    notes: 'Tài khoản chính thức Đoàn Học Viện',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-ctsv',
    email: 'ctsv@ptithcm.edu.vn',
    role_tier: 'ctsv',
    unit_code: 'PHONG_CTSV',
    unit_name: 'Phòng Công Tác Sinh Viên (CTSV)',
    full_name: 'Phòng Công Tác Sinh Viên',
    notes: 'Tài khoản chính thức Phòng CTSV',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-facility',
    email: 'quantri@ptithcm.edu.vn',
    role_tier: 'facility',
    unit_code: 'PHONG_TCHCQT',
    unit_name: 'Phòng Tổ Chức - Hành Chính - Quản Trị (TC-HC-QT)',
    full_name: 'Phòng TC-HC-QT',
    notes: 'Tài khoản chính thức Quản trị CSVC',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-security',
    email: 'baove@ptithcm.edu.vn',
    role_tier: 'security',
    unit_code: 'TO_BAO_VE',
    unit_name: 'Tổ Bảo Vệ & Quản Lý Chìa Khóa Phòng',
    full_name: 'Tổ Bảo Vệ',
    notes: 'Tài khoản trực giao nhận chìa khóa',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  // 8 LCĐs
  {
    id: 'off-lcd-cntt',
    email: 'lcdcntt@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_CNTT',
    unit_name: 'LCĐ Khoa Công nghệ Thông tin',
    full_name: 'BCH LCĐ Công nghệ Thông tin',
    notes: 'Tài khoản chính thức LCĐ CNTT',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-cndpt',
    email: 'lcdcndpt@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_CNDPT',
    unit_name: 'LCĐ Công nghệ Đa phương tiện',
    full_name: 'BCH LCĐ Công nghệ Đa phương tiện',
    notes: 'Tài khoản chính thức LCĐ Đa phương tiện',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-attt',
    email: 'lcdattt@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_ATTT',
    unit_name: 'LCĐ An toàn Thông tin',
    full_name: 'BCH LCĐ An toàn Thông tin',
    notes: 'Tài khoản chính thức LCĐ ATTT',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-vt',
    email: 'lcdvt@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_VT',
    unit_name: 'LCĐ Khoa Viễn thông',
    full_name: 'BCH LCĐ Khoa Viễn thông',
    notes: 'Tài khoản chính thức LCĐ Viễn thông',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-dt',
    email: 'lcddt@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_DT',
    unit_name: 'LCĐ Khoa Điện tử',
    full_name: 'BCH LCĐ Khoa Điện tử',
    notes: 'Tài khoản chính thức LCĐ Điện tử',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-qtkd',
    email: 'lcdqtkd@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_QTKD',
    unit_name: 'LCĐ Khoa Quản trị Kinh doanh',
    full_name: 'BCH LCĐ Quản trị Kinh doanh',
    notes: 'Tài khoản chính thức LCĐ QTKD',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-mkt',
    email: 'lcdmkt@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_MKT',
    unit_name: 'LCĐ Marketing',
    full_name: 'BCH LCĐ Marketing',
    notes: 'Tài khoản chính thức LCĐ Marketing',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-lcd-kt',
    email: 'lcdketoan@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'LCD_KT',
    unit_name: 'LCĐ Kế toán',
    full_name: 'BCH LCĐ Kế toán',
    notes: 'Tài khoản chính thức LCĐ Kế toán',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  // 16 CLB / Đội / Nhóm
  {
    id: 'off-clb-itmc',
    email: 'clb.itmc@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_ITMC',
    unit_name: 'CLB ITMC',
    full_name: 'Ban Chủ Nhiệm CLB ITMC',
    notes: 'Tài khoản chính thức CLB ITMC',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-attt',
    email: 'clb.antoanthongtin@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_ATTT',
    unit_name: 'CLB An toàn Thông tin',
    full_name: 'Ban Chủ Nhiệm CLB ATTT',
    notes: 'Tài khoản chính thức CLB ATTT',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-ta',
    email: 'clb.tienganh@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_TA',
    unit_name: 'CLB Tiếng Anh',
    full_name: 'Ban Chủ Nhiệm CLB Tiếng Anh',
    notes: 'Tài khoản chính thức CLB Tiếng Anh',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-doi-vn',
    email: 'doivannghe@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'DOI_VN',
    unit_name: 'Đội Văn Nghệ',
    full_name: 'Ban Điều Hành Đội Văn Nghệ',
    notes: 'Tài khoản chính thức Đội Văn Nghệ',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-guitar',
    email: 'clb.guitar@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_GUITAR',
    unit_name: 'CLB Guitar',
    full_name: 'Ban Chủ Nhiệm CLB Guitar',
    notes: 'Tài khoản chính thức CLB Guitar',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-doi-svtn',
    email: 'doisinhvientinhnguyen@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'DOI_SVTN',
    unit_name: 'Đội Sinh Viên Tình Nguyện',
    full_name: 'Ban Điều Hành Đội SV Tình Nguyện',
    notes: 'Tài khoản chính thức Đội SV Tình Nguyện',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-ketnoi',
    email: 'clb.ketnoi@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_KETNOI',
    unit_name: 'CLB Kết Nối',
    full_name: 'Ban Chủ Nhiệm CLB Kết Nối',
    notes: 'Tài khoản chính thức CLB Kết Nối',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-cmc',
    email: 'clb.truyenthongcmc@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_CMC',
    unit_name: 'CLB C.MC',
    full_name: 'Ban Chủ Nhiệm CLB C.MC',
    notes: 'Tài khoản chính thức CLB C.MC',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-37do',
    email: 'clb.37dosinhvien@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_37DO',
    unit_name: 'CLB 37 Độ Sinh viên',
    full_name: 'Ban Chủ Nhiệm CLB 37 Độ',
    notes: 'Tài khoản chính thức CLB 37 Độ',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-bma',
    email: 'clb.bma@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_BMA',
    unit_name: 'CLB BMA',
    full_name: 'Ban Chủ Nhiệm CLB BMA',
    notes: 'Tài khoản chính thức CLB BMA',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-bongchuyen',
    email: 'clb.bongchuyen@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_BONGCHUYEN',
    unit_name: 'CLB Bóng Chuyền',
    full_name: 'Ban Chủ Nhiệm CLB Bóng Chuyền',
    notes: 'Tài khoản chính thức CLB Bóng Chuyền',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-bongda',
    email: 'clbbongda@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_BONGDA',
    unit_name: 'CLB Bóng Đá',
    full_name: 'Ban Chủ Nhiệm CLB Bóng Đá',
    notes: 'Tài khoản chính thức CLB Bóng Đá',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-bongro',
    email: 'clb.bongro@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_BONGRO',
    unit_name: 'CLB Bóng Rổ',
    full_name: 'Ban Chủ Nhiệm CLB Bóng Rổ',
    notes: 'Tài khoản chính thức CLB Bóng Rổ',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-vovinam',
    email: 'clb.vovinam@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_VOVINAM',
    unit_name: 'CLB VOVINAM',
    full_name: 'Ban Chủ Nhiệm CLB VOVINAM',
    notes: 'Tài khoản chính thức CLB VOVINAM',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-covua',
    email: 'clb.covua@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_CO',
    unit_name: 'CLB Cờ',
    full_name: 'Ban Chủ Nhiệm CLB Cờ',
    notes: 'Tài khoản chính thức CLB Cờ',
    created_by: 'System',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'off-clb-caulong',
    email: 'clb.caulong@student.ptithcm.edu.vn',
    role_tier: 'event_admin',
    unit_code: 'CLB_CAULONG',
    unit_name: 'CLB Cầu Lông',
    full_name: 'Ban Chủ Nhiệm CLB Cầu Lông',
    notes: 'Tài khoản chính thức CLB Cầu Lông',
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
  if (process.env.NODE_ENV === 'test') return null;
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
  if (process.env.NODE_ENV === 'test') return;
  try {
    const filePath = getStoreFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf8');
  } catch {}
}

const OFFICER_SETTINGS_KEY = 'officer_roles_registry';

export async function getStoredOfficerRoles(supabase?: any): Promise<OfficerRoleItem[]> {
  // 1. Try Supabase officer_roles table first if available
  if (supabase) {
    try {
      const { data: tableData, error } = await supabase
        .from('officer_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && tableData && Array.isArray(tableData) && tableData.length > 0) {
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
        if (!mapped.some((m) => m.email.toLowerCase() === ROOT_SUPER_ADMIN.toLowerCase())) {
          mapped.unshift(DEFAULT_OFFICERS[0]);
        }

        // Cache in memory and file
        inMemoryOfficers = mapped;
        saveToFile(mapped);
        return mapped;
      }
    } catch {}

    // 2. Try Supabase system_settings table (key = 'officer_roles_registry')
    try {
      const { data: settingsData } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', OFFICER_SETTINGS_KEY)
        .maybeSingle();

      if (settingsData?.value) {
        let parsed = settingsData.value;
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {}
        }
        if (Array.isArray(parsed) && parsed.length > 0) {
          const mapped = parsed as OfficerRoleItem[];
          if (!mapped.some((m) => m.email.toLowerCase() === ROOT_SUPER_ADMIN.toLowerCase())) {
            mapped.unshift(DEFAULT_OFFICERS[0]);
          }
          inMemoryOfficers = mapped;
          saveToFile(mapped);
          return mapped;
        }
      }

      // Auto-seed default officers to system_settings only when completely empty
      await supabase.from('system_settings').upsert({
        key: OFFICER_SETTINGS_KEY,
        value: JSON.stringify(DEFAULT_OFFICERS),
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  // 3. Try in-memory cache
  if (inMemoryOfficers && inMemoryOfficers.length > 0) {
    return inMemoryOfficers;
  }

  // 4. Try reading from server local file storage
  const fromFile = loadFromFile();
  if (fromFile && Array.isArray(fromFile)) {
    inMemoryOfficers = fromFile;
    return fromFile;
  }

  // 5. Initial seed
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
    // 1. Try upserting to officer_roles table
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

    // 2. Also save to system_settings for 100% cloud persistence
    try {
      await supabase.from('system_settings').upsert({
        key: OFFICER_SETTINGS_KEY,
        value: JSON.stringify(updated),
        updated_at: new Date().toISOString(),
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
  if (!updated.some((o) => o.email.toLowerCase() === ROOT_SUPER_ADMIN.toLowerCase())) {
    updated.unshift(DEFAULT_OFFICERS[0]);
  }

  inMemoryOfficers = updated;
  saveToFile(updated);

  if (supabase) {
    // 1. Try deleting from officer_roles table
    try {
      if (id && !id.startsWith('off-') && !id.startsWith('root-') && !id.startsWith('default-')) {
        await supabase.from('officer_roles').delete().eq('id', id);
      } else {
        let q = supabase.from('officer_roles').delete().ilike('email', normalizedEmail);
        if (roleTier) q = q.eq('role_tier', roleTier);
        await q;
      }
    } catch {}

    // 2. Also update system_settings
    try {
      await supabase.from('system_settings').upsert({
        key: OFFICER_SETTINGS_KEY,
        value: JSON.stringify(updated),
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }
}
