'use client';

import React from 'react';
import Link from 'next/link';
import {
  QrCodeIcon,
  CalendarIcon,
  BadgeMedalIcon,
  HistoryIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  BuildingIcon,
  FileTextIcon,
} from '@/components/icons';
import styles from './MobileBottomNav.module.css';

interface MobileBottomNavProps {
  pathname: string;
  activeStudentTab?: 'overview' | 'registered' | 'history' | 'delegate';
  isStudentAccount: boolean;
  isOfficer: boolean;
  isSuperAdmin: boolean;
  canManageEvents: boolean;
  canViewProposals: boolean;
  canSecurity: boolean;
  adminBadgeCount?: number;
  proposalBadgeCount?: number;
}

export default function MobileBottomNav({
  pathname,
  activeStudentTab = 'overview',
  isStudentAccount,
  isOfficer,
  isSuperAdmin,
  canManageEvents,
  canViewProposals,
  canSecurity,
  adminBadgeCount = 0,
  proposalBadgeCount = 0,
}: MobileBottomNavProps) {
  const adminHref = isSuperAdmin
    ? '/super-admin'
    : canManageEvents
    ? '/admin'
    : canViewProposals
    ? '/admin/proposals'
    : canSecurity
    ? '/security'
    : '/admin';

  const isHomeActive = pathname === '/' && activeStudentTab === 'overview';
  const isEventsActive = pathname === '/events' || pathname.startsWith('/events/');
  const isRankingActive = pathname === '/ranking' || pathname.startsWith('/ranking/');
  const isHistoryActive = pathname === '/' && activeStudentTab === 'history';
  const isRegisteredActive = pathname === '/' && activeStudentTab === 'registered';
  const isAdminActive =
    pathname.startsWith('/super-admin') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/office') ||
    pathname.startsWith('/security') ||
    pathname.startsWith('/scanner');

  const items = isStudentAccount
    ? [
        {
          key: 'home',
          href: '/?view=student',
          label: 'Thẻ QR',
          active: isHomeActive,
          icon: <QrCodeIcon size={20} />,
        },
        {
          key: 'events',
          href: '/events',
          label: 'Sự kiện',
          active: isEventsActive,
          icon: <CalendarIcon size={20} />,
        },
        {
          key: 'ranking',
          href: '/ranking',
          label: 'Xếp hạng',
          active: isRankingActive,
          icon: <BadgeMedalIcon size={20} />,
        },
        {
          key: 'history',
          href: '/?view=student&tab=history',
          label: 'Minh chứng',
          active: isHistoryActive,
          icon: <HistoryIcon size={20} />,
        },
        isOfficer
          ? {
              key: 'admin',
              href: adminHref,
              label: 'Quản trị',
              active: isAdminActive,
              icon: <ShieldCheckIcon size={20} />,
            }
          : {
              key: 'registered',
              href: '/?view=student&tab=registered',
              label: 'Đã ĐK',
              active: isRegisteredActive,
              icon: <CheckCircleIcon size={20} />,
            },
      ]
    : [
        {
          key: 'admin',
          href: adminHref,
          label: 'Quản trị',
          active: pathname.startsWith('/super-admin') || pathname === '/admin',
          icon: isSuperAdmin ? <ShieldCheckIcon size={20} /> : <BuildingIcon size={20} />,
        },
        {
          key: 'proposals',
          href: '/admin/proposals',
          label: 'Kế hoạch',
          active: pathname.startsWith('/admin/proposals'),
          icon: <FileTextIcon size={20} />,
        },
        {
          key: 'events',
          href: '/events',
          label: 'Sự kiện',
          active: isEventsActive,
          icon: <CalendarIcon size={20} />,
        },
        {
          key: 'ranking',
          href: '/ranking',
          label: 'Xếp hạng',
          active: isRankingActive,
          icon: <BadgeMedalIcon size={20} />,
        },
      ];

  return (
    <nav className={styles.bottomNav} aria-label="Điều hướng nhanh di động">
      {items.map((item) => {
        const badge =
          item.key === 'admin'
            ? adminBadgeCount
            : item.key === 'proposals'
            ? proposalBadgeCount
            : 0;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={`${styles.navItem} ${item.active ? styles.navItemActive : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <span className={styles.navIcon}>
              {item.icon}
              {badge > 0 && (
                <span className={styles.navBadge}>{badge > 99 ? '99+' : badge}</span>
              )}
            </span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
