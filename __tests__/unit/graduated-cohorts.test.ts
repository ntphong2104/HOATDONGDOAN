import {
  normalizeGraduatedRules,
  isStudentGraduated,
  getGraduatedBlockReason,
  type GraduatedCohortRule,
} from '@/lib/utils/graduated-cohorts';

describe('graduated-cohorts', () => {
  const rules: GraduatedCohortRule[] = [
    { lcd_code: 'LCD_QTKD', cohort: 'D21' },
    { lcd_code: 'LCD_KT', cohort: 'D21' },
    { lcd_code: 'LCD_MKT', cohort: 'D21' },
  ];

  test('marks economic faculty D21 student as graduated while keeping IT D21 active', () => {
    // QTKD D21 -> graduated
    expect(isStudentGraduated('N21DCQT015', 'D21CQQT01-N', rules)).toBe(true);
    expect(getGraduatedBlockReason('N21DCQT015', 'D21CQQT01-N', rules)).toContain('D21');

    // CNTT D21 (4.5-5 year engineering program) -> still active!
    expect(isStudentGraduated('N21DCCN015', 'D21CQCN01-N', rules)).toBe(false);
    expect(getGraduatedBlockReason('N21DCCN015', 'D21CQCN01-N', rules)).toBeNull();

    // QTKD D22 -> still active!
    expect(isStudentGraduated('N22DCQT015', 'D22CQQT01-N', rules)).toBe(false);
  });

  test('normalizes and deduplicates rules safely', () => {
    const normalized = normalizeGraduatedRules([
      { lcd_code: 'lcd_qtkd', cohort: '21' },
      { lcd_code: 'LCD_QTKD', cohort: 'D21' },
      { lcd_code: 'INVALID', cohort: 'D21' },
    ]);
    expect(normalized).toEqual([{ lcd_code: 'LCD_QTKD', cohort: 'D21' }]);
  });
});
