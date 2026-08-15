import { extractMSSV, isValidSchoolEmail } from '@/lib/utils/extract-mssv';

describe('Unit Tests: extractMSSV & isValidSchoolEmail', () => {
  describe('extractMSSV', () => {
    test('extracts uppercase MSSV from valid student email (@student.ptithcm.edu.vn)', () => {
      expect(extractMSSV('n22dccn001@student.ptithcm.edu.vn')).toBe('N22DCCN001');
      expect(extractMSSV('B21DCDT999@student.ptithcm.edu.vn')).toBe('B21DCDT999');
      expect(extractMSSV('b20dcpt123@student.ptithcm.edu.vn')).toBe('B20DCPT123');
    });

    test('extracts uppercase MSSV from faculty/teacher domain if formatted as MSSV', () => {
      expect(extractMSSV('n22dccn001@ptithcm.edu.vn')).toBe('N22DCCN001');
    });

    test('returns null for faculty username that is not MSSV format', () => {
      expect(extractMSSV('thanhphong@ptithcm.edu.vn')).toBeNull();
      expect(extractMSSV('gv_hoa@ptithcm.edu.vn')).toBeNull();
    });

    test('returns null for non-school email domains', () => {
      expect(extractMSSV('student@gmail.com')).toBeNull();
      expect(extractMSSV('n22dccn001@hust.edu.vn')).toBeNull();
      expect(extractMSSV('n22dccn001@ptit.edu.vn')).toBeNull();
    });

    test('handles empty or malformed email strings gracefully', () => {
      expect(extractMSSV('')).toBeNull();
      expect(extractMSSV('invalid-email')).toBeNull();
      expect(extractMSSV('@student.ptithcm.edu.vn')).toBe('');
    });
  });

  describe('isValidSchoolEmail', () => {
    test('returns true for emails matching @student.ptithcm.edu.vn (students) and @ptithcm.edu.vn (faculty)', () => {
      expect(isValidSchoolEmail('an.nv@student.ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmail('n22dccn001@student.ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmail('teacher@ptithcm.edu.vn')).toBe(true);
      expect(isValidSchoolEmail('phongctsv@ptithcm.edu.vn')).toBe(true);
    });

    test('returns false for external emails', () => {
      expect(isValidSchoolEmail('an.nv@gmail.com')).toBe(false);
      expect(isValidSchoolEmail('admin@yahoo.com')).toBe(false);
      expect(isValidSchoolEmail('student@hcmus.edu.vn')).toBe(false);
    });
  });
});
