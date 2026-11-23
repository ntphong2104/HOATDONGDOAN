import type { AuthContext } from '@/lib/supabase/auth-helper';
import { OFFICIAL_UNITS } from '@/lib/constants/units';
import { getLcdByCode, normalizeLcdCode } from '@/lib/utils/lcd';
import { extractMSSV, isUnitAccount } from '@/lib/utils/extract-mssv';

export function isOfficeAdminAuth(auth: AuthContext | null): boolean {
  if (!auth) return false;
  return Boolean(
    auth.isSuperAdmin ||
      auth.isOfficeAdmin ||
      auth.tier === 'super_admin' ||
      auth.tier === 'office_admin'
  );
}

export async function getDutyVolunteerRecord(
  supabase: any,
  email: string
): Promise<{ mssv: string; email: string; full_name: string | null; class_id: string | null } | null> {
  try {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) return null;
    const mssv = extractMSSV(cleanEmail);
    const q = supabase
      .from('office_duty_volunteers')
      .select('mssv, email, full_name, class_id')
      .eq('is_active', true);
    const { data, error } = mssv
      ? await q.or(`email.ilike.${cleanEmail},mssv.eq.${mssv}`).limit(1)
      : await q.ilike('email', cleanEmail).limit(1);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data[0];
    }
  } catch {}
  return null;
}

/**
 * Kiểm tra tài khoản có quyền tạo đơn mượn dụng cụ VPĐ.
 * Mở cho tất cả tài khoản đã đăng nhập (Sinh viên, LCĐ, CLB, Đội, Cán bộ) — mọi đơn đều phải nêu rõ cơ sở và chờ VPĐ duyệt.
 */
export function canCreateBorrowRequest(auth: AuthContext | null): boolean {
  return Boolean(auth && auth.email);
}

export function resolveBorrowerUnit(auth: AuthContext): { unit_code: string; unit_name: string } {
  const emailLower = (auth.email || '').trim().toLowerCase();
  const matchedOfficial = OFFICIAL_UNITS.find((u) => u.email.toLowerCase() === emailLower);
  if (matchedOfficial) {
    return { unit_code: matchedOfficial.code, unit_name: matchedOfficial.name };
  }
  const lcdCode = normalizeLcdCode(emailLower);
  if (lcdCode) {
    const lcd = getLcdByCode(lcdCode);
    if (lcd) return { unit_code: lcd.code, unit_name: lcd.name };
  }
  const mssv = extractMSSV(emailLower);
  if (mssv && !isUnitAccount({ email: emailLower })) {
    return {
      unit_code: mssv,
      unit_name: `Sinh viên (${mssv})`,
    };
  }
  const username = emailLower.split('@')[0] || 'DON_VI';
  return {
    unit_code: username.toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
    unit_name: username.toUpperCase(),
  };
}
