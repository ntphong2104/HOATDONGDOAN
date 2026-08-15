import { exportToExcel } from '@/lib/utils/excel-export';
import * as XLSX from 'xlsx';

jest.mock('xlsx', () => {
  const actual = jest.requireActual('xlsx');
  return {
    ...actual,
    writeFile: jest.fn(),
  };
});

describe('Unit Tests: exportToExcel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generates Excel file and triggers download for valid data array', () => {
    const mockData = [
      {
        STT: 1,
        MSSV: 'N22DCCN001',
        'Họ và Tên': 'Nguyễn Văn An',
        Lớp: 'D22CQCN01-N',
        'Vai trò': 'Người tham gia',
      },
      {
        STT: 2,
        MSSV: 'N22DCCN002',
        'Họ và Tên': 'Trần Thị Bích',
        Lớp: 'D22CQCN01-N',
        'Vai trò': 'Cộng tác viên',
      },
    ];

    exportToExcel(mockData, 'DanhSachDiemDanh', 'MinhChung');

    expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
    expect(XLSX.writeFile).toHaveBeenCalledWith(
      expect.anything(),
      'DanhSachDiemDanh.xlsx'
    );
  });

  test('does nothing when data array is empty', () => {
    exportToExcel([], 'EmptyFile');
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  test('uses default sheet name "Sheet1" when omitted', () => {
    const mockData = [{ MSSV: 'B22DCCN001' }];
    exportToExcel(mockData, 'TestExport');
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'TestExport.xlsx');
  });
});
