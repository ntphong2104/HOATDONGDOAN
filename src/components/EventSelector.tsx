'use client';

import React from 'react';
import styles from './EventSelector.module.css';

import { ChevronDownIcon } from '@/components/icons';

interface EventSelectorProps {
  events: Array<{ event_id: string; event_name: string }>;
  selectedEventId?: string;
  value?: string;
  onChange: (id: string) => void;
}

export default function EventSelector({ events, selectedEventId, value, onChange }: EventSelectorProps) {
  const currentVal = value !== undefined ? value : (selectedEventId || '');

  return (
    <div className={styles.wrapper}>
      <select
        className={styles.select}
        value={currentVal}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>-- Chọn sự kiện --</option>
        {events.map((event) => (
          <option key={event.event_id} value={event.event_id}>
            {event.event_name}
          </option>
        ))}
      </select>
      <div className={styles.icon}>
        <ChevronDownIcon size={18} />
      </div>
    </div>
  );
}
