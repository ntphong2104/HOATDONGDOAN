'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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
} from '@/components/icons';
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
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(() => {
    if (propUser && propUser.full_name) return propUser;
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('ptit_user_session_cache');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return propUser || null;
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If propUser is already provided, use it directly without network call
    if (propUser && propUser.full_name) {
      setCurrentUser(propUser);
      try {
        sessionStorage.setItem('ptit_user_session_cache', JSON.stringify(propUser));
      } catch {}
      return;
    }

    // Fetch user profile
    if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      window
        .fetch('/api/me')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setCurrentUser(data.data);
            try {
              sessionStorage.setItem('ptit_user_session_cache', JSON.stringify(data.data));
            } catch {}
          } else if (propUser) {
            setCurrentUser(propUser);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch user profile', err);
          if (propUser) setCurrentUser(propUser);
        });
    }
  }, [propUser, propUserName, propAvatarUrl]);

  // Click outside listener
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

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

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

  const displayName = currentUser?.full_name || propUserName || currentUser?.email?.split('@')[0] || 'Tài khoản';
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
      : tier === 'event_admin'
      ? 'Admin Sự Kiện (LCĐ / CLB)'
      : tier === 'checker'
      ? 'Cộng Tác Viên'
      : 'Sinh Viên';

  const isPureApprover = tier === 'youth_union' || tier === 'ctsv' || tier === 'facility';

  const rawAvatar = currentUser?.avatar_url || propAvatarUrl;
  const hasRealAvatar = !!rawAvatar && !imgError && (rawAvatar.startsWith('http') || rawAvatar.startsWith('/'));
  const initialLetter = (displayName ? displayName.trim().charAt(0).toUpperCase() : 'U');

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
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={styles.avatarFallback}>
            {initialLetter}
          </div>
        )}
        <span className={styles.userNameText}>{displayName}</span>
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
                onError={() => setImgError(true)}
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
                      style={{ background: '#f1f5f9', color: '#475569' }}
                    >
                      {currentUser.mssv}
                    </span>
                  )}
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <ul className={styles.menuList}>
            {/* Cổng Sinh Viên & Mã QR Cá Nhân (Dành cho MỌI tài khoản kể cả Admin) */}
            <li>
              <Link
                href="/?view=student"
                className={styles.menuItem}
                onClick={() => setIsOpen(false)}
              >
                <div className={styles.menuItemIcon} style={{ color: '#16a34a' }}>
                  <QrCodeIcon size={16} />
                </div>
                <span>Cổng Sinh Viên & Mã QR Cá Nhân</span>
              </Link>
            </li>

            {/* Pure Department Approvers Menu */}
            {isPureApprover && (
              <li>
                <Link
                  href="/admin/proposals"
                  className={styles.menuItem}
                  onClick={() => setIsOpen(false)}
                >
                  <div className={styles.menuItemIcon} style={{ color: '#ea580c' }}>
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
                  <div className={styles.menuItemIcon} style={{ color: '#dc2626' }}>
                    <ShieldCheckIcon size={16} />
                  </div>
                  <span>Bảng Quản Trị Toàn Trường</span>
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
                  <div className={styles.menuItemIcon} style={{ color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <KeyIcon size={16} color="#059669" />
                  </div>
                  <span>Sổ Trực Bàn Giao Chìa Khóa</span>
                </Link>
              </li>
            )}

            {/* If Event Admin or Super Admin */}
            {(tier === 'super_admin' || tier === 'event_admin' || Boolean(currentUser?.isEventAdmin) || Boolean(currentUser?.isSuperAdmin) || Boolean(currentUser?.managed_events && currentUser.managed_events.length > 0)) && (
              <>
                <li>
                  <Link
                    href="/admin/proposals"
                    className={styles.menuItem}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className={styles.menuItemIcon} style={{ color: '#ea580c' }}>
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
                    <div className={styles.menuItemIcon} style={{ color: '#d97706' }}>
                      <SettingsIcon size={16} />
                    </div>
                    <span>Quản Lý Sự Kiện & Điểm Danh</span>
                  </Link>
                </li>
              </>
            )}

            {/* If Checker or above (not pure approver) */}
            {!isPureApprover &&
              (tier === 'super_admin' || tier === 'event_admin' || tier === 'checker' || Boolean(currentUser?.isChecker) || Boolean(currentUser?.isEventAdmin) || Boolean(currentUser?.isSuperAdmin) || Boolean(currentUser?.managed_events && currentUser.managed_events.length > 0)) && (
                <li>
                  <Link
                    href="/scanner"
                    className={styles.menuItem}
                    onClick={() => setIsOpen(false)}
                  >
                    <div className={styles.menuItemIcon} style={{ color: '#2563eb' }}>
                      <ScanCameraIcon size={16} />
                    </div>
                    <span>Máy Quét Điểm Danh (Camera)</span>
                  </Link>
                </li>
              )}

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
