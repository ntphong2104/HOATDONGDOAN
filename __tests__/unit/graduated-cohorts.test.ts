import {
  normalizeGraduatedRules,
  isStudentGraduated,
  getGraduatedBlockReason,
  getCohortGraduationStatus,
  isCohortFullyGraduated,
  LCD_DEFINITIONS,
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

  test('checks full cohort graduation status across all LCDs (0/8, partial, full, invalid)', () => {
    const emptyStatus = getCohortGraduationStatus('D22', []);
    expect(emptyStatus.isFullyGraduated).toBe(false);
    expect(emptyStatus.graduatedCount).toBe(0);
    expect(emptyStatus.totalLcds).toBe(LCD_DEFINITIONS.length);
    expect(emptyStatus.missingLcds).toHaveLength(LCD_DEFINITIONS.length);
    expect(isCohortFullyGraduated('D22', [])).toBe(false);

    const partialStatus = getCohortGraduationStatus('D21', rules);
    expect(partialStatus.isFullyGraduated).toBe(false);
    expect(partialStatus.graduatedCount).toBe(3);
    expect(partialStatus.totalLcds).toBe(LCD_DEFINITIONS.length);
    expect(partialStatus.missingLcds).toHaveLength(LCD_DEFINITIONS.length - 3);
    expect(isCohortFullyGraduated('D21', rules)).toBe(false);

    const fullRules: GraduatedCohortRule[] = LCD_DEFINITIONS.map((lcd) => ({
      lcd_code: lcd.code,
      cohort: 'D21',
    }));
    const fullStatus = getCohortGraduationStatus('d21', fullRules);
    expect(fullStatus.isFullyGraduated).toBe(true);
    expect(fullStatus.graduatedCount).toBe(LCD_DEFINITIONS.length);
    expect(fullStatus.missingLcds).toEqual([]);
    expect(isCohortFullyGraduated('D21', fullRules)).toBe(true);

    const invalidStatus = getCohortGraduationStatus('invalid', fullRules);
    expect(invalidStatus.isFullyGraduated).toBe(false);
    expect(invalidStatus.graduatedCount).toBe(0);
    expect(invalidStatus.missingLcds).toHaveLength(LCD_DEFINITIONS.length);
    expect(isCohortFullyGraduated('invalid', fullRules)).toBe(false);
  });
});
