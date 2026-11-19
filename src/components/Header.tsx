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
  const [desktopExpanded, setDesktopExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const usePersistentSidebar = !showSidebarToggle && !hideNavbar;

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

  // Sync Gmail-style body layout padding with persistent sidebar state
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!usePersistentSidebar) {
      delete document.body.dataset.sidebar;
      return;
    }
    document.body.dataset.sidebar = desktopExpanded ? 'expanded' : 'collapsed';
    return () => {
      delete document.body.dataset.sidebar;
    };
  }, [usePersistentSidebar, desktopExpanded]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleToggleBuiltInSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
    } else {
      setDesktopExpanded((prev) => !prev);
    }
  };

  const effectiveUser = user || resolvedUser;

  const isEventsActive = pathname === '/events' || pathname.startsWith('/events/');
  const isProfileActive = pathname === '/';
  const isSuperAdminPage = pathname.startsWith('/super-admin');
  const isProposalsPage = pathname.startsWith('/admin/proposals');
  const isAdminHome = pathname === '/admin' || (pathname.startsWith('/admin/events') && !isProposalsPage);
  const isScannerPage = pathname.startsWith('/scanner');
  const isSecurityPage = pathname.startsWith('/security');

  const tier = effectiveUser?.tier || 'user';
  const isSuperAdmin = Boolean(effectiveUser?.isSuperAdmin || tier === 'super_admin');
  const isOfficer =
    tier !== 'user' ||
    isSuperAdmin ||
    Boolean(effectiveUser?.isEventAdmin || effectiveUser?.isChecker || effectiveUser?.isSecurity);
  const canManageEvents =
    isSuperAdmin || tier === 'youth_union' || tier === 'event_admin' || Boolean(effectiveUser?.isEventAdmin);
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
      <header className={`${styles.header} ${usePersistentSidebar ? styles.headerFixed : ''}`}>
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
          ) : usePersistentSidebar ? (
            <button
              type="button"
              onClick={handleToggleBuiltInSidebar}
              className={styles.menuToggleBtn}
              title={desktopExpanded ? 'Thu gọn thanh điều hướng' : 'Mở rộng thanh điều hướng'}
              aria-label="Thu gọn hoặc mở rộng thanh điều hướng"
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

      {/* Gmail-style Persistent Collapsible Left Sidebar */}
      {usePersistentSidebar && (
        <>
          {mobileOpen && (
            <div
              className={styles.mobileBackdrop}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
          )}

          <aside
            className={`${styles.sidebar} ${
              desktopExpanded ? styles.sidebarExpanded : styles.sidebarCollapsed
            } ${mobileOpen ? styles.sidebarMobileOpen : ''}`}
            aria-label="Thanh điều hướng chính"
          >
            {/* Gmail-style Rounded Primary Pill Button */}
            <div className={styles.sidebarCtaWrap}>
              {canViewProposals ? (
                <Link
                  href="/admin/proposals/new"
                  className={styles.sidebarPrimaryCta}
                  title="Trình Kế Hoạch Mới"
                  onClick={() => setMobileOpen(false)}
                >
                  <PlusIcon size={18} />
                  <span className={styles.sidebarLabel}>Trình Kế Hoạch</span>
                </Link>
              ) : (
                <Link
                  href="/events"
                  className={styles.sidebarPrimaryCta}
                  title="Khám Phá Sự Kiện"
                  onClick={() => setMobileOpen(false)}
                >
                  <CalendarIcon size={18} />
                  <span className={styles.sidebarLabel}>Khám Phá Sự Kiện</span>
                </Link>
              )}
            </div>

            <nav className={styles.sidebarNav} aria-label="Điều hướng chính">
              <div className={styles.sidebarSectionLabel}>Cổng Sinh Viên</div>

              <Link
                href="/events"
                title="Tổng quan Sự kiện"
                className={`${styles.sidebarItem} ${isEventsActive ? styles.sidebarItemActive : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className={styles.sidebarIcon}>
                  <CalendarIcon size={18} />
                </span>
                <span className={styles.sidebarLabel}>Tổng quan Sự kiện</span>
              </Link>

              <Link
                href="/?view=student"
                title="Trang cá nhân & QR"
                className={`${styles.sidebarItem} ${isProfileActive ? styles.sidebarItemActive : ''}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className={styles.sidebarIcon}>
                  <QrCodeIcon size={18} />
                </span>
                <span className={styles.sidebarLabel}>Trang cá nhân &amp; QR</span>
              </Link>

              {isOfficer && (
                <>
                  <div className={styles.sidebarDivider} />
                  <div className={styles.sidebarSectionLabel}>Cán Bộ &amp; LCĐ</div>

                  {isSuperAdmin && (
                    <Link
                      href="/super-admin"
                      title="Quản Trị Toàn Trường"
                      className={`${styles.sidebarItem} ${isSuperAdminPage ? styles.sidebarItemActive : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={styles.sidebarIcon}>
                        <ShieldCheckIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Quản Trị Trường</span>
                    </Link>
                  )}

                  {canManageEvents && (
                    <Link
                      href="/admin"
                      title="Sự kiện & Quản lý LCĐ"
                      className={`${styles.sidebarItem} ${isAdminHome ? styles.sidebarItemActive : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={styles.sidebarIcon}>
                        <BuildingIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Sự kiện &amp; LCĐ</span>
                    </Link>
                  )}

                  {canViewProposals && (
                    <Link
                      href="/admin/proposals"
                      title="Kế hoạch trình duyệt"
                      className={`${styles.sidebarItem} ${isProposalsPage ? styles.sidebarItemActive : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={styles.sidebarIcon}>
                        <FileTextIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Kế hoạch duyệt</span>
                    </Link>
                  )}

                  {canScan && (
                    <Link
                      href="/scanner"
                      title="Máy quét QR Điểm danh"
                      className={`${styles.sidebarItem} ${isScannerPage ? styles.sidebarItemActive : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={styles.sidebarIcon}>
                        <ScanCameraIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Máy quét QR</span>
                    </Link>
                  )}

                  {canSecurity && (
                    <Link
                      href="/security"
                      title="Bàn giao chìa khóa"
                      className={`${styles.sidebarItem} ${isSecurityPage ? styles.sidebarItemActive : ''}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={styles.sidebarIcon}>
                        <KeyIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Chìa khóa phòng</span>
                    </Link>
                  )}
                </>
              )}
            </nav>

            {effectiveUser && (
              <div className={styles.sidebarFooter}>
                <div className={styles.sidebarUserName}>{effectiveUser.full_name || effectiveUser.mssv}</div>
                <div className={styles.sidebarUserMeta}>
                  {effectiveUser.mssv} {effectiveUser.class_id ? `• ${effectiveUser.class_id}` : ''}
                </div>
                {studentLcd && (
                  <span
                    className={styles.sidebarLcdPill}
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
