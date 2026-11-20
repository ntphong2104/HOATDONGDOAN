'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import RoleBadge from '@/components/RoleBadge';
import StudentSelfScannerModal from '@/components/StudentSelfScannerModal';
import DataTable from '@/components/DataTable';
import ExcelExportButton from '@/components/ExcelExportButton';
import { useToast } from '@/components/ToastProvider';
import { fetchMeCached, invalidateClientMeCache } from '@/lib/client/me-cache';
import { resolveStudentLcd } from '@/lib/utils/lcd';
import { getCohortFromMssv } from '@/lib/utils/cohort';
import { isEventPastDeadline } from '@/lib/utils/event-logic';
import { isUnitAccount } from '@/lib/utils/extract-mssv';
import {
  ShieldCheckIcon,
  ScanCameraIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
  CloseIcon,
  CalendarIcon,
  AlertTriangleIcon,
  MapPinIcon,
  SearchIcon,
  BuildingIcon,
  YouthUnionIcon,
  PencilIcon,
} from '@/components/icons';
import type { HistoryItem } from '@/lib/types';
import styles from './StudentDashboardClient.module.css';

interface StudentDashboardClientProps {
  user: {
    mssv: string;
    full_name: string;
    class_id: string;
    gender?: string;
    phone?: string;
  };
  tier: string;
  initialHistory: HistoryItem[];
  initialRegistrations?: any[];
  activeSection?: 'overview' | 'registered' | 'history' | 'delegate';
}

