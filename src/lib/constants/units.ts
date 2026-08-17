// ════════════════════════════════════════════
// src/lib/constants/units.ts — Official Units & Mapping
// ════════════════════════════════════════════

export interface OfficialUnit {
  code: string;
  name: string;
  type: string;
  email: string;
}

export const OFFICIAL_UNITS: OfficialUnit[] = [
  // Đoàn Trường
  {
    code: 'BCH_DOAN',
    name: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
    type: 'Đoàn Thanh Niên',
    email: 'doanthanhnien@ptithcm.edu.vn',
  },
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
    email: 'lcdmkt@student.ptithcm.edu.vn',
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
    group: '── ĐOÀN THANH NIÊN HỌC VIỆN ──',
    items: OFFICIAL_UNITS.filter((u) => u.type.includes('Đoàn')).map((u) => u.name),
  },
  {
    group: '── 8 LIÊN CHI ĐOÀN (LCĐ) ──',
    items: OFFICIAL_UNITS.filter((u) => u.type.includes('LCĐ')).map((u) => u.name),
  },
  {
    group: '── 16 CÂU LẠC BỘ / ĐỘI / NHÓM ──',
    items: OFFICIAL_UNITS.filter((u) => !u.type.includes('LCĐ') && !u.type.includes('Đoàn')).map((u) => u.name),
  },
];

export const EMAIL_TO_UNIT: Record<string, string> = {
  'doanthanhnien@ptithcm.edu.vn': 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
  'bchdoan@ptithcm.edu.vn': 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
  
  // 8 LCĐs
  'lcdcntt@student.ptithcm.edu.vn': 'LCĐ Khoa Công nghệ Thông tin',
  'lcd_cntt@student.ptithcm.edu.vn': 'LCĐ Khoa Công nghệ Thông tin',
  'lcdcndpt@student.ptithcm.edu.vn': 'LCĐ Công nghệ Đa phương tiện',
  'lcd_cndpt@student.ptithcm.edu.vn': 'LCĐ Công nghệ Đa phương tiện',
  'lcdattt@student.ptithcm.edu.vn': 'LCĐ An toàn Thông tin',
  'lcd_attt@student.ptithcm.edu.vn': 'LCĐ An toàn Thông tin',
  'lcdvt@student.ptithcm.edu.vn': 'LCĐ Khoa Viễn thông',
  'lcd_vt@student.ptithcm.edu.vn': 'LCĐ Khoa Viễn thông',
  'lcddt@student.ptithcm.edu.vn': 'LCĐ Khoa Điện tử',
  'lcd_dt@student.ptithcm.edu.vn': 'LCĐ Khoa Điện tử',
  'lcdqtkd@student.ptithcm.edu.vn': 'LCĐ Khoa Quản trị Kinh doanh',
  'lcd_qtkd@student.ptithcm.edu.vn': 'LCĐ Khoa Quản trị Kinh doanh',
  'lcdmkt@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcd_mkt@student.ptithcm.edu.vn': 'LCĐ Marketing',
  'lcdketoan@student.ptithcm.edu.vn': 'LCĐ Kế toán',
  'lcd_kt@student.ptithcm.edu.vn': 'LCĐ Kế toán',
  'lcd_ketoan@student.ptithcm.edu.vn': 'LCĐ Kế toán',

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

  // 3. Fallback: match prefix in email
  if (email.includes('cntt')) return { unitName: 'LCĐ Khoa Công nghệ Thông tin', isLocked: true };
  if (email.includes('cndpt') || email.includes('dpt')) return { unitName: 'LCĐ Công nghệ Đa phương tiện', isLocked: true };
  if (email.includes('attt')) return { unitName: 'LCĐ An toàn Thông tin', isLocked: true };
  if (email.includes('vt') || email.includes('vienthong')) return { unitName: 'LCĐ Khoa Viễn thông', isLocked: true };
  if (email.includes('dt') || email.includes('dientu')) return { unitName: 'LCĐ Khoa Điện tử', isLocked: true };
  if (email.includes('qtkd')) return { unitName: 'LCĐ Khoa Quản trị Kinh doanh', isLocked: true };
  if (email.includes('mkt')) return { unitName: 'LCĐ Marketing', isLocked: true };
  if (email.includes('ketoan') || email.includes('kt')) return { unitName: 'LCĐ Kế toán', isLocked: true };
  if (email.includes('itmc')) return { unitName: 'CLB ITMC', isLocked: true };
  if (email.includes('guitar')) return { unitName: 'CLB Guitar', isLocked: true };
  if (email.includes('vannghe')) return { unitName: 'Đội Văn Nghệ', isLocked: true };
  if (email.includes('tinhnguyen')) return { unitName: 'Đội Sinh Viên Tình Nguyện', isLocked: true };
  if (email.includes('ketnoi')) return { unitName: 'CLB Kết Nối', isLocked: true };
  if (email.includes('cmc')) return { unitName: 'CLB C.MC', isLocked: true };
  if (email.includes('37do')) return { unitName: 'CLB 37 Độ Sinh viên', isLocked: true };
  if (email.includes('bma')) return { unitName: 'CLB BMA', isLocked: true };
  if (email.includes('bongchuyen')) return { unitName: 'CLB Bóng Chuyền', isLocked: true };
  if (email.includes('bongda')) return { unitName: 'CLB Bóng Đá', isLocked: true };
  if (email.includes('bongro')) return { unitName: 'CLB Bóng Rổ', isLocked: true };
  if (email.includes('vovinam')) return { unitName: 'CLB VOVINAM', isLocked: true };
  if (email.includes('covua') || email.includes('clb.co')) return { unitName: 'CLB Cờ', isLocked: true };
  if (email.includes('caulong')) return { unitName: 'CLB Cầu Lông', isLocked: true };

  // 4. Try matching full_name
  const name = (user.full_name || '').toLowerCase();
  const matched = OFFICIAL_UNITS.find((u) => name.includes(u.name.toLowerCase()) || u.name.toLowerCase().includes(name));
  if (matched) {
    return { unitName: matched.name, isLocked: true };
  }

  // Default fallback
  return {
    unitName: 'LCĐ Khoa Công nghệ Thông tin',
    isLocked: true,
  };
}
