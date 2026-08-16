# 🏛️ HỆ THỐNG QUẢN LÝ HOẠT ĐỘNG ĐOÀN PTIT HCM
> **ĐOÀN HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG — CƠ SỞ TẠI TP. HỒ CHÍ MINH**  
> *Hệ thống Quản trị Sự kiện, Điểm danh QR Động, Duyệt Kế hoạch Đa cấp, Tra cứu Điểm Rèn Luyện & Chống Gian lận Toàn diện*

---

## 📖 Tài Liệu Nghiệp Vụ Đầy Đủ

👉 **Xem tài liệu đặc tả nghiệp vụ chi tiết tại:** [DOCS_NGHIEP_VU.md](./DOCS_NGHIEP_VU.md)

Tài liệu bao gồm:
1. **Cơ cấu 24 Đơn vị Cơ sở:** 8 Liên Chi Đoàn Khoa + 16 CLB/Đội/Nhóm trực thuộc.
2. **Ma trận Phân quyền 7 Cấp:** Super Admin, Đoàn Học viện, Phòng CTSV, Phòng Tổ chức/CSVC, Event Admin, Checker, Cán bộ Chi đoàn, Sinh viên.
3. **8 Quy trình Nghiệp vụ Cốt lõi:**
   - Trình duyệt kế hoạch & Cấp phòng sự kiện (Kiểm tra xung đột phòng).
   - Cổng đăng ký công khai, Khóa tự động 12 giờ & Quyền mở thủ công.
   - Điểm danh QR Động OTP đổi mỗi 10s (HMAC-SHA256 Anti-Replay).
   - Tự động đóng sự kiện và Nút mở lại / Đóng thủ công.
   - Cơ chế kỷ luật 3-Strike Blacklist (3 lần vắng mặt $\rightarrow$ Khóa tài khoản).
   - Phân quyền Cán bộ đa tài khoản & Bảo vệ Admin Gốc bất biến.
   - Ủy quyền Cán bộ Chi đoàn tra cứu ĐRL trong thời hạn 30 ngày.
   - Đánh giá sao & Xuất báo cáo Excel UTF-8 chuẩn.
4. **Bản đồ Cơ sở Dữ liệu (Schema Dictionary)** & **Danh mục 30+ API Endpoints**.

---

## 🚀 Khởi Chạy Ứng Dụng

```bash
# Cài đặt thư viện phụ thuộc
npm install

# Chạy môi trường phát triển (Development)
npm run dev

# Chạy kiểm thử tự động (38 Test Suites / 456 Tests)
npm test

# Xây dựng bản phát hành (Production Build)
npm run build
```

Mở trình duyệt tại [http://localhost:3000](http://localhost:3000) để trải nghiệm.

