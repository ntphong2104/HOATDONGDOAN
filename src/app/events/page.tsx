'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  UsersIcon,
  SearchIcon,
  CheckCircleIcon,
  BuildingIcon,
  LockIcon,
  QrCodeIcon,
  AlertTriangleIcon,
} from '@/components/icons';
import { LCD_DEFINITIONS, type LcdCode, type LcdEligibility } from '@/lib/utils/lcd';
import type { CohortEligibility } from '@/lib/utils/cohort';
import styles from './page.module.css';

interface DiscoverEventItem {
  event_id: string;
  event_name: string;
  event_date: string | null;
  start_time: string | null;
  end_time: string | null;
  semester: string | null;
  status: string;
  is_registration_open: boolean | null;
  is_recruitment_open: boolean;
  allowed_cohorts: string[];
  allowed_lcds: LcdCode[];
  allowed_lcds_label: string;
  max_participants: number;
  max_volunteers: number;
  participant_count: number;
  departments_count: number;
  sessions_count: number;
  room_name: string | null;
  organizer_unit: string;
  organizer_lcd_code: LcdCode | null;
  description: string | null;
  is_expired: boolean;
  registration_window: { isOpen: boolean; reason?: string };
  recruitment_window: { isOpen: boolean; reason?: string };
  lcd_eligibility: LcdEligibility;
  cohort_eligibility: CohortEligibility;
  is_eligible_for_me: boolean;
  is_my_lcd_scoped: boolean;
  is_my_lcd_event: boolean;
  is_registered: boolean;
  my_role_type: string | null;
  my_attended: boolean;
}

interface MyProfileSummary {
  mssv: string;
  full_name: string;
  class_id: string;
  cohort: string | null;
  lcd: {
    code: LcdCode;
    name: string;
    shortName: string;
    color: string;
    bg: string;
    border: string;
  } | null;
}

type DiscoverTab = 'for_me' | 'my_lcd' | 'recruiting' | 'all';

