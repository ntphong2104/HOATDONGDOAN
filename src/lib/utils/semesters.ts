import fs from 'fs';
import path from 'path';
import type { AcademicSemester } from '@/lib/types';
import { writeJsonFileAtomicSync } from '@/lib/utils/atomic-file';
import { getVietnamDateString } from '@/lib/utils/vn-date';

export const DEFAULT_ACADEMIC_SEMESTERS: AcademicSemester[] = [
  {
    id: 'HK1-2026-2027',
    name: 'Học kỳ 1 (2026 - 2027)',
    academic_year: '2026 - 2027',
    start_date: '2026-09-01',
    end_date: '2027-01-31',
    is_active: true,
    notes: 'Học kỳ chính mùa Thu - Đông',
  },
  {
    id: 'HK2-2026-2027',
    name: 'Học kỳ 2 (2026 - 2027)',
    academic_year: '2026 - 2027',
    start_date: '2027-02-01',
    end_date: '2027-06-30',
    is_active: false,
    notes: 'Học kỳ chính mùa Xuân - Hè',
  },
  {
    id: 'HK-HE-2026-2027',
    name: 'Học kỳ Hè (2026 - 2027)',
    academic_year: '2026 - 2027',
    start_date: '2027-07-01',
    end_date: '2027-08-31',
    is_active: false,
    notes: 'Chiến dịch Mùa hè xanh & Học kỳ hè',
  },
  {
    id: 'HK1-2025-2026',
    name: 'Học kỳ 1 (2025 - 2026)',
    academic_year: '2025 - 2026',
    start_date: '2025-09-01',
    end_date: '2026-01-31',
    is_active: false,
    notes: 'Năm học trước',
  },
  {
    id: 'HK2-2025-2026',
    name: 'Học kỳ 2 (2025 - 2026)',
    academic_year: '2025 - 2026',
    start_date: '2026-02-01',
    end_date: '2026-06-30',
    is_active: false,
    notes: 'Năm học trước',
  },
];

export const SYSTEM_SETTINGS_SEMESTERS_KEY = 'academic_semesters';

const LOCAL_SEMESTERS_FILE = path.join(process.cwd(), 'data', 'semesters.json');

function readLocalSemestersFallback(): AcademicSemester[] | null {
  try {
    if (fs.existsSync(LOCAL_SEMESTERS_FILE)) {
      const raw = fs.readFileSync(LOCAL_SEMESTERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as AcademicSemester[];
      }
    }
  } catch {}
  return null;
}

function writeLocalSemestersFallback(semesters: AcademicSemester[]): boolean {
  try {
    writeJsonFileAtomicSync(LOCAL_SEMESTERS_FILE, semesters);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lấy danh sách cấu hình học kỳ từ system_settings (fallback local file / mặc định).
 */
export async function getAcademicSemesters(supabase: any): Promise<AcademicSemester[]> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SYSTEM_SETTINGS_SEMESTERS_KEY)
      .maybeSingle();

    if (!error && data?.value && Array.isArray(data.value) && data.value.length > 0) {
      return data.value as AcademicSemester[];
    }
  } catch {}

  const localSaved = readLocalSemestersFallback();
  if (localSaved) return localSaved;

  return DEFAULT_ACADEMIC_SEMESTERS;
}

/**
 * Lưu danh sách học kỳ do Super Admin chỉnh sửa/gán thời gian.
 * Lưu vào bảng system_settings trên Supabase; nếu môi trường local chưa có service_role/INSERT RLS,
 * tự động fallback sang data/semesters.json để Super Admin vẫn thao tác mượt mà khi test local.
 */
export async function saveAcademicSemesters(
  supabase: any,
  semesters: AcademicSemester[],
  updatedBy: string
): Promise<boolean> {
  const sanitized: AcademicSemester[] = semesters.map((s) => ({
    id: String(s.id).trim(),
    name: String(s.name).trim(),
    academic_year: String(s.academic_year || '').trim(),
    start_date: String(s.start_date).trim(),
    end_date: String(s.end_date).trim(),
    is_active: Boolean(s.is_active),
    notes: s.notes ? String(s.notes).trim() : '',
    updated_at: new Date().toISOString(),
  }));

  let dbSaved = false;
  try {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        {
          key: SYSTEM_SETTINGS_SEMESTERS_KEY,
          value: sanitized,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        },
        { onConflict: 'key' }
      );
    if (!error) {
      dbSaved = true;
    } else {
      console.warn('[semesters] DB upsert failed (likely RLS without service role), falling back to local file:', error.message);
    }
  } catch (err) {
    console.warn('[semesters] DB upsert exception, falling back to local file:', err);
  }

  // Luôn đồng bộ bản lưu cục bộ (hoặc dùng khi local dev chưa bật service role)
  const localSaved = writeLocalSemestersFallback(sanitized);
  return dbSaved || localSaved;
}

/**
 * Lấy học kỳ đang kích hoạt hoặc học kỳ phù hợp với ngày hiện tại.
 */
export function getActiveSemester(semesters: AcademicSemester[]): AcademicSemester {
  if (!semesters || semesters.length === 0) return DEFAULT_ACADEMIC_SEMESTERS[0];
  const active = semesters.find((s) => s.is_active);
  if (active) return active;

  const todayStr = getVietnamDateString(0);
  const currentByDate = semesters.find(
    (s) => s.start_date <= todayStr && s.end_date >= todayStr
  );
  return currentByDate || semesters[0];
}

/**
 * Kiểm tra một ngày sự kiện có nằm trong khoảng thời gian của học kỳ không.
 */
export function isEventInSemester(
  eventDate?: string | null,
  semester?: AcademicSemester | null
): boolean {
  if (!eventDate || !semester) return false;
  const d = String(eventDate).trim().split('T')[0];
  return d >= semester.start_date && d <= semester.end_date;
}
