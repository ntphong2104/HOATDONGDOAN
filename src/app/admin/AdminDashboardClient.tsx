'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import EventCard from '@/components/EventCard';
import { CalendarIcon, ScanCameraIcon, PlusIcon, CloseIcon } from '@/components/icons';
import type { Event } from '@/lib/types';
import styles from './AdminDashboardClient.module.css';

interface AdminDashboardClientProps {
  initialEvents: Event[];
}

export default function AdminDashboardClient({ initialEvents }: AdminDashboardClientProps) {
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('22:00');
  const [submitting, setSubmitting] = useState(false);

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events');
      const data = await res.json();
      if (data.success && data.data) {
        setEvents(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: eventName.trim(),
          event_date: eventDate,
          start_time: startTime,
          end_time: endTime,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('Đã gửi yêu cầu mở chương trình thành công! Đang chờ Super Admin phê duyệt.');
        setEventName('');
        setShowProposeForm(false);
        fetchEvents();
      } else {
        alert(`Không thể gửi yêu cầu: ${data.message || data.error || 'Lỗi kết nối'}`);
      }
    } catch (err: any) {
      alert(`Đã xảy ra lỗi: ${err.message || 'Lỗi mạng'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={styles.tabs}>
        <div className={styles.tabActive}>
          <CalendarIcon size={16} />
          Sự kiện phụ trách
        </div>
        <Link href="/admin/proposals" className={styles.tabInactive} style={{ color: '#c2410c', borderColor: '#fed7aa', background: '#fff7ed' }}>
          📋 Kế hoạch trình duyệt
        </Link>
        <Link href="/scanner" className={styles.tabInactive}>
          <ScanCameraIcon size={16} />
          Máy quét QR
        </Link>
      </div>

      <div className={styles.headerSection}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Quản lý sự kiện & Chương trình</h1>
          <p className={styles.subtitle}>
            Bấm vào từng sự kiện đang mở để xem danh sách điểm danh, chiếu mã QR động và xuất Excel
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link
            href="/admin/proposals/new"
            className={styles.proposeButton}
            style={{ textDecoration: 'none', background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)' }}
          >
            <PlusIcon size={18} />
            <span>Trình Kế Hoạch Sự Kiện Mới</span>
          </Link>
        </div>
      </div>

      {/* Biểu mẫu đề xuất chương trình mới */}
      {showProposeForm && (
        <div className={styles.proposeCard}>
          <div className={styles.proposeHeader}>
            <h3 className={styles.proposeTitle}>Gửi yêu cầu mở chương trình mới tới Super Admin</h3>
            <button
              onClick={() => setShowProposeForm(false)}
              className={styles.closeProposeButton}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmitProposal} className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tên chương trình / sự kiện *</label>
              <input
                type="text"
                placeholder="VD: Hội thảo Công nghệ Web 2026..."
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ngày tổ chức</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Giờ bắt đầu</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Giờ kết thúc</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            <button type="submit" className={styles.submitButton} disabled={submitting}>
              {submitting ? 'Đang gửi...' : 'Gửi yêu cầu'}
            </button>
          </form>
        </div>
      )}

      {/* Grid danh sách sự kiện */}
      <div className={styles.eventGrid}>
        {!events || events.length === 0 ? (
          <div className={styles.empty}>
            Bạn chưa có sự kiện nào. Hãy bấm <strong>"Đề xuất / Yêu cầu mở chương trình mới"</strong> ở phía trên để gửi yêu cầu tới Super Admin Đoàn trường!
          </div>
        ) : (
          events.map((event) => {
            const isApproved = event.status === 'active' || event.status === 'closed';
            if (isApproved) {
              return (
                <Link
                  key={event.event_id}
                  href={`/admin/events/${event.event_id}`}
                  style={{ display: 'flex', height: '100%', textDecoration: 'none' }}
                >
                  <EventCard event={event} />
                </Link>
              );
            }

            return (
              <div
                key={event.event_id}
                onClick={() => {
                  if (event.status === 'pending') {
                    alert('Sự kiện đang chờ Super Admin phê duyệt. Bạn sẽ có thể chiếu mã QR và quét điểm danh ngay khi được duyệt!');
                  } else if (event.status === 'rejected') {
                    alert('Chương trình này đã bị Super Admin từ chối phê duyệt.');
                  }
                }}
                style={{ display: 'flex', height: '100%', cursor: 'pointer' }}
              >
                <EventCard event={event} />
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
