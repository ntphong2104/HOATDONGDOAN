import fs from 'fs';
import path from 'path';
import { writeJsonFileAtomicSync } from '@/lib/utils/atomic-file';

export type DutyShift = 'morning' | 'afternoon';

export interface ShiftTimeRange {
  start: string; // HH:mm
  end: string;   // HH:mm
  label: string;
}

export interface OfficeDutyConfig {
  max_per_shift: number;
  early_checkin_minutes: number;
  late_checkout_minutes: number;
  require_ip_check: boolean;
  allowed_ips: string[];
  allow_localhost: boolean;
  ban_days_on_late_return: number;
  shifts: Record<DutyShift, ShiftTimeRange>;
}

export const DEFAULT_OFFICE_DUTY_CONFIG: OfficeDutyConfig = {
  max_per_shift: 2,
  early_checkin_minutes: 30,
  late_checkout_minutes: 30,
  require_ip_check: true,
  allowed_ips: [],
  allow_localhost: true,
  ban_days_on_late_return: 30,
  shifts: {
    morning: { start: '07:30', end: '11:30', label: 'Ca Sáng (07:30 – 11:30)' },
    afternoon: { start: '13:00', end: '17:00', label: 'Ca Chiều (13:00 – 17:00)' },
  },
};

export const OFFICE_DUTY_CONFIG_KEY = 'office_duty_config';
const LOCAL_CONFIG_FILE = path.join(process.cwd(), 'data', 'office-duty-config.json');

export function normalizeConfig(raw: any): OfficeDutyConfig {
  const base = DEFAULT_OFFICE_DUTY_CONFIG;
  if (!raw || typeof raw !== 'object') return { ...base, shifts: { ...base.shifts } };
  const allowedIps = Array.isArray(raw.allowed_ips)
    ? raw.allowed_ips.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];
  return {
    max_per_shift: Math.max(1, Number(raw.max_per_shift) || base.max_per_shift),
    early_checkin_minutes:
      Number.isFinite(Number(raw.early_checkin_minutes)) && Number(raw.early_checkin_minutes) >= 0
        ? Number(raw.early_checkin_minutes)
        : base.early_checkin_minutes,
    late_checkout_minutes:
      Number.isFinite(Number(raw.late_checkout_minutes)) && Number(raw.late_checkout_minutes) >= 0
        ? Number(raw.late_checkout_minutes)
        : base.late_checkout_minutes,
    require_ip_check:
      typeof raw.require_ip_check === 'boolean' ? raw.require_ip_check : base.require_ip_check,
    allowed_ips: allowedIps,
    allow_localhost:
      typeof raw.allow_localhost === 'boolean' ? raw.allow_localhost : base.allow_localhost,
    ban_days_on_late_return: Math.max(
      1,
      Number(raw.ban_days_on_late_return) || base.ban_days_on_late_return
    ),
    shifts: {
      morning: {
        start: String(raw.shifts?.morning?.start || base.shifts.morning.start),
        end: String(raw.shifts?.morning?.end || base.shifts.morning.end),
        label: `Ca Sáng (${raw.shifts?.morning?.start || base.shifts.morning.start} – ${raw.shifts?.morning?.end || base.shifts.morning.end})`,
      },
      afternoon: {
        start: String(raw.shifts?.afternoon?.start || base.shifts.afternoon.start),
        end: String(raw.shifts?.afternoon?.end || base.shifts.afternoon.end),
        label: `Ca Chiều (${raw.shifts?.afternoon?.start || base.shifts.afternoon.start} – ${raw.shifts?.afternoon?.end || base.shifts.afternoon.end})`,
      },
    },
  };
}

export async function getOfficeDutyConfig(supabase: any): Promise<OfficeDutyConfig> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', OFFICE_DUTY_CONFIG_KEY)
      .maybeSingle();
    if (!error && data?.value) {
      return normalizeConfig(data.value);
    }
  } catch {}

  try {
    if (fs.existsSync(LOCAL_CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_CONFIG_FILE, 'utf8'));
      return normalizeConfig(parsed);
    }
  } catch {}

  return normalizeConfig(null);
}

