'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchMeCached, invalidateClientMeCache } from '@/lib/client/me-cache';
import {
  UserIcon,
  ShieldCheckIcon,
  SettingsIcon,
  ScanCameraIcon,
  LogoutIcon,
  QrCodeIcon,
  CalendarIcon,
  YouthUnionIcon,
  UsersIcon,
  KeyIcon,
  BuildingIcon,
} from '@/components/icons';
import { isUnitAccount } from '@/lib/utils/extract-mssv';
import ThemeToggleButton from '@/components/ThemeToggleButton';
import type { SessionUser } from '@/lib/types';
import styles from './UserMenuDropdown.module.css';

interface UserMenuDropdownProps {
  user?: SessionUser | null;
  userName?: string;
  avatarUrl?: string;
  onLogout?: () => void;
}

export default function UserMenuDropdown({
  user: propUser,
  userName: propUserName,
  avatarUrl: propAvatarUrl,
  onLogout,
}: UserMenuDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(propUser || null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Use propUser as initial state immediately for fast render (no redundant /api/me fetch when SSR provided user),
    // without overwriting the global me-cache (which pages like /scanner rely on for full managed_events).
    if (propUser && propUser.full_name) {
      queueMicrotask(() => {
        if (!cancelled) setCurrentUser(propUser);
      });
      if (propUser.mssv !== 'TO-BAOVE') {
        try {
          sessionStorage.setItem('ptit_user_session_cache', JSON.stringify(propUser));
        } catch {}
      }
      return () => {
        cancelled = true;
      };
    }

    // Read cached session on client mount
    try {
      const cached = sessionStorage.getItem('ptit_user_session_cache');
      if (cached) {
        const parsedCached = JSON.parse(cached);
        queueMicrotask(() => {
          if (!cancelled) setCurrentUser(parsedCached);
        });
      }
    } catch {}

    // Fetch /api/me (coalesced via shared client cache) only when rich propUser was not passed from SSR
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      fetchMeCached()
        .then(({ json: data }) => {
          if (!cancelled && data?.success && data?.data) {
            setCurrentUser(data.data);
            try {
              sessionStorage.setItem('ptit_user_session_cache', JSON.stringify(data.data));
            } catch {}
          }
        })
        .catch((err) => {
          console.error('Failed to fetch user profile', err);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [propUser, propUserName, propAvatarUrl]);

  // Click outside & Escape key listener
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogout = async () => {
    invalidateClientMeCache();
    if (onLogout) {
      onLogout();
      return;
    }
    try {
      sessionStorage.removeItem('ptit_user_session_cache');
      sessionStorage.removeItem('demo_role');
      sessionStorage.removeItem('demo_email');
      const supabase = createClient();
      await supabase.auth.signOut();
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    window.location.replace('/login');
  };

  const displayName =
    currentUser?.full_name ||
    propUserName ||
    currentUser?.email?.split('@')[0] ||
    'Tài khoản';
  const tier = currentUser?.tier || (propUser?.tier) || 'user';

  const tierLabel =
    tier === 'super_admin'
      ? 'Super Admin'
      : tier === 'youth_union'
      ? 'Đoàn Học Viện (Phê Duyệt)'
      : tier === 'ctsv'
      ? 'Phòng CTSV (Phê Duyệt)'
      : tier === 'facility'
      ? 'Phòng. TC-HC-QT (Phê Duyệt)'
      : tier === 'security'
      ? 'Tổ Bảo Vệ (Bàn Giao Chìa Khóa)'
      : tier === 'office_admin'
      ? 'Admin Văn phòng Đoàn'
      : tier === 'event_admin'
      ? 'Admin Sự Kiện (LCĐ / CLB)'
      : tier === 'checker'
      ? 'Cộng Tác Viên'
      : 'Sinh Viên';

  const isPureApprover = tier === 'youth_union' || tier === 'ctsv' || tier === 'facility';

  const rawAvatar = currentUser?.avatar_url || propAvatarUrl;
  const hasRealAvatar =
    !!rawAvatar &&
    failedAvatarUrl !== rawAvatar &&
    (rawAvatar.startsWith('http') || rawAvatar.startsWith('/'));
  const initialLetter = (displayName ? displayName.trim().charAt(0).toUpperCase() : 'U');

  const isUnit = isUnitAccount({
    email: currentUser?.email || propUser?.email,
    mssv: currentUser?.mssv || propUser?.mssv,
  });
  const isStudentAccount = !isUnit;

  return (
    <div className={styles.wrapper} ref={menuRef}>
      {/* Trigger Button */}
      <button
        type="button"
        className={styles.triggerButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="Bấm để mở danh mục chức năng cá nhân"
      >
        {hasRealAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rawAvatar}
            alt={displayName}
            className={styles.avatar}
            referrerPolicy="no-referrer"
            onError={() => setFailedAvatarUrl(rawAvatar || null)}
          />
        ) : (
          <div className={styles.avatarFallback} suppressHydrationWarning>
            {initialLetter}
          </div>
        )}
        <span className={styles.userNameText} suppressHydrationWarning>{displayName}</span>
        <svg
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown Menu Box */}
      {isOpen && (
        <div className={styles.dropdownMenu}>
          {/* User Profile Card Header */}
          <div className={styles.userCardHeader}>
            {hasRealAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rawAvatar}
                alt={displayName}
                className={styles.largeAvatar}
                referrerPolicy="no-referrer"
                onError={() => setFailedAvatarUrl(rawAvatar || null)}
              />
            ) : (
              <div
                className={styles.largeAvatar}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  fontSize: '1.25rem',
                  fontWeight: 800,
                }}
              >
                {initialLetter}
              </div>
            )}
            <div className={styles.userDetails}>
              <span className={styles.fullName} title={displayName}>
                {displayName}
              </span>
              <span className={styles.emailText} title={currentUser?.email || ''}>
                {currentUser?.email || ''}
              </span>
              <div className={styles.badgesRow}>
                <span className={`${styles.tierBadge} ${styles[tier] || styles.user}`}>
                  {tierLabel}
                </span>
                {currentUser?.mssv &&
                  currentUser.mssv !== 'SUPER_ADMIN' &&
                  currentUser.mssv !== 'EVENT_ADMIN' &&
                  currentUser.mssv !== 'DOAN-HV' &&
                  currentUser.mssv !== 'PHONG-CTSV' &&
                  currentUser.mssv !== 'PHONG-CSVC' &&
                  currentUser.mssv !== 'PHONG-TCHCQT' && (
                    <span
                      className={styles.tierBadge}
                      style={{ background: 'var(--bg-muted)', color: 'var(--text-secondary)' }}
                    >
                      {currentUser.mssv}
                    </span>
                  )}
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <ul className={styles.menuList}>
            {/* Cổng Sinh Viên & Mã QR Cá Nhân (Chỉ dành cho sinh viên cá nhân có MSSV thật) */}
            {isStudentAccount ? (
              <li>
                <Link
                  href="/?view=student"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: 'var(--status-green-text)' }}>
                    <QrCodeIcon size={16} />
                  </div>
                  <span>Cổng Sinh Viên & Mã QR Cá Nhân</span>
                </Link>
              </li>
            ) : (
              <li>
                <Link
                  href="/admin"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: 'var(--text-brand)' }}>
                    <BuildingIcon size={16} />
                  </div>
                  <span>Bàn Làm Việc LCĐ &amp; Quản Lý Sự Kiện</span>
                </Link>
              </li>
            )}

            {/* Pure Department Approvers Menu */}
            {isPureApprover && (
              <li>
                <Link
                  href="/admin/proposals"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: 'var(--status-amber-text)' }}>
                    <ShieldCheckIcon size={16} />
                  </div>
                  <span>Bàn Phê Duyệt Kế Hoạch</span>
                </Link>
              </li>
            )}

            {/* If Super Admin */}
            {tier === 'super_admin' && (
              <li>
                <Link
                  href="/super-admin"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: 'var(--status-red-text)' }}>
                    <ShieldCheckIcon size={16} />
                  </div>
                  <span>Bảng Quản Trị Toàn Trường</span>
                </Link>
              </li>
            )}

            {/* If Office Admin or Super Admin */}
            {(tier === 'office_admin' || Boolean(currentUser?.isOfficeAdmin)) && (
              <li>
                <Link
                  href="/office/admin"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: 'var(--status-amber-text)' }}>
                    <BuildingIcon size={16} />
                  </div>
                  <span>Quản Trị Văn Phòng Đoàn</span>
                </Link>
              </li>
            )}

            {/* If Security or Super Admin or Facility */}
            {(tier === 'security' || tier === 'super_admin' || tier === 'facility' || Boolean(currentUser?.isSecurity)) && (
              <li>
                <Link
                  href="/security"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: 'var(--status-green-text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyIcon size={16} color="var(--status-green-text)" />
                  </div>
                  <span>Sổ Trực Bàn Giao Chìa Khóa</span>
                </Link>
              </li>
            )}

            {/* If Event Admin or Super Admin (FULL admin — not students with event roles) */}
            {(tier === 'super_admin' || tier === 'event_admin' || Boolean(currentUser?.isSuperAdmin)) && (
              <>
                <li>
                  <Link
                    href="/admin/proposals"
                    className={styles.menuItem}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className={styles.menuItemIcon} style={{ color: 'var(--status-amber-text)' }}>
                      <CalendarIcon size={16} />
                    </div>
                    <span>Trình & Duyệt Kế Hoạch Sự Kiện</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin"
                    className={styles.menuItem}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className={styles.menuItemIcon} style={{ color: 'var(--status-amber-text)' }}>
                      <SettingsIcon size={16} />
                    </div>
                    <span>Quản Lý Sự Kiện & Điểm Danh</span>
                  </Link>
                </li>
              </>
            )}

            {/* Students who manage specific events (tier=user but have managed_events) */}
            {tier === 'user' && currentUser?.managed_events && currentUser.managed_events.length > 0 && (
              <>
                <li className={styles.divider} />
                <li style={{ padding: '0.35rem 1rem 0.15rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--status-purple-text)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Sự kiện tôi quản lý
                  </span>
                </li>
                {currentUser.managed_events
                  .filter((e: any) => e.status === 'active' && e.is_active !== false)
                  .slice(0, 5)
                  .map((evt: any) => (
                    <li key={evt.event_id}>
                      <Link
                        href={`/admin/events/${evt.event_id}`}
                        className={styles.menuItem}
                        onClick={() => setIsOpen(false)}
                      >
                        <div className={styles.menuItemIcon} style={{ color: 'var(--status-purple-text)' }}>
                          <CalendarIcon size={16} />
                        </div>
                        <span style={{ fontSize: '0.85rem' }}>{evt.event_name || 'Sự kiện'}</span>
                      </Link>
                    </li>
                  ))}
                <li>
                  <Link
                    href="/scanner"
                    className={styles.menuItem}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className={styles.menuItemIcon} style={{ color: 'var(--text-brand)' }}>
                      <ScanCameraIcon size={16} />
                    </div>
                    <span>Máy Quét Điểm Danh (Camera)</span>
                  </Link>
                </li>
              </>
            )}

            {/* If Checker or above (not pure approver, not student-with-events) */}
            {!isPureApprover &&
              tier !== 'user' &&
              (tier === 'super_admin' || tier === 'event_admin' || tier === 'checker' || Boolean(currentUser?.isChecker) || Boolean(currentUser?.isSuperAdmin)) && (
                <li>
                  <Link
                    href="/scanner"
                    className={styles.menuItem}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className={styles.menuItemIcon} style={{ color: 'var(--text-brand)' }}>
                      <ScanCameraIcon size={16} />
                    </div>
                    <span>Máy Quét Điểm Danh (Camera)</span>
                  </Link>
                </li>
              )}

            <li className={styles.divider} />

            {/* Theme Preference Switcher (Sáng / Tối / Hệ thống) */}
            <li>
              <ThemeToggleButton variant="segmented" />
            </li>

            <li className={styles.divider} />

            {/* Logout Action */}
            <li>
              <button
                type="button"
                className={`${styles.menuItem} ${styles.logoutItem}`}
                onClick={handleLogout}
                aria-label="Đăng xuất"
              >
                <div className={styles.menuItemIcon}>
                  <LogoutIcon size={16} />
                </div>
                <span>Đăng Xuất Khỏi Hệ Thống</span>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
