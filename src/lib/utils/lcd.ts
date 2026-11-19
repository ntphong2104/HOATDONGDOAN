// ═══════════════════════════════════════════════════════════════════════════
// Phân lớp theo 8 Liên Chi Đoàn (LCĐ) — PTIT Cơ sở tại TP. Hồ Chí Minh
//
// Đối chiếu theo Danh sách Ban Chấp Hành các Chi Đoàn thuộc 8 LCĐ nhiệm kỳ 2026-2027:
//  1. LCD_CNTT  (LCĐ Khoa Công nghệ Thông tin): CN, CE, TN (DCCN, DVCN, DECE, DCCE, DCTN)
//  2. LCD_ATTT  (LCĐ An toàn Thông tin)       : AT, AE (DCAT, DCAE)
//  3. LCD_CNDPT (LCĐ Công nghệ Đa phương tiện): PT, PTTK, PTUD, TT (DCPT, DCTT)
//  4. LCD_VT    (LCĐ Khoa Viễn thông)         : VT, CVT, CI, KD (DCVT, DCCI, DCKD)
//  5. LCD_DT    (LCĐ Khoa Điện tử)            : DT, DK, VM (DCDT, DCDK, DCVM)
//  6. LCD_QTKD  (LCĐ Khoa Quản trị Kinh doanh): QT (DCQT, DVQT)
//  7. LCD_MKT   (LCĐ Marketing)               : MR, ME, MEO (DCMR, DEME, DCME)
//  8. LCD_KT    (LCĐ Kế toán)                 : KT, TC (DCKT, DCTC)
//
// allowed_lcds rỗng / null = KHÔNG giới hạn (Toàn Học viện)
// ═══════════════════════════════════════════════════════════════════════════

export type LcdCode =
  | 'LCD_CNTT'
  | 'LCD_ATTT'
  | 'LCD_CNDPT'
  | 'LCD_VT'
  | 'LCD_DT'
  | 'LCD_QTKD'
  | 'LCD_MKT'
  | 'LCD_KT';

export interface LcdDefinition {
  code: LcdCode;
  name: string;
  shortName: string;
  email: string;
  /** Mã ngành xuất hiện trong mã lớp (sau CQ/VH/CLC), VD: D25CQCN01-N -> CN */
  classCodes: string[];
  /** Mã ngành xuất hiện trong MSSV (sau N25 / E25), VD: N25DECE018 -> DECE */
  mssvCodes: string[];
  color: string;
  bg: string;
  border: string;
}

