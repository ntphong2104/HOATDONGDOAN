import Link from 'next/link';
import Header from '@/components/Header';

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '3rem', margin: '0 0 1rem', color: 'var(--neutral-900)' }}>404</h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--neutral-600)', marginBottom: '2rem' }}>Trang không tồn tại</p>
        <Link 
          href="/" 
          style={{ 
            padding: '0.75rem 1.5rem', 
            background: 'var(--primary-600)', 
            color: 'white', 
            borderRadius: 'var(--radius-md)',
            fontWeight: 500
          }}
        >
          Quay về trang chủ
        </Link>
      </main>
    </div>
  );
}
