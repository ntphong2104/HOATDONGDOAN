import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Hoạt Động Đoàn PTIT HCM',
    short_name: 'Đoàn PTIT',
    description:
      'Hệ thống điểm danh QR & quản lý hoạt động Đoàn Thanh Niên PTIT Cơ sở tại TP. Hồ Chí Minh',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#1e3a8a',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png?v=doan2',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png?v=doan2',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-touch-icon.png?v=doan2',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
