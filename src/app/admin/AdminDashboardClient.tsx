'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import EventCard from '@/components/EventCard';
import LcdManagementSection from './LcdManagementSection';
import RankingBoard from '@/components/RankingBoard';
import {
  CalendarIcon,
  ScanCameraIcon,
  PlusIcon,
  CloseIcon,
  FileTextIcon,
  UsersIcon,
  ShieldCheckIcon,
  BadgeMedalIcon,
} from '@/components/icons';
import type { Event } from '@/lib/types';
import type { LcdCode } from '@/lib/utils/lcd';
import styles from './AdminDashboardClient.module.css';

interface AdminDashboardClientProps {
  initialEvents: Event[];
  lcdScope?: {
    role: 'all' | 'lcd' | 'none';
    lcdCode: LcdCode | null;
    lcdName: string | null;
    lcdShortName: string | null;
  };
}

export default function AdminDashboardClient({
  initialEvents,
  lcdScope,
}: AdminDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<'events' | 'lcd_members' | 'lcd_delegates' | 'ranking'>('events');
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('22:00');
  const [submitting, setSubmitting] = useState(false);

  const canManageLcd = lcdScope?.role === 'lcd' || lcdScope?.role === 'all';
  const defaultLcdCode: LcdCode = lcdScope?.lcdCode || 'LCD_CNTT';

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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi mạng';
      alert(`Đã xảy ra lỗi: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className={styles.tabs}>
        <button
          type="button"
          onClick={() => setActiveTab('events')}
          className={activeTab === 'events' ? styles.tabActive : styles.tabInactive}
        >
          <CalendarIcon size={16} />
          <span>Sự kiện phụ trách</span>
        </button>

        {canManageLcd && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('lcd_members')}
              className={activeTab === 'lcd_members' ? styles.tabActive : styles.tabInactive}
            >
              <UsersIcon size={16} />
              <span>Đoàn viên &amp; Chi đoàn</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('lcd_delegates')}
              className={activeTab === 'lcd_delegates' ? styles.tabActive : styles.tabInactive}
            >
              <ShieldCheckIcon size={16} />
              <span>BCH Chi đoàn</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={activeTab === 'ranking' ? styles.tabActive : styles.tabInactive}
        >
          <BadgeMedalIcon size={16} />
          <span>Bảng xếp hạng</span>
        </button>

        <Link href="/office/borrow" className={styles.tabInactive} style={{ color: '#0369a1', border: '1px solid #bae6fd', background: '#f0f9ff' }}>
          <FileTextIcon size={16} /> Mượn dụng cụ VPĐ
        </Link>
        <Link href="/admin/proposals" className={styles.tabInactive} style={{ color: '#c2410c', border: '1px solid #fed7aa', background: '#fff7ed' }}>
          <FileTextIcon size={16} /> Kế hoạch trình duyệt
        </Link>
        <Link href="/scanner" className={styles.tabInactive}>
          <ScanCameraIcon size={16} />
          Máy quét QR
        </Link>
      </div>

      {activeTab === 'ranking' ? (
        <RankingBoard highlightLcdCode={lcdScope?.lcdCode} canExport />
      ) : canManageLcd && activeTab === 'lcd_members' ? (
        <LcdManagementSection
          mode="members"
          initialLcdCode={defaultLcdCode}
          canSwitchLcd={lcdScope?.role === 'all'}
        />
      ) : canManageLcd && activeTab === 'lcd_delegates' ? (
        <LcdManagementSection
          mode="delegates"
          initialLcdCode={defaultLcdCode}
          canSwitchLcd={lcdScope?.role === 'all'}
        />
      ) : (
        <>
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
            Bạn chưa có sự kiện nào. Hãy bấm <strong>&ldquo;Trình Kế Hoạch Sự Kiện Mới&rdquo;</strong> ở phía trên để gửi yêu cầu tới Super Admin Đoàn trường!
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
      )}
    </>
  );
}