export const LCD_DEFINITIONS: ReadonlyArray<LcdDefinition> = [
  {
    code: 'LCD_CNTT',
    name: 'LCĐ Khoa Công nghệ Thông tin',
    shortName: 'LCĐ Khoa Công nghệ Thông tin',
    email: 'lcdcntt@student.ptithcm.edu.vn',
    classCodes: ['CN', 'CE', 'TN'],
    mssvCodes: ['DCCN', 'DVCN', 'CQCN', 'DECE', 'DCCE', 'CECE', 'EDCE', 'CQCE', 'DCTN', 'CQTN'],
    color: '#0369a1', // Xanh biển
    bg: '#f0f9ff',
    border: '#bae6fd',
  },
  {
    code: 'LCD_CNDPT',
    name: 'LCĐ Công nghệ Đa phương tiện',
    shortName: 'LCĐ Công nghệ Đa phương tiện',
    email: 'lcdcndpt@student.ptithcm.edu.vn',
    classCodes: ['PT', 'PTTK', 'PTUD', 'TT'],
    mssvCodes: ['DCPT', 'CQPT', 'DCTT', 'CQTT'],
    color: '#ea580c', // Cam
    bg: '#fff7ed',
    border: '#fed7aa',
  },
  {
    code: 'LCD_ATTT',
    name: 'LCĐ An toàn Thông tin',
    shortName: 'LCĐ An toàn Thông tin',
    email: 'lcdattt@student.ptithcm.edu.vn',
    classCodes: ['AT', 'AE'],
    mssvCodes: ['DCAT', 'CQAT', 'DCAE', 'CQAE'],
    color: '#0ea5e9', // Xanh biển tươi sáng hơn CNTT
    bg: '#e0f2fe',
    border: '#7dd3fc',
  },
  {
    code: 'LCD_VT',
    name: 'LCĐ Khoa Viễn thông',
    shortName: 'LCĐ Khoa Viễn thông',
    email: 'lcdvt@student.ptithcm.edu.vn',
    classCodes: ['VT', 'CVT', 'CI', 'KD'],
    mssvCodes: ['DCVT', 'CQVT', 'CQCVT', 'DTCV', 'DCCI', 'CQCI', 'DCKD', 'CQKD'],
    color: '#172554', // Xanh đen
    bg: '#eef2ff',
    border: '#c7d2fe',
  },
  {
    code: 'LCD_DT',
    name: 'LCĐ Khoa Điện tử',
    shortName: 'LCĐ Khoa Điện tử',
    email: 'lcddt@student.ptithcm.edu.vn',
    classCodes: ['DT', 'DK', 'DKDK', 'VM'],
    mssvCodes: ['DCDT', 'CQDT', 'DCDK', 'CQDK', 'DCVM', 'CQVM'],
    color: '#18181b', // Đen
    bg: '#f4f4f5',
    border: '#d4d4d8',
  },
  {
    code: 'LCD_QTKD',
    name: 'LCĐ Khoa Quản trị Kinh doanh',
    shortName: 'LCĐ Khoa Quản trị Kinh doanh',
    email: 'lcdqtkd@student.ptithcm.edu.vn',
    classCodes: ['QT'],
    mssvCodes: ['DCQT', 'DVQT', 'CQQT'],
    color: '#dc2626', // Đỏ
    bg: '#fef2f2',
    border: '#fecaca',
  },
  {
    code: 'LCD_MKT',
    name: 'LCĐ Marketing',
    shortName: 'LCĐ Marketing',
    email: 'lcdmarketing@student.ptithcm.edu.vn',
    classCodes: ['MR', 'ME', 'MEO'],
    mssvCodes: ['DCMR', 'CQMR', 'DQMR', 'DEME', 'DCME', 'CQME'],
    color: '#111827', // Đen
    bg: '#f3f4f6',
    border: '#d1d5db',
  },
  {
    code: 'LCD_KT',
    name: 'LCĐ Kế toán',
    shortName: 'LCĐ Kế toán',
    email: 'lcdketoan@student.ptithcm.edu.vn',
    classCodes: ['KT', 'TC'],
    mssvCodes: ['DCKT', 'CQKT', 'DCTC', 'CQTC'],
    color: '#15803d', // Xanh lá đậm
    bg: '#f0fdf4',
    border: '#bbf7d0',
  },
];

const LCD_BY_CODE = new Map<LcdCode, LcdDefinition>(
  LCD_DEFINITIONS.map((d) => [d.code, d])
);

const CLASS_CODE_TO_LCD = new Map<string, LcdDefinition>();
const MSSV_CODE_TO_LCD = new Map<string, LcdDefinition>();

for (const def of LCD_DEFINITIONS) {
  for (const c of def.classCodes) CLASS_CODE_TO_LCD.set(c.toUpperCase(), def);
  for (const m of def.mssvCodes) MSSV_CODE_TO_LCD.set(m.toUpperCase(), def);
}

export function getLcdByCode(code?: string | null): LcdDefinition | null {
  if (!code) return null;
  const upper = String(code).trim().toUpperCase() as LcdCode;
  return LCD_BY_CODE.get(upper) || null;
}

/**
 * Chuẩn hóa chuỗi mã LCĐ (VD: "LCD_CNTT", "lcdcntt", "LCĐ Khoa Công nghệ Thông tin") -> LcdCode.
 */
export function normalizeLcdCode(value?: string | null): LcdCode | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (LCD_BY_CODE.has(upper as LcdCode)) {
    return upper as LcdCode;
  }

  const lower = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();

  for (const def of LCD_DEFINITIONS) {
    if (lower === def.email.toLowerCase() || lower === def.email.split('@')[0].toLowerCase()) {
      return def.code;
    }
  }

  if (lower.includes('lcdcntt') || lower.includes('cong nghe thong tin')) return 'LCD_CNTT';
  if (lower.includes('lcdattt') || lower.includes('an toan thong tin')) return 'LCD_ATTT';
  if (lower.includes('lcdcndpt') || lower.includes('da phuong tien')) return 'LCD_CNDPT';
  if (lower.includes('lcdvt') || lower.includes('vien thong')) return 'LCD_VT';
  if (lower.includes('lcddt') || lower.includes('dien tu')) return 'LCD_DT';
  if (lower.includes('lcdqtkd') || lower.includes('quan tri kinh doanh')) return 'LCD_QTKD';
  if (lower.includes('lcdmarketing') || lower.includes('lcdmkt') || lower.includes('marketing')) return 'LCD_MKT';
  if (lower.includes('lcdketoan') || lower.includes('lcdkt') || lower.includes('ke toan')) return 'LCD_KT';

  return null;
}

