// ════════════════════════════════════════════
// src/lib/constants/units.ts — Official Units & Mapping
// ════════════════════════════════════════════

export interface OfficialUnit {
  code: string;
  name: string;
  type: string;
  email: string;
}

// 5 Khoa Đào Tạo của Học Viện Cơ Sở TP.HCM
export const ACADEMIC_FACULTIES: OfficialUnit[] = [
  {
    code: 'KHOA_CNTT',
    name: 'Khoa Công Nghệ Thông Tin 2',
    type: 'Khoa Đào Tạo',
    email: 'khoacntt@ptithcm.edu.vn',
  },
  {
    code: 'KHOA_DT',
    name: 'Khoa Điện Tử 2',
    type: 'Khoa Đào Tạo',
    email: 'khoadt@ptithcm.edu.vn',
  },
  {
    code: 'KHOA_VT',
    name: 'Khoa Viễn Thông 2',
    type: 'Khoa Đào Tạo',
    email: 'khoavt@ptithcm.edu.vn',
  },
  {
    code: 'KHOA_QTKD',
    name: 'Khoa Quản Trị Kinh Doanh 2',
    type: 'Khoa Đào Tạo',
    email: 'khoaqtkd@ptithcm.edu.vn',
  },
  {
    code: 'KHOA_CB',
    name: 'Khoa Cơ Bản 2',
    type: 'Khoa Đào Tạo',
    email: 'khoacoban@ptithcm.edu.vn',
  },
];

export const OFFICIAL_UNITS: OfficialUnit[] = [
  // 8 LCĐs
  {
    code: 'LCD_CNTT',
    name: 'LCĐ Khoa Công nghệ Thông tin',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdcntt@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_CNDPT',
    name: 'LCĐ Công nghệ Đa phương tiện',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdcndpt@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_ATTT',
    name: 'LCĐ An toàn Thông tin',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdattt@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_VT',
    name: 'LCĐ Khoa Viễn thông',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdvt@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_DT',
    name: 'LCĐ Khoa Điện tử',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcddt@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_QTKD',
    name: 'LCĐ Khoa Quản trị Kinh doanh',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdqtkd@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_MKT',
    name: 'LCĐ Marketing',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdmarketing@student.ptithcm.edu.vn',
  },
  {
    code: 'LCD_KT',
    name: 'LCĐ Kế toán',
    type: 'Liên Chi Đoàn (LCĐ)',
    email: 'lcdketoan@student.ptithcm.edu.vn',
  },
  // 16 CLB / Đội / Nhóm
  {
    code: 'CLB_ITMC',
    name: 'CLB ITMC',
    type: 'Câu Lạc Bộ Học Thuật',
    email: 'clb.itmc@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_ATTT',
    name: 'CLB An toàn Thông tin',
    type: 'Câu Lạc Bộ Học Thuật',
    email: 'clb.antoanthongtin@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_TA',
    name: 'CLB Tiếng Anh',
    type: 'Câu Lạc Bộ Kỹ Năng',
    email: 'clb.tienganh@student.ptithcm.edu.vn',
  },
  {
    code: 'DOI_VN',
    name: 'Đội Văn Nghệ',
    type: 'Đội / Nhóm Văn Thể',
    email: 'doivannghe@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_GUITAR',
    name: 'CLB Guitar',
    type: 'Câu Lạc Bộ Văn Thể',
    email: 'clb.guitar@student.ptithcm.edu.vn',
  },
  {
    code: 'DOI_SVTN',
    name: 'Đội Sinh Viên Tình Nguyện',
    type: 'Đội / Nhóm Tình Nguyện',
    email: 'doisinhvientinhnguyen@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_KETNOI',
    name: 'CLB Kết Nối',
    type: 'Câu Lạc Bộ Kỹ Năng',
    email: 'clb.ketnoi@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_CMC',
    name: 'CLB C.MC',
    type: 'Câu Lạc Bộ Truyền Thông',
    email: 'clb.truyenthongcmc@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_37DO',
    name: 'CLB 37 Độ Sinh viên',
    type: 'Câu Lạc Bộ Kỹ Năng',
    email: 'clb.37dosinhvien@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_BMA',
    name: 'CLB BMA',
    type: 'Câu Lạc Bộ Học Thuật',
    email: 'clb.bma@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_BONGCHUYEN',
    name: 'CLB Bóng Chuyền',
    type: 'Câu Lạc Bộ Thể Thao',
    email: 'clb.bongchuyen@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_BONGDA',
    name: 'CLB Bóng Đá',
    type: 'Câu Lạc Bộ Thể Thao',
    email: 'clbbongda@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_BONGRO',
    name: 'CLB Bóng Rổ',
    type: 'Câu Lạc Bộ Thể Thao',
    email: 'clb.bongro@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_VOVINAM',
    name: 'CLB VOVINAM',
    type: 'Câu Lạc Bộ Thể Thao',
    email: 'clb.vovinam@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_CO',
    name: 'CLB Cờ',
    type: 'Câu Lạc Bộ Thể Thao',
    email: 'clb.covua@student.ptithcm.edu.vn',
  },
  {
    code: 'CLB_CAULONG',
    name: 'CLB Cầu Lông',
    type: 'Câu Lạc Bộ Thể Thao',
    email: 'clb.caulong@student.ptithcm.edu.vn',
  },
];

