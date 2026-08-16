import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/ToastProvider';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#1e3a8a',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://ptithcm.com'),
  title: 'Hoạt Động Đoàn - Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh',
  description: 'Hệ thống điểm danh và quản lý minh chứng Hoạt Động Đoàn Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh (PTIT HCM)',
  keywords: ['Hoạt động đoàn', 'PTIT HCM', 'Điểm rèn luyện', 'Điểm danh QR', 'Học viện công nghệ bưu chính viễn thông'],
  authors: [{ name: 'Đoàn Thanh Niên PTIT HCM', url: 'https://ptithcm.com' }],
  creator: 'Đoàn Thanh Niên Học Viện Cơ Sở TP.HCM',
  publisher: 'Học Viện Công Nghệ Bưu Chính Viễn Thông',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/logos/logo-ptit.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon-32x32.png',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Hoạt Động Đoàn - PTIT HCM',
    description: 'Hệ thống điểm danh QR động & quản lý minh chứng ĐRL chính thức của Đoàn Thanh Niên Học viện Công nghệ Bưu chính Viễn thông Cơ sở tại TP.HCM',
    url: 'https://ptithcm.com',
    siteName: 'Hoạt Động Đoàn PTIT HCM',
    locale: 'vi_VN',
    type: 'website',
    images: [
      {
        url: 'https://ptithcm.com/logos/logo-ptit.png',
        width: 512,
        height: 512,
        alt: 'Logo Học viện Công nghệ Bưu chính Viễn thông Cơ sở tại TP. Hồ Chí Minh',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Hoạt Động Đoàn - PTIT HCM',
    description: 'Hệ thống điểm danh QR động & quản lý minh chứng ĐRL chính thức của Đoàn Thanh Niên PTIT HCM',
    images: ['https://ptithcm.com/logos/logo-ptit.png'],
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: 'Đoàn Thanh Niên Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh',
  alternateName: 'Đoàn PTIT HCM',
  url: 'https://ptithcm.com',
  logo: 'https://ptithcm.com/logos/logo-ptit.png',
  sameAs: [
    'https://ptithcm.edu.vn',
    'https://www.facebook.com/DoanHocVienCoSoTPHCM',
  ],
  description: 'Nền tảng điểm danh và cấp minh chứng điểm rèn luyện số của Đoàn Học viện Công nghệ Bưu chính Viễn thông - Cơ sở tại TP. Hồ Chí Minh',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '97 Man Thiện, Phường Hiệp Phú, TP. Thủ Đức',
    addressLocality: 'TP. Hồ Chí Minh',
    addressCountry: 'VN',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://accounts.google.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
