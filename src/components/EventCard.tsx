import React from 'react';
import styles from './EventCard.module.css';
import { CalendarIcon, ClockIcon, MapPinIcon, UsersIcon } from '@/components/icons';
import {
  isEventPastDeadline,
  getEventLifecycleState,
  getEffectiveEndDate,
  resolveEventDisplayLocation,
} from '@/lib/utils/event-logic';
import { Event } from '@/lib/types';

function formatEventCardDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const clean = String(dateStr).split('T')[0].trim();
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const dt = new Date(dateStr);
  return Number.isNaN(dt.getTime()) ? String(dateStr) : dt.toLocaleDateString('vi-VN');
}

interface EventCardProps {
  event: Event & { checkin_count?: number };
  onClick?: () => void;
}

export default function EventCard({ event, onClick }: EventCardProps) {
  const isPast = typeof isEventPastDeadline === 'function' ? isEventPastDeadline(event) : false;
  const rawStatus = event.status || 'closed';
  const status = isPast ? 'closed' : rawStatus;
  const lifecycle = typeof getEventLifecycleState === 'function' ? getEventLifecycleState(event) : (status === 'active' ? 'active' : 'closed');

  const statusLabel =
    status === 'closed' || isPast
      ? 'Đã đóng'
      : lifecycle === 'upcoming'
      ? 'Sắp diễn ra'
      : status === 'active'
      ? 'Đang mở'
      : status === 'pending'
      ? 'Chờ duyệt'
      : status === 'rejected'
      ? 'Từ chối'
      : 'Đã đóng';

  const statusClass =
    status === 'closed' || isPast
      ? styles.closed
      : lifecycle === 'upcoming'
      ? styles.pending
      : status === 'active'
      ? styles.active
      : status === 'pending'
      ? styles.pending
      : status === 'rejected'
      ? styles.rejected
      : styles.closed;

  const sessionCount = Array.isArray(event.sessions) ? event.sessions.length : 0;
  const effectiveEnd =
    typeof getEffectiveEndDate === 'function'
      ? getEffectiveEndDate(event)
      : event.end_date
      ? { date: event.end_date, endTime: event.end_time || '22:00' }
      : null;
  const startDateFormatted = formatEventCardDate(event.event_date) || 'Hôm nay';
  const endDateFormatted = effectiveEnd?.date ? formatEventCardDate(effectiveEnd.date) : null;

  const dateStr =
    endDateFormatted && endDateFormatted !== startDateFormatted
      ? sessionCount > 1
        ? `${startDateFormatted} – ${endDateFormatted} (${sessionCount} ca)`
        : `${startDateFormatted} – ${endDateFormatted}`
      : sessionCount > 1
      ? `${startDateFormatted} (${sessionCount} ca)`
      : startDateFormatted;

  const endTimeDisplay = (effectiveEnd?.endTime || event.end_time)?.slice(0, 5) || null;
  const timeStr =
    event.start_time && endTimeDisplay
      ? `${event.start_time.slice(0, 5)} - ${endTimeDisplay}`
      : event.start_time
      ? `${event.start_time.slice(0, 5)}`
      : null;

  const displayLocation =
    typeof resolveEventDisplayLocation === 'function'
      ? resolveEventDisplayLocation(event)
      : event.location || event.room_name || null;

  return (
    <div
      className={`${styles.card} ${onClick ? styles.clickable : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div>
        <div className={styles.header}>
          <h3 className={styles.title} title={event.event_name}>
            {event.event_name}
          </h3>
          <span className={`${styles.status} ${statusClass}`}>
            <span className={styles.dot}></span>
            {statusLabel}
          </span>
        </div>

        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <CalendarIcon size={14} />
            <span>{dateStr}</span>
          </div>
          {timeStr && (
            <div className={styles.metaItem}>
              <ClockIcon size={14} />
              <span>{timeStr}</span>
            </div>
          )}
          {displayLocation && (
            <div className={styles.metaItem} title={displayLocation}>
              <MapPinIcon size={14} />
              <span>{displayLocation}</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.organizer}>
          {event.created_by || 'Đoàn trường'}
        </div>

        {event.checkin_count !== undefined ? (
          <div className={styles.checkinBadge}>
            <UsersIcon size={13} />
            <span>{event.checkin_count}</span>
            <span>lượt</span>
          </div>
        ) : (
          <span className={styles.viewDetail}>Chi tiết →</span>
        )}
      </div>
    </div>
  );
}
