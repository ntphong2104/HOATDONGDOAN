'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import StatCard from '@/components/StatCard';
import ExcelExportButton from '@/components/ExcelExportButton';
import DataTable from '@/components/DataTable';
import DynamicEventQRModal from '@/components/DynamicEventQRModal';
import {
  UsersIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  SettingsIcon,
  CloseIcon,
  QrCodeIcon,
  StarIcon,
  TrashIcon,
} from '@/components/icons';
import type { Event, EventRole, CheckinExportRow, EventRegistration } from '@/lib/types';
import { isEventPastDeadline, isEventScheduleExpired } from '@/lib/utils/event-logic';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';
import styles from './page.module.css';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const supabase = createClient();
  const [event, setEvent] = useState<Event | null>(null);
  const [checkins, setCheckins] = useState<CheckinExportRow[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [roles, setRoles] = useState<EventRole[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [togglingReg, setTogglingReg] = useState(false);
  const [activeTab, setActiveTab] = useState<'checkins' | 'registrations' | 'ratings' | 'noshow'>('checkins');
  const [ratings, setRatings] = useState<any[]>([]);
  const [manualMSSV, setManualMSSV] = useState('');
  const [manualCheckinStatus, setManualCheckinStatus] = useState('');
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDynamicQR, setShowDynamicQR] = useState(false);
  const [projectorRole, setProjectorRole] = useState<'participant' | 'volunteer' | 'organizer'>('participant');

  useEffect(() => {
    fetchData(true);

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        fetchData(false);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [resolvedParams.id]);

  const fetchData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const meRes = await fetch('/api/me');
      const meData = await meRes.json();
      if (meData.success && meData.data) {
        setCurrentUser(meData.data);
      } else {
        window.location.replace('/login');
        return;
      }

      const { data: eventData } = await supabase
        .from('events')
        .select('*')
        .eq('event_id', resolvedParams.id)
        .single();
      
      if (eventData) {
        setEvent(eventData);
      }

      const res = await fetch(`/api/events/${resolvedParams.id}/checkins`);
      const checkinsData = await res.json();
      if (checkinsData.success) {
        setCheckins(checkinsData.data);
      }

      const rolesRes = await fetch(`/api/events/${resolvedParams.id}/roles`);
      const rolesData = await rolesRes.json();
      if (rolesData.success) {
        setRoles(rolesData.data);
      }

      const regRes = await fetch(`/api/events/${resolvedParams.id}/register`);
      const regData = await regRes.json();
      if (regData.success && regData.data?.allRegistrations) {
        setRegistrations(regData.data.allRegistrations);
      }

      const ratingRes = await fetch(`/api/events/${resolvedParams.id}/ratings`);
      const ratingData = await ratingRes.json();
      if (ratingData.success) {
        setRatings(ratingData.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const handleSubmitEventRating = async () => {
    setSubmittingRating(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stars: ratingStars,
          feedback: ratingFeedback,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã gửi đánh giá thành công!');
        setRatingFeedback('');
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi gửi đánh giá');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleToggleRegistration = async () => {
    if (!event) return;
    const currentWindow = isRegistrationWindowOpen(
      event.event_date,
      event.start_time,
      event.status,
      event.is_registration_open
    );
    const isCurrentlyOpen = currentWindow.isOpen;
    const isExpired = isEventScheduleExpired(event);

    if (!isCurrentlyOpen && isExpired && !isPrivileged) {
      alert(
        'Chương trình đã kết thúc quá 1 giờ và tự động đóng. Cán bộ đơn vị trực thuộc không được phép mở lại cổng đăng ký. Vui lòng liên hệ Super Admin hoặc Đoàn Thanh Niên Học Viện.'
      );
      return;
    }

    const msg = isCurrentlyOpen
      ? 'Bạn có chắc muốn ĐÓNG cổng đăng ký của sự kiện này sớm? (Sinh viên sẽ không thể đăng ký thêm)'
      : 'Bạn có chắc muốn MỞ LẠI cổng đăng ký cho sự kiện này? (Cho phép sinh viên đăng ký bổ sung)';
    if (!confirm(msg)) return;

    setTogglingReg(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/toggle-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: !isCurrentlyOpen }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        if (data.data) {
          setEvent(data.data);
        } else {
          setEvent((prev) => (prev ? { ...prev, is_registration_open: !isCurrentlyOpen } : null));
        }
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi thay đổi trạng thái');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setTogglingReg(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const regUrl = `${window.location.origin}/events/${resolvedParams.id}/register`;
    navigator.clipboard.writeText(regUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleManualCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMSSV.trim()) return;
    setManualCheckinStatus('Đang xử lý...');
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv: manualMSSV.trim(), event_id: event?.event_id, participate_role: 'participant' }),
      });
      const data = await res.json();
      if (data.success) {
        setManualCheckinStatus(`Thành công: Đã điểm danh cho ${manualMSSV}`);
        setManualMSSV('');
        fetchData();
      } else {
        setManualCheckinStatus(`Lỗi: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setManualCheckinStatus(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleReconcileAttendance = async () => {
    if (!confirm('Xác nhận chốt danh sách điểm danh và tự động xử lý vắng mặt (No-Show)?\n\nSinh viên đã đăng ký nhưng không quét mã sẽ bị tính +1 lần vắng mặt. Nếu đủ 3 lần vắng sẽ tự động bị khóa Blacklist.')) return;
    setReconciling(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/reconcile-attendance`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchData();
      } else {
        alert(data.error || 'Lỗi xử lý điểm danh');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setReconciling(false);
    }
  };

  const addChecker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role_type: 'checker' }),
      });
      const data = await res.json();
      if (data.success) {
        setNewEmail('');
        fetchData();
      } else {
        alert(data.message || data.error || 'Lỗi thêm checker');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeRole = async (roleId: number) => {
    if (!confirm('Bạn có chắc muốn xóa quyền của tài khoản này?')) return;
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/roles/${roleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event) return;
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN sự kiện "${event.event_name}"?\n\nToàn bộ dữ liệu điểm danh, đánh giá và phân quyền của sự kiện này sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/events/${resolvedParams.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Đã xóa thành công sự kiện "${event.event_name}"!`);
        window.location.href = backTarget;
      } else {
        alert(data.message || data.error || 'Không thể xóa sự kiện');
      }
    } catch (err: any) {
      alert(`Đã xảy ra lỗi: ${err.message || 'Lỗi kết nối'}`);
    }
  };

  const isSuperAdmin = currentUser?.tier === 'super_admin' || Boolean((currentUser as any)?.isSuperAdmin);
  const backTarget = isSuperAdmin ? '/super-admin' : '/admin';

  const isYouthUnion =
    currentUser?.tier === 'youth_union' ||
    Boolean(currentUser?.email?.toLowerCase().includes('doanthanhnien'));
  const isPrivileged = isSuperAdmin || isYouthUnion;
  const isEventCreator = Boolean(
    event?.created_by &&
    currentUser?.email &&
    event.created_by.toLowerCase() === currentUser.email.toLowerCase()
  );
  const hasEventRole = currentUser?.managed_events?.some(
    (e: any) => e.event_id === resolvedParams.id
  ) || roles?.some(
    (r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase()
  );

  // Authorization: super admin, youth union, event creator or assigned role can view
  const hasEventAccess = isSuperAdmin || isYouthUnion || isEventCreator || hasEventRole;

  const handleToggleEventStatus = async () => {
    if (!event) return;
    const newStatus = event.status === 'active' ? 'closed' : 'active';
    const isPast = isEventPastDeadline(event);

    if (newStatus === 'active' && isPast && !isPrivileged) {
      alert('Chương trình đã kết thúc quá 1 giờ và tự động đóng. Cán bộ đơn vị trực thuộc không được phép tự mở lại. Vui lòng liên hệ Super Admin hoặc Đoàn Thanh Niên Học Viện để được hỗ trợ.');
      return;
    }

    const actionText = newStatus === 'active' ? 'MỞ LẠI' : 'ĐÓNG';
    if (!confirm(`Xác nhận ${actionText} sự kiện "${event.event_name}"?`)) return;

    try {
      const res = await fetch(`/api/events/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEvent(data.data);
        alert(`Đã ${actionText.toLowerCase()} sự kiện thành công!`);
      } else {
        alert(data.error || data.message || 'Lỗi cập nhật trạng thái sự kiện');
      }
    } catch (err: any) {
      alert(`Lỗi: ${err.message || 'Lỗi kết nối'}`);
    }
  };

  if (loading || !event) {
    return (
      <div className={styles.container}>
        <Header userName="Admin Sự Kiện" showBack backHref={backTarget} />
        <main className={styles.main}>
          <div className={styles.loading}>Đang tải thông tin sự kiện...</div>
        </main>
      </div>
    );
  }

  if (!hasEventAccess) {
    return (
      <div className={styles.container}>
        <Header userName={currentUser?.full_name || 'Admin'} showBack backHref={backTarget} title="KHÔNG CÓ QUYỀN" />
        <main className={styles.main}>
          <div style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: '#fff1f2',
            borderRadius: '16px',
            border: '1.5px solid #fecaca',
            color: '#b91c1c',
          }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>⛔ Bạn không có quyền xem sự kiện này</p>
            <p style={{ fontSize: '0.875rem', margin: 0, color: '#64748b' }}>Chỉ Super Admin, Đoàn Học Viện hoặc đơn vị tạo sự kiện mới có quyền truy cập.</p>
          </div>
        </main>
      </div>
    );
  }

  const stats = {
    participant: checkins.filter(c => c.participate_role === 'Người tham gia').length,
    volunteer: checkins.filter(c => c.participate_role === 'Cộng tác viên').length,
    organizer: checkins.filter(c => c.participate_role === 'Ban tổ chức').length,
  };

  const regUrl = typeof window !== 'undefined' ? `${window.location.origin}/events/${event.event_id}/register` : `/events/${event.event_id}/register`;

  const userTier = currentUser?.tier || 'user';
  const userEmail = currentUser?.email || '';
  const isApproverRole =
    userTier === 'youth_union' ||
    userTier === 'ctsv' ||
    userTier === 'facility' ||
    userTier === 'super_admin' ||
    userEmail.includes('doanthanhnien') ||
    userEmail.includes('ctsv') ||
    userEmail.includes('quantri') ||
    userEmail.includes('csvc') ||
    userEmail.includes('superadmin');

  return (
    <div className={styles.container}>
      <Header userName={currentUser?.full_name || 'Admin Sự Kiện'} showBack backHref={backTarget} title="CHI TIẾT SỰ KIỆN" />
      <main className={styles.main}>
        <div className={styles.breadcrumb}>
          <Link href={backTarget} className={styles.backLink}>
            <ArrowLeftIcon size={16} />
            <span>{isSuperAdmin ? 'Quay lại Bàn Quản Trị Toàn Trường' : 'Quay lại Danh Sách Sự Kiện'}</span>
          </Link>
        </div>

        <div className={styles.headerArea}>
          <h1 className={styles.title}>{event.event_name}</h1>
          <p className={styles.subtitle}>
            <ClockIcon size={16} />
            {event.event_date ? new Date(event.event_date).toLocaleDateString('vi-VN') : 'Hôm nay'}
            {event.start_time && ` (${event.start_time.slice(0, 5)} - ${event.end_time ? event.end_time.slice(0, 5) : '22:00'})`}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ color: event.status === 'active' ? '#16a34a' : '#dc2626', fontWeight: 700, fontSize: '0.9rem' }}>
              {event.status === 'active' ? '● Đang mở điểm danh' : '● Đã đóng sự kiện'}
            </span>
            {event.status === 'active' ? (
              <button
                type="button"
                onClick={handleToggleEventStatus}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '8px',
                  border: '1.5px solid #fca5a5',
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                🔒 Đóng Sự Kiện
              </button>
            ) : isPrivileged ? (
              <button
                type="button"
                onClick={handleToggleEventStatus}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '8px',
                  border: '1.5px solid #86efac',
                  background: '#f0fdf4',
                  color: '#15803d',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                🔓 Mở Lại Sự Kiện
              </button>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
                title="Sự kiện tự động đóng sau 1 giờ. Chỉ Super Admin và Đoàn Thanh Niên mới có quyền mở lại."
              >
                🔒 Đã tự động đóng (Liên hệ Đoàn TN để mở lại)
              </span>
            )}
          </div>

          {event.status === 'active' && (() => {
            const regWindow = isRegistrationWindowOpen(
              event.event_date,
              event.start_time,
              event.status,
              event.is_registration_open
            );
            const isExpired = isEventScheduleExpired(event);

            return (
              <div
                style={{
                  marginTop: '1.25rem',
                  padding: '1.25rem 1.5rem',
                  background: regWindow.isOpen
                    ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                    : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                  border: `1.5px solid ${regWindow.isOpen ? '#bfdbfe' : '#fde68a'}`,
                  borderRadius: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: regWindow.isOpen ? '#1e40af' : '#b45309', textTransform: 'uppercase' }}>
                      Cổng Link Đăng Ký Công Khai
                    </span>
                    <span
                      style={{
                        padding: '0.2rem 0.65rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: regWindow.isOpen ? '#dcfce7' : '#fee2e2',
                        color: regWindow.isOpen ? '#15803d' : '#b91c1c',
                        border: `1px solid ${regWindow.isOpen ? '#86efac' : '#fca5a5'}`,
                      }}
                    >
                      {regWindow.isOpen ? '● Đang mở đăng ký' : '● Đã đóng cổng đăng ký'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: regWindow.isOpen ? '#1e3a8a' : '#92400e', marginTop: '0.3rem' }}>
                    {registrations.length} sinh viên đã đăng ký tham gia
                  </div>
                  <div style={{ fontSize: '0.8rem', color: regWindow.isOpen ? '#3b82f6' : '#b45309', marginTop: '0.15rem' }}>
                    {regWindow.isOpen
                      ? 'Gửi link này cho sinh viên các khoa để đăng ký tham gia hoặc làm CTV'
                      : `Trạng thái: ${regWindow.reason || 'Cổng đăng ký đã tự động đóng theo quy chế.'}`}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    style={{
                      padding: '0.55rem 1rem',
                      background: copied ? '#16a34a' : '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                    }}
                  >
                    {copied ? 'Đã sao chép link!' : 'Sao Chép Link Đăng Ký'}
                  </button>

                  {regWindow.isOpen ? (
                    <button
                      type="button"
                      onClick={handleToggleRegistration}
                      disabled={togglingReg}
                      style={{
                        padding: '0.55rem 1rem',
                        background: '#d97706',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)',
                      }}
                    >
                      {togglingReg ? 'Đang xử lý...' : '🔒 Tắt Cổng Đăng Ký (Đóng Sớm)'}
                    </button>
                  ) : (!isExpired || isPrivileged) ? (
                    <button
                      type="button"
                      onClick={handleToggleRegistration}
                      disabled={togglingReg}
                      style={{
                        padding: '0.55rem 1rem',
                        background: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                      }}
                    >
                      {togglingReg ? 'Đang xử lý...' : '🔓 Mở Lại Cổng Đăng Ký'}
                    </button>
                  ) : (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '10px',
                        border: '1.5px solid #e2e8f0',
                        background: '#ffffff',
                        color: '#64748b',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                      title="Sự kiện kết thúc quá 1 giờ. Chỉ Super Admin hoặc Đoàn Thanh Niên mới có quyền mở lại cổng đăng ký."
                    >
                      🔒 Khóa mở lại (Liên hệ Đoàn TN)
                    </span>
                  )}

                  <a
                    href={`/events/${event.event_id}/register`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '0.55rem 1rem',
                      background: '#ffffff',
                      color: '#2563eb',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    Mở Trang Đăng Ký ➔
                  </a>

                  <button
                    type="button"
                    onClick={handleReconcileAttendance}
                    disabled={reconciling}
                    style={{
                      padding: '0.55rem 1rem',
                      background: '#c2410c',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(194, 65, 12, 0.25)',
                    }}
                  >
                    {reconciling ? 'Đang xử lý...' : 'Chốt & Phạt Vắng Mặt (No-Show)'}
                  </button>

                  <button
                    type="button"
                    onClick={handleDeleteEvent}
                    style={{
                      padding: '0.55rem 1rem',
                      background: '#fff1f2',
                      color: '#e11d48',
                      border: '1.5px solid #fecaca',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <TrashIcon size={15} />
                    <span>Xóa Sự Kiện</span>
                  </button>
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: '1.25rem', padding: '1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem 0' }}>
                  Màn hình Chiếu Mã QR Động (Máy chiếu / Hội trường)
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Chọn vai trò trước khi chiếu để phát mã QR tương ứng lên màn hình lớn:
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setProjectorRole('participant');
                    setShowDynamicQR(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} />
                  Chiếu QR: Người tham gia
                </button>

                <button
                  onClick={() => {
                    setProjectorRole('volunteer');
                    setShowDynamicQR(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} />
                  Chiếu QR: Cộng tác viên (CTV)
                </button>

                <button
                  onClick={() => {
                    setProjectorRole('organizer');
                    setShowDynamicQR(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} />
                  Chiếu QR: Ban tổ chức (BTC)
                </button>
              </div>
            </div>
          </div>
        </div>

        {event.status === 'active' && (
          <DynamicEventQRModal
            eventId={event.event_id}
            eventName={event.event_name}
            targetRole={projectorRole}
            isOpen={showDynamicQR}
            onClose={() => setShowDynamicQR(false)}
          />
        )}

        {event.status === 'active' && (
        <div className={styles.statsGrid}>
          <StatCard
            title="Người tham gia"
            value={stats.participant}
            color="success"
            icon={<CheckCircleIcon size={20} />}
            subtitle="Sinh viên đã quét mã"
          />
          <StatCard
            title="Cộng tác viên"
            value={stats.volunteer}
            color="warning"
            icon={<UsersIcon size={20} />}
            subtitle="Hỗ trợ tổ chức"
          />
          <StatCard
            title="Ban tổ chức"
            value={stats.organizer}
            color="primary"
            icon={<ShieldCheckIcon size={20} />}
            subtitle="Điều phối chương trình"
          />
        </div>
        )}

        {event.status === 'active' && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <UsersIcon size={20} color="#2563eb" />
              Quản lý Cộng tác viên quét mã (Checker)
            </h2>
          </div>
          <form onSubmit={addChecker} className={styles.addForm}>
            <input 
              type="email" 
              placeholder="Nhập email sinh viên (@student.ptithcm.edu.vn)..." 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={styles.input}
              required
            />
            <button type="submit" className={styles.button}>Thêm CTV Quét Mã</button>
          </form>

          <ul className={styles.roleList}>
            {roles.filter(r => r.role_type === 'checker').length === 0 ? (
              <li className={styles.emptyList}>Chưa có checker nào được gán cho sự kiện này.</li>
            ) : (
              roles.filter(r => r.role_type === 'checker').map(role => (
                <li key={role.id} className={styles.roleItem}>
                  <span className={styles.roleEmail}>{role.email}</span>
                  <button onClick={() => removeRole(role.id)} className={styles.deleteButton} title="Xóa quyền">
                    Xóa quyền
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
        )}

        {event.status !== 'active' && isSuperAdmin && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Bổ sung điểm danh thủ công (Super Admin)</h2>
            </div>
            <form onSubmit={handleManualCheckin} className={styles.addForm} style={{ marginBottom: '1rem' }}>
              <input 
                type="text" 
                placeholder="Nhập MSSV cần điểm danh..." 
                value={manualMSSV}
                onChange={(e) => setManualMSSV(e.target.value)}
                className={styles.input}
                required
              />
              <button type="submit" className={styles.button}>Điểm danh</button>
            </form>
            {manualCheckinStatus && (
              <div style={{ color: manualCheckinStatus.startsWith('Lỗi') ? '#dc2626' : '#16a34a', fontSize: '0.9rem', fontWeight: 600 }}>
                {manualCheckinStatus}
              </div>
            )}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setActiveTab('checkins')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: activeTab === 'checkins' ? '#2563eb' : '#f1f5f9',
                  color: activeTab === 'checkins' ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                ✓ Đã Điểm Danh ({checkins.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('registrations')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: activeTab === 'registrations' ? '#2563eb' : '#f1f5f9',
                  color: activeTab === 'registrations' ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Danh Sách Đăng Ký ({registrations.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('noshow')}
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: activeTab === 'noshow' ? '#2563eb' : '#f1f5f9',
                  color: activeTab === 'noshow' ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Chưa Điểm Danh ({registrations.filter(r => !r.attended).length})
              </button>

              {(isApproverRole || ratings.length > 0) && (
                <button
                  type="button"
                  onClick={() => setActiveTab('ratings')}
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '8px',
                    background: activeTab === 'ratings' ? '#2563eb' : '#f1f5f9',
                    color: activeTab === 'ratings' ? '#ffffff' : '#475569',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  {isApproverRole
                    ? `Đánh Giá Sự Kiện (${ratings.length})`
                    : `Nhận Xét Từ Phòng Ban (${ratings.length})`}
                </button>
              )}
            </div>

            {activeTab === 'checkins' && (
              <ExcelExportButton
                fetchUrl={`/api/events/${resolvedParams.id}/checkins`}
                filename={`DiemDanh_${event.event_name.replace(/\s+/g, '_')}`}
                label="Xuất File Excel"
              />
            )}
          </div>

          {activeTab === 'checkins' ? (
            <DataTable 
              columns={[
                { key: 'stt', label: 'STT' },
                { key: 'mssv', label: 'MSSV' },
                { key: 'full_name', label: 'Họ và tên' },
                { key: 'class_id', label: 'Lớp' },
                { key: 'participate_role', label: 'Vai trò' },
                { key: 'checked_by', label: 'Người quét' },
                { key: 'checkin_time', label: 'Thời gian quét' },
              ]}
              data={checkins}
              searchable
              searchPlaceholder="Tìm kiếm theo MSSV, Họ tên, Lớp..."
              emptyMessage="Chưa có lượt điểm danh nào cho sự kiện này."
            />
          ) : activeTab === 'registrations' ? (
            <DataTable 
              columns={[
                { key: 'mssv', label: 'MSSV' },
                { key: 'full_name', label: 'Họ và tên' },
                { key: 'class_id', label: 'Lớp' },
                { key: 'role_type', label: 'Vai trò đăng ký' },
                {
                  key: 'attended',
                  label: 'Trạng thái tham gia',
                  render: (val: boolean) =>
                    val ? (
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>Đã có mặt</span>
                    ) : (
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>Chưa check-in</span>
                    ),
                },
                {
                  key: 'created_at',
                  label: 'Ngày đăng ký',
                  render: (val: string) => new Date(val).toLocaleString('vi-VN'),
                },
              ]}
              data={registrations}
              searchable
              searchPlaceholder="Tìm kiếm trong danh sách đăng ký..."
              emptyMessage="Chưa có sinh viên nào đăng ký sự kiện này."
            />
          ) : activeTab === 'noshow' ? (
            <DataTable 
              columns={[
                { key: 'mssv', label: 'MSSV' },
                { key: 'full_name', label: 'Họ và tên' },
                { key: 'class_id', label: 'Lớp' },
                { key: 'role_type', label: 'Vai trò đăng ký' }
              ]}
              data={registrations.filter(r => !r.attended)}
              searchable
              searchPlaceholder="Tìm kiếm MSSV, Họ tên..."
              emptyMessage="Không có sinh viên nào vắng mặt."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {isApproverRole && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '1.25rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <StarIcon size={18} color="#f59e0b" fill="#f59e0b" />
                    <span>Gửi Đánh Giá Chất Lượng Tổ Chức (Dành cho 4 cấp Ban ngành)</span>
                  </h4>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Nếu đơn vị bị đánh giá 1, 2 hoặc 3 sao, hệ thống sẽ tự động gắn cờ cảnh báo chú ý trong các lần trình kế hoạch tiếp theo.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Chọn số sao:</span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRatingStars(s)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.15rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <StarIcon
                            size={22}
                            color="#f59e0b"
                            fill={s <= ratingStars ? '#f59e0b' : 'none'}
                          />
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: ratingStars <= 3 ? '#d97706' : '#16a34a', marginLeft: '0.5rem' }}>
                      {ratingStars} Sao {ratingStars <= 3 ? '(Kích hoạt cảnh báo lưu ý)' : '(Đạt chuẩn)'}
                    </span>
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Nhập nhận xét chi tiết (về kỷ luật, vệ sinh hội trường, chuẩn bị, đúng giờ,...)"
                    value={ratingFeedback}
                    onChange={(e) => setRatingFeedback(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleSubmitEventRating}
                      disabled={submittingRating}
                      style={{
                        padding: '0.55rem 1.25rem',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      {submittingRating ? 'Đang gửi...' : 'Gửi Đánh Giá Sau Sự Kiện'}
                    </button>
                  </div>
                </div>
              )}

              {ratings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {ratings.map((r: any) => (
                    <div
                      key={r.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '10px',
                        padding: '1rem',
                        border: '1px solid #e2e8f0',
                        borderLeft: r.stars <= 3 ? '4px solid #f59e0b' : '4px solid #10b981',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div>
                          <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                            {r.rater_tier === 'youth_union'
                              ? 'Đoàn Học Viện'
                              : r.rater_tier === 'ctsv'
                              ? 'Phòng CTSV'
                              : r.rater_tier === 'facility'
                              ? 'Phòng Quản Trị CSVC'
                              : 'Super Admin'}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>({r.rater_email})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#d97706', fontWeight: 800 }}>
                          <StarIcon size={14} color="#f59e0b" fill="#f59e0b" />
                          <span>{r.stars} / 5 sao</span>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
                        {r.feedback || 'Không có nhận xét chi tiết.'}
                      </p>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem', display: 'block' }}>
                        Ngày đánh giá: {new Date(r.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                  Chưa có đánh giá nào cho sự kiện này.
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
