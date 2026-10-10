import {
  isPlaceholderName,
  isPlaceholderClass,
  parseGoogleStudentName,
  normalizeStudentFullName,
  normalizeStudentClassId,
} from '@/lib/utils/student-profile';

describe('student-profile helpers', () => {
  it('detects placeholder names', () => {
    expect(isPlaceholderName('N25DCMR097', 'N25DCMR097')).toBe(true);
    expect(isPlaceholderName('n25dcmr097', 'N25DCMR097')).toBe(true);
    expect(isPlaceholderName('', 'N25DCMR097')).toBe(true);
    expect(isPlaceholderName('a@student.ptithcm.edu.vn', 'X')).toBe(true);
    expect(isPlaceholderName('LE NGOC BAO LINH', 'N25DCMR097')).toBe(false);
  });

  it('detects placeholder classes', () => {
    expect(isPlaceholderClass('PTIT-HCM')).toBe(true);
    expect(isPlaceholderClass('')).toBe(true);
    expect(isPlaceholderClass('D25CQMR02-N')).toBe(false);
  });

  it('parses PTIT Google display names', () => {
    expect(parseGoogleStudentName('D22CQCN02-N NGUYEN THANH PHONG')).toEqual({
      full_name: 'NGUYEN THANH PHONG',
      class_id: 'D22CQCN02-N',
    });
    expect(parseGoogleStudentName('Nguyễn Văn An')).toEqual({ full_name: 'Nguyễn Văn An', class_id: null });
    expect(parseGoogleStudentName('')).toEqual({ full_name: null, class_id: null });
  });

  it('validates names', () => {
    expect(normalizeStudentFullName('  Nguyễn   Văn  An ')).toBe('Nguyễn Văn An');
    expect(normalizeStudentFullName('N25DCMR097')).toBeNull();
    expect(normalizeStudentFullName('An')).toBeNull();
    expect(normalizeStudentFullName('<script>x</script> a')).toBeNull();
  });

  it('validates class ids', () => {
    expect(normalizeStudentClassId(' d25cqmr02-n ')).toBe('D25CQMR02-N');
    expect(normalizeStudentClassId('PTIT-HCM')).toBeNull();
    expect(normalizeStudentClassId('abc')).toBeNull();
  });
});
