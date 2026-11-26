import { getLcdByCode, normalizeLcdCode } from '@/lib/utils/lcd';
import { OFFICIAL_UNITS, EMAIL_TO_UNIT } from '@/lib/constants/units';
import { getOfficialTierForEmail } from '@/lib/auth/official-roles';
import { ROOT_SUPER_ADMIN, type OfficerRoleItem } from '@/lib/constants/officers-store';

export interface ResolvedRankingEventOrigin {
  unitName: string;
  unitType: 'lcd' | 'clb' | 'school' | 'faculty';
  lcdCode: string | null;
  lcdColor: string | null;
  /** 'school' = Hoạt động Đoàn Trường & Phát động; 'other' = LCĐ / CLB / Khoa / Đơn vị còn lại */
  rankingScope: 'school' | 'other';
  /** Phân loại con cho tab Đoàn Trường: 'support' (Phát động / Hỗ trợ) vs 'official' (Sự kiện Đoàn Trường) */
  campaignKind: 'support' | 'official' | null;
}

const BUILTIN_SCHOOL_YOUTH_UNION_EMAILS: ReadonlySet<string> = new Set([
  ROOT_SUPER_ADMIN.toLowerCase(),
  'bchdoan@ptithcm.edu.vn',
  'doanthanhnien@ptithcm.edu.vn',
  'vpdoan@ptithcm.edu.vn',
  'vanphongdoan@ptithcm.edu.vn',
]);

const UNIT_BY_EMAIL = new Map<string, string>([
  ...OFFICIAL_UNITS.map((u): [string, string] => [u.email.toLowerCase(), u.name]),
  ...Object.entries(EMAIL_TO_UNIT).map(([k, v]): [string, string] => [k.toLowerCase(), v]),
]);

