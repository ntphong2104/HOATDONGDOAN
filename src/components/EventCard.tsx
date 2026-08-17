import React from 'react';
import styles from './EventCard.module.css';
import { CalendarIcon, ClockIcon, UsersIcon } from '@/components/icons';
import { isEventPastDeadline, getEventLifecycleState } from '@/lib/utils/event-logic';
import { Event } from '@/lib/types';

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

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString('vi-VN')
    : 'Hôm nay';

  const timeStr =
    event.start_time && event.end_time
      ? `${event.start_time.slice(0, 5)} - ${event.end_time.slice(0, 5)}`
      : event.start_time
      ? `${event.start_time.slice(0, 5)}`
      : null;

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