function normalizeVN(val: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

export default function StudentDashboardClient({
  user,
  tier,
  initialHistory,
  initialRegistrations = [],
  activeSection = 'overview',
}: StudentDashboardClientProps) {
  const toast = useToast();
  const [currentUser, setCurrentUser] = useState(user);
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [registeredEvents, setRegisteredEvents] = useState<any[]>(initialRegistrations);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [userGender, setUserGender] = useState(user.gender || 'Nam');
  const [userPhone, setUserPhone] = useState(user.phone || '');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // History Filters
  const [historySearch, setHistorySearch] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState<'all' | 'participant' | 'volunteer' | 'organizer'>('all');

  // Delegate states
  const [delegateInfo, setDelegateInfo] = useState<{
    isDelegate: boolean;
    class_id?: string;
    daysLeft?: number;
    expires_at?: string;
  } | null>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [loadingClass, setLoadingClass] = useState(false);

  // Modal classmate history states
  const [selectedClassmate, setSelectedClassmate] = useState<any | null>(null);
  const [classmateHistory, setClassmateHistory] = useState<any | null>(null);
  const [loadingClassmateHistory, setLoadingClassmateHistory] = useState(false);
  const [classmateHistoryError, setClassmateHistoryError] = useState<string | null>(null);

  const myLcd = useMemo(
    () => resolveStudentLcd(currentUser.class_id, currentUser.mssv),
    [currentUser.class_id, currentUser.mssv]
  );
  const myCohort = useMemo(() => getCohortFromMssv(currentUser.mssv), [currentUser.mssv]);

  const checkedInEventIdSet = useMemo(
    () => new Set(history.map((h) => h.event_id).filter(Boolean)),
    [history]
  );

  // Chỉ tính các sự kiện CHƯA điểm danh và CHƯA kết thúc là "Chờ điểm danh"
  const pendingRegistrations = useMemo(
    () =>
      registeredEvents.filter((ev) => {
        if (ev.attended || checkedInEventIdSet.has(ev.event_id)) return false;
        const isClosedOrPast =
          ev.status === 'closed' ||
          ev.status === 'rejected' ||
          isEventPastDeadline({
            event_date: ev.event_date,
            start_time: ev.start_time,
            end_time: ev.end_time,
            status: ev.status,
            sessions: ev.sessions,
          });
        return !isClosedOrPast;
      }),
    [registeredEvents, checkedInEventIdSet]
  );

  // Các sự kiện đã đăng ký nhưng đã kết thúc mà chưa có check-in
  const pastMissedRegistrations = useMemo(
    () =>
      registeredEvents.filter((ev) => {
        if (ev.attended || checkedInEventIdSet.has(ev.event_id)) return false;
        return (
          ev.status === 'closed' ||
          ev.status === 'rejected' ||
          isEventPastDeadline({
            event_date: ev.event_date,
            start_time: ev.start_time,
            end_time: ev.end_time,
            status: ev.status,
            sessions: ev.sessions,
          })
        );
      }),
    [registeredEvents, checkedInEventIdSet]
  );

  const volunteerOrOrganizerCount = useMemo(
    () => history.filter((h) => h.participate_role === 'volunteer' || h.participate_role === 'organizer').length,
    [history]
  );

  const availableSemesters = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) {
      if (h.semester) set.add(h.semester);
    }
    return Array.from(set);
  }, [history]);

  const filteredHistory = useMemo(() => {
    const q = normalizeVN(historySearch);
    return history.filter((item) => {
      if (semesterFilter !== 'ALL' && (item.semester || '') !== semesterFilter) return false;
      if (roleFilter !== 'all' && item.participate_role !== roleFilter) return false;
      if (q) {
        const hay = normalizeVN(`${item.event_name} ${item.semester || ''} ${item.session_names || ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [history, historySearch, semesterFilter, roleFilter]);

  const isPhoneMissing = !userPhone || userPhone.trim().length < 8;

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/me/history');
      const data = await res.json();
      if (data.success && data.data) {
        setHistory(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClassStudents = async (query?: string) => {
    setLoadingClass(true);
    try {
      const url = query
        ? `/api/me/class-lookup/students?q=${encodeURIComponent(query)}`
        : '/api/me/class-lookup/students';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.data?.students) {
        setClassStudents(data.data.students);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingClass(false);
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/me/class-lookup');
        const data = await res.json();
        if (active && data.success && data.data?.isDelegate) {
          setDelegateInfo(data.data);
          const stRes = await fetch('/api/me/class-lookup/students');
          const stData = await stRes.json();
          if (active && stData.success && stData.data?.students) {
            setClassStudents(stData.data.students);
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();

    (async () => {
      try {
        const { json: data } = await fetchMeCached();
        if (active && data?.success && data?.data) {
          const d = data.data;
          setCurrentUser((prev) => ({
            ...prev,
            mssv: d.mssv || prev.mssv,
            full_name: d.full_name && !d.full_name.includes('@') ? d.full_name : prev.full_name,
            class_id: d.class_id && d.class_id !== 'PTIT-HCM' ? d.class_id : prev.class_id,
            gender: d.gender || prev.gender,
            phone: d.phone || prev.phone,
          }));
          if (d.gender) setUserGender(d.gender);
          if (d.phone) setUserPhone(d.phone);
        }
      } catch {}
    })();

    if (initialRegistrations.length > 0 && initialRegistrations[0]?.review_status === undefined) {
      (async () => {
        try {
          const res = await fetch('/api/me/registrations');
          const data = await res.json();
          if (active && data.success && Array.isArray(data.data)) {
            setRegisteredEvents(data.data);
          }
        } catch (err) {
          console.error(err);
        } finally {
          if (active) setLoadingRegistrations(false);
        }
      })();
    }

    return () => {
      active = false;
    };
  }, [initialRegistrations]);

  const openClassmateHistory = async (student: any) => {
    setSelectedClassmate(student);
    setLoadingClassmateHistory(true);
    setClassmateHistory(null);
    setClassmateHistoryError(null);
    try {
      const res = await fetch(`/api/me/class-lookup/history?mssv=${encodeURIComponent(student.mssv)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setClassmateHistory(data.data);
      } else {
        setClassmateHistoryError(data.error || 'Không thể tải minh chứng của sinh viên');
      }
    } catch (err: any) {
      console.error(err);
      setClassmateHistoryError('Lỗi kết nối máy chủ khi tải minh chứng');
    } finally {
      setLoadingClassmateHistory(false);
    }
  };

  const isUnit = isUnitAccount({ mssv: currentUser.mssv });
  if (isUnit) {
    const primaryHref =
      tier === 'super_admin'
        ? '/super-admin'
        : tier === 'ctsv' || tier === 'facility'
        ? '/admin/proposals'
        : tier === 'security'
        ? '/security'
        : tier === 'checker'
        ? '/scanner'
        : '/admin';

    const primaryLabel =
      tier === 'super_admin'
        ? 'Vào Quản Trị Toàn Trường'
        : tier === 'ctsv' || tier === 'facility'
        ? 'Vào Duyệt Kế Hoạch'
        : tier === 'security'
        ? 'Vào Chìa Khóa Phòng'
        : tier === 'checker'
        ? 'Mở Máy Quét QR'
        : 'Vào Bàn Làm Việc LCĐ';

    return (
      <div
        style={{
          maxWidth: 760,
          margin: '1.5rem auto',
          padding: '2rem',
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BuildingIcon size={22} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1d4ed8' }}>
              Tổng quan Đơn vị / Cán bộ
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0.1rem 0 0' }}>
              {currentUser.full_name || currentUser.mssv}
            </h2>
          </div>
        </div>

        <p style={{ color: '#64748b', fontSize: '0.88rem', lineHeight: 1.55, margin: '0 0 1.5rem' }}>
          Chọn nhanh khu vực nghiệp vụ bên dưới hoặc dùng thanh điều hướng bên trái để quản lý sự kiện, duyệt kế hoạch, xem bảng xếp hạng và mượn dụng cụ Văn phòng Đoàn.
        </p>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <Link
            href={primaryHref}
            style={{
              background: '#1d4ed8',
              color: '#ffffff',
              padding: '0.6rem 1.15rem',
              borderRadius: 9,
              fontSize: '0.85rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            {primaryLabel}
          </Link>
          <Link
            href="/events"
            style={{
              background: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              padding: '0.6rem 1.05rem',
              borderRadius: 9,
              fontSize: '0.85rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Sự kiện toàn Học viện
          </Link>
          <Link
            href="/ranking"
            style={{
              background: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              padding: '0.6rem 1.05rem',
              borderRadius: 9,
              fontSize: '0.85rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Bảng xếp hạng
          </Link>
          <Link
            href="/office/borrow"
            style={{
              background: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              padding: '0.6rem 1.05rem',
              borderRadius: 9,
              fontSize: '0.85rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Mượn dụng cụ VPĐ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Officer Shortcut Banner */}
      {tier !== 'user' && (
        <div className={styles.officerBanner}>
          <div>
            <span className={styles.officerTitle}>
              Không gian Cán bộ Đoàn — {currentUser.full_name || currentUser.mssv}
            </span>
            <span className={styles.officerSub}>
              Đang xem Cổng Sinh Viên cá nhân. Chọn lối tắt bên phải để vào Bàn Quản Trị.
            </span>
          </div>

          <div className={styles.officerActions}>
            <Link href="/admin/proposals" className={styles.officerBtnSecondary}>
              Trình Kế Hoạch
            </Link>

            <Link
              href={
                tier === 'super_admin'
                  ? '/super-admin'
                  : tier === 'youth_union' || tier === 'ctsv' || tier === 'facility'
                  ? '/admin/proposals'
                  : '/admin'
              }
              className={styles.officerBtnPrimary}
            >
              Bàn Quản Trị
            </Link>
          </div>
        </div>
      )}

      {/* ═══ SECTION 1: TỔNG QUAN CÁ NHÂN (/?view=student) ═══ */}
      {activeSection === 'overview' && (
      <div className={styles.portalGrid}>
        {/* ── LEFT STICKY COLUMN: Unified Digital Member ID Card ── */}
        <aside className={styles.leftColumn}>
          <div className={styles.memberIdCard}>
            <div className={styles.memberIdTop}>
              <div className={styles.memberIdBadges}>
                {myLcd ? (
                  <span
                    className={styles.lcdBadge}
                    style={{
                      background: myLcd.bg,
                      color: myLcd.color,
                      border: `1px solid ${myLcd.border}`,
                    }}
                  >
                    <BuildingIcon size={13} color={myLcd.color} />
                    <span>{myLcd.shortName}</span>
                  </span>
                ) : (
                  <span className={styles.cohortBadge}>Đoàn Viên PTIT</span>
                )}
                {myCohort && <span className={styles.cohortBadge}>Khóa {myCohort}</span>}
              </div>

              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className={styles.editProfileMiniBtn}
                title="Chỉnh sửa SĐT / Giới tính"
              >
                <PencilIcon size={12} color="#475569" />
                <span>Sửa SĐT</span>
              </button>
            </div>

            <QRCodeDisplay
              value={currentUser.mssv}
              studentName={currentUser.full_name}
              studentClass={currentUser.class_id}
              studentId={currentUser.mssv}
              className={styles.embeddedQrCard}
            />

            <div className={styles.memberIdMetaRow}>
              <span>
                SĐT:{' '}
                <strong style={{ color: userPhone ? '#0f172a' : '#b45309' }}>
                  {userPhone || 'Chưa cập nhật'}
                </strong>
              </span>
              <span className={styles.memberIdDot}>•</span>
              <span>
                Giới tính: <strong>{userGender === 'Nam' ? 'Nam' : 'Nữ'}</strong>
              </span>
            </div>

            <div className={styles.scanEventSection}>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className={styles.scanEventButton}
              >
                <ScanCameraIcon size={18} color="#ffffff" />
                <span>Quét QR Sự Kiện Trên Màn Hình</span>
              </button>
              <p className={styles.scanHelpText}>
                Quét mã QR động trên màn hình sự kiện để tự điểm danh minh chứng ĐRL
              </p>
            </div>
          </div>
        </aside>

        {/* ── RIGHT MAIN COLUMN: Alerts + Unified Stat Strip + Discovery + Delegate + Recent Proofs ── */}
        <div className={styles.rightColumn}>
          {/* Missing Phone Alert */}
          {isPhoneMissing && (
            <div className={styles.phoneAlert}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 220 }}>
                <AlertTriangleIcon size={18} color="#b45309" />
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#92400e' }}>
                    Chưa cập nhật Số Điện Thoại / Zalo
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#78350f', fontWeight: 500 }}>
                    Bắt buộc khi đăng ký sự kiện hoặc ứng tuyển CTV để Ban Tổ Chức liên hệ.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className={styles.phoneAlertBtn}
              >
                Cập nhật ngay
              </button>
            </div>
          )}

          {/* Unified Neutral 3-Stat KPI Strip (Anti-AI: tabular dark slate, no rainbow) */}
          <div className={styles.kpiGrid}>
            <Link href="/?view=student&tab=history" className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Hoạt động ĐRL</span>
              <span className={styles.kpiValue}>{history.length}</span>
              <span className={styles.kpiSub}>Xem lịch sử minh chứng</span>
            </Link>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Vai trò CTV / BTC</span>
              <span className={styles.kpiValue}>{volunteerOrOrganizerCount}</span>
              <span className={styles.kpiSub}>Hỗ trợ &amp; điều hành</span>
            </div>

            <Link href="/?view=student&tab=registered" className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Chờ điểm danh</span>
              <span className={styles.kpiValue}>{pendingRegistrations.length}</span>
              <span className={styles.kpiSub}>Xem sự kiện đã đăng ký</span>
            </Link>
          </div>

          {/* Clean Discovery CTA Bar */}
          <div className={styles.discoverCta}>
            <div>
              <div className={styles.discoverEyebrow}>
                Hoạt động Đoàn – Hội đang mở
              </div>
              <div className={styles.discoverHeading}>
                {myLcd
                  ? `Chương trình dành cho ${myLcd.shortName} & Toàn Học viện`
                  : 'Các sự kiện đang mở đăng ký & tuyển CTV'}
              </div>
            </div>
            <Link href="/events" className={styles.discoverCtaBtn}>
              <CalendarIcon size={15} color="#1e3a8a" />
              <span>Xem sự kiện</span>
            </Link>
          </div>

          {/* BCH Chi Đoàn Shortcut Card (if student is an active Class Delegate) */}
          {delegateInfo?.isDelegate && (
            <div className={styles.delegateBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <ShieldCheckIcon size={19} color="#1d4ed8" />
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a' }}>
                    BCH Chi Đoàn {delegateInfo.class_id} · còn {delegateInfo.daysLeft} ngày nhiệm kỳ
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b', fontWeight: 500 }}>
                    Tra cứu minh chứng &amp; xuất Excel ĐRL cho toàn bộ đoàn viên trong lớp.
                  </div>
                </div>
              </div>
              <Link href="/?view=student&tab=delegate" className={styles.delegateBtn}>
                Mở Tra Cứu Lớp
              </Link>
            </div>
          )}

          {/* Compact Recent 3 Attendance Proofs Preview */}
          <section className={styles.profileCard}>
            <div className={styles.profileHeader} style={{ marginBottom: '0.75rem', paddingBottom: '0.75rem' }}>
              <h3 className={styles.historyTitle}>
                <CheckCircleIcon size={17} color="#15803d" />
                <span>Minh chứng gần nhất</span>
              </h3>
              <Link
                href="/?view=student&tab=history"
                style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1d4ed8', textDecoration: 'none' }}
              >
                Xem tất cả ({history.length})
              </Link>
            </div>

            {history.length === 0 ? (
              <div className={styles.emptyHistory} style={{ padding: '1.25rem' }}>
                Bạn chưa có lượt điểm danh minh chứng nào.
              </div>
            ) : (
              <ul className={styles.historyList}>
                {history.slice(0, 3).map((item, idx) => (
                  <li key={item.event_id ? `${item.event_id}-${idx}` : idx} className={styles.historyItem} style={{ padding: '0.8rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className={styles.eventName} style={{ fontSize: '0.92rem' }}>{item.event_name}</span>
                      <RoleBadge role={item.participate_role} />
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ClockIcon size={13} />
                      <span>
                        {item.event_date
                          ? new Date(item.event_date).toLocaleDateString('vi-VN')
                          : new Date(item.checkin_time).toLocaleDateString('vi-VN')}
                      </span>
                      {item.semester && <span>• {item.semester}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
      )}

      {/* ═══ SECTION 2 / 3 / 4: DEDICATED FULL-WIDTH PAGES (history | registered | delegate) ═══ */}
      {activeSection !== 'overview' && (
        <section className={styles.historySection}>
          <div className={styles.historyHeader} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 className={styles.historyTitle}>
              {activeSection === 'history' ? (
                <>
                  <CheckCircleIcon size={20} color="#2563eb" />
                  <span>Lịch sử điểm danh minh chứng ĐRL ({history.length})</span>
                </>
              ) : activeSection === 'registered' ? (
                <>
                  <CalendarIcon size={20} color="#2563eb" />
                  <span>Sự kiện đã đăng ký chờ điểm danh ({pendingRegistrations.length})</span>
                </>
              ) : (
                <>
                  <ShieldCheckIcon size={20} color="#2563eb" />
                  <span>Tra cứu minh chứng Chi Đoàn {delegateInfo?.class_id || ''}</span>
                </>
              )}
            </h2>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Link
                href="/?view=student"
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                ← Về Tổng quan cá nhân
              </Link>
              <Link
                href="/events"
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '10px',
                  background: '#2563eb',
                  color: '#ffffff',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  textDecoration: 'none',
                }}
              >
                Sự kiện ➔
              </Link>
            </div>
          </div>

          {/* DEDICATED VIEW: ATTENDANCE HISTORY WITH SEARCH & FILTERS */}
          {activeSection === 'history' && (
              <div>
                {history.length > 0 && (
                  <>
                    <div className={styles.filterToolbar}>
                      <div className={styles.searchInputWrap}>
                        <span className={styles.searchIcon}>
                          <SearchIcon size={15} />
                        </span>
                        <input
                          type="text"
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          placeholder="Tìm tên sự kiện minh chứng..."
                          className={styles.searchInput}
                        />
                      </div>

                      {availableSemesters.length > 0 && (
                        <select
                          value={semesterFilter}
                          onChange={(e) => setSemesterFilter(e.target.value)}
                          className={styles.semesterSelect}
                          aria-label="Lọc theo học kỳ"
                        >
                          <option value="ALL">Tất cả học kỳ</option>
                          {availableSemesters.map((sem) => (
                            <option key={sem} value={sem}>
                              {sem}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className={styles.rolePills}>
                      {(
                        [
                          { id: 'all', label: 'Tất cả vai trò' },
                          { id: 'participant', label: 'Người tham gia' },
                          { id: 'volunteer', label: 'Cộng tác viên' },
                          { id: 'organizer', label: 'Ban tổ chức' },
                        ] as const
                      ).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setRoleFilter(r.id)}
                          className={`${styles.rolePill} ${roleFilter === r.id ? styles.rolePillActive : ''}`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {filteredHistory.length === 0 ? (
                  <div className={styles.emptyHistory}>
                    {history.length === 0
                      ? 'Bạn chưa có lượt điểm danh minh chứng nào.'
                      : 'Không tìm thấy sự kiện minh chứng nào phù hợp bộ lọc.'}
                  </div>
                ) : (
                  <ul className={styles.historyList}>
                    {filteredHistory.map((item, idx) => {
                      const sessionCount = item.session_count || 1;
                      const totalSessions = item.total_sessions || 1;
                      const isFullAttendance = sessionCount >= totalSessions;
                      const showSessionNames =
                        totalSessions > 1 ||
                        Boolean(item.session_names && item.session_names !== 'Buổi chính');

                      return (
                        <li key={item.event_id ? `${item.event_id}-${idx}` : idx} className={styles.historyItem}>
                          <div className={styles.historyMeta}>
                            <span className={styles.eventName}>{item.event_name}</span>
                            <span className={styles.semester}>
                              <ClockIcon size={14} />
                              <span>
                                Ngày tổ chức:{' '}
                                {item.event_date
                                  ? new Date(item.event_date).toLocaleDateString('vi-VN')
                                  : new Date(item.checkin_time).toLocaleDateString('vi-VN')}
                              </span>
                              {item.semester && (
                                <span
                                  style={{
                                    marginLeft: '0.35rem',
                                    padding: '0.1rem 0.45rem',
                                    borderRadius: '6px',
                                    background: '#e2e8f0',
                                    color: '#334155',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.semester}
                                </span>
                              )}
                            </span>
                            {showSessionNames && (
                              <span
                                style={{
                                  fontSize: '0.78rem',
                                  color: '#475569',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                }}
                              >
                                <CalendarIcon size={13} color="#2563eb" />
                                Buổi đã tham gia: <strong style={{ color: '#1e40af' }}>{item.session_names}</strong>
                              </span>
                            )}
                          </div>
                          <div className={styles.historyDetails}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <RoleBadge role={item.participate_role} />
                              <span
                                title={`Đã điểm danh ${sessionCount} trên tổng số ${totalSessions} buổi của chương trình`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  padding: '0.22rem 0.65rem',
                                  borderRadius: '999px',
                                  fontSize: '0.76rem',
                                  fontWeight: 800,
                                  background: isFullAttendance ? '#dcfce7' : '#fef3c7',
                                  color: isFullAttendance ? '#15803d' : '#b45309',
                                  border: `1px solid ${isFullAttendance ? '#bbf7d0' : '#fde68a'}`,
                                }}
                              >
                                <CalendarIcon size={12} color={isFullAttendance ? '#15803d' : '#b45309'} />
                                Số buổi: {sessionCount}/{totalSessions} buổi
                              </span>
                            </div>
                            <span className={styles.time}>
                              {new Date(item.checkin_time).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            {/* DEDICATED VIEW: REGISTERED UPCOMING EVENTS */}
            {activeSection === 'registered' && (
              <div>
                {loadingRegistrations ? (
                  <p style={{ textAlign: 'center', padding: '1.5rem', color: '#64748b', fontSize: '0.86rem' }}>
                    Đang tải sự kiện đã đăng ký...
                  </p>
                ) : pendingRegistrations.length === 0 ? (
                  <div className={styles.emptyHistory}>
                    <p style={{ margin: '0 0 0.85rem', fontWeight: 600 }}>
                      Bạn chưa có sự kiện nào đang chờ điểm danh.
                    </p>
                    <Link
                      href="/events"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.55rem 1rem',
                        background: '#2563eb',
                        color: '#ffffff',
                        borderRadius: '10px',
                        fontSize: '0.84rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                      }}
                    >
                      Khám phá sự kiện đang mở ➔
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    {pendingRegistrations.map((ev) => (
                      <div
                        key={ev.id || ev.event_id}
                        style={{
                          background: '#ffffff',
                          border: '1.5px solid #e2e8f0',
                          borderRadius: '14px',
                          padding: '1.1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.8rem',
                          boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                            {ev.semester && ev.semester !== 'Chưa xếp kỳ' ? (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                                {ev.semester}
                              </span>
                            ) : (
                              <span />
                            )}
                            {ev.role_type === 'volunteer' && ev.review_status === 'pending' ? (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                                Đang chờ duyệt CTV
                              </span>
                            ) : ev.role_type === 'volunteer' && ev.review_status === 'rejected' ? (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                                Chưa trúng tuyển CTV
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                                Đã đăng ký (Chờ điểm danh)
                              </span>
                            )}
                          </div>

                          <h3 style={{ margin: '0.2rem 0 0.4rem', fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
                            {ev.event_name}
                          </h3>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#475569' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <ClockIcon size={14} color="#2563eb" />
                              <span>
                                {ev.event_date ? new Date(ev.event_date).toLocaleDateString('vi-VN') : 'Chưa xếp ngày'}{' '}
                                {ev.start_time
                                  ? `(${String(ev.start_time).slice(0, 5)}${ev.end_time ? ` - ${String(ev.end_time).slice(0, 5)}` : ''})`
                                  : ''}
                              </span>
                            </div>
                            {ev.location && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <MapPinIcon size={14} color="#2563eb" />
                                <span>{ev.location}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                              <span style={{ fontWeight: 600 }}>Vai trò:</span>
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontSize: '0.75rem',
                                  padding: '0.15rem 0.5rem',
                                  borderRadius: '6px',
                                  background: ev.role_type === 'volunteer' ? '#f5f3ff' : '#ecfdf5',
                                  color: ev.role_type === 'volunteer' ? '#6d28d9' : '#047857',
                                  border: `1px solid ${ev.role_type === 'volunteer' ? '#ddd6fe' : '#a7f3d0'}`,
                                }}
                              >
                                {ev.role_type === 'volunteer'
                                  ? `Cộng tác viên ${ev.department_name ? `(${ev.department_name})` : ''}`
                                  : 'Người tham gia'}
                              </span>
                            </div>

                            {ev.session_ratio && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                                <span style={{ fontWeight: 600 }}>Điểm danh ca:</span>
                                <span
                                  style={{
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '6px',
                                    background: ev.session_count > 0 ? '#eff6ff' : '#f8fafc',
                                    color: ev.session_count > 0 ? '#2563eb' : '#64748b',
                                    border: '1px solid #bfdbfe',
                                  }}
                                >
                                  {ev.session_ratio} {ev.session_names?.length ? `(${ev.session_names.join(', ')})` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <Link
                          href={
                            ev.role_type === 'volunteer'
                              ? `/events/${ev.event_id}/recruitment`
                              : `/events/${ev.event_id}/register`
                          }
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.4rem',
                            padding: '0.55rem 0.9rem',
                            background: '#f8fafc',
                            color: '#2563eb',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            textDecoration: 'none',
                          }}
                        >
                          <span>Xem Phiếu Đăng Ký / Chi Tiết</span>
                          <span>➔</span>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}

                {pastMissedRegistrations.length > 0 && (
                  <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1.5px dashed #e2e8f0' }}>
                    <h3 style={{ margin: '0 0 0.85rem', fontSize: '0.92rem', fontWeight: 800, color: '#64748b' }}>
                      Sự kiện đã kết thúc — Chưa ghi nhận điểm danh ({pastMissedRegistrations.length})
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.9rem' }}>
                      {pastMissedRegistrations.map((ev) => (
                        <div
                          key={ev.id || ev.event_id}
                          style={{
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '14px',
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.55rem',
                            opacity: 0.9,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', background: '#e2e8f0', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                              {ev.role_type === 'volunteer'
                                ? `Cộng tác viên${ev.department_name ? ` (${ev.department_name})` : ''}`
                                : 'Người tham gia'}
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                              Đã kết thúc • Chưa check-in
                            </span>
                          </div>
                          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#334155', lineHeight: 1.35 }}>
                            {ev.event_name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#64748b' }}>
                            <ClockIcon size={13} color="#64748b" />
                            <span>
                              {ev.event_date ? new Date(ev.event_date).toLocaleDateString('vi-VN') : 'Chưa xếp ngày'}{' '}
                              {ev.start_time
                                ? `(${String(ev.start_time).slice(0, 5)}${ev.end_time ? ` - ${String(ev.end_time).slice(0, 5)}` : ''})`
                                : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* DEDICATED VIEW: CLASS DELEGATE LOOKUP */}
            {activeSection === 'delegate' && delegateInfo?.isDelegate && (
              <div>
                <div
                  style={{
                    background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                    color: '#ffffff',
                    padding: '1.15rem 1.35rem',
                    borderRadius: '12px',
                    marginBottom: '1.15rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: 'rgba(255, 255, 255, 0.2)',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '12px',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      <ShieldCheckIcon size={14} color="#ffffff" /> Quyền Ban Chấp Hành Chi Đoàn
                    </div>
                    <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1.05rem', fontWeight: 800 }}>
                      Tra Cứu Hoạt Động & Chấm ĐRL Chi Đoàn {delegateInfo.class_id}
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: '#e0e7ff' }}>
                      Tra cứu danh sách, lịch sử sự kiện và minh chứng của đoàn viên thuộc lớp {delegateInfo.class_id}.
                    </p>
                  </div>
                  <div
                    style={{
                      background: '#ffffff',
                      color: '#1e3a8a',
                      padding: '0.45rem 0.9rem',
                      borderRadius: '10px',
                      textAlign: 'center',
                      fontWeight: 800,
                    }}
                  >
                    <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>Còn lại</div>
                    <div style={{ color: '#16a34a', fontSize: '1.05rem' }}>{delegateInfo.daysLeft} ngày</div>
                  </div>
                </div>

                <div className={styles.historyHeader} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                  <div>
                    <h2 className={styles.historyTitle} style={{ color: '#1e40af' }}>
                      <UsersIcon size={18} color="#2563eb" />
                      Danh Sách Đoàn Viên Lớp {delegateInfo.class_id} ({classStudents.length})
                    </h2>
                  </div>
                  <ExcelExportButton
                    data={classStudents.map((s, idx) => ({
                      stt: idx + 1,
                      mssv: s.mssv,
                      full_name: s.full_name,
                      class_id: s.class_id,
                      email: s.email,
                      so_su_kien_tham_gia: s.total_attended,
                      danh_sach_su_kien: s.attended_events_summary || '',
                    }))}
                    filename={`danh-sach-drl-chidoan-${delegateInfo.class_id}.xlsx`}
                    label={`Xuất Excel ĐRL ${delegateInfo.class_id}`}
                  />
                </div>

                <DataTable
                  columns={[
                    {
                      key: 'stt',
                      label: 'STT',
                      render: (_, __) => null,
                    },
                    {
                      key: 'mssv',
                      label: 'MSSV',
                      render: (val) => <strong style={{ color: '#1d4ed8', fontFamily: 'monospace' }}>{val}</strong>,
                    },
                    {
                      key: 'full_name',
                      label: 'Họ và tên',
                      render: (val) => <span style={{ fontWeight: 700 }}>{val}</span>,
                    },
                    {
                      key: 'total_attended',
                      label: 'Đã Tham Gia',
                      render: (val) => (
                        <span
                          style={{
                            padding: '0.25rem 0.65rem',
                            borderRadius: '12px',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            background: val > 0 ? '#dcfce7' : '#f1f5f9',
                            color: val > 0 ? '#15803d' : '#64748b',
                          }}
                        >
                          {val} sự kiện
                        </span>
                      ),
                    },
                    {
                      key: 'actions',
                      label: 'Minh Chứng ĐRL',
                      render: (_, row) => (
                        <button
                          type="button"
                          onClick={() => openClassmateHistory(row)}
                          style={{
                            padding: '0.35rem 0.75rem',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            borderRadius: '8px',
                            color: '#1d4ed8',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                          }}
                        >
                          Xem Minh Chứng
                        </button>
                      ),
                    },
                  ]}
                  data={classStudents}
                  searchable={true}
                  searchPlaceholder={`Tìm MSSV, họ tên trong lớp ${delegateInfo.class_id}...`}
                  emptyMessage={
                    loadingClass
                      ? 'Đang tải danh sách lớp...'
                      : `Không tìm thấy sinh viên nào trong lớp ${delegateInfo.class_id}.`
                  }
                  pageSize={50}
                  onSearchChange={(q) => fetchClassStudents(q)}
                />
              </div>
            )}

            {activeSection === 'delegate' && !delegateInfo?.isDelegate && (
              <div className={styles.emptyHistory}>
                Tài khoản của bạn hiện chưa được cấp quyền Ban Chấp Hành Chi Đoàn (Bí thư / Phó Bí thư / BCS lớp).
              </div>
            )}
        </section>
      )}

      {/* Modal Chỉnh Sửa Hồ Sơ */}
      {showProfileModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={() => setShowProfileModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              padding: '2rem',
              width: '100%',
              maxWidth: '440px',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                Cập Nhật Thông Tin Cá Nhân
              </h3>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingProfile(true);
                try {
                  const res = await fetch('/api/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gender: userGender, phone: userPhone }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    invalidateClientMeCache();
                    setCurrentUser((prev) => ({
                      ...prev,
                      gender: userGender,
                      phone: userPhone,
                    }));
                    toast.success('Đã lưu thông tin hồ sơ thành công!');
                    setShowProfileModal(false);
                  } else {
                    toast.error(data.error || 'Lỗi cập nhật hồ sơ');
                  }
                } catch {
                  toast.error('Lỗi kết nối máy chủ');
                } finally {
                  setSavingProfile(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Giới tính
                </label>
                <select
                  value={userGender}
                  onChange={(e) => setUserGender(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    color: '#0f172a',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="Nam">Nam</option>
                  <option value="Nữ">Nữ</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                  Số điện thoại / Zalo
                </label>
                <input
                  type="tel"
                  value={userPhone}
                  onChange={(e) => setUserPhone(e.target.value)}
                  placeholder="Ví dụ: 0912345678"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    background: '#f8fafc',
                    fontWeight: 600,
                    fontSize: '0.95rem',
                    color: '#0f172a',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#f1f5f9',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: '#475569',
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  style={{
                    padding: '0.65rem 1.5rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  {savingProfile ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View Classmate Attendance Proofs */}
      {selectedClassmate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setSelectedClassmate(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '20px',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1.25rem 1.5rem',
                background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: '#93c5fd' }}>
                  Minh Chứng Chấm Điểm Rèn Luyện
                </div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.2rem', fontWeight: 800 }}>
                  {selectedClassmate.full_name} ({selectedClassmate.mssv})
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#e0e7ff', marginTop: '0.15rem' }}>
                  Lớp: {selectedClassmate.class_id} • Email: {selectedClassmate.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClassmate(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloseIcon size={16} color="#ffffff" />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {loadingClassmateHistory ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                    Đang tải dữ liệu minh chứng...
                  </div>
                  <div>Vui lòng chờ trong giây lát.</div>
                </div>
              ) : classmateHistoryError ? (
                <div
                  style={{
                    padding: '2rem 1.5rem',
                    textAlign: 'center',
                    background: '#fef2f2',
                    border: '1.5px solid #fecaca',
                    borderRadius: '14px',
                    color: '#b91c1c',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                    <AlertTriangleIcon size={24} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                    {classmateHistoryError}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>
                    Vui lòng liên hệ Đoàn Trường nếu bạn cần cấp lại quyền Ban cán sự lớp.
                  </div>
                </div>
              ) : classmateHistory ? (
                <>
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1.5px solid #bbf7d0',
                      borderRadius: '12px',
                      padding: '0.85rem 1rem',
                      marginBottom: '1.25rem',
                    }}
                  >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                      Tổng Số Lượt Điểm Danh Hợp Lệ
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#15803d', marginTop: '0.15rem' }}>
                      {classmateHistory.total_attended} sự kiện
                    </div>
                  </div>

                  <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', fontWeight: 800, color: '#1e293b' }}>
                    Chi Tiết Các Sự Kiện Đã Check-in
                  </h4>

                  {classmateHistory.history && classmateHistory.history.length > 0 ? (
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                            <th style={{ padding: '0.7rem 0.9rem' }}>Tên Sự Kiện</th>
                            <th style={{ padding: '0.7rem 0.9rem' }}>Số Buổi</th>
                            <th style={{ padding: '0.7rem 0.9rem' }}>Thời Gian Điểm Danh</th>
                            <th style={{ padding: '0.7rem 0.9rem' }}>Vai Trò</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classmateHistory.history.map((h: any) => {
                            const sCount = h.session_count || 1;
                            const sTotal = h.total_sessions || 1;
                            const isFull = sCount >= sTotal;
                            return (
                              <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.7rem 0.9rem', fontWeight: 700, color: '#0f172a' }}>
                                  <div>{h.event_name}</div>
                                  {(sTotal > 1 || (h.session_names && h.session_names !== 'Buổi chính')) && (
                                    <div style={{ fontSize: '0.73rem', color: '#475569', fontWeight: 600, marginTop: '0.15rem' }}>
                                      Buổi: {h.session_names}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '0.7rem 0.9rem', whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{
                                      padding: '0.2rem 0.55rem',
                                      borderRadius: '999px',
                                      fontSize: '0.75rem',
                                      fontWeight: 800,
                                      background: isFull ? '#dcfce7' : '#fef3c7',
                                      color: isFull ? '#15803d' : '#b45309',
                                      border: `1px solid ${isFull ? '#bbf7d0' : '#fde68a'}`,
                                    }}
                                  >
                                    {sCount}/{sTotal} buổi
                                  </span>
                                </td>
                                <td style={{ padding: '0.7rem 0.9rem', color: '#64748b' }}>
                                  {new Date(h.checkin_time).toLocaleString('vi-VN')}
                                </td>
                                <td style={{ padding: '0.7rem 0.9rem' }}>
                                  <span
                                    style={{
                                      padding: '0.2rem 0.55rem',
                                      borderRadius: '10px',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      background:
                                        h.participate_role === 'volunteer'
                                          ? '#fef3c7'
                                          : h.participate_role === 'organizer'
                                          ? '#f3e8ff'
                                          : '#dcfce7',
                                      color:
                                        h.participate_role === 'volunteer'
                                          ? '#b45309'
                                          : h.participate_role === 'organizer'
                                          ? '#7e22ce'
                                          : '#15803d',
                                    }}
                                  >
                                    {h.participate_role === 'volunteer'
                                      ? 'Tình Nguyện Viên'
                                      : h.participate_role === 'organizer'
                                      ? 'Ban Tổ Chức'
                                      : 'Người Tham Gia'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b' }}>
                      Sinh viên này chưa có lượt điểm danh sự kiện nào.
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div style={{ padding: '0.85rem 1.25rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSelectedClassmate(null)}
                style={{
                  padding: '0.45rem 1rem',
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Scanner */}
      <StudentSelfScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onSuccess={fetchHistory}
      />
    </>
  );
}
