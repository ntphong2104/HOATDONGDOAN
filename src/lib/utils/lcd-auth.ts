import { getStoredOfficerRoles, DEFAULT_OFFICERS } from '@/lib/constants/officers-store';
import { getLcdByCode, normalizeLcdCode, type LcdDefinition } from '@/lib/utils/lcd';
import type { AuthContext } from '@/lib/supabase/auth-helper';

export interface ActorLcdScope {
  role: 'all' | 'lcd' | 'none';
  lcd: LcdDefinition | null;
}

/**
 * Xác định phạm vi Liên Chi Đoàn của tài khoản đang đăng nhập.
 * - Super Admin / Đoàn TNCS Học viện -> role: 'all' (quản lý cả 8 LCĐ)
 * - Tài khoản 8 LCĐ (email chính thức hoặc được gán trong officer_roles với unit_code/unit_name thuộc LCĐ) -> role: 'lcd'
 * - Các đơn vị khác (CLB/Đội/Nhóm/SV thường) -> role: 'none'
 */
export async function resolveActorLcdScope(
  supabase: any,
  auth: AuthContext | null
): Promise<ActorLcdScope> {
  if (!auth?.email) {
    return { role: 'none', lcd: null };
  }

  if (auth.isSuperAdmin || auth.tier === 'super_admin' || auth.tier === 'youth_union') {
    return { role: 'all', lcd: null };
  }

  const lowerEmail = auth.email.toLowerCase().trim();

  // 1. Direct email match (VD: lcdcntt@student.ptithcm.edu.vn)
  const directCode = normalizeLcdCode(lowerEmail);
  if (directCode) {
    const def = getLcdByCode(directCode);
    if (def) return { role: 'lcd', lcd: def };
  }

  // 2. Match against default officers + stored officers
  let storedOfficers: any[] = [];
  try {
    storedOfficers = (await getStoredOfficerRoles()) || [];
  } catch {}
  const localMatch = [...DEFAULT_OFFICERS, ...storedOfficers].find(
    (o) => o?.email?.toLowerCase().trim() === lowerEmail
  );
  if (localMatch) {
    const code = normalizeLcdCode(localMatch.unit_code) || normalizeLcdCode(localMatch.unit_name);
    if (code) {
      const def = getLcdByCode(code);
      if (def) return { role: 'lcd', lcd: def };
    }
  }

  // 3. Match against Supabase officer_roles table (for custom-assigned LCĐ officers)
  if (supabase) {
    try {
      const { data: row } = await supabase
        .from('officer_roles')
        .select('unit_code, unit_name')
        .eq('email', lowerEmail)
        .maybeSingle();

      if (row) {
        const code = normalizeLcdCode(row.unit_code) || normalizeLcdCode(row.unit_name);
        if (code) {
          const def = getLcdByCode(code);
          if (def) return { role: 'lcd', lcd: def };
        }
      }
    } catch {}
  }

  return { role: 'none', lcd: null };
}

/**
 * Tính ngày hết hạn ủy quyền BCH Chi Đoàn theo nhiệm kỳ.
 * Mặc định: 365 ngày (1 nhiệm kỳ) nếu không truyền expires_at / duration_days.
 */
export function resolveDelegateExpiry(options?: {
  expires_at?: string | null;
  duration_days?: number | string | null;
}): Date {
  const now = new Date();

  if (options?.expires_at) {
    const raw = String(options.expires_at).trim();
    // Nếu chỉ truyền YYYY-MM-DD, đặt cuối ngày 23:59:59 theo giờ VN (+07:00)
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T23:59:59+07:00`)
      : new Date(raw);

    if (!isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      // Giới hạn tối đa 2 năm (730 ngày) để đảm bảo an toàn nhiệm kỳ
      const maxTime = now.getTime() + 730 * 24 * 60 * 60 * 1000;
      return new Date(Math.min(parsed.getTime(), maxTime));
    }
  }

  const daysNum = Number(options?.duration_days);
  const effectiveDays =
    Number.isFinite(daysNum) && daysNum >= 1 && daysNum <= 730
      ? Math.round(daysNum)
      : 365; // Mặc định 1 nhiệm kỳ (12 tháng)

  return new Date(now.getTime() + effectiveDays * 24 * 60 * 60 * 1000);
}
