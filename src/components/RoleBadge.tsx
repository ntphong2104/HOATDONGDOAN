import React from 'react';
import styles from './RoleBadge.module.css';
import { ParticipateRole, ROLE_LABELS } from '@/lib/types';

interface RoleBadgeProps {
  role: ParticipateRole;
  size?: 'sm' | 'md';
}

export default function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[role]} ${styles[size]}`}>
      {ROLE_LABELS[role]}
    </span>
  );
}