function normalizeSearch(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

function formatDateVN(dateStr?: string | null): string {
  if (!dateStr) return 'Đang cập nhật';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export default function StudentEventsDiscoverPage() {
  const [profile, setProfile] = useState<MyProfileSummary | null>(null);
  const [events, setEvents] = useState<DiscoverEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const [activeTab, setActiveTab] = useState<DiscoverTab>('for_me');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLcdFilter, setSelectedLcdFilter] = useState<string>('ALL');

  const fetchDiscover = async () => {
    try {
      const res = await fetch('/api/events/discover', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setProfile(json.data.my_profile || null);
        setEvents(Array.isArray(json.data.events) ? json.data.events : []);
        setErrorMsg('');
      } else {
        setErrorMsg(json.error || 'Không thể tải danh sách sự kiện');
      }
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiscover();
  }, []);

  const counts = useMemo(() => {
    const forMe = events.filter((e) => e.is_eligible_for_me && !e.is_expired);
    const myLcd = events.filter((e) => e.is_my_lcd_event && !e.is_expired);
    const recruiting = events.filter(
      (e) => e.is_eligible_for_me && e.recruitment_window.isOpen && !e.is_expired
    );
    const openNow = forMe.filter(
      (e) => e.registration_window.isOpen || e.recruitment_window.isOpen
    );
    const registered = events.filter((e) => e.is_registered);

    return {
      forMe: forMe.length,
      myLcd: myLcd.length,
      recruiting: recruiting.length,
      all: events.length,
      openNow: openNow.length,
      registered: registered.length,
    };
  }, [events]);

  const filteredEvents = useMemo(() => {
    const q = normalizeSearch(searchQuery);

    return events.filter((ev) => {
      if (activeTab === 'for_me') {
        if (!ev.is_eligible_for_me || ev.is_expired) return false;
      } else if (activeTab === 'my_lcd') {
        if (!ev.is_my_lcd_event || ev.is_expired) return false;
      } else if (activeTab === 'recruiting') {
        if (!ev.is_eligible_for_me || !ev.recruitment_window.isOpen || ev.is_expired) {
          return false;
        }
      }

      if (activeTab === 'all' && selectedLcdFilter !== 'ALL') {
        if (selectedLcdFilter === 'OPEN_ALL') {
          if (ev.allowed_lcds.length > 0) return false;
        } else {
          const matchesScoped = ev.allowed_lcds.includes(selectedLcdFilter as LcdCode);
          const matchesOrg = ev.organizer_lcd_code === selectedLcdFilter;
          if (!matchesScoped && !matchesOrg) return false;
        }
      }

      if (q) {
        const haystack = normalizeSearch(
          `${ev.event_name} ${ev.organizer_unit} ${ev.room_name || ''} ${ev.allowed_lcds_label} ${ev.semester || ''}`
        );
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [events, activeTab, searchQuery, selectedLcdFilter]);

  return (
    <div className={styles.container}>
      <Header />

      <main className={styles.main}>
        {/* ── Personalized Student & LCĐ Banner ── */}
        <section className={styles.heroBanner}>
          <div className={styles.heroLeft}>
            <span className={styles.heroEyebrow}>Cổng Khám Phá & Đăng Ký Sự Kiện PTIT HCM</span>
            <h1 className={styles.heroTitle}>Tổng Quan Sự Kiện Dành Cho Bạn</h1>
            <p className={styles.heroSubtitle}>
              Hệ thống tự động lọc các chương trình toàn Học viện và chương trình riêng thuộc Liên Chi Đoàn của bạn để bạn đăng ký nhanh chóng, không lo nhầm đối tượng.
            </p>
            {profile && (
              <div className={styles.profilePills}>
                {profile.lcd ? (
                  <span
                    className={styles.lcdHeroPill}
                    style={{ color: profile.lcd.color }}
                  >
                    🏛️ {profile.lcd.name}
                  </span>
                ) : (
                  <span className={styles.profilePill}>
                    🏛️ Chưa xác định LCĐ (Cập nhật Mã lớp ở Trang cá nhân)
                  </span>
                )}
                <span className={styles.profilePill}>
                  🎓 Lớp {profile.class_id}
                </span>
                {profile.cohort && (
                  <span className={styles.profilePill}>
                    Khóa {profile.cohort}
                  </span>
                )}
                <span className={styles.profilePill}>
                  MSSV: {profile.mssv}
                </span>
              </div>
            )}
          </div>

          <div className={styles.heroActions}>
            <div className={styles.heroStatsRow}>
              <div className={styles.heroStatBox}>
                <div className={styles.heroStatNum}>{counts.openNow}</div>
                <div className={styles.heroStatLabel}>Đang mở ĐK</div>
              </div>
              <div className={styles.heroStatBox}>
                <div className={styles.heroStatNum}>{counts.myLcd}</div>
                <div className={styles.heroStatLabel}>Của LCĐ bạn</div>
              </div>
              <div className={styles.heroStatBox}>
                <div className={styles.heroStatNum}>{counts.registered}</div>
                <div className={styles.heroStatLabel}>Bạn đã ĐK</div>
              </div>
            </div>
            <Link
              href="/?view=student"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.5rem 0.95rem',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              <QrCodeIcon size={15} />
              <span>Mở Thẻ QR Cá Nhân</span>
            </Link>
          </div>
        </section>

        {/* ── Tabs, Search & LCĐ Filter Bar ── */}
        <section className={styles.controlsCard}>
          <div className={styles.controlsTopRow}>
            <div className={styles.tabsRow}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'for_me' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('for_me')}
              >
                <span>✨ Dành cho tôi</span>
                <span className={styles.tabCount}>{counts.forMe}</span>
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'my_lcd' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('my_lcd')}
              >
                <span>🏛️ {profile?.lcd ? `Riêng ${profile.lcd.shortName}` : 'Riêng LCĐ của tôi'}</span>
                <span className={styles.tabCount}>{counts.myLcd}</span>
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'recruiting' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('recruiting')}
              >
                <span>🤝 Tuyển CTV</span>
                <span className={styles.tabCount}>{counts.recruiting}</span>
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <span>🌐 Tất cả sự kiện</span>
                <span className={styles.tabCount}>{counts.all}</span>
              </button>
            </div>

            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <SearchIcon size={16} />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm tên sự kiện, đơn vị, phòng..."
                className={styles.searchInput}
                aria-label="Tìm kiếm sự kiện"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className={styles.searchClear}
                  aria-label="Xóa tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {activeTab === 'all' && (
            <div className={styles.lcdFilterBar}>
              <span className={styles.lcdFilterLabel}>Lọc theo LCĐ:</span>
              <button
                type="button"
                className={`${styles.lcdFilterChip} ${selectedLcdFilter === 'ALL' ? styles.lcdFilterChipActive : ''}`}
                onClick={() => setSelectedLcdFilter('ALL')}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={`${styles.lcdFilterChip} ${selectedLcdFilter === 'OPEN_ALL' ? styles.lcdFilterChipActive : ''}`}
                onClick={() => setSelectedLcdFilter('OPEN_ALL')}
              >
                Toàn Học viện
              </button>
              {LCD_DEFINITIONS.map((lcd) => (
                <button
                  key={lcd.code}
                  type="button"
                  className={`${styles.lcdFilterChip} ${selectedLcdFilter === lcd.code ? styles.lcdFilterChipActive : ''}`}
                  onClick={() => setSelectedLcdFilter(lcd.code)}
                >
                  {lcd.shortName}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── Error Banner ── */}
        {errorMsg && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '14px',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              color: '#b91c1c',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertTriangleIcon size={18} color="#b91c1c" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ── Loading Skeleton ── */}
        {loading ? (
          <div className={styles.loadingGrid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={styles.skeletonCard} />
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className={styles.emptyState}>
            <CalendarIcon size={40} color="#94a3b8" />
            <h3 className={styles.emptyTitle}>
              {searchQuery
                ? `Không tìm thấy sự kiện khớp "${searchQuery}"`
                : activeTab === 'my_lcd'
                ? `Hiện chưa có sự kiện riêng nào đang mở cho ${profile?.lcd?.shortName || 'LCĐ của bạn'}`
                : activeTab === 'recruiting'
                ? 'Hiện chưa có sự kiện nào đang tuyển Cộng tác viên'
                : 'Hiện chưa có sự kiện nào đang mở đăng ký'}
            </h3>
            <p className={styles.emptyDesc}>
              {activeTab !== 'all'
                ? 'Bạn có thể chuyển sang tab "Tất cả sự kiện" để xem toàn bộ hoạt động đang diễn ra trong Học viện.'
                : 'Các chương trình Đoàn – Hội mới sẽ tự động hiển thị tại đây ngay khi được phê duyệt.'}
            </p>
            {activeTab !== 'all' && (
              <button
                type="button"
                className={styles.tabBtnActive}
                style={{ border: 'none', padding: '0.6rem 1.2rem', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}
                onClick={() => {
                  setActiveTab('all');
                  setSearchQuery('');
                  setSelectedLcdFilter('ALL');
                }}
              >
                Xem Tất Cả Sự Kiện
              </button>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredEvents.map((ev) => {
              const capacityPct =
                ev.max_participants > 0
                  ? Math.min(100, Math.round((ev.participant_count / ev.max_participants) * 100))
                  : 0;
              const isFull =
                ev.max_participants > 0 && ev.participant_count >= ev.max_participants;
              const isIneligible = !ev.is_eligible_for_me;

              const lockReason = !ev.lcd_eligibility.eligible
                ? `Chỉ dành cho sinh viên thuộc ${ev.allowed_lcds_label}`
                : !ev.cohort_eligibility.eligible
                ? `Chỉ dành cho sinh viên khóa ${ev.allowed_cohorts.join(', ')}`
                : '';

              return (
                <article
                  key={ev.event_id}
                  className={`${styles.card} ${ev.is_my_lcd_scoped ? styles.cardMyLcd : ''} ${isIneligible ? styles.cardLocked : ''}`}
                >
                  {/* Scope & Status Badges */}
                  <div className={styles.badgesRow}>
                    {ev.allowed_lcds.length > 0 ? (
                      <span className={`${styles.badge} ${styles.badgeLcd}`}>
                        🏛️ {ev.allowed_lcds_label}
                      </span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeAll}`}>
                        🌐 Toàn Học viện
                      </span>
                    )}

                    {ev.allowed_cohorts.length > 0 && (
                      <span className={`${styles.badge} ${styles.badgeCohort}`}>
                        🎓 Khóa {ev.allowed_cohorts.join(', ')}
                      </span>
                    )}

                    {ev.is_registered && (
                      <span className={`${styles.badge} ${styles.badgeRegistered}`}>
                        <CheckCircleIcon size={12} color="#15803d" />
                        Đã đăng ký
                      </span>
                    )}

                    {ev.recruitment_window.isOpen && !ev.is_expired && (
                      <span className={`${styles.badge} ${styles.badgeRecruiting}`}>
                        🤝 Tuyển CTV
                      </span>
                    )}

                    {!ev.registration_window.isOpen && !ev.recruitment_window.isOpen && (
                      <span className={`${styles.badge} ${styles.badgeClosed}`}>
                        Đã đóng cổng
                      </span>
                    )}
                  </div>

                  {/* Title & Organizer */}
                  <div>
                    <h2 className={styles.cardTitle} title={ev.event_name}>
                      {ev.event_name}
                    </h2>
                    <div className={styles.cardOrg} style={{ marginTop: '0.35rem' }}>
                      <BuildingIcon size={14} color="#64748b" />
                      <span>{ev.organizer_unit}</span>
                    </div>
                  </div>

                  {/* Meta Schedule & Location */}
                  <div className={styles.metaList}>
                    <div className={styles.metaItem}>
                      <CalendarIcon size={14} color="#2563eb" />
                      <span>{formatDateVN(ev.event_date)}</span>
                      {ev.sessions_count > 1 && (
                        <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>
                          ({ev.sessions_count} ca)
                        </span>
                      )}
                    </div>
                    <div className={styles.metaItem}>
                      <ClockIcon size={14} color="#2563eb" />
                      <span>
                        {ev.start_time?.slice(0, 5) || '07:30'} – {ev.end_time?.slice(0, 5) || '11:30'}
                      </span>
                    </div>
                    {ev.room_name && (
                      <div className={styles.metaItem}>
                        <MapPinIcon size={14} color="#2563eb" />
                        <span>{ev.room_name}</span>
                      </div>
                    )}
                  </div>

                  {/* Participant Capacity Bar */}
                  {ev.max_participants > 0 && (
                    <div className={styles.capacityWrap}>
                      <div className={styles.capacityHeader}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <UsersIcon size={13} color="#64748b" />
                          <span>Chỉ tiêu tham gia</span>
                        </span>
                        <span style={{ color: isFull ? '#dc2626' : '#1e40af' }}>
                          {ev.participant_count} / {ev.max_participants} SV ({capacityPct}%)
                        </span>
                      </div>
                      <div className={styles.capacityBarTrack}>
                        <div
                          className={`${styles.capacityBarFill} ${isFull ? styles.capacityBarFull : ''}`}
                          style={{ width: `${capacityPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer CTA */}
                  <div className={styles.cardFooter}>
                    {ev.is_registered ? (
                      <div className={styles.actionsRow}>
                        <Link
                          href={
                            ev.my_role_type === 'volunteer'
                              ? `/events/${ev.event_id}/recruitment`
                              : `/events/${ev.event_id}/register`
                          }
                          className={styles.successBtn}
                        >
                          <CheckCircleIcon size={16} color="#ffffff" />
                          <span>
                            {ev.my_role_type === 'volunteer'
                              ? 'Đã ứng tuyển CTV — Xem chi tiết'
                              : 'Đã đăng ký — Xem vé / Hủy'}
                          </span>
                        </Link>
                      </div>
                    ) : isIneligible ? (
                      <div className={styles.lockedNotice}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                          <LockIcon size={14} color="#b91c1c" />
                          <span>{lockReason}</span>
                        </span>
                      </div>
                    ) : ev.registration_window.isOpen || ev.recruitment_window.isOpen ? (
                      <div className={styles.actionsRow}>
                        {ev.registration_window.isOpen && (
                          <Link
                            href={`/events/${ev.event_id}/register`}
                            className={styles.primaryBtn}
                          >
                            <span>Đăng ký tham gia ➔</span>
                          </Link>
                        )}
                        {ev.recruitment_window.isOpen && (
                          <Link
                            href={`/events/${ev.event_id}/recruitment`}
                            className={
                              ev.registration_window.isOpen ? styles.secondaryBtn : styles.primaryBtn
                            }
                          >
                            <span>Ứng tuyển CTV</span>
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className={styles.closedNotice}>
                        {ev.registration_window.reason || 'Cổng đăng ký đã đóng'}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
