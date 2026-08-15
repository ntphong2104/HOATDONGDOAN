import * as XLSX from 'xlsx';

export function exportToExcel(data: Record<string, unknown>[], filename: string, sheetName: string = 'Sheet1') {
  if (data.length === 0) return;

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  // Calculate dynamic column widths based on contents
  const maxWidths = data.reduce((acc: Record<string, number>, row) => {
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