export const OFFICIAL_UNIT_GROUPS = [
  {
    group: '── 🏢 5 KHOA ĐÀO TẠO (MƯỢN PHÒNG TRỰC TIẾP) ──',
    items: ACADEMIC_FACULTIES.map((u) => u.name),
  },
  {
    group: '── 🏛️ ĐOÀN THANH NIÊN HỌC VIỆN ──',
    items: ['Đoàn TNCS Học Viện Cơ Sở TP.HCM'],
  },
  {
    group: '── 🏛️ 8 LIÊN CHI ĐOÀN (LCĐ) ──',
    items: OFFICIAL_UNITS.filter((u) => u.code.startsWith('LCD_') || u.type.includes('LCĐ')).map((u) => u.name),
  },
  {
    group: '── 🎯 16 CÂU LẠC BỘ / ĐỘI / NHÓM ──',
    items: OFFICIAL_UNITS.filter((u) => !u.code.startsWith('LCD_') && !u.type.includes('LCĐ') && !u.type.includes('Khoa')).map((u) => u.name),
  },
];

export const EMAIL_TO_UNIT: Record<string, string> = {
  // 4 Khoa Đào Tạo
  'khoacntt@ptithcm.edu.vn': 'Khoa Công Nghệ Thông Tin',
  'khoa_cntt@ptithcm.edu.vn': 'Khoa Công Nghệ Thông Tin',
  'khoadt@ptithcm.edu.vn': 'Khoa Điện Tử',
  'khoa_dt@ptithcm.edu.vn': 'Khoa Điện Tử',
  'khoadientu@ptithcm.edu.vn': 'Khoa Điện Tử',
  'khoacoban@ptithcm.edu.vn': 'Khoa Cơ Bản',
  'khoa_cb@ptithcm.edu.vn': 'Khoa Cơ Bản',
  'khoacb@ptithcm.edu.vn': 'Khoa Cơ Bản',
  'khoaqtkd@ptithcm.edu.vn': 'Khoa Quản Trị Kinh Doanh',
  'khoa_qtkd@ptithcm.edu.vn': 'Khoa Quản Trị Kinh Doanh',

  'doanthanhnien@ptithcm.edu.vn': 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
  'bchdoan@ptithcm.edu.vn': 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
  
  // 8 LCĐs
  'lcdcntt@student.ptithcm.edu.vn': 'LCĐ Khoa Công nghệ Thông tin',
  'lcd_cntt@student.ptithcm.edu.vn': 'LCĐ Khoa Công nghệ Thông tin',
  'lcdcntt@ptithcm.edu.vn': 'LCĐ Khoa Công nghệ Thông tin',
  'lcdcndpt@student.ptithcm.edu.vn': 'LCĐ Công nghệ Đa phương tiện',
  'lcd_cndpt@student.ptithcm.edu.vn': 'LCĐ Công nghệ Đa phương tiện',
  'lcdcndpt@ptithcm.edu.vn': 'LCĐ Công nghệ Đa phương tiện',
  'lcdattt@student.ptithcm.edu.vn': 'LCĐ An toàn Thông tin',
  'lcd_attt@student.ptithcm.edu.vn': 'LCĐ An toàn Thông tin',
  'lcdattt@ptithcm.edu.vn': 'LCĐ An toàn Thông tin',
  'lcdvt@student.ptithcm.edu.vn': 'LCĐ Khoa Viễn thông',
  'lcd_vt@student.ptithcm.edu.vn': 'LCĐ Khoa Viễn thông',
  'lcdvt@ptithcm.edu.vn': 'LCĐ Khoa Viễn thông',
  'lcddt@student.ptithcm.edu.vn': 'LCĐ Khoa Điện tử',
  'lcd_dt@student.ptithcm.edu.vn': 'LCĐ Khoa Điện tử',
  'lcddt@ptithcm.edu.vn': 'LCĐ Khoa Điện tử',
  'lcdqtkd@student.ptithcm.edu.vn': 'LCĐ Khoa Quản trị Kinh doanh',
  'lcd_qtkd@student.ptithcm.edu.vn': 'LCĐ Khoa Quản trị Kinh doanh',
  'lcdqtkd@ptithcm.edu.vn': 'LCĐ Khoa Quản trị Kinh doanh',
  'lcdmkt@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcd_mkt@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcdmkt@ptithcm.edu.vn': 'LCĐ Marketing',
  'lcdmarketing@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcd_marketing@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcdmarketing@ptithcm.edu.vn': 'LCĐ Marketing',
  'lcd.marketing@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcdketoan@student.ptithcm.edu.vn': 'LCĐ Kế toán',
  'lcd_kt@student.ptithcm.edu.vn': 'LCĐ Kế toán',
  'lcd_ketoan@student.ptithcm.edu.vn': 'LCĐ Kế toán',
  'lcdketoan@ptithcm.edu.vn': 'LCĐ Kế toán',
  'lcdkt@student.ptithcm.edu.vn': 'LCĐ Kế toán',

  // 16 CLBs
  'clb.itmc@student.ptithcm.edu.vn': 'CLB ITMC',
  'clbitmc@student.ptithcm.edu.vn': 'CLB ITMC',
  'clb_itmc@student.ptithcm.edu.vn': 'CLB ITMC',
  'clb.antoanthongtin@student.ptithcm.edu.vn': 'CLB An toàn Thông tin',
  'clbattt@student.ptithcm.edu.vn': 'CLB An toàn Thông tin',
  'clb.tienganh@student.ptithcm.edu.vn': 'CLB Tiếng Anh',
  'doivannghe@student.ptithcm.edu.vn': 'Đội Văn Nghệ',
  'clb.guitar@student.ptithcm.edu.vn': 'CLB Guitar',
  'doisinhvientinhnguyen@student.ptithcm.edu.vn': 'Đội Sinh Viên Tình Nguyện',
  'clb.ketnoi@student.ptithcm.edu.vn': 'CLB Kết Nối',
  'clb.truyenthongcmc@student.ptithcm.edu.vn': 'CLB C.MC',
  'clb.cmc@student.ptithcm.edu.vn': 'CLB C.MC',
  'clb.37dosinhvien@student.ptithcm.edu.vn': 'CLB 37 Độ Sinh viên',
  'clb37dosinhvien@student.ptithcm.edu.vn': 'CLB 37 Độ Sinh viên',
  'clb.bma@student.ptithcm.edu.vn': 'CLB BMA',
  'clbbma@student.ptithcm.edu.vn': 'CLB BMA',
  'clb.bongchuyen@student.ptithcm.edu.vn': 'CLB Bóng Chuyền',
  'clbbongda@student.ptithcm.edu.vn': 'CLB Bóng Đá',
  'clb.bongda@student.ptithcm.edu.vn': 'CLB Bóng Đá',
  'clb.bongro@student.ptithcm.edu.vn': 'CLB Bóng Rổ',
  'clb.vovinam@student.ptithcm.edu.vn': 'CLB VOVINAM',
  'clb.covua@student.ptithcm.edu.vn': 'CLB Cờ',
  'clb.co@student.ptithcm.edu.vn': 'CLB Cờ',
  'clb.caulong@student.ptithcm.edu.vn': 'CLB Cầu Lông',
};

