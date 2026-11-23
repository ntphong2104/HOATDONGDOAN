import * as XLSX from 'xlsx';
import { buildStyledWorkbookBuffer } from '@/lib/utils/styled-excel';

function extractZipEntryUtf8(zipBuffer: Uint8Array, targetPath: string): string {
  const view = new DataView(zipBuffer.buffer, zipBuffer.byteOffset, zipBuffer.byteLength);
  const decoder = new TextDecoder('utf-8');
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;

    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const entryName = decoder.decode(zipBuffer.subarray(nameStart, nameStart + nameLen));

    if (entryName === targetPath) {
      return decoder.decode(zipBuffer.subarray(dataStart, dataStart + compSize));
    }

    offset = dataStart + compSize;
  }

  throw new Error(`ZIP entry not found: ${targetPath}`);
}

describe('Unit Tests: styled-excel OpenXML generator', () => {
  test('generates valid multi-sheet ECMA-376 .xlsx parseable by SheetJS with headers at Row 7, merges, numbers & sanitized formulas', () => {
    const buffer = buildStyledWorkbookBuffer([
      {
        sheetName: 'TongQuan_HocKy',
        reportTitle: 'BÁO CÁO TỔNG QUAN ĐIỀU HÀNH HOẠT ĐỘNG ĐOÀN',
        reportSubtitle: 'Học kỳ 1 (2026 - 2027)',
        showSignatureBlock: true,
        columns: [
          { key: 'stt', label: 'STT', align: 'center', width: 7, numFmt: 'rawInt' },
          { key: 'metric', label: 'Chỉ Tiêu Điều Hành', align: 'left', width: 32, tone: 'bold' },
          { key: 'value', label: 'Kết Quả', align: 'right', width: 16, numFmt: 'int' },
          { key: 'detail', label: 'Diễn Giải Chi Tiết', align: 'left', width: 42 },
          { key: 'status', label: 'Trạng Thái', align: 'center', width: 18 },
        ],
        rows: [
          {
            stt: 1,
            metric: 'Tổng đoàn viên đang học',
            value: 6638,
            detail: '• Đã trừ khóa tốt nghiệp\n• Đồng bộ tự động từ PTIT HCM',
            status: 'Ổn định',
          },
          {
            stt: 2,
            metric: 'Công thức kiểm thử an toàn',
            value: 100,
            detail: '=CMD("calc")',
            status: 'Cần đôn đốc',
          },
        ],
        summaryRow: {
          stt: '',
          metric: 'TỔNG CỘNG',
          value: 6738,
          detail: 'Tổng hợp toàn hệ thống',
          status: 'Hoàn thành',
        },
      },
      {
        sheetName: 'SucKhoe_8LCD:Invalid*Chars?',
        reportTitle: 'ĐÁNH GIÁ 8 LIÊN CHI ĐOÀN',
        rows: [
          { 'STT': 1, 'Liên Chi Đoàn': 'LCĐ Công nghệ Thông tin', 'Số lượt': 1250 },
        ],
      },
    ]);

    expect(buffer).toBeInstanceOf(Uint8Array);
    expect(buffer.length).toBeGreaterThan(500);

    // 1. Parse real ZIP/OpenXML with SheetJS
    const wb = XLSX.read(buffer, { type: 'array' });
    expect(wb.SheetNames).toEqual(['TongQuan_HocKy', 'SucKhoe_8LCD_Invalid_Chars_']);

    const ws1 = wb.Sheets['TongQuan_HocKy'];
    expect(ws1['A4']?.v).toBe('BÁO CÁO TỔNG QUAN ĐIỀU HÀNH HOẠT ĐỘNG ĐOÀN');
    expect(ws1['A7']?.v).toBe('STT');
    expect(ws1['B7']?.v).toBe('Chỉ Tiêu Điều Hành');
    expect(ws1['C7']?.v).toBe('Kết Quả');
    expect(ws1['E7']?.v).toBe('Trạng Thái');

    // Data starts on Row 8
    expect(ws1['A8']?.v).toBe(1);
    expect(ws1['B8']?.v).toBe('Tổng đoàn viên đang học');
    expect(ws1['C8']?.v).toBe(6638);
    expect(ws1['D8']?.v).toContain('• Đã trừ khóa tốt nghiệp\n• Đồng bộ tự động');

    // CWE-1236 formula injection prefixed with '
    expect(ws1['D9']?.v).toBe("'=CMD(\"calc\")");

    // Summary row on Row 10
    expect(ws1['B10']?.v).toBe('TỔNG CỘNG');
    expect(ws1['C10']?.v).toBe(6738);

    // Merged ranges present (admin banner, report title, signature block)
    expect(Array.isArray(ws1['!merges'])).toBe(true);
    expect((ws1['!merges'] || []).length).toBeGreaterThanOrEqual(8);

    // 2. Verify strict ECMA-376 XML tags and element ordering
    const stylesXml = extractZipEntryUtf8(buffer, 'xl/styles.xml');
    expect(stylesXml).toContain('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">');
    expect(stylesXml).toContain('<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>');
    expect(stylesXml).toContain('<borders count="3">');
    expect(stylesXml).toContain('<cellXfs count=');

    const sheet1Xml = extractZipEntryUtf8(buffer, 'xl/worksheets/sheet1.xml');
    expect(sheet1Xml).toContain('state="frozen"');
    expect(sheet1Xml).toContain('ySplit="7"');
    expect(sheet1Xml).toContain('<autoFilter ref="A7:E9"/>');

    const idxSheetData = sheet1Xml.indexOf('</sheetData>');
    const idxAutoFilter = sheet1Xml.indexOf('<autoFilter');
    const idxMergeCells = sheet1Xml.indexOf('<mergeCells');
    const idxPageMargins = sheet1Xml.indexOf('<pageMargins');
    const idxPageSetup = sheet1Xml.indexOf('<pageSetup');

    expect(idxSheetData).toBeGreaterThan(0);
    expect(idxAutoFilter).toBeGreaterThan(idxSheetData);
    expect(idxMergeCells).toBeGreaterThan(idxAutoFilter);
    expect(idxPageMargins).toBeGreaterThan(idxMergeCells);
    expect(idxPageSetup).toBeGreaterThan(idxPageMargins);
  });

  test('handles narrow (<4 col) sheets and empty rows without invalid single-cell merges or autoFilter errors', () => {
    const buffer = buildStyledWorkbookBuffer([
      {
        sheetName: 'Trong',
        reportTitle: 'BÁO CÁO RỖNG',
        columns: [{ key: 'only', label: 'Dữ liệu' }],
        rows: [],
      },
    ]);

    const wb = XLSX.read(buffer, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Trong']);
    const sheetXml = extractZipEntryUtf8(buffer, 'xl/worksheets/sheet1.xml');
    expect(sheetXml).not.toContain('<autoFilter');
    expect(sheetXml).not.toContain('<mergeCells');
  });
});
