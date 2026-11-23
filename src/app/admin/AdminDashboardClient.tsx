'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import EventCard from '@/components/EventCard';
import LcdManagementSection from './LcdManagementSection';
import RankingBoard from '@/components/RankingBoard';
import SupportEventCreator from '@/components/SupportEventCreator';
import { getEffectiveEventStatus } from '@/lib/utils/event-logic';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import {
  CalendarIcon,
  ScanCameraIcon,
  PlusIcon,
  CloseIcon,
  FileTextIcon,
  UsersIcon,
  ShieldCheckIcon,
  BadgeMedalIcon,
  SearchIcon,
} from '@/components/icons';
import type { Event } from '@/lib/types';
import type { LcdCode } from '@/lib/utils/lcd';
import styles from './AdminDashboardClient.module.css';

interface AdminDashboardClientProps {
  initialEvents: Event[];
  canCreateSupportEvent?: boolean;
  lcdScope?: {
    role: 'all' | 'lcd' | 'none';
    lcdCode: LcdCode | null;
    lcdName: string | null;
    lcdShortName: string | null;
  };
}

export default function AdminDashboardClient({
  initialEvents,
  canCreateSupportEvent = false,
  lcdScope,
}: AdminDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<'events' | 'lcd_members' | 'lcd_delegates' | 'ranking'>('events');
  const [events, setEvents] = useState<Event[]>(initialEvents);
  const [statusFilter, setStatusFilter] = useState<'active' | 'closed' | 'all'>('active');
  const [eventSearch, setEventSearch] = useState('');
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [showSupportCreator, setShowSupportCreator] = useState(false);
  const [eventName, setEventName] = useState('');
  const [eventDate, setEventDate] = useState(() => getVietnamDateString(0));
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('22:00');
  const [submitting, setSubmitting] = useState(false);

  const canManageLcd = lcdScope?.role === 'lcd' || lcdScope?.role === 'all';
  const defaultLcdCode: LcdCode = lcdScope?.lcdCode || 'LCD_CNTT';

  const { activeCount, closedCount, filteredEvents } = useMemo(() => {
    let active = 0;
    let closed = 0;
    const q = eventSearch.trim().toLowerCase();

    for (const ev of events) {
      const eff = getEffectiveEventStatus(ev);
      if (eff === 'active') active++;
      else closed++;
    }

    const filtered = events.filter((ev) => {
      const eff = getEffectiveEventStatus(ev);
      if (statusFilter === 'active' && eff !== 'active') return false;
      if (statusFilter === 'closed' && eff !== 'closed') return false;
      if (q && !(ev.event_name || '').toLowerCase().includes(q)) return false;
      return true;
    });

    return { activeCount: active, closedCount: closed, filteredEvents: filtered };
  }, [events, statusFilter, eventSearch]);

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
      <div className={styles.toolbarRow}>
        <div className={styles.tabs}>
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={activeTab === 'events' ? styles.tabActive : styles.tabInactive}
          >
            <CalendarIcon size={15} />
            <span>Sự kiện phụ trách</span>
          </button>

          {canManageLcd && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('lcd_members')}
                className={activeTab === 'lcd_members' ? styles.tabActive : styles.tabInactive}
              >
                <UsersIcon size={15} />
                <span>Đoàn viên &amp; Chi đoàn</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('lcd_delegates')}
                className={activeTab === 'lcd_delegates' ? styles.tabActive : styles.tabInactive}
              >
                <ShieldCheckIcon size={15} />
                <span>BCH Chi đoàn</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setActiveTab('ranking')}
            className={activeTab === 'ranking' ? styles.tabActive : styles.tabInactive}
          >
            <BadgeMedalIcon size={15} />
            <span>Bảng xếp hạng</span>
          </button>
        </div>

        <div className={styles.quickActions}>
          <Link href="/admin/proposals" className={styles.quickLink}>
            <FileTextIcon size={15} />
            <span>Kế hoạch trình duyệt</span>
          </Link>
          <Link href="/office/borrow" className={styles.quickLink}>
            <FileTextIcon size={15} />
            <span>Mượn dụng cụ</span>
          </Link>
          <Link href="/scanner" className={styles.quickLink}>
            <ScanCameraIcon size={15} />
            <span>Máy quét QR</span>
          </Link>
        </div>
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
          {canCreateSupportEvent && (
            <button
              type="button"
              onClick={() => setShowSupportCreator((v) => !v)}
              className={styles.proposeButton}
              style={{
                background: 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <PlusIcon size={18} />
              <span>{showSupportCreator ? 'Đóng Tạo Sự Kiện Hỗ Trợ' : 'Tạo Sự Kiện Hỗ Trợ (Mở ngay)'}</span>
            </button>
          )}
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

      {canCreateSupportEvent && showSupportCreator && (
        <div style={{ marginBottom: '1.25rem' }}>
          <SupportEventCreator
            onCreated={() => {
              fetchEvents();
            }}
            onCancel={() => setShowSupportCreator(false)}
          />
        </div>
      )}

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

      {/* Bộ lọc trạng thái & tìm kiếm nhanh */}
      {events.length > 0 && (
        <div className={styles.filterRow}>
          <div className={styles.filterPills}>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`${styles.filterPill} ${statusFilter === 'active' ? styles.filterPillActive : ''}`}
            >
              Đang mở ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('closed')}
              className={`${styles.filterPill} ${statusFilter === 'closed' ? styles.filterPillActive : ''}`}
            >
              Đã đóng ({closedCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`${styles.filterPill} ${statusFilter === 'all' ? styles.filterPillActive : ''}`}
            >
              Tất cả ({events.length})
            </button>
          </div>

          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}>
              <SearchIcon size={15} />
            </span>
            <input
              type="text"
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
              placeholder="Tìm tên sự kiện..."
              className={styles.searchInput}
            />
          </div>
        </div>
      )}

      {/* Grid danh sách sự kiện */}
      <div className={styles.eventGrid}>
        {!events || events.length === 0 ? (
          <div className={styles.empty}>
            Bạn chưa có sự kiện nào. Hãy bấm <strong>&ldquo;Trình Kế Hoạch Sự Kiện Mới&rdquo;</strong> ở phía trên để gửi yêu cầu tới Super Admin Đoàn trường!
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className={styles.empty}>
            Không tìm thấy sự kiện nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          filteredEvents.map((event) => {
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
