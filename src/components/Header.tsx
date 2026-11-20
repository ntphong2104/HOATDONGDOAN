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
  UsersIcon,
  SettingsIcon,
} from '@/components/icons';
import DualLogos from '@/components/DualLogos';
import UserMenuDropdown from '@/components/UserMenuDropdown';
import PushNotificationButton from '@/components/PushNotificationButton';
import MobileBottomNav from '@/components/MobileBottomNav';
import type { SessionUser } from '@/lib/types';
import styles from './Header.module.css';

export type SuperAdminSidebarTab =
  | 'events'
  | 'proposals'
  | 'officers'
  | 'rooms'
  | 'units'
  | 'students'
  | 'delegates'
  | 'blacklist'
  | 'ranking'
  | 'settings';

interface AdminPendingCounts {
  pending_proposals: number;
  pending_office_borrows: number;
}

const PENDING_CACHE_TTL_MS = 60_000;
let pendingClientCache: { data: AdminPendingCounts; expiresAt: number } | null = null;
let pendingClientInflight: Promise<AdminPendingCounts> | null = null;

async function fetchAdminPendingCounts(force = false): Promise<AdminPendingCounts> {
  if (!force && pendingClientCache && Date.now() < pendingClientCache.expiresAt) {
    return pendingClientCache.data;
  }
  if (!force && pendingClientInflight) return pendingClientInflight;

  const task = (async () => {
    try {
      const res = await fetch('/api/admin/pending-counts', { cache: 'no-store' });
      const json = await res.json();
      if (json?.success && json?.data) {
        const data: AdminPendingCounts = {
          pending_proposals: Number(json.data.pending_proposals) || 0,
          pending_office_borrows: Number(json.data.pending_office_borrows) || 0,
        };
        pendingClientCache = { data, expiresAt: Date.now() + PENDING_CACHE_TTL_MS };
        return data;
      }
    } catch {}
    return pendingClientCache?.data || { pending_proposals: 0, pending_office_borrows: 0 };
  })().finally(() => {
    pendingClientInflight = null;
  });

  pendingClientInflight = task;
  return task;
}

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
  activeSuperAdminTab?: SuperAdminSidebarTab;
  onSelectSuperAdminTab?: (tab: SuperAdminSidebarTab) => void;
  superAdminBadges?: Partial<Record<SuperAdminSidebarTab, number>>;
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
  activeSuperAdminTab,
  onSelectSuperAdminTab,
  superAdminBadges,
}: HeaderProps = {}) {
  const pathname = usePathname() || '';
  const [resolvedUser, setResolvedUser] = useState<SessionUser | null>(user || null);
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [desktopHovered, setDesktopHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Persist user's pinned sidebar preference on desktop (defaults to pinned on /super-admin)
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 1024) return;
    try {
      const saved = localStorage.getItem('hdd_sidebar_pinned');
      if (saved === 'true') {
        setDesktopExpanded(true);
      } else if (saved === 'false') {
        setDesktopExpanded(false);
      } else if (pathname.startsWith('/super-admin')) {
        setDesktopExpanded(true);
      }
    } catch {}
  }, [pathname]);

  const handleMouseEnter = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setDesktopHovered(true);
  };

  const handleMouseLeave = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) return;
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

  // Sync body layout padding with persistent sidebar state & mobile bottom nav
  const hasUser = Boolean(user || resolvedUser);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!hideNavbar && hasUser) {
      document.body.dataset.hasBottomNav = 'true';
    } else {
      delete document.body.dataset.hasBottomNav;
    }
    if (!usePersistentSidebar) {
      delete document.body.dataset.sidebar;
      return () => {
        delete document.body.dataset.hasBottomNav;
      };
    }
    document.body.dataset.sidebar = desktopExpanded ? 'expanded' : 'hidden';
    return () => {
      delete document.body.dataset.sidebar;
      delete document.body.dataset.hasBottomNav;
    };
  }, [usePersistentSidebar, desktopExpanded, hideNavbar, hasUser]);

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
      setDesktopHovered(false);
      setMobileOpen((prev) => !prev);
    } else {
      setDesktopExpanded((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('hdd_sidebar_pinned', String(next));
        } catch {}
        return next;
      });
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
  const needsMobileMenu = isOfficer || canOfficeDuty || !isStudentAccount;

  const shouldTrackPending = Boolean(effectiveUser && (isSuperAdmin || isOfficeAdmin || canViewProposals));
  const [adminPending, setAdminPending] = useState<AdminPendingCounts>(
    () => pendingClientCache?.data || { pending_proposals: 0, pending_office_borrows: 0 }
  );

  useEffect(() => {
    if (!shouldTrackPending) return;
    let active = true;
    const load = async (force = false) => {
      const data = await fetchAdminPendingCounts(force);
      if (active) setAdminPending(data);
    };
    load(false);
    const onChanged = () => {
      pendingClientCache = null;
      load(true);
    };
    const onFocus = () => {
      if (!pendingClientCache || Date.now() >= pendingClientCache.expiresAt) {
        load(false);
      }
    };
    window.addEventListener('hdd:pending-counts-changed', onChanged);
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('hdd:pending-counts-changed', onChanged);
      window.removeEventListener('focus', onFocus);
    };
  }, [shouldTrackPending]);

  const pendingProposals = canViewProposals
    ? typeof superAdminBadges?.proposals === 'number'
      ? superAdminBadges.proposals
      : adminPending.pending_proposals
    : 0;
  const pendingOfficeBorrows = isOfficeAdmin ? adminPending.pending_office_borrows : 0;
  const totalAdminPending = pendingProposals + pendingOfficeBorrows;

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
    : '/admin';

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
              className={`${styles.menuToggleBtn} ${!needsMobileMenu ? styles.menuToggleHideMobile : ''}`}
              title={
                desktopExpanded
                  ? 'Đang ghim thanh điều hướng (Bấm để ẩn)'
                  : 'Thanh điều hướng (Rê chuột hoặc bấm để mở)'
              }
              aria-label="Thanh điều hướng"
            >
              <MenuIcon size={20} />
              {totalAdminPending > 0 && (
                <span
                  className={styles.menuAlertDot}
                  aria-label={`${totalAdminPending} mục cần duyệt`}
                />
              )}
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
              {/* ── NHÓM 1: CỔNG SINH VIÊN (Hiện với tài khoản sinh viên) ── */}
              {isStudentAccount && (
                <>
                  <div className={styles.sidebarSectionLabel}>Cổng Sinh Viên</div>

                  <Link
                    href="/?view=student"
                    title="Thẻ QR & Tổng quan cá nhân"
                    className={`${styles.sidebarItem} ${isOverviewActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <QrCodeIcon size={17} />
                    </span>
                    <span className={styles.sidebarLabel}>Thẻ QR &amp; Tổng quan</span>
                  </Link>

                  <Link
                    href="/events"
                    title="Sự kiện"
                    className={`${styles.sidebarItem} ${isEventsActive ? styles.sidebarItemActive : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className={styles.sidebarIcon}>
                      <CalendarIcon size={17} />
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
                      <BadgeMedalIcon size={17} />
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
                      <CheckCircleIcon size={17} />
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
                      <HistoryIcon size={17} />
                    </span>
                    <span className={styles.sidebarLabel}>Lịch sử minh chứng</span>
                  </Link>

                  {canOfficeDuty && (
                    <Link
                      href="/office/duty"
                      title="Trực văn phòng Đoàn"
                      className={`${styles.sidebarItem} ${isOfficeDutyPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <ClockIcon size={17} />
                      </span>
                      <span className={styles.sidebarLabel}>Trực văn phòng</span>
                    </Link>
                  )}
                </>
              )}

              {/* ── NHÓM 2: NGHIỆP VỤ CÁN BỘ / LCĐ (Tự hiện thêm theo quyền) ── */}
              {(isOfficer || !isStudentAccount) && (
                <>
                  {isStudentAccount && <div className={styles.sidebarDivider} />}
                  <div className={styles.sidebarSectionLabel}>Nghiệp Vụ &amp; LCĐ</div>

                  {canManageEvents && (
                    <Link
                      href="/admin"
                      title="Sự kiện & Quản lý LCĐ"
                      className={`${styles.sidebarItem} ${isAdminHome ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <BuildingIcon size={17} />
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
                        <FileTextIcon size={17} />
                      </span>
                      <span className={styles.sidebarLabel}>Kế hoạch duyệt</span>
                      {pendingProposals > 0 && (
                        <span className={styles.sidebarBadgeRed}>
                          {pendingProposals > 99 ? '99+' : pendingProposals}
                        </span>
                      )}
                    </Link>
                  )}

                  {isOfficeAdmin && (
                    <Link
                      href="/office/admin"
                      title="Quản trị Văn phòng Đoàn"
                      className={`${styles.sidebarItem} ${isOfficeAdminPage ? styles.sidebarItemActive : ''}`}
                      onClick={closeSidebar}
                    >
                      <span className={styles.sidebarIcon}>
                        <ClockIcon size={17} />
                      </span>
                      <span className={styles.sidebarLabel}>Văn phòng Đoàn</span>
                      {pendingOfficeBorrows > 0 && (
                        <span className={styles.sidebarBadgeRed}>
                          {pendingOfficeBorrows > 99 ? '99+' : pendingOfficeBorrows}
                        </span>
                      )}
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
                        <BuildingIcon size={17} />
                      </span>
                      <span className={styles.sidebarLabel}>Mượn dụng cụ VPĐ</span>
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
                        <ScanCameraIcon size={17} />
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
                        <KeyIcon size={17} />
                      </span>
                      <span className={styles.sidebarLabel}>Chìa khóa phòng</span>
                    </Link>
                  )}

                  {!isStudentAccount && (
                    <>
                      <Link
                        href="/events"
                        title="Sự kiện"
                        className={`${styles.sidebarItem} ${isEventsActive ? styles.sidebarItemActive : ''}`}
                        onClick={closeSidebar}
                      >
                        <span className={styles.sidebarIcon}>
                          <CalendarIcon size={17} />
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
                          <BadgeMedalIcon size={17} />
                        </span>
                        <span className={styles.sidebarLabel}>Bảng xếp hạng</span>
                      </Link>
                    </>
                  )}
                </>
              )}

              {/* ── NHÓM 3: QUẢN TRỊ TOÀN TRƯỜNG (Chỉ hiện thêm với Super Admin) ── */}
              {isSuperAdmin && (
                <>
                  <div className={styles.sidebarDivider} />
                  <div className={styles.sidebarSectionLabel}>Quản Trị Toàn Trường</div>

                  {(
                    [
                      { id: 'events', label: 'Quản lý Sự kiện', icon: <CalendarIcon size={17} /> },
                      { id: 'proposals', label: 'Duyệt Kế Hoạch', icon: <FileTextIcon size={17} /> },
                      { id: 'officers', label: 'Cán Bộ & Phân Quyền', icon: <UsersIcon size={17} /> },
                      { id: 'rooms', label: 'Địa Điểm & Phòng', icon: <SettingsIcon size={17} /> },
                      { id: 'units', label: 'Đơn Vị / LCĐ', icon: <BuildingIcon size={17} /> },
                      { id: 'students', label: 'Quản lý Sinh viên', icon: <UsersIcon size={17} /> },
                      { id: 'delegates', label: 'BCH Chi Đoàn (ĐRL)', icon: <CheckCircleIcon size={17} /> },
                      { id: 'blacklist', label: 'Danh Sách Đen', icon: <ShieldCheckIcon size={17} /> },
                      { id: 'settings', label: 'Học kỳ & Hệ thống', icon: <SettingsIcon size={17} /> },
                    ] as Array<{ id: SuperAdminSidebarTab; label: string; icon: React.ReactNode }>
                  ).map((item) => {
                    const isActive = isSuperAdminPage && activeSuperAdminTab === item.id;
                    const badgeVal =
                      item.id === 'proposals'
                        ? pendingProposals
                        : superAdminBadges?.[item.id];
                    const isAlertBadge = item.id === 'proposals' || item.id === 'blacklist';
                    if (isSuperAdminPage && onSelectSuperAdminTab) {
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                          style={{ width: '100%', border: 'none', background: isActive ? undefined : 'transparent', cursor: 'pointer', textAlign: 'left', justifyContent: 'space-between' }}
                          onClick={() => {
                            onSelectSuperAdminTab(item.id);
                            if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                              closeSidebar();
                            }
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                            <span className={styles.sidebarIcon}>{item.icon}</span>
                            <span className={styles.sidebarLabel}>{item.label}</span>
                          </span>
                          {typeof badgeVal === 'number' && badgeVal > 0 && (
                            <span
                              className={item.id === 'proposals' ? styles.sidebarBadgeRed : undefined}
                              style={
                                item.id === 'proposals'
                                  ? undefined
                                  : {
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      padding: '0.08rem 0.45rem',
                                      borderRadius: '999px',
                                      background: isAlertBadge ? '#fee2e2' : '#f1f5f9',
                                      color: isAlertBadge ? '#b91c1c' : '#475569',
                                    }
                              }
                            >
                              {badgeVal > 99 ? '99+' : badgeVal}
                            </span>
                          )}
                        </button>
                      );
                    }
                    return (
                      <Link
                        key={item.id}
                        href={`/super-admin?tab=${item.id}`}
                        className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`}
                        onClick={closeSidebar}
                      >
                        <span className={styles.sidebarIcon}>{item.icon}</span>
                        <span className={styles.sidebarLabel}>{item.label}</span>
                        {item.id === 'proposals' && typeof badgeVal === 'number' && badgeVal > 0 && (
                          <span className={styles.sidebarBadgeRed}>
                            {badgeVal > 99 ? '99+' : badgeVal}
                          </span>
                        )}
                      </Link>
                    );
                  })}
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

      {/* Mobile Native-Style Bottom Tab Bar (≤ 768px) */}
      {!hideNavbar && effectiveUser && (
        <MobileBottomNav
          pathname={pathname}
          activeStudentTab={activeStudentTab}
          isStudentAccount={isStudentAccount}
          isOfficer={isOfficer}
          isSuperAdmin={isSuperAdmin}
          canManageEvents={canManageEvents}
          canViewProposals={canViewProposals}
          canSecurity={canSecurity}
          adminBadgeCount={totalAdminPending}
          proposalBadgeCount={pendingProposals}
        />
      )}
    </>
  );
}