export async function saveOfficeDutyConfig(
  supabase: any,
  input: Partial<OfficeDutyConfig>,
  updatedBy: string
): Promise<{ ok: boolean; config: OfficeDutyConfig }> {
  const config = normalizeConfig(input);
  let dbSaved = false;
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          key: OFFICE_DUTY_CONFIG_KEY,
          value: JSON.stringify(config),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      );
    if (!error) dbSaved = true;
  } catch {}

  let localSaved = false;
  try {
    writeJsonFileAtomicSync(LOCAL_CONFIG_FILE, config);
    localSaved = true;
  } catch {}

  return { ok: dbSaved || localSaved, config };
}

/**
 * Kiểm tra ngày YYYY-MM-DD có phải Thứ 2 -> Thứ 6 không (giờ VN).
 */
export function isWeekday(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(`${dateStr}T12:00:00+07:00`);
  if (isNaN(d.getTime())) return false;
  const day = d.getUTCDay(); // At 12:00+07:00 (= 05:00Z), UTC day === VN day
  return day >= 1 && day <= 5;
}

/**
 * Lấy danh sách 5 ngày Thứ 2 -> Thứ 6 của tuần chứa `anchorDate` (YYYY-MM-DD).
 */
export function getWeekWorkdays(anchorDateStr?: string | null): string[] {
  const baseStr =
    anchorDateStr && /^\d{4}-\d{2}-\d{2}$/.test(anchorDateStr)
      ? anchorDateStr
      : getTodayVN();
  const d = new Date(`${baseStr}T12:00:00+07:00`);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d.getTime() + diffToMon * 86_400_000);
  const res: string[] = [];
  for (let i = 0; i < 5; i++) {
    const cur = new Date(monday.getTime() + i * 86_400_000);
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    res.push(`${y}-${m}-${dd}`);
  }
  return res;
}

/**
 * Ngày hôm nay theo giờ Việt Nam (+07:00) dạng YYYY-MM-DD.
 */
