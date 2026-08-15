'use client';

import React from 'react';
import styles from './RoleSelector.module.css';
import { ParticipateRole } from '@/lib/types';

interface RoleSelectorProps {
  selectedRole?: ParticipateRole;
  value?: ParticipateRole;
  onChange: (role: ParticipateRole) => void;
}

export default function RoleSelector({ selectedRole, value, onChange }: RoleSelectorProps) {
  const roles: ParticipateRole[] = ['participant', 'volunteer', 'organizer'];
  const currentRole = value !== undefined ? value : (selectedRole || 'participant');
  
  // Map internal labels to requested short display texts
  const displayLabels: Record<ParticipateRole, string> = {
    participant: 'NGƯỜI THAM GIA',
    volunteer: 'CTV',
    organizer: 'BTC'
  };

  return (
    <div className={styles.container}>
      {roles.map((role) => {
        const isSelected = currentRole === role;
        return (
          <button
            key={role}
            className={`${styles.roleButton} ${styles[role]} ${isSelected ? styles.selected : ''}`}
            onClick={() => onChange(role)}
            aria-pressed={isSelected}
            type="button"
          >
            <span className={styles.label}>{displayLabels[role]}</span>
          </button>
        );
      })}
    </div>
  );
}
