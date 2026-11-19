'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchMeCached } from '@/lib/client/me-cache';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import {
  ArrowLeftIcon,
  CalendarIcon,
  QrCodeIcon,
  MenuIcon,
  CloseIcon,
  ShieldCheckIcon,
  BuildingIcon,
  FileTextIcon,
  ScanCameraIcon,
  KeyIcon,
  PlusIcon,
} from '@/components/icons';
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const effectiveUser = user || resolvedUser;
  const useBuiltInDrawer = !showSidebarToggle && !hideNavbar;

  const isEventsActive = pathname === '/events' || pathname.startsWith('/events/');
  const isProfileActive = pathname === '/';
  const isSuperAdminPage = pathname.startsWith('/super-admin');
  const isProposalsPage = pathname.startsWith('/admin/proposals');
  const isAdminHome = pathname === '/admin' || (pathname.startsWith('/admin/events') && !isProposalsPage);
  const isScannerPage = pathname.startsWith('/scanner');
  const isSecurityPage = pathname.startsWith('/security');

  const tier = effectiveUser?.tier || 'user';
  const isSuperAdmin = Boolean(effectiveUser?.isSuperAdmin || tier === 'super_admin');
  const isOfficer = tier !== 'user' || isSuperAdmin || Boolean(effectiveUser?.isEventAdmin || effectiveUser?.isChecker || effectiveUser?.isSecurity);
  const canManageEvents = isSuperAdmin || tier === 'youth_union' || tier === 'event_admin' || Boolean(effectiveUser?.isEventAdmin);
  const canViewProposals = canManageEvents || tier === 'ctsv' || tier === 'facility';
  const canScan = canManageEvents || tier === 'checker' || Boolean(effectiveUser?.isChecker);
  const canSecurity = isSuperAdmin || tier === 'security' || Boolean(effectiveUser?.isSecurity);

  const studentLcd = effectiveUser ? resolveStudentLcd(effectiveUser.class_id, effectiveUser.mssv) : null;

  const handleLogout = async () => {
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      if (typeof window !== 'undefined') {
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
    <>
      <header className={styles.header}>
        <div className={styles.left}>
          {showSidebarToggle ? (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={styles.menuToggleBtn}
              title={isSidebarOpen ? 'Ẩn Menu Quản Trị' : 'Hiện Menu Quản Trị'}
              aria-label="Ẩn hiện menu quản trị"
            >
              <MenuIcon size={20} />
            </button>
          ) : useBuiltInDrawer ? (
            <button
              type="button"
              onClick={() => setDrawerOpen((prev) => !prev)}
              className={styles.menuToggleBtn}
              title={drawerOpen ? 'Đóng Menu Điều Hướng' : 'Mở Menu Điều Hướng'}
              aria-label="Mở menu điều hướng"
              aria-expanded={drawerOpen}
            >
              <MenuIcon size={20} />
            </button>
          ) : null}

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

        <div className={styles.right}>
          <UserMenuDropdown user={effectiveUser} userName={userName} avatarUrl={avatarUrl} onLogout={handleLogout} />
        </div>
      </header>

      {/* Gmail-style Slide-Out Navigation Drawer */}
      {useBuiltInDrawer && (
        <>
          {drawerOpen && (
            <div
              className={styles.drawerBackdrop}
              onClick={() => setDrawerOpen(false)}
              aria-hidden="true"
            />
          )}

          <aside
            className={`${styles.drawer} ${drawerOpen ? styles.drawerOpen : styles.drawerClosed}`}
            aria-label="Menu điều hướng"
          >
            <div className={styles.drawerHeader}>
              <div className={styles.drawerBrand}>
                <DualLogos size="sm" />
                <span className={styles.drawerHeaderTitle}>Điều Hướng</span>
              </div>
              <button
                type="button"
                className={styles.drawerCloseBtn}
                onClick={() => setDrawerOpen(false)}
                title="Đóng menu"
                aria-label="Đóng menu"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Gmail-style Rounded Primary Action Button */}
            <div className={styles.drawerCtaWrap}>
              {canViewProposals ? (
                <Link
                  href="/admin/proposals/new"
                  className={styles.drawerPrimaryCta}
                  onClick={() => setDrawerOpen(false)}
                >
                  <PlusIcon size={18} />
                  <span>Trình Kế Hoạch Mới</span>
                </Link>
              ) : (
                <Link
                  href="/events"
                  className={styles.drawerPrimaryCta}
                  onClick={() => setDrawerOpen(false)}
                >
                  <CalendarIcon size={18} />
                  <span>Khám Phá Sự Kiện</span>
                </Link>
              )}
            </div>

            <nav className={styles.drawerNav} aria-label="Điều hướng chính">
              <div className={styles.drawerSectionLabel}>Cổng Sinh Viên</div>

              <Link
                href="/events"
                className={`${styles.drawerItem} ${isEventsActive ? styles.drawerItemActive : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <CalendarIcon size={18} />
                <span>Tổng quan Sự kiện</span>
              </Link>

              <Link
                href="/?view=student"
                className={`${styles.drawerItem} ${isProfileActive ? styles.drawerItemActive : ''}`}
                onClick={() => setDrawerOpen(false)}
              >
                <QrCodeIcon size={18} />
                <span>Trang cá nhân &amp; QR</span>
              </Link>

              {isOfficer && (
                <>
                  <div className={styles.drawerDivider} />
                  <div className={styles.drawerSectionLabel}>Không Gian Cán Bộ &amp; LCĐ</div>

                  {isSuperAdmin && (
                    <Link
                      href="/super-admin"
                      className={`${styles.drawerItem} ${isSuperAdminPage ? styles.drawerItemActive : ''}`}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <ShieldCheckIcon size={18} />
                      <span>Quản Trị Toàn Trường</span>
                    </Link>
                  )}

                  {canManageEvents && (
                    <Link
                      href="/admin"
                      className={`${styles.drawerItem} ${isAdminHome ? styles.drawerItemActive : ''}`}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <BuildingIcon size={18} />
                      <span>Sự kiện &amp; Quản lý LCĐ</span>
                    </Link>
                  )}

                  {canViewProposals && (
                    <Link
                      href="/admin/proposals"
                      className={`${styles.drawerItem} ${isProposalsPage ? styles.drawerItemActive : ''}`}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <FileTextIcon size={18} />
                      <span>Kế hoạch trình duyệt</span>
                    </Link>
                  )}

                  {canScan && (
                    <Link
                      href="/scanner"
                      className={`${styles.drawerItem} ${isScannerPage ? styles.drawerItemActive : ''}`}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <ScanCameraIcon size={18} />
                      <span>Máy quét QR Điểm danh</span>
                    </Link>
                  )}

                  {canSecurity && (
                    <Link
                      href="/security"
                      className={`${styles.drawerItem} ${isSecurityPage ? styles.drawerItemActive : ''}`}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <KeyIcon size={18} />
                      <span>Bàn giao chìa khóa</span>
                    </Link>
                  )}
                </>
              )}
            </nav>

            {effectiveUser && (
              <div className={styles.drawerFooter}>
                <div className={styles.drawerUserName}>{effectiveUser.full_name || effectiveUser.mssv}</div>
                <div className={styles.drawerUserMeta}>
                  {effectiveUser.mssv} {effectiveUser.class_id ? `• ${effectiveUser.class_id}` : ''}
                </div>
                {studentLcd && (
                  <span
                    className={styles.drawerLcdPill}
                    style={{
                      background: studentLcd.bg,
                      color: studentLcd.color,
                      borderColor: studentLcd.border,
                    }}
                  >
                    <BuildingIcon size={12} color={studentLcd.color} />
                    <span>{studentLcd.shortName}</span>
                  </span>
                )}
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
