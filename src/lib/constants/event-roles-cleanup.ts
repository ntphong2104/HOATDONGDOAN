// ═══════════════════════════════════════════════════════════════════════════
// src/lib/constants/event-roles-cleanup.ts
// Tự động thu hồi quyền Admin / Checker theo từng sự kiện sau khi
// sự kiện đã kết thúc quá 3 ngày — áp dụng cho TẤT CẢ tài khoản
// (sinh viên cá nhân lẫn tài khoản đơn vị LCĐ / CLB / Đội).
//
// Chỉ giữ vĩnh viễn quyền của: Super Admin và cán bộ cấp phòng ban
// (Đoàn Học Viện, CTSV, TC-HC-QT, Bảo vệ) — những người vốn đã có quyền
// rộng hơn quyền theo từng sự kiện.
//
// Lưu ý: tài khoản đơn vị vẫn giữ quyền đơn vị (tier event_admin trong
// danh sách Cán bộ) và vẫn xem được sự kiện do chính mình tạo (created_by).
// Chỉ quyền gắn với TỪNG sự kiện đã kết thúc bị thu hồi.
// ═══════════════════════════════════════════════════════════════════════════

import { ROOT_SUPER_ADMIN, getStoredOfficerRoles } from './officers-store';
import { getOfficialTierForEmail } from '@/lib/auth/official-roles';
import { isEventLockedPast3Days } from '@/lib/utils/event-logic';

/** Cấp cán bộ được giữ quyền sự kiện vĩnh viễn (không bị thu hồi tự động). */
const PERMANENT_OFFICER_TIERS = new Set(['super_admin', 'youth_union', 'ctsv', 'facility', 'security']);

/**
 * Từ danh sách cán bộ đã lưu, lấy ra email của những cán bộ cấp phòng ban trở lên.
 * Tài khoản đơn vị (role_tier = 'event_admin') KHÔNG nằm trong danh sách này.
 */
export function buildPermanentOfficerEmailSet(
  storedOfficers: { email?: string | null; role_tier?: string | null }[] = []
): Set<string> {
  const set = new Set<string>();
  for (const o of storedOfficers || []) {
    const email = (o?.email || '').toLowerCase().trim();
    if (email && o?.role_tier && PERMANENT_OFFICER_TIERS.has(o.role_tier)) {
      set.add(email);
    }
  }
  return set;
}

/**
 * Kiểm tra xem một email có được miễn thu hồi quyền sự kiện tự động không.
 * Chỉ Super Admin và cán bộ cấp phòng ban được miễn.
 * (So khớp email CHÍNH XÁC — không dùng chuỗi con.)
 */
export function isExemptFromAutoRevoke(
  email: string,
  superAdminEmails: Set<string> = new Set(),
  permanentOfficerEmails: Set<string> = new Set()
): boolean {
  if (!email) return false;
  const lower = email.toLowerCase().trim();

  // 1. Root Super Admin
  if (lower === ROOT_SUPER_ADMIN.toLowerCase()) return true;

  // 2. Super Admins trong database
  if (superAdminEmails.has(lower)) return true;

  // 3. Cán bộ cấp phòng ban được Super Admin phân quyền
  if (permanentOfficerEmails.has(lower)) return true;

  // 4. Tài khoản phòng ban chính thức (danh sách email cố định)
  if (getOfficialTierForEmail(lower)) return true;

  return false;
}

/**
 * Lấy danh sách buổi (sessions) của nhiều sự kiện trong 1 truy vấn,
 * để xác định chính xác ngày kết thúc thực tế của sự kiện nhiều buổi.
 */
export async function fetchEventSessionsMap(
  supabase: any,
  eventIds: (string | number)[]
): Promise<Map<string, any[]>> {
  const map = new Map<string, any[]>();
  const ids = [...new Set((eventIds || []).filter((id) => id !== null && id !== undefined).map(String))];
  if (!supabase || ids.length === 0) return map;

  const CHUNK_SIZE = 100;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const keys = ids.slice(i, i + CHUNK_SIZE).map((id) => `event_meta_${id}`);
    try {
      const { data } = await supabase.from('system_settings').select('key, value').in('key', keys);
      for (const row of data || []) {
        try {
          const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
          if (Array.isArray(parsed?.sessions)) {
            map.set(String(row.key).replace('event_meta_', ''), parsed.sessions);
          }
        } catch {}
      }
    } catch {}
  }
  return map;
}

