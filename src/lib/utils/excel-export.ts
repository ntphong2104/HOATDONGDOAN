import { sanitizeSpreadsheetCell } from '@/lib/security/redirect';

export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName: string = 'Sheet1'
) {
  if (data.length === 0) return;

  const XLSX = await import('xlsx');

  const safeData = data.map((row) => {
    const cleanRow: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      cleanRow[k] = typeof v === 'string' ? sanitizeSpreadsheetCell(v) : v;
    }
    return cleanRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(safeData);
  const workbook = XLSX.utils.book_new();

  // Calculate dynamic column widths based on contents
  const maxWidths = safeData.reduce((acc: Record<string, number>, row) => {
    Object.keys(row).forEach((key) => {
      const val = row[key];
      const length = val ? val.toString().length : 0;
      const headerLength = key.length;
      acc[key] = Math.max(acc[key] || headerLength, length, headerLength);
    });
    return acc;
  }, {});

  worksheet['!cols'] = Object.keys(maxWidths).map((key) => ({
    wch: (maxWidths as Record<string, number>)[key] + 2, // adding padding
  }));

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