function stripAccents(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Xây dựng tập email các tài khoản cấp Đoàn Trường / VPĐ / Super Admin từ cấu hình cán bộ.
 */
export function buildSchoolYouthUnionEmailSet(officers?: OfficerRoleItem[] | null): Set<string> {
  const set = new Set<string>(BUILTIN_SCHOOL_YOUTH_UNION_EMAILS);
  if (Array.isArray(officers)) {
    for (const item of officers) {
      const email = String(item?.email || '').trim().toLowerCase();
      if (!email) continue;
      if (
        item.role_tier === 'super_admin' ||
        item.role_tier === 'youth_union' ||
        item.role_tier === 'office_admin' ||
        item.unit_code === 'BCH_DOAN'
      ) {
        set.add(email);
      }
    }
  }
  return set;
}

function isSchoolYouthUnionName(nameNorm: string): boolean {
  if (!nameNorm) return false;
  return (
    nameNorm.includes('doan tncs') ||
    nameNorm.includes('doan thanh nien') ||
    nameNorm.includes('doan hoc vien') ||
    nameNorm.includes('doan truong') ||
    nameNorm.includes('van phong doan') ||
    nameNorm.includes('vp doan') ||
    nameNorm.includes('bch doan') ||
    nameNorm.includes('ban chap hanh doan') ||
    nameNorm.includes('ban quan tri toan truong')
  );
}

/**
 * Phân loại nguồn gốc đơn vị và phân hệ xét thi đua ('school' vs 'other') cho 1 sự kiện:
 * - 'school': Sự kiện Hỗ trợ / Phát động (isSupportEvent = true) HOẶC sự kiện thuộc Đoàn Trường / VPĐ / tk Đoàn Trường tạo.
 * - 'other' : Các sự kiện còn lại (8 Liên Chi Đoàn, 16 CLB/Đội/Nhóm, Khoa đào tạo, Phòng ban khác).
 */
export function classifyEventForRanking(params: {
  proposalUnit?: string | null;
  metaUnit?: string | null;
  creatorEmail?: string | null;
  isSupportEvent?: boolean;
  schoolOfficerEmails?: ReadonlySet<string>;
}): ResolvedRankingEventOrigin {
  const emailLower = String(params.creatorEmail || '').trim().toLowerCase();
  const explicitUnit = String(params.proposalUnit || params.metaUnit || '').trim();
  const mappedFromEmail = UNIT_BY_EMAIL.get(emailLower) || '';
  const rawName = explicitUnit || mappedFromEmail;
  const rawLower = rawName.toLowerCase();
  const normName = stripAccents(rawName);
  const schoolEmails = params.schoolOfficerEmails || BUILTIN_SCHOOL_YOUTH_UNION_EMAILS;

  // 1. Mọi sự kiện tạo từ luồng "+ Tạo Sự Kiện Hỗ Trợ" / Phát động đều tính vào phân hệ Đoàn Trường & Phát động
  if (params.isSupportEvent) {
    return {
      unitName: rawName || 'Văn phòng Đoàn Học Viện',
      unitType: 'school',
      lcdCode: null,
      lcdColor: '#1d4ed8',
      rankingScope: 'school',
      campaignKind: 'support',
    };
  }

  // 2. Nhận diện CLB / Đội / Nhóm trước LCĐ (tránh "CLB An toàn Thông tin" trùng từ khóa với "LCĐ An toàn Thông tin")
  const isExplicitClub =
    rawLower.startsWith('clb') ||
    rawLower.startsWith('câu lạc bộ') ||
    rawLower.startsWith('đội ') ||
    normName.startsWith('cau lac bo') ||
    normName.startsWith('doi ') ||
    (!explicitUnit && (emailLower.startsWith('clb') || emailLower.startsWith('doi')));

  if (isExplicitClub && rawName) {
    return {
      unitName: rawName,
      unitType: 'clb',
      lcdCode: null,
      lcdColor: '#7c3aed',
      rankingScope: 'other',
      campaignKind: null,
    };
  }

  // 3. Khoa đào tạo hoặc Phòng ban chuyên môn (bắt đầu bằng "Khoa " / "Phòng ", không phải "LCĐ Khoa...") -> nhóm Còn lại ('other')
  if (
    rawName &&
    !normName.startsWith('lcd') &&
    !normName.startsWith('lien chi doan') &&
    (normName.startsWith('khoa ') ||
      normName.startsWith('phong ') ||
      (!explicitUnit && emailLower.startsWith('khoa')) ||
      getOfficialTierForEmail(emailLower) === 'ctsv' ||
      getOfficialTierForEmail(emailLower) === 'facility')
  ) {
    return {
      unitName: rawName,
      unitType: 'faculty',
      lcdCode: null,
      lcdColor: '#0284c7',
      rankingScope: 'other',
      campaignKind: null,
    };
  }

  // 4. Nhận diện 8 Liên Chi Đoàn
  const lcdCode =
    normalizeLcdCode(explicitUnit) || (!explicitUnit ? normalizeLcdCode(emailLower) : null);
  if (lcdCode) {
    const lcd = getLcdByCode(lcdCode);
    if (lcd) {
      return {
        unitName: lcd.name,
        unitType: 'lcd',
        lcdCode: lcd.code,
        lcdColor: lcd.color,
        rankingScope: 'other',
        campaignKind: null,
      };
    }
  }

  // 5. Nếu có tên đơn vị tường minh thuộc Đoàn Trường / Văn phòng Đoàn
  if (rawName && isSchoolYouthUnionName(normName)) {
    return {
      unitName: rawName,
      unitType: 'school',
      lcdCode: null,
      lcdColor: '#1d4ed8',
      rankingScope: 'school',
      campaignKind: 'official',
    };
  }

  // 6. Kiểm tra theo tài khoản người tạo là Đoàn Trường / VPĐ / Super Admin
  const isCreatorSchoolYouthUnion =
    Boolean(emailLower) &&
    (schoolEmails.has(emailLower) || getOfficialTierForEmail(emailLower) === 'youth_union');

  if (isCreatorSchoolYouthUnion) {
    return {
      unitName: rawName || 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
      unitType: 'school',
      lcdCode: null,
      lcdColor: '#1d4ed8',
      rankingScope: 'school',
      campaignKind: 'official',
    };
  }

  // 7. Nếu có tên đơn vị khác chưa khớp -> xếp vào đơn vị còn lại ('other')
  if (rawName) {
    return {
      unitName: rawName,
      unitType: 'clb',
      lcdCode: null,
      lcdColor: '#7c3aed',
      rankingScope: 'other',
      campaignKind: null,
    };
  }

  // 8. Sự kiện hệ thống cấp trường không gắn đơn vị phụ -> mặc định Đoàn TNCS Học Viện ('school')
  return {
    unitName: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
    unitType: 'school',
    lcdCode: null,
    lcdColor: '#1d4ed8',
    rankingScope: 'school',
    campaignKind: 'official',
  };
}
