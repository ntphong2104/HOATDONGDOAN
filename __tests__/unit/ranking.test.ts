import {
  DEFAULT_ACADEMIC_SEMESTERS,
  getActiveSemester,
  isEventInSemester,
} from '@/lib/utils/semesters';
import { LCD_DEFINITIONS, resolveStudentLcd } from '@/lib/utils/lcd';
import { getMasterStudentDirectory } from '@/lib/utils/student-profile';

describe('Academic Semesters & Ranking Unit Tests', () => {
  it('has at least 5 default academic semesters defined', () => {
    expect(DEFAULT_ACADEMIC_SEMESTERS.length).toBeGreaterThanOrEqual(5);
    const active = DEFAULT_ACADEMIC_SEMESTERS.find((s) => s.is_active);
    expect(active).toBeDefined();
    expect(active?.id).toBe('HK1-2026-2027');
  });

  it('correctly resolves active semester', () => {
    const active = getActiveSemester(DEFAULT_ACADEMIC_SEMESTERS);
    expect(active.is_active).toBe(true);
    expect(active.id).toBe('HK1-2026-2027');
  });

  it('correctly checks if an event date falls within semester', () => {
    const sem = DEFAULT_ACADEMIC_SEMESTERS[0]; // 2026-09-01 -> 2027-01-31
    expect(isEventInSemester('2026-10-15', sem)).toBe(true);
    expect(isEventInSemester('2026-09-01', sem)).toBe(true);
    expect(isEventInSemester('2027-01-31', sem)).toBe(true);
    expect(isEventInSemester('2026-08-30', sem)).toBe(false);
    expect(isEventInSemester('2027-02-05', sem)).toBe(false);
  });

  it('loads all 8 official LCĐs with non-zero student counts', () => {
    const masterDir = getMasterStudentDirectory();
    expect(masterDir.size).toBe(4491);

    const counts = new Map<string, number>();
    for (const [rawMssv, info] of masterDir.entries()) {
      const classId = info.class_id;
      const lcd = resolveStudentLcd(classId, rawMssv);
      if (lcd) {
        counts.set(lcd.code, (counts.get(lcd.code) || 0) + 1);
      }
    }

    expect(LCD_DEFINITIONS.length).toBe(8);
    for (const lcd of LCD_DEFINITIONS) {
      const count = counts.get(lcd.code) || 0;
      expect(count).toBeGreaterThan(0);
    }
    expect(counts.get('LCD_CNTT')).toBe(1170);
  });
});
