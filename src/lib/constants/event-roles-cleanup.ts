// ═══════════════════════════════════════════════════════════════════════════
// src/lib/constants/event-roles-cleanup.ts
// Tự động thu hồi quyền Admin / Checker sự kiện của sinh viên sau khi
// sự kiện đã kết thúc quá 3 ngày.
// Các đơn vị chính thức (LCĐ, CLB, Phòng ban, Super Admin) được giữ vĩnh viễn.
// ═══════════════════════════════════════════════════════════════════════════

import { EMAIL_TO_UNIT } from './units';
import { ROOT_SUPER_ADMIN, getStoredOfficerRoles } from './officers-store';

/**
 * Kiểm tra xem một email có phải là đơn vị chính thức hoặc cán bộ cố định không.
 * Các tài khoản này KHÔNG BAO GIỜ bị thu hồi quyền tự động.
 */
export function isExemptFromAutoRevoke(
  email: string,
  superAdminEmails: Set<string> = new Set(),
  storedOfficerEmails: Set<string> = new Set()
): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();

  // 1. Root Super Admin
  if (lower === ROOT_SUPER_ADMIN.toLowerCase()) return true;

  // 2. Super Admins trong database
  if (superAdminEmails.has(lower)) return true;

  // 3. Cán bộ phân quyền cố định (stored_officer_roles)
  if (storedOfficerEmails.has(lower)) return true;

  // 4. Các đơn vị chính thức (Khoa, LCĐ, CLB, BCH Đoàn)
  if (EMAIL_TO_UNIT[lower]) return true;

  // 5. Tiền tố email đơn vị chính thức của Học Viện
  if (
    lower.startsWith('lcd') ||
    lower.startsWith('clb.') ||
    lower.startsWith('clb_') ||
    lower.startsWith('clb') ||
    lower.startsWith('doi') ||
    lower.startsWith('bch') ||
    lower.includes('bchdoan') ||
    lower.includes('phongctsv') ||
    lower.includes('ctsv') ||
    lower.includes('phongquantri') ||
    lower.includes('quantri') ||
    lower.includes('tchc') ||
    lower.includes('khoa') ||
    lower.includes('baove') ||
    lower.includes('security')
  ) {
    return true;
  }

  return false;
}

/**
 * Thu hồi quyền event_roles của sinh viên đối với các sự kiện đã kết thúc > 3 ngày.
 * @param supabase Client có quyền thao tác (admin client hoặc authenticated)
 * @param daysThreshold Số ngày sau khi sự kiện kết thúc thì thu hồi (mặc định: 3 ngày)
 */
export async function cleanupExpiredStudentEventRoles(
  supabase: any,
  daysThreshold: number = 3
): Promise<{ cleanedCount: number; expiredIds: (string | number)[] }> {
  if (!supabase) return { cleanedCount: 0, expiredIds: [] };

  try {
    // Ngưỡng thời gian: hôm nay - daysThreshold ngày
    const now = new Date();
    const thresholdDate = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);
    const thresholdDateStr = thresholdDate.toISOString().split('T')[0];

    // Lấy danh sách exempt (Super Admin, Cán bộ cố định) song song
    const [superAdminsRes, storedRolesRes, eventRolesRes] = await Promise.all([
      supabase.from('super_admins').select('email').then((r: any) => r.data || []).catch(() => []),
      getStoredOfficerRoles(supabase).catch(() => []),
      supabase
        .from('event_roles')
        .select('id, email, role_type, created_at, event_id, events(event_id, event_name, event_date, status, is_active)')
        .then((r: any) => r.data || [])
        .catch(() => []),
    ]);

    const superAdminEmails = new Set<string>(
      (superAdminsRes || []).map((sa: any) => (sa.email || '').toLowerCase().trim())
    );
    const storedOfficerEmails = new Set<string>(
      (storedRolesRes || []).map((so: any) => (so.email || '').toLowerCase().trim())
    );

    const expiredIds: (string | number)[] = [];

    for (const er of eventRolesRes || []) {
      const email = (er.email || '').toLowerCase().trim();
      if (!email) continue;

      // Nếu là đơn vị chính thức / cán bộ cố định -> BỎ QUA, GIỮ NGUYÊN
      if (isExemptFromAutoRevoke(email, superAdminEmails, storedOfficerEmails)) {
        continue;
      }

      // Đây là tài khoản sinh viên / cá nhân!
      // Kiểm tra xem sự kiện đã kết thúc quá 3 ngày chưa
      const ev = er.events as any;
      if (!ev) continue;

      const evDate = ev.event_date; // Format YYYY-MM-DD
      const isPastThreshold = evDate && evDate < thresholdDateStr;
      const isClosedLongAgo = ev.status === 'closed' && isPastThreshold;

      if (isPastThreshold || isClosedLongAgo) {
        if (er.id !== undefined && er.id !== null) {
          expiredIds.push(er.id);
        }
      }
    }

    // Thực hiện xóa theo lô các ID đã hết hạn
    if (expiredIds.length > 0) {
      // Chunking 50 ID / lần xóa để tránh giới hạn URL PostgREST
      const CHUNK_SIZE = 50;
      for (let i = 0; i < expiredIds.length; i += CHUNK_SIZE) {
        const chunk = expiredIds.slice(i, i + CHUNK_SIZE);
        await supabase.from('event_roles').delete().in('id', chunk);
      }
    }

    return { cleanedCount: expiredIds.length, expiredIds };
  } catch (err) {
    console.error('Lỗi cleanupExpiredStudentEventRoles:', err);
    return { cleanedCount: 0, expiredIds: [] };
  }
}
