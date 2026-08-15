import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Hoạt Động Đoàn - Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh',
  description: 'Hệ thống điểm danh và quản lý minh chứng Hoạt Động Đoàn Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh',
  icons: {
    icon: '/logos/logo-ptit.png',
    shortcut: '/logos/logo-ptit.png',
    apple: '/logos/logo-ptit.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