/**
 * Quyền theo sự kiện đã hết hạn khi sự kiện KHÔNG còn 'active' và đã kết thúc
 * (theo buổi cuối cùng) quá 3 ngày. Sự kiện đang active không bao giờ bị thu hồi.
 */
export function isEventRoleExpired(ev: any, sessions?: any[] | null): boolean {
  if (!ev) return false;
  return isEventLockedPast3Days({
    event_date: ev.event_date,
    start_time: ev.start_time,
    end_time: ev.end_time,
    status: ev.status,
    sessions: sessions || null,
  });
}

/**
 * Thu hồi quyền event_roles đối với các sự kiện đã kết thúc > 3 ngày.
 * @param supabase Client có quyền thao tác (admin client hoặc authenticated)
 * @param _daysThreshold Giữ để tương thích — ngưỡng hiện cố định 3 ngày theo isEventLockedPast3Days
 */
export async function cleanupExpiredStudentEventRoles(
  supabase: any,
  _daysThreshold: number = 3
): Promise<{ cleanedCount: number; expiredIds: (string | number)[] }> {
  if (!supabase) return { cleanedCount: 0, expiredIds: [] };

  try {
    const [superAdminsRes, storedRolesRes, eventRolesRes] = await Promise.all([
      supabase.from('super_admins').select('email').then((r: any) => r.data || []).catch(() => []),
      getStoredOfficerRoles(supabase).catch(() => []),
      supabase
        .from('event_roles')
        .select('id, email, role_type, created_at, event_id, events(event_id, event_name, event_date, start_time, end_time, status, is_active)')
        .then((r: any) => r.data || [])
        .catch(() => []),
    ]);

    const superAdminEmails = new Set<string>(
      (superAdminsRes || []).map((sa: any) => (sa.email || '').toLowerCase().trim())
    );
    const permanentOfficerEmails = buildPermanentOfficerEmailSet(storedRolesRes || []);
    const sessionsMap = await fetchEventSessionsMap(
      supabase,
      (eventRolesRes || []).map((er: any) => er.event_id)
    );

    const expiredIds: (string | number)[] = [];

    for (const er of eventRolesRes || []) {
      const email = (er.email || '').toLowerCase().trim();
      if (!email) continue;

      if (isExemptFromAutoRevoke(email, superAdminEmails, permanentOfficerEmails)) {
        continue;
      }

      const ev = er.events as any;
      if (!ev) continue;

      if (isEventRoleExpired(ev, sessionsMap.get(String(er.event_id)))) {
        if (er.id !== undefined && er.id !== null) {
          expiredIds.push(er.id);
        }
      }
    }

    // Thực hiện xóa theo lô, chỉ đếm những dòng thực sự đã bị xóa
    let cleanedCount = 0;
    const deletedIds: (string | number)[] = [];
    if (expiredIds.length > 0) {
      // Chunking 50 ID / lần xóa để tránh giới hạn URL PostgREST
      const CHUNK_SIZE = 50;
      for (let i = 0; i < expiredIds.length; i += CHUNK_SIZE) {
        const chunk = expiredIds.slice(i, i + CHUNK_SIZE);
        const { data: deleted, error } = await supabase
          .from('event_roles')
          .delete()
          .in('id', chunk)
          .select('id');
        if (error) {
          console.error('[cleanupExpiredEventRoles] Delete failed:', error);
          continue;
        }
        for (const d of deleted || []) deletedIds.push(d.id);
        cleanedCount += (deleted || []).length;
      }
    }

    return { cleanedCount, expiredIds: deletedIds };
  } catch (err) {
    console.error('Lỗi cleanupExpiredStudentEventRoles:', err);
    return { cleanedCount: 0, expiredIds: [] };
  }
}
