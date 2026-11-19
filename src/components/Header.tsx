'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeftIcon, CalendarIcon, QrCodeIcon, MenuIcon, ShieldCheckIcon } from '@/components/icons';
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
  hideNavbar?: boolean;
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
  hideNavbar = false,
}: HeaderProps = {}) {
  const pathname = usePathname() || '';
  const showNav = !hideNavbar && !showSidebarToggle;
  const isEventsActive = pathname === '/events' || pathname.startsWith('/events/');
  const isProfileActive = pathname === '/';

  const adminHref =
    user?.tier === 'super_admin' || user?.isSuperAdmin
      ? '/super-admin'
      : user?.tier === 'youth_union' || user?.tier === 'ctsv' || user?.tier === 'facility'
      ? '/admin/proposals'
      : user?.tier === 'event_admin' || user?.isEventAdmin
      ? '/admin'
      : user?.tier === 'security'
      ? '/security'
      : user?.tier === 'checker' || user?.isChecker
      ? '/scanner'
      : null;
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
        } catch {}

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
    <div className={styles.headerWrapper}>
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
          <Link href="/" className={styles.logoLink} title="Về trang chủ">
            <DualLogos size="sm" />
            <div className={styles.branding}>
              <span className={styles.appTitle}>{title || 'HOẠT ĐỘNG ĐOÀN'}</span>
              <span className={styles.appSubtitle}>Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh</span>
            </div>
          </Link>
        </div>

        {showNav && (
          <nav className={styles.desktopNav} aria-label="Điều hướng chính">
            <Link
              href="/events"
              className={`${styles.navLink} ${isEventsActive ? styles.navLinkActive : ''}`}
            >
              <CalendarIcon size={15} />
              <span>Tổng quan Sự kiện</span>
            </Link>
            <Link
              href="/?view=student"
              className={`${styles.navLink} ${isProfileActive ? styles.navLinkActive : ''}`}
            >
              <QrCodeIcon size={15} />
              <span>Trang cá nhân & QR</span>
            </Link>
            {adminHref && (
              <Link
                href={adminHref}
                className={`${styles.navLink} ${pathname.startsWith('/admin') || pathname.startsWith('/super-admin') ? styles.navLinkActive : ''}`}
              >
                <ShieldCheckIcon size={15} />
                <span>Quản trị</span>
              </Link>
            )}
          </nav>
        )}

        <div className={styles.right}>
          <UserMenuDropdown user={user} userName={userName} avatarUrl={avatarUrl} onLogout={handleLogout} />
        </div>
      </header>

      {showNav && (
        <nav className={styles.mobileNav} aria-label="Điều hướng di động">
          <Link
            href="/events"
            className={`${styles.mobileNavLink} ${isEventsActive ? styles.mobileNavLinkActive : ''}`}
          >
            <CalendarIcon size={15} />
            <span>Tổng quan Sự kiện</span>
          </Link>
          <Link
            href="/?view=student"
            className={`${styles.mobileNavLink} ${isProfileActive ? styles.mobileNavLinkActive : ''}`}
          >
            <QrCodeIcon size={15} />
            <span>Trang cá nhân & QR</span>
          </Link>
          {adminHref && (
            <Link
              href={adminHref}
              className={`${styles.mobileNavLink} ${pathname.startsWith('/admin') || pathname.startsWith('/super-admin') ? styles.mobileNavLinkActive : ''}`}
            >
              <ShieldCheckIcon size={15} />
              <span>Quản trị</span>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
