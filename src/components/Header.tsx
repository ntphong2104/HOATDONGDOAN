'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchMeCached } from '@/lib/client/me-cache';
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
  const [resolvedUser, setResolvedUser] = useState<SessionUser | null>(user || null);

  useEffect(() => {
    if (user) return;
    let active = true;
    (async () => {
      try {
        const { json } = await fetchMeCached();
        if (active && json?.success && json?.data) {
          setResolvedUser(json.data as SessionUser);
        }
      } catch {}
    })();
    return () => {
      active = false;
    };
  }, [user]);

  const effectiveUser = user || resolvedUser;
  const showNav = !hideNavbar;
  const isEventsActive = pathname === '/events' || pathname.startsWith('/events/');
  const isProfileActive = pathname === '/';
  const isAdminActive =
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/security') ||
    pathname.startsWith('/scanner');

  const adminHref =
    effectiveUser?.tier === 'super_admin' || effectiveUser?.isSuperAdmin
      ? '/super-admin'
      : effectiveUser?.tier === 'youth_union' || effectiveUser?.tier === 'ctsv' || effectiveUser?.tier === 'facility'
      ? '/admin/proposals'
      : effectiveUser?.tier === 'event_admin' || effectiveUser?.isEventAdmin
      ? '/admin'
      : effectiveUser?.tier === 'security'
      ? '/security'
      : effectiveUser?.tier === 'checker' || effectiveUser?.isChecker
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
                className={`${styles.navLink} ${isAdminActive ? styles.navLinkActive : ''}`}
              >
                <ShieldCheckIcon size={15} />
                <span>Quản trị</span>
              </Link>
            )}
          </nav>
        )}

        <div className={styles.right}>
          <UserMenuDropdown user={effectiveUser} userName={userName} avatarUrl={avatarUrl} onLogout={handleLogout} />
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
              className={`${styles.mobileNavLink} ${isAdminActive ? styles.mobileNavLinkActive : ''}`}
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
