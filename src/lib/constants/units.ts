export interface OfficialUnit {
  code: string;
  name: string;
  type: string;
  email: string;
}

export const OFFICIAL_UNITS: OfficialUnit[] = [
  // 8 Liên Chi Đoàn Khoa
  { code: 'LCD_CNTT', name: 'LCĐ Khoa Công nghệ Thông tin', type: 'LCĐ Khoa', email: 'lcdcntt@student.ptithcm.edu.vn' },
  { code: 'LCD_CNDPT', name: 'LCĐ Công nghệ Đa phương tiện', type: 'LCĐ Khoa', email: 'lcdcndpt@student.ptithcm.edu.vn' },
  { code: 'LCD_ATTT', name: 'LCĐ An toàn Thông tin', type: 'LCĐ Khoa', email: 'lcdattt@student.ptithcm.edu.vn' },
  { code: 'LCD_VT', name: 'LCĐ Khoa Viễn thông', type: 'LCĐ Khoa', email: 'lcdvt@student.ptithcm.edu.vn' },
  { code: 'LCD_DT', name: 'LCĐ Khoa Điện tử', type: 'LCĐ Khoa', email: 'lcddt@student.ptithcm.edu.vn' },
  { code: 'LCD_QTKD', name: 'LCĐ Khoa Quản trị Kinh doanh', type: 'LCĐ Khoa', email: 'lcdqtkd@student.ptithcm.edu.vn' },
  { code: 'LCD_MKT', name: 'LCĐ Marketing', type: 'LCĐ Khoa', email: 'lcdmkt@student.ptithcm.edu.vn' },
  { code: 'LCD_KETOAN', name: 'LCĐ Kế toán', type: 'LCĐ Khoa', email: 'lcdketoan@student.ptithcm.edu.vn' },

  // 16 CLB / Đội / Nhóm
  { code: 'CLB_ITMC', name: 'CLB ITMC', type: 'CLB Học Thuật', email: 'clb.itmc@student.ptithcm.edu.vn' },
  { code: 'CLB_ATTT_CLUB', name: 'CLB An toàn Thông tin', type: 'CLB Học Thuật', email: 'clb.antoanthongtin@student.ptithcm.edu.vn' },
  { code: 'CLB_TIENGANH', name: 'CLB Tiếng Anh', type: 'CLB Kỹ Năng', email: 'clb.tienganh@student.ptithcm.edu.vn' },
  { code: 'DOI_VANNGHE', name: 'Đội Văn Nghệ', type: 'Đội Văn Thể Mỹ', email: 'doivannghe@student.ptithcm.edu.vn' },
  { code: 'CLB_GUITAR', name: 'CLB Guitar', type: 'CLB Nghệ Thuật', email: 'clb.guitar@student.ptithcm.edu.vn' },
  { code: 'DOI_TINHNGUYEN', name: 'Đội Sinh Viên Tình Nguyện', type: 'Đội Tình Nguyện', email: 'doisinhvientinhnguyen@student.ptithcm.edu.vn' },
  { code: 'CLB_KETNOI', name: 'CLB Kết Nối', type: 'CLB Kỹ Năng', email: 'clb.ketnoi@student.ptithcm.edu.vn' },
  { code: 'CLB_CMC', name: 'CLB C.MC', type: 'CLB Truyền Thông', email: 'clb.truyenthongcmc@student.ptithcm.edu.vn' },
  { code: 'CLB_37DO', name: 'CLB 37 Độ Sinh viên', type: 'CLB Tình Nguyện', email: 'clb.37dosinhvien@student.ptithcm.edu.vn' },
  { code: 'CLB_BMA', name: 'CLB BMA', type: 'CLB Học Thuật', email: 'clb.bma@student.ptithcm.edu.vn' },
  { code: 'CLB_BONGCHUYEN', name: 'CLB Bóng Chuyền', type: 'CLB Thể Thao', email: 'clb.bongchuyen@student.ptithcm.edu.vn' },
  { code: 'CLB_BONGDA', name: 'CLB Bóng Đá', type: 'CLB Thể Thao', email: 'clbbongda@student.ptithcm.edu.vn' },
  { code: 'CLB_BONGRO', name: 'CLB Bóng Rổ', type: 'CLB Thể Thao', email: 'clb.bongro@student.ptithcm.edu.vn' },
  { code: 'CLB_VOVINAM', name: 'CLB Vovinam', type: 'CLB Võ Thuật', email: 'clb.vovinam@student.ptithcm.edu.vn' },
  { code: 'CLB_CO', name: 'CLB Cờ', type: 'CLB Trí Tuệ', email: 'clb.covua@student.ptithcm.edu.vn' },
  { code: 'CLB_CAULONG', name: 'CLB Cầu Lông', type: 'CLB Thể Thao', email: 'clb.caulong@student.ptithcm.edu.vn' },
];