/**
 * Nhận diện Liên Chi Đoàn của sinh viên từ Mã lớp (`class_id`) và/hoặc `mssv`.
 * Ưu tiên mã lớp trước (chính xác kể cả sinh viên chuyển ngành), sau đó fallback sang MSSV.
 */
export function resolveStudentLcd(
  classId?: string | null,
  mssv?: string | null
): LcdDefinition | null {
  const cleanClass = String(classId || '').trim().toUpperCase().replace(/\s+/g, '');
  if (cleanClass && cleanClass !== 'PTIT-HCM') {
    // Pattern chuẩn: D25CQCN01-N, E25CQCE01-N, D23VHCN01-N, D24CLCQT01-N, D25CQPTTK01-N
    const clsMatch = cleanClass.match(/^[A-Z]\d{2}(?:CQ|VH|CLC|LT|TX)([A-Z]{2,5})\d*/);
    if (clsMatch) {
      const code = clsMatch[1];
      if (CLASS_CODE_TO_LCD.has(code)) {
        return CLASS_CODE_TO_LCD.get(code)!;
      }
      // Thử 2 ký tự đầu (VD: PTTK -> PT, MEO -> ME)
      if (code.length > 2 && CLASS_CODE_TO_LCD.has(code.slice(0, 2))) {
        return CLASS_CODE_TO_LCD.get(code.slice(0, 2))!;
      }
    }
  }

  const cleanMssv = String(mssv || '').trim().toUpperCase();
  if (cleanMssv) {
    // Pattern chuẩn: N22DCCN158, N25DECE018, N23DVCN002, N26DCTC002
    const mssvMatch = cleanMssv.match(/^[A-Z]\d{2}([A-Z]{2,5})\d+/);
    if (mssvMatch) {
      const majorCode = mssvMatch[1];
      if (MSSV_CODE_TO_LCD.has(majorCode)) {
        return MSSV_CODE_TO_LCD.get(majorCode)!;
      }
      // Fallback lấy 2 ký tự cuối của mã 4 chữ (VD: DCCN -> CN, DECE -> CE)
      if (majorCode.length >= 4 && CLASS_CODE_TO_LCD.has(majorCode.slice(-2))) {
        return CLASS_CODE_TO_LCD.get(majorCode.slice(-2))!;
      }
    }
  }

  return null;
}

/** Danh sách mã LCĐ giới hạn đã chuẩn hóa; [] = Toàn Học viện (không giới hạn). */
export function normalizeAllowedLcds(allowed: unknown): LcdCode[] {
  if (!Array.isArray(allowed)) return [];
  const out: LcdCode[] = [];
  for (const item of allowed) {
    const code = normalizeLcdCode(String(item));
    if (code && !out.includes(code)) {
      out.push(code);
    }
  }
  return out;
}

export interface LcdEligibility {
  restricted: boolean;
  allowed: LcdCode[];
  allowedNames: string[];
  myLcd: {
    code: LcdCode;
    name: string;
    shortName: string;
  } | null;
  eligible: boolean;
}

export function checkLcdEligibility(
  allowed: unknown,
  classId?: string | null,
  mssv?: string | null
): LcdEligibility {
  const list = normalizeAllowedLcds(allowed);
  const myDef = resolveStudentLcd(classId, mssv);
  const myLcd = myDef ? { code: myDef.code, name: myDef.name, shortName: myDef.shortName } : null;

  if (list.length === 0) {
    return {
      restricted: false,
      allowed: [],
      allowedNames: [],
      myLcd,
      eligible: true,
    };
  }

  const allowedNames = list.map((c) => LCD_BY_CODE.get(c)?.name || c);
  return {
    restricted: true,
    allowed: list,
    allowedNames,
    myLcd,
    eligible: Boolean(myDef && list.includes(myDef.code)),
  };
}

export function describeLcdBlock(
  check: LcdEligibility,
  mssv?: string | null,
  target = 'Sự kiện này'
): string {
  const allowedLabel = check.allowedNames.join(', ');
  const who = mssv ? `Tài khoản ${mssv}` : 'Tài khoản của bạn';
  const mine = check.myLcd
    ? `thuộc ${check.myLcd.name}`
    : 'chưa xác định được Liên Chi Đoàn (vui lòng cập nhật đúng Mã lớp trong Hồ sơ cá nhân)';
  return `${target} chỉ dành riêng cho sinh viên thuộc ${allowedLabel}. ${who} hiện ${mine} nên không thể đăng ký.`;
}

export function formatLcdsLabel(allowed: unknown): string {
  const list = normalizeAllowedLcds(allowed);
  if (list.length === 0) return 'Toàn Học viện';
  return list.map((c) => LCD_BY_CODE.get(c)?.shortName || c).join(', ');
}