// Helper to remove accents for fuzzy matching
function stripVietnameseAccents(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim();
}

export function resolveUnitForUser(user: {
  email?: string;
  tier?: string;
  isSuperAdmin?: boolean;
  unit_name?: string;
  unit_code?: string;
  full_name?: string;
}): { unitName: string; isLocked: boolean } {
  const isSA = user.tier === 'super_admin' || user.isSuperAdmin;
  const email = (user.email || '').toLowerCase().trim();
  const isYouthUnion = user.tier === 'youth_union' || email.includes('doanthanhnien') || email.includes('bchdoan');

  // Super Admin & Đoàn Thanh Niên can pick any unit
  if (isSA || isYouthUnion) {
    return {
      unitName: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
      isLocked: false,
    };
  }

  // 1. If explicit unit_name attached
  if (user.unit_name && user.unit_name.trim()) {
    return {
      unitName: user.unit_name.trim(),
      isLocked: true,
    };
  }

  // 2. Lookup exact email mapping
  if (EMAIL_TO_UNIT[email]) {
    return {
      unitName: EMAIL_TO_UNIT[email],
      isLocked: true,
    };
  }

  const cleanEmail = stripVietnameseAccents(email);
  const cleanName = stripVietnameseAccents(user.full_name || '');

  // 3. Match Faculties (Khoa Đào Tạo)
  if (cleanEmail.includes('khoacntt') || cleanEmail.includes('khoa cntt')) return { unitName: 'Khoa Công Nghệ Thông Tin', isLocked: true };
  if (cleanEmail.includes('khoadt') || cleanEmail.includes('khoa dt') || cleanEmail.includes('khoadientu')) return { unitName: 'Khoa Điện Tử', isLocked: true };
  if (cleanEmail.includes('khoacoban') || cleanEmail.includes('khoa cb') || cleanEmail.includes('khoacb')) return { unitName: 'Khoa Cơ Bản', isLocked: true };
  if (cleanEmail.includes('khoaqtkd') || cleanEmail.includes('khoa qtkd')) return { unitName: 'Khoa Quản Trị Kinh Doanh', isLocked: true };

  // 4. Match 8 LCĐs by email or full_name (fuzzy support)
  if (cleanEmail.includes('marketing') || cleanEmail.includes('mkt') || cleanName.includes('marketing')) {
    return { unitName: 'LCĐ Marketing', isLocked: true };
  }
  if (cleanEmail.includes('ketoan') || cleanEmail.includes('ke toan') || cleanEmail.includes('kt') || cleanName.includes('ke toan')) {
    return { unitName: 'LCĐ Kế toán', isLocked: true };
  }
  if (cleanEmail.includes('qtkd') || cleanEmail.includes('quantri') || cleanName.includes('quan tri kinh doanh')) {
    return { unitName: 'LCĐ Khoa Quản trị Kinh doanh', isLocked: true };
  }
  if (cleanEmail.includes('attt') || cleanEmail.includes('antoan') || cleanName.includes('an toan thong tin')) {
    return { unitName: 'LCĐ An toàn Thông tin', isLocked: true };
  }
  if (cleanEmail.includes('cndpt') || cleanEmail.includes('dpt') || cleanEmail.includes('daphuongtien') || cleanName.includes('da phuong tien')) {
    return { unitName: 'LCĐ Công nghệ Đa phương tiện', isLocked: true };
  }
  if (cleanEmail.includes('vt') || cleanEmail.includes('vienthong') || cleanName.includes('vien thong')) {
    return { unitName: 'LCĐ Khoa Viễn thông', isLocked: true };
  }
  if (cleanEmail.includes('dt') || cleanEmail.includes('dientu') || cleanName.includes('dien tu')) {
    return { unitName: 'LCĐ Khoa Điện tử', isLocked: true };
  }
  if (cleanEmail.includes('cntt') || cleanEmail.includes('congnghethongtin') || cleanName.includes('cong nghe thong tin')) {
    return { unitName: 'LCĐ Khoa Công nghệ Thông tin', isLocked: true };
  }

  // 5. Match 16 CLBs
  if (cleanEmail.includes('itmc') || cleanName.includes('itmc')) return { unitName: 'CLB ITMC', isLocked: true };
  if (cleanEmail.includes('guitar') || cleanName.includes('guitar')) return { unitName: 'CLB Guitar', isLocked: true };
  if (cleanEmail.includes('vannghe') || cleanName.includes('van nghe')) return { unitName: 'Đội Văn Nghệ', isLocked: true };
  if (cleanEmail.includes('tinhnguyen') || cleanName.includes('tinh nguyen')) return { unitName: 'Đội Sinh Viên Tình Nguyện', isLocked: true };
  if (cleanEmail.includes('ketnoi') || cleanName.includes('ket noi')) return { unitName: 'CLB Kết Nối', isLocked: true };
  if (cleanEmail.includes('cmc') || cleanName.includes('cmc')) return { unitName: 'CLB C.MC', isLocked: true };
  if (cleanEmail.includes('37do') || cleanName.includes('37 do')) return { unitName: 'CLB 37 Độ Sinh viên', isLocked: true };
  if (cleanEmail.includes('bma') || cleanName.includes('bma')) return { unitName: 'CLB BMA', isLocked: true };
  if (cleanEmail.includes('bongchuyen') || cleanName.includes('bong chuyen')) return { unitName: 'CLB Bóng Chuyền', isLocked: true };
  if (cleanEmail.includes('bongda') || cleanName.includes('bong da')) return { unitName: 'CLB Bóng Đá', isLocked: true };
  if (cleanEmail.includes('bongro') || cleanName.includes('bong ro')) return { unitName: 'CLB Bóng Rổ', isLocked: true };
  if (cleanEmail.includes('vovinam') || cleanName.includes('vovinam')) return { unitName: 'CLB VOVINAM', isLocked: true };
  if (cleanEmail.includes('covua') || cleanEmail.includes('clb.co') || cleanName.includes('co vua')) return { unitName: 'CLB Cờ', isLocked: true };
  if (cleanEmail.includes('caulong') || cleanName.includes('cau long')) return { unitName: 'CLB Cầu Lông', isLocked: true };

  // 6. Direct full_name match with official unit name
  const matched = OFFICIAL_UNITS.find((u) => {
    const uClean = stripVietnameseAccents(u.name);
    return cleanName.includes(uClean) || uClean.includes(cleanName);
  });
  if (matched) {
    return { unitName: matched.name, isLocked: true };
  }

  // Default fallback
  return {
    unitName: 'LCĐ Khoa Công nghệ Thông tin',
    isLocked: true,
  };
}