export function getTodayVN(now: Date = new Date()): string {
  const vnMs = now.getTime() + 7 * 60 * 60 * 1000;
  const d = new Date(vnMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function buildVnTimestamp(dateStr: string, hhmm: string): number {
  return new Date(`${dateStr}T${hhmm}:00+07:00`).getTime();
}

export interface ShiftWindowCheck {
  allowed: boolean;
  reason?: string;
  lateMinutes?: number;
  windowStartIso?: string;
  windowEndIso?: string;
}

/**
 * Kiểm tra thời gian Check-in ca trực:
 * Được phép check-in sớm tối đa `early_checkin_minutes` (mặc định 30 phút) trước giờ vào ca,
 * đến hết giờ ca trực.
 */
export function validateCheckInWindow(
  dutyDate: string,
  shift: DutyShift,
  config: OfficeDutyConfig = DEFAULT_OFFICE_DUTY_CONFIG,
  now: Date = new Date()
): ShiftWindowCheck {
  const range = config.shifts[shift];
  const startMs = buildVnTimestamp(dutyDate, range.start);
  const endMs = buildVnTimestamp(dutyDate, range.end);
  const earliestMs = startMs - config.early_checkin_minutes * 60_000;
  const nowMs = now.getTime();

  if (nowMs < earliestMs) {
    return {
      allowed: false,
      reason: `Chưa đến giờ check-in. Chỉ được check-in sớm tối đa ${config.early_checkin_minutes} phút trước giờ bắt đầu ca (${range.start}).`,
      windowStartIso: new Date(earliestMs).toISOString(),
      windowEndIso: new Date(endMs).toISOString(),
    };
  }
  if (nowMs > endMs) {
    return {
      allowed: false,
      reason: `Ca trực đã kết thúc lúc ${range.end}, không thể check-in nữa.`,
      windowStartIso: new Date(earliestMs).toISOString(),
      windowEndIso: new Date(endMs).toISOString(),
    };
  }

  const lateMinutes = nowMs > startMs ? Math.floor((nowMs - startMs) / 60_000) : 0;
  return {
    allowed: true,
    lateMinutes,
    windowStartIso: new Date(earliestMs).toISOString(),
    windowEndIso: new Date(endMs).toISOString(),
  };
}

/**
 * Kiểm tra thời gian Check-out ca trực:
 * Được phép check-out từ sau khi đã check-in đến trễ tối đa `late_checkout_minutes` (mặc định 30 phút)
 * sau giờ kết thúc ca trực.
 */
export function validateCheckOutWindow(
  dutyDate: string,
  shift: DutyShift,
  config: OfficeDutyConfig = DEFAULT_OFFICE_DUTY_CONFIG,
  now: Date = new Date()
): ShiftWindowCheck {
  const range = config.shifts[shift];
  const startMs = buildVnTimestamp(dutyDate, range.start);
  const endMs = buildVnTimestamp(dutyDate, range.end);
  const latestMs = endMs + config.late_checkout_minutes * 60_000;
  const nowMs = now.getTime();

  if (nowMs < startMs - config.early_checkin_minutes * 60_000) {
    return {
      allowed: false,
      reason: `Chưa đến khung giờ ca trực (${range.start} – ${range.end}).`,
    };
  }
  if (nowMs > latestMs) {
    return {
      allowed: false,
      reason: `Đã quá hạn check-out (tối đa trễ ${config.late_checkout_minutes} phút sau ${range.end}). Vui lòng liên hệ Admin Văn phòng Đoàn để xử lý.`,
      windowStartIso: new Date(startMs).toISOString(),
      windowEndIso: new Date(latestMs).toISOString(),
    };
  }

  return {
    allowed: true,
    windowStartIso: new Date(startMs).toISOString(),
    windowEndIso: new Date(latestMs).toISOString(),
  };
}

/**
 * Trích xuất địa chỉ IP client từ request headers (Cloudflare / Nginx / Next.js).
 */
export function extractClientIp(req: Request): string {
  const h = req.headers;
  const candidates = [
    h.get('cf-connecting-ip'),
    h.get('x-real-ip'),
    h.get('x-forwarded-for')?.split(',')[0],
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const cleaned = raw.trim().replace(/^::ffff:/i, '');
    if (cleaned) return cleaned;
  }
  return '127.0.0.1';
}

/**
 * Kiểm tra IP client có thuộc mạng WiFi Văn phòng Đoàn được cấu hình hay không.
 * Hỗ trợ IP chính xác (VD: 113.161.72.10) hoặc tiền tố (VD: 113.161.72.* hoặc 113.161.72.).
 */
export function isIpAllowedForOffice(
  clientIp: string,
  config: OfficeDutyConfig
): { allowed: boolean; reason?: string } {
  if (!config.require_ip_check) {
    return { allowed: true };
  }

  const ip = String(clientIp || '').trim().replace(/^::ffff:/i, '');
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
  if (isLocal && config.allow_localhost) {
    return { allowed: true };
  }

  if (!config.allowed_ips || config.allowed_ips.length === 0) {
    return {
      allowed: false,
      reason: `Admin Văn phòng Đoàn chưa cấu hình danh sách IP mạng VPĐ (IP hiện tại của bạn: ${ip}).`,
    };
  }

  for (const ruleRaw of config.allowed_ips) {
    const rule = String(ruleRaw || '').trim().replace(/^::ffff:/i, '');
    if (!rule) continue;
    if (rule === ip) return { allowed: true };
    if (rule.endsWith('*')) {
      const prefix = rule.slice(0, -1);
      if (prefix && ip.startsWith(prefix)) return { allowed: true };
    } else if (rule.endsWith('.')) {
      if (ip.startsWith(rule)) return { allowed: true };
    }
  }

  return {
    allowed: false,
    reason: `Bạn không kết nối đúng mạng WiFi Văn phòng Đoàn (IP hiện tại: ${ip}). Vui lòng chuyển sang WiFi VPĐ để chấm công.`,
  };
}

/**
 * Tính số ngày trả trễ của đơn mượn dụng cụ (theo lịch ngày Việt Nam +07:00).
 * Trả trong ngày hẹn trả hoặc sớm hơn -> 0.
 * Trả từ ngày hôm sau trở đi -> >= 1 ngày trễ -> tự động cấm mượn!
 */
export function computeBorrowLateDays(
  dueDateStr: string,
  returnedAt: Date = new Date()
): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateStr)) return 0;
  const returnDateVN = getTodayVN(returnedAt);
  const dueMs = new Date(`${dueDateStr}T00:00:00Z`).getTime();
  const retMs = new Date(`${returnDateVN}T00:00:00Z`).getTime();
  const diffDays = Math.floor((retMs - dueMs) / 86_400_000);
  return Math.max(0, diffDays);
}
