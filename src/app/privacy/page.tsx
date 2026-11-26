import React from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chính Sách Bảo Mật (Privacy Policy) — Hoạt Động Đoàn PTIT HCM',
  description:
    'Chính sách bảo mật và quyền riêng tư của Hệ thống Quản lý Hoạt Động Đoàn — Học viện Công nghệ Bưu chính Viễn thông Cơ sở tại TP. Hồ Chí Minh (ptithcm.com).',
};

export default function PrivacyPolicyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', padding: '2rem 1rem 4rem' }}>
      <main
        style={{
          maxWidth: 820,
          margin: '0 auto',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: 18,
          padding: '2rem 2rem 2.5rem',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
          color: 'var(--text-body)',
          lineHeight: 1.7,
        }}
      >
        <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1.25rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-brand)' }}>
            Đoàn TNCS Hồ Chí Minh — PTIT Cơ sở tại TP. Hồ Chí Minh
          </div>
          <h1 style={{ margin: '0.35rem 0 0.4rem', fontSize: '1.7rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Chính Sách Bảo Mật (Privacy Policy)
          </h1>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Ứng dụng: <strong>Hoạt Động Đoàn PTIT HCM</strong> (https://ptithcm.com) • Cập nhật lần cuối: 20/11/2026
          </div>
        </div>

        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            1. Mục đích của ứng dụng / Purpose of the Application
          </h2>
          <p style={{ margin: 0, fontSize: '0.93rem' }}>
            <strong>Hoạt Động Đoàn PTIT HCM</strong> (<code>https://ptithcm.com</code>) là hệ thống nội bộ phục vụ
            Đoàn Thanh Niên Học viện Công nghệ Bưu chính Viễn thông Cơ sở tại TP. Hồ Chí Minh (PTIT HCM) trong việc
            đăng ký sự kiện, điểm danh bằng mã QR, quản lý lịch trực Văn phòng Đoàn, và lưu trữ minh chứng tham gia
            hoạt động để xét điểm rèn luyện sinh viên.
          </p>
        </section>

        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            2. Dữ liệu chúng tôi thu thập / Data We Collect
          </h2>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.93rem' }}>
            Khi bạn đăng nhập bằng <strong>Google Sign-In (OAuth 2.0)</strong>, ứng dụng chỉ yêu cầu các quyền cơ bản
            không nhạy cảm (<code>openid</code>, <code>email</code>, <code>profile</code>) và thu thập các thông tin sau:
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.93rem' }}>
            <li><strong>Địa chỉ email Học viện</strong> (VD: <code>@student.ptithcm.edu.vn</code>) và Mã số sinh viên (MSSV) trích xuất từ email.</li>
            <li><strong>Họ và tên, Lớp sinh hoạt / Chi đoàn</strong> để hiển thị trong danh sách đăng ký và điểm danh sự kiện.</li>
            <li><strong>Số điện thoại / Zalo</strong> (do sinh viên tự nguyện cung cấp trong hồ sơ) để Ban Tổ Chức liên hệ khi tham gia sự kiện hoặc ứng tuyển CTV.</li>
            <li><strong>Lịch sử đăng ký và thời gian điểm danh sự kiện</strong> nhằm xác nhận minh chứng hoạt động Đoàn – Hội.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            3. Cách chúng tôi sử dụng dữ liệu / How We Use Your Data
          </h2>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.93rem' }}>
            <li>Xác thực danh tính sinh viên và cán bộ Đoàn – Hội PTIT HCM.</li>
            <li>Ghi nhận lượt tham gia sự kiện, xuất báo cáo điểm danh và thống kê thi đua theo học kỳ cho các Liên Chi Đoàn / Phòng Công tác Sinh viên.</li>
            <li>Chúng tôi <strong>không bán, không cho thuê và không chia sẻ</strong> dữ liệu cá nhân của người dùng cho bất kỳ bên thứ ba thương mại hay mục đích quảng cáo nào.</li>
          </ul>
        </section>

        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            4. Lưu trữ và bảo mật / Data Storage &amp; Security
          </h2>
          <p style={{ margin: 0, fontSize: '0.93rem' }}>
            Dữ liệu được truyền tải qua giao thức mã hóa HTTPS và lưu trữ an toàn trên hệ thống cơ sở dữ liệu có kiểm soát
            phân quyền truy cập theo vai trò (Row-Level Security). Chỉ tài khoản chính chủ và cán bộ Đoàn có thẩm quyền
            mới có thể xem dữ liệu trong phạm vi quản lý.
          </p>
        </section>

        <section style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            5. Quyền của người dùng &amp; Liên hệ / User Rights &amp; Contact
          </h2>
          <p style={{ margin: 0, fontSize: '0.93rem' }}>
            Sinh viên có thể xem, cập nhật thông tin cá nhân trực tiếp trên hệ thống hoặc yêu cầu hỗ trợ chỉnh sửa/xóa dữ liệu
            bằng cách liên hệ Ban Quản trị Hệ thống Hoạt Động Đoàn PTIT HCM qua email:{' '}
            <a href="mailto:nnguyenthanhphong2104@gmail.com" style={{ color: 'var(--text-brand)', fontWeight: 700 }}>
              nnguyenthanhphong2104@gmail.com
            </a>.
          </p>
        </section>

        <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <Link
            href="/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0.55rem 1.1rem',
              borderRadius: 10,
              background: '#1d4ed8',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '0.88rem',
            }}
          >
            ← Quay lại trang Đăng nhập
          </Link>
        </div>
      </main>
    </div>
  );
}