const CUSTOM_UNITS_KEY = 'custom_units_registry';
const NON_STUDENT_UNIT_CODES = new Set([
  'KHOA_CNTT',
  'KHOA_DT',
  'KHOA_VT',
  'KHOA_CB',
  'KHOA_QTKD',
  'BCH_DOAN',
  'PHONG_CTSV',
  'PHONG_TCHCQT',
  'TO_BAO_VE',
]);

export async function getCustomUnitsFromDb(supabase?: any): Promise<OfficialUnit[]> {
  if (!supabase) return OFFICIAL_UNITS;
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', CUSTOM_UNITS_KEY)
      .maybeSingle();

    if (data?.value) {
      let parsed = data.value;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {}
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        let hasChanges = false;
        const normalized = (parsed as OfficialUnit[]).map((u) => {
          if (u.code === 'LCD_MKT' && u.email !== 'lcdmarketing@student.ptithcm.edu.vn') {
            hasChanges = true;
            return { ...u, email: 'lcdmarketing@student.ptithcm.edu.vn' };
          }
          return u;
        });

        const filtered = normalized.filter((u) => !NON_STUDENT_UNIT_CODES.has(u.code));
        if (filtered.length !== parsed.length || hasChanges) {
          // Clean up stored units in DB to keep exactly the official student units
          await supabase.from('system_settings').upsert({
            key: CUSTOM_UNITS_KEY,
            value: JSON.stringify(filtered),
            updated_at: new Date().toISOString(),
          });
        }
        return filtered;
      }
    }

    // Pre-seed 24 official units directly into Supabase DB
    await supabase.from('system_settings').upsert({
      key: CUSTOM_UNITS_KEY,
      value: JSON.stringify(OFFICIAL_UNITS),
      updated_at: new Date().toISOString(),
    });
    return OFFICIAL_UNITS;
  } catch (err) {
    console.warn('Could not load custom units from DB:', err);
  }
  return OFFICIAL_UNITS;
}

export async function saveCustomUnitsToDb(
  supabase: any,
  units: OfficialUnit[],
  actorEmail?: string
): Promise<OfficialUnit[]> {
  try {
    await supabase.from('system_settings').upsert({
      key: CUSTOM_UNITS_KEY,
      value: JSON.stringify(units),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Could not save custom units to DB:', err);
  }
  return units;
}

