'use client';

import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeftIcon, LogoutIcon, MenuIcon } from '@/components/icons';
import DualLogos from '@/components/DualLogos';
import UserMenuDropdown from '@/components/UserMenuDropdown';
import type { SessionUser } from '@/lib/types';
import styles from './Header.module.css';

interface HeaderProps {
  user?: SessionUser | null;
  userName?: string;
  avatarUrl?: string;
  onLogout?: () => void;
  showBack?: boolean;
  backHref?: string;
  title?: string;
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export default function Header({
  user,
  userName,
  avatarUrl,
  onLogout,
  showBack,
  backHref = '/',
  title,
  showSidebarToggle,
  onToggleSidebar,
  isSidebarOpen = true,
}: HeaderProps = {}) {
  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      if (typeof window !== 'undefined') {
        // Clear client cookies directly
        document.cookie = 'demo_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {}

        await Promise.allSettled([
          window.fetch('/api/auth/logout', { method: 'POST' }),
          window.fetch('/api/auth/demo', { method: 'DELETE' }),
        ]);
      }
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error', err);
    } finally {
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {showSidebarToggle && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className={styles.menuToggleBtn}
            title={isSidebarOpen ? 'Ẩn Menu Quản Trị' : 'Hiện Menu Quản Trị'}
            aria-label="Ẩn hiện menu quản trị"
          >
            <MenuIcon size={20} />
          </button>
        )}
        {showBack && (
          <Link href={backHref} className={styles.backButton} aria-label="Quay lại">
            <ArrowLeftIcon size={20} />
          </Link>
        )}
        <DualLogos size="sm" />
        <div className={styles.branding}>
          <span className={styles.appTitle}>{title || 'HOẠT ĐỘNG ĐOÀN'}</span>
          <span className={styles.appSubtitle}>Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh</span>
        </div>
      </div>

      <div className={styles.right}>
        <UserMenuDropdown user={user} userName={userName} avatarUrl={avatarUrl} onLogout={handleLogout} />
      </div>
    </header>
  );
}
