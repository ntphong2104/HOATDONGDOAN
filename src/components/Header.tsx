'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchMeCached } from '@/lib/client/me-cache';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import { isUnitAccount } from '@/lib/utils/extract-mssv';
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
  CheckCircleIcon,
  HistoryIcon,
  BadgeMedalIcon,
  ClockIcon,
} from '@/components/icons';
import DualLogos from '@/components/DualLogos';
import UserMenuDropdown from '@/components/UserMenuDropdown';
import PushNotificationButton from '@/components/PushNotificationButton';
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
  activeStudentTab?: 'overview' | 'registered' | 'history' | 'delegate';
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
  activeStudentTab = 'overview',
}: HeaderProps = {}) {
  const pathname = usePathname() || '';
  const [resolvedUser, setResolvedUser] = useState<SessionUser | null>(user || null);
  // Mặc định ẩn hoàn toàn thanh bên; rê chuột vào nút Menu (≡) hoặc mép trái để tự mở ra
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [desktopHovered, setDesktopHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setDesktopHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setDesktopHovered(false);
    }, 180);
  };

  const closeSidebar = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setDesktopHovered(false);
    setMobileOpen(false);
  };

  const usePersistentSidebar = !showSidebarToggle && !hideNavbar;
  const isVisuallyExpanded = desktopExpanded || desktopHovered || mobileOpen;

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

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

  // Sync body layout padding with persistent sidebar state (chỉ thụt lề khi người dùng chủ động ghim cố định)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!usePersistentSidebar) {
      delete document.body.dataset.sidebar;
      return;
    }
    document.body.dataset.sidebar = desktopExpanded ? 'expanded' : 'hidden';
    return () => {
      delete document.body.dataset.sidebar;
    };
  }, [usePersistentSidebar, desktopExpanded]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSidebar();
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
  const isRankingActive = pathname === '/ranking' || pathname.startsWith('/ranking/');
  const isOverviewActive = pathname === '/' && activeStudentTab === 'overview';
  const isRegisteredActive = pathname === '/' && activeStudentTab === 'registered';
  const isHistoryActive = pathname === '/' && activeStudentTab === 'history';
  const isSuperAdminPage = pathname.startsWith('/super-admin');
  const isProposalsPage = pathname.startsWith('/admin/proposals');
  const isAdminHome = pathname === '/admin' || (pathname.startsWith('/admin/events') && !isProposalsPage);
  const isScannerPage = pathname.startsWith('/scanner');
  const isSecurityPage = pathname.startsWith('/security');
  const isOfficeDutyPage = pathname.startsWith('/office/duty');
  const isOfficeBorrowPage = pathname.startsWith('/office/borrow');
  const isOfficeAdminPage = pathname.startsWith('/office/admin');

  const tier = effectiveUser?.tier || 'user';
  const isSuperAdmin = Boolean(effectiveUser?.isSuperAdmin || tier === 'super_admin');
  const isOfficeAdmin = Boolean(
    isSuperAdmin || effectiveUser?.isOfficeAdmin || tier === 'office_admin'
  );
  const canOfficeDuty = Boolean(effectiveUser?.isDutyVolunteer || isOfficeAdmin);
  const isOfficer =
    tier !== 'user' ||
    isSuperAdmin ||
    isOfficeAdmin ||
    Boolean(effectiveUser?.isEventAdmin || effectiveUser?.isChecker || effectiveUser?.isSecurity);
  const canManageEvents =
    isSuperAdmin || tier === 'youth_union' || tier === 'event_admin' || Boolean(effectiveUser?.isEventAdmin);
  const canViewProposals = canManageEvents || tier === 'ctsv' || tier === 'facility';
  const canScan = canManageEvents || tier === 'checker' || Boolean(effectiveUser?.isChecker);
  const canSecurity = isSuperAdmin || tier === 'security' || Boolean(effectiveUser?.isSecurity);

  const isUnit = isUnitAccount({
    email: effectiveUser?.email,
    mssv: effectiveUser?.mssv,
  });
  const canOfficeBorrow = Boolean(isUnit || canManageEvents || isOfficeAdmin);
  const isStudentAccount = !isUnit;

  const studentLcd = effectiveUser ? resolveStudentLcd(effectiveUser.class_id, effectiveUser.mssv) : null;
  const homeHref = isStudentAccount
    ? '/'
    : isSuperAdmin
    ? '/super-admin'
    : canManageEvents
    ? '/admin'
    : canViewProposals
    ? '/admin/proposals'
    : canSecurity
    ? '/security'
    : '/events';

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
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className={styles.menuToggleBtn}
              title={
                desktopExpanded
                  ? 'Đang ghim thanh điều hướng (Bấm để ẩn)'
                  : 'Thanh điều hướng (Rê chuột hoặc bấm để mở)'
              }
              aria-label="Thanh điều hướng"
            >
              <MenuIcon size={20} />
            </button>
          ) : null}

          {showBack && (
            <Link href={backHref} className={styles.backButton} aria-label="Quay lại">
              <ArrowLeftIcon size={20} />
            </Link>
          )}
          <Link href={homeHref} className={styles.logoLink} title="Về trang chủ">
            <DualLogos size="sm" />
            <div className={styles.branding}>
              <span className={styles.appTitle}>{title || 'HOẠT ĐỘNG ĐOÀN'}</span>
              <span className={styles.appSubtitle}>Học Viện Công Nghệ Bưu Chính Viễn Thông Cơ Sở Tại TP. Hồ Chí Minh</span>
            </div>
          </Link>
        </div>

        <div className={styles.right}>
          {effectiveUser && <PushNotificationButton />}
          <UserMenuDropdown user={effectiveUser} userName={userName} avatarUrl={avatarUrl} onLogout={handleLogout} />
        </div>
      </header>

      {/* Hover-Slide Drawer Left Sidebar */}
      {usePersistentSidebar && (
        <>
          {mobileOpen && (
            <div
              className={styles.mobileBackdrop}
              onClick={closeSidebar}
              aria-hidden="true"
            />
          )}

          {!isVisuallyExpanded && (
            <div
              className={styles.edgeHoverZone}
              onMouseEnter={handleMouseEnter}
              aria-hidden="true"
            />
          )}

          <aside
            className={`${styles.sidebar} ${isVisuallyExpanded ? styles.sidebarOpen : ''} ${
              desktopExpanded ? styles.sidebarPinned : ''
            } ${mobileOpen ? styles.sidebarMobileOpen : ''}`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            aria-label="Thanh điều hướng chính"
          >
            <nav className={styles.sidebarNav} aria-label="Điều hướng chính">
              {isStudentAccount ? (
                <>
                  <div className={styles.sidebarSectionLabel}>Cổng Sinh Viên</div>

                  <Link
                    href="/?view=student"
                    title="Tổng quan cá nhân & QR"
                    className={`${styles.sidebarItem} ${isOverviewActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <QrCodeIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Tổng quan cá nhân</span>
                  </Link>

                  <Link
                    href="/events"
                    title="Sự kiện"
                    className={`${styles.sidebarItem} ${isEventsActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <CalendarIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Sự kiện</span>
                  </Link>

                  <Link
                    href="/ranking"
                    title="Bảng xếp hạng theo học kỳ"
                    className={`${styles.sidebarItem} ${isRankingActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <BadgeMedalIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Bảng xếp hạng</span>
                  </Link>

                  <Link
                    href="/?view=student&tab=registered"
                    title="Sự kiện đã đăng ký"
                    className={`${styles.sidebarItem} ${isRegisteredActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <CheckCircleIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Sự kiện đã đăng ký</span>
                  </Link>

                  <Link
                    href="/?view=student&tab=history"
                    title="Lịch sử minh chứng ĐRL"
                    className={`${styles.sidebarItem} ${isHistoryActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <HistoryIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Lịch sử minh chứng</span>
                  </Link>

                  {canOfficeDuty && (
                    <Link
                      href="/office/duty"
                      title="Trực văn phòng Đoàn (chỉ dành cho CTV trực)"
                      className={`${styles.sidebarItem} ${isOfficeDutyPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <ClockIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Trực văn phòng</span>
                    </Link>
                  )}

                  {isOfficer && (
                    <>
                      <div className={styles.sidebarDivider} />
                      <div className={styles.sidebarSectionLabel}>Cán Bộ &amp; LCĐ</div>

                      {isSuperAdmin && (
                        <Link
                          href="/super-admin"
                          title="Quản Trị Toàn Trường"
                          className={`${styles.sidebarItem} ${isSuperAdminPage ? styles.sidebarItemActive : ''}`}
                          onClick={closeSidebar}
                        >
                          <span className={styles.sidebarIcon}>
                            <ShieldCheckIcon size={18} />
                          </span>
                          <span className={styles.sidebarLabel}>Quản Trị Trường</span>
                        </Link>
                      )}

                      {isOfficeAdmin && (
                        <Link
                          href="/office/admin"
                          title="Quản trị Văn phòng Đoàn (Trực VP & Mượn dụng cụ)"
                          className={`${styles.sidebarItem} ${isOfficeAdminPage ? styles.sidebarItemActive : ''}`}
                          onClick={closeSidebar}
                        >
                          <span className={styles.sidebarIcon}>
                            <ClockIcon size={18} />
                          </span>
                          <span className={styles.sidebarLabel}>Văn phòng Đoàn</span>
                        </Link>
                      )}

                      {canManageEvents && (
                        <Link
                          href="/admin"
                          title="Sự kiện & Quản lý LCĐ"
                          className={`${styles.sidebarItem} ${isAdminHome ? styles.sidebarItemActive : ''}`}
                          onClick={closeSidebar}
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
                          onClick={closeSidebar}
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
                          onClick={closeSidebar}
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
                          onClick={closeSidebar}
                        >
                          <span className={styles.sidebarIcon}>
                            <KeyIcon size={18} />
                          </span>
                          <span className={styles.sidebarLabel}>Chìa khóa phòng</span>
                        </Link>
                      )}
                    </>
                  )}
                </>
              ) : (
                /* ──── Tài khoản Cán bộ / LCĐ / Quản trị (Không có Cổng Sinh Viên cá nhân) ──── */
                <>
                  <div className={styles.sidebarSectionLabel}>Bàn Quản Trị &amp; LCĐ</div>

                  {isSuperAdmin && (
                    <Link
                      href="/super-admin"
                      title="Quản Trị Toàn Trường"
                      className={`${styles.sidebarItem} ${isSuperAdminPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
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
                      title="Bàn làm việc Quản lý LCĐ & Sự kiện"
                      className={`${styles.sidebarItem} ${isAdminHome ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <BuildingIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Bàn Làm Việc LCĐ</span>
                    </Link>
                  )}

                  {canViewProposals && (
                    <Link
                      href="/admin/proposals"
                      title="Kế hoạch trình duyệt"
                      className={`${styles.sidebarItem} ${isProposalsPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
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
                      onClick={closeSidebar}
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
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <KeyIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Chìa khóa phòng</span>
                    </Link>
                  )}

                  {isOfficeAdmin && (
                    <Link
                      href="/office/admin"
                      title="Quản trị Văn phòng Đoàn (Trực VP & Mượn dụng cụ)"
                      className={`${styles.sidebarItem} ${isOfficeAdminPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <ClockIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Quản trị VP Đoàn</span>
                    </Link>
                  )}

                  {canOfficeBorrow && (
                    <Link
                      href="/office/borrow"
                      title="Mượn dụng cụ Văn phòng Đoàn"
                      className={`${styles.sidebarItem} ${isOfficeBorrowPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <BuildingIcon size={18} />
                      </span>
                      <span className={styles.sidebarLabel}>Mượn dụng cụ VPĐ</span>
                    </Link>
                  )}

                  <div className={styles.sidebarDivider} />
                  <div className={styles.sidebarSectionLabel}>Học Viện</div>

                  <Link
                    href="/events"
                    title="Sự kiện"
                    className={`${styles.sidebarItem} ${isEventsActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <CalendarIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Sự kiện</span>
                  </Link>

                  <Link
                    href="/ranking"
                    title="Bảng xếp hạng theo học kỳ"
                    className={`${styles.sidebarItem} ${isRankingActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <BadgeMedalIcon size={18} />
                    </span>
                    <span className={styles.sidebarLabel}>Bảng xếp hạng</span>
                  </Link>
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
