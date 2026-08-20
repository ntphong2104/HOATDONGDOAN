'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import DualLogos from '@/components/DualLogos';
import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  CheckCircleIcon,
  SpinnerIcon,
  ShieldCheckIcon,
  QrCodeIcon,
  AlertTriangleIcon,
} from '@/components/icons';
import type { Event, EventRegistration, UserPenalty, SessionUser } from '@/lib/types';
import styles from './page.module.css';

export default function EventRegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [totalRegistered, setTotalRegistered] = useState(0);
  const [myRegistration, setMyRegistration] = useState<EventRegistration | null>(null);
  const [penaltyStatus, setPenaltyStatus] = useState<UserPenalty | null>(null);
  const [registrationWindow, setRegistrationWindow] = useState<{ isOpen: boolean; cutoffTime?: string; reason?: string } | null>(null);
  const [regType, setRegType] = useState<'participant' | 'volunteer'>('participant');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [gender, setGender] = useState<'Nam' | 'Nữ'>('Nam');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.success && data.data) {
        setCurrentUser(data.data);
        if (data.data.gender) setGender(data.data.gender);
        if (data.data.phone) setPhone(data.data.phone);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRegistrationData = async () => {
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/register`);
      const data = await res.json();
      if (data.success && data.data) {
        setEvent(data.data.event);
        setTotalRegistered(data.data.totalRegistered || 0);
        setMyRegistration(data.data.myRegistration || null);
        setPenaltyStatus(data.data.penaltyStatus || null);
        setRegistrationWindow(data.data.registrationWindow || null);
        if (data.data.event?.departments?.length > 0) {
          setSelectedDeptId(data.data.event.departments[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load registration info', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchRegistrationData();
  }, [resolvedParams.id]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      router.push(`/login?redirect=/events/${resolvedParams.id}/register`);
      return;
    }

    if (penaltyStatus?.is_blacklisted) {
      alert('Tài khoản của bạn đang bị khóa Blacklist do vắng mặt 3 lần.');
      return;
    }

    if (regType === 'volunteer' && selectedDeptId && event?.departments) {
      const targetDept = event.departments.find((d) => d.id === selectedDeptId);
      if (targetDept) {
        if (targetDept.gender_req === 'male' && gender === 'Nữ') {
          alert(`Vị trí "${targetDept.name}" yêu cầu ứng viên Nam. Bạn vui lòng chọn Ban khác phù hợp hơn nhé!`);
          return;
        }
        if (targetDept.gender_req === 'female' && gender === 'Nam') {
          alert(`Vị trí "${targetDept.name}" yêu cầu ứng viên Nữ. Bạn vui lòng chọn Ban khác phù hợp hơn nhé!`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      const selectedDept = event?.departments?.find((d) => d.id === selectedDeptId);
      const res = await fetch(`/api/events/${resolvedParams.id}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role_type: regType,
          department_id: regType === 'volunteer' ? selectedDeptId : null,
          department_name: regType === 'volunteer' ? selectedDept?.name : null,
          gender,
          phone,
          note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Chúc mừng bạn đã đăng ký tham gia sự kiện thành công!');
        fetchRegistrationData();
      } else {
        alert(data.error || 'Lỗi đăng ký');
      }
    } catch (err) {
      alert('Lỗi kết nối mạng');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!confirm('Bạn có chắc chắn muốn hủy đăng ký tham gia sự kiện này?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/register`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã hủy đăng ký');
        fetchRegistrationData();
      } else {
        alert(data.error || 'Lỗi hủy đăng ký');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Header showBack backHref="/" title="CỔNG ĐĂNG KÝ SỰ KIỆN" />
        <div style={{ textAlign: 'center', padding: '5rem' }}>
          <SpinnerIcon size={36} color="var(--primary-600)" />
          <p style={{ marginTop: '0.75rem', color: '#64748b', fontWeight: 600 }}>
            Đang tải thông tin sự kiện...
          </p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className={styles.container}>
        <Header showBack backHref="/" title="CỔNG ĐĂNG KÝ SỰ KIỆN" />
        <div style={{ textAlign: 'center', padding: '5rem' }}>
          <h3>Không tìm thấy sự kiện hoặc sự kiện đã đóng.</h3>
          <Link href="/">Quay lại trang chủ</Link>
        </div>
      </div>
    );
  }

  const isBlacklisted = penaltyStatus?.is_blacklisted;

  return (
    <div className={styles.container}>
      <Header showBack backHref="/" title="CỔNG ĐĂNG KÝ SỰ KIỆN" />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.headerArea}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <DualLogos size="md" />
            </div>
            <span className={styles.badgeTag}>Đoàn Thanh Niên PTIT</span>
            <h1 className={styles.title}>{event.event_name}</h1>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
              Học Viện Công Nghệ Bưu Chính Viễn Thông — Cơ Sở Tại TP. Hồ Chí Minh
            </p>
          </div>

          <div className={styles.infoGrid}>
            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Ngày Diễn Ra</span>
              <span className={styles.infoValue}>
                {event.event_date ? new Date(event.event_date).toLocaleDateString('vi-VN') : 'Hôm nay'}
              </span>
            </div>

            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Thời Gian</span>
              <span className={styles.infoValue}>
                {event.start_time?.slice(0, 5) || '07:30'} — {event.end_time?.slice(0, 5) || '22:00'}
              </span>
            </div>

            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Đã Đăng Ký</span>
              <span className={styles.infoValue}>
                {totalRegistered}{event.max_participants ? ` / ${event.max_participants}` : ''} sinh viên
              </span>
            </div>

            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Trạng Thái</span>
              <span
                className={styles.infoValue}
                style={{ color: registrationWindow?.isOpen ? '#16a34a' : '#dc2626' }}
              >
                {registrationWindow?.isOpen
                  ? '🟢 Đang mở đăng ký'
                  : event.max_participants && totalRegistered >= event.max_participants
                  ? '🔴 Đã đủ chỉ tiêu (Đã đóng)'
                  : '🔴 Đã đóng đăng ký'}
              </span>
            </div>
          </div>

          {/* 1. BLACKLIST WARNING BANNER (If Student is Blacklisted) */}
          {isBlacklisted && (
            <div className={styles.blacklistAlert}>
              <h3 className={styles.blacklistTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangleIcon size={20} color="#b91c1c" />
                <span>TÀI KHOẢN CỦA BẠN ĐÃ BỊ KHÓA ĐĂNG KÝ (BLACKLIST)</span>
              </h3>
              <p className={styles.blacklistDesc}>
                Lý do: Bạn đã vắng mặt <strong>{penaltyStatus.missed_count} lần</strong> không lý do trong các sự kiện đã đăng ký trước đây.
                Hệ thống tự động đình chỉ quyền đăng ký sự kiện của bạn.
              </p>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.9 }}>
                Vui lòng liên hệ trực tiếp Văn phòng Đoàn Thanh Niên PTIT để được giải trình và hỗ trợ mở khóa.
              </div>
            </div>
          )}

          {/* 2. REGISTRATION WINDOW CLOSED (12-Hour Cutoff or Closed) */}
          {!registrationWindow?.isOpen && !isBlacklisted && (
            <div
              style={{
                background: '#fffbeb',
                border: '1.5px solid #fde68a',
                borderRadius: '16px',
                padding: '1.5rem',
                marginBottom: '1.75rem',
                color: '#92400e',
              }}
            >
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', fontWeight: 800, color: '#b45309' }}>
                CỔNG ĐĂNG KÝ ĐÃ ĐÓNG
              </h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {registrationWindow?.reason || 'Cổng đăng ký đã đóng theo thời hạn quy định.'}
              </p>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                Quy định: Cổng đăng ký tự động đóng trước 12 tiếng để Ban tổ chức chốt số lượng người tham gia & chuẩn bị công tác tổ chức.
              </div>
            </div>
          )}

          {/* 3. ALREADY REGISTERED SUCCESS VIEW */}
          {myRegistration && !isBlacklisted && (
            <div className={styles.successCard}>
              <span className={styles.registeredBadge}>
                <CheckCircleIcon size={16} color="#ffffff" />
                ĐÃ ĐĂNG KÝ THÀNH CÔNG
              </span>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#166534', fontSize: '1.15rem', fontWeight: 800 }}>
                Bạn đã có vé tham gia sự kiện này!
              </h3>
              <p style={{ margin: '0 0 1.25rem 0', color: '#15803d', fontSize: '0.875rem' }}>
                Vai trò đăng ký: <strong>{myRegistration.role_type === 'volunteer' ? 'Cộng tác viên' : 'Người tham gia'}</strong> • MSSV: <strong>{myRegistration.mssv}</strong>
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <Link
                  href="/"
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <QrCodeIcon size={16} />
                  <span>Xem Mã QR Điểm Danh Cá Nhân</span>
                </Link>

                <button
                  type="button"
                  onClick={handleCancelRegistration}
                  disabled={submitting}
                  className={styles.cancelBtn}
                  style={{ width: 'auto', padding: '0 1rem' }}
                >
                  Hủy Đăng Ký
                </button>
              </div>
            </div>
          )}

          {/* 3. REGISTRATION FORM (If not registered & not blacklisted & registration window is open) */}
          {!myRegistration && !isBlacklisted && registrationWindow?.isOpen && (
            <form onSubmit={handleRegister} className={styles.formSection}>
              {!currentUser ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Vui lòng đăng nhập với tài khoản Google Học Viện để tiến hành đăng ký.
                  </p>
                  <Link
                    href={`/login?redirect=/events/${event.event_id}/register`}
                    className={styles.submitBtn}
                    style={{ textDecoration: 'none' }}
                  >
                    Đăng Nhập Ngay Để Đăng Ký
                  </Link>
                </div>
              ) : (
                <>
                  {/* Student info and extra details */}
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Thông Tin Sinh Viên Đăng Ký</label>
                    <div
                      style={{
                        padding: '0.85rem 1.15rem',
                        background: '#f8fafc',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '12px',
                        fontSize: '0.925rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span><strong>Họ và tên:</strong> {currentUser.full_name}</span>
                        <span style={{ color: '#2563eb', fontWeight: 700 }}>MSSV: {currentUser.mssv || currentUser.email}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        Lớp: <strong>{currentUser.class_id || 'PTIT-HCM'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Gender & Phone fields when applying for CTV */}
                  {regType === 'volunteer' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.875rem', marginBottom: '1rem' }}>
                      <div className={styles.formGroup} style={{ margin: 0 }}>
                        <label className={styles.label} style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                          Giới Tính Của Bạn <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', height: '44px' }}>
                          <button
                            type="button"
                            onClick={() => setGender('Nam')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.35rem',
                              border: gender === 'Nam' ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                              borderRadius: '10px',
                              background: gender === 'Nam' ? '#eff6ff' : '#ffffff',
                              color: gender === 'Nam' ? '#1d4ed8' : '#64748b',
                              fontWeight: gender === 'Nam' ? 700 : 600,
                              fontSize: '0.9rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>👨</span> Nam
                          </button>
                          <button
                            type="button"
                            onClick={() => setGender('Nữ')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.35rem',
                              border: gender === 'Nữ' ? '2px solid #ec4899' : '1.5px solid #e2e8f0',
                              borderRadius: '10px',
                              background: gender === 'Nữ' ? '#fdf2f8' : '#ffffff',
                              color: gender === 'Nữ' ? '#be185d' : '#64748b',
                              fontWeight: gender === 'Nữ' ? 700 : 600,
                              fontSize: '0.9rem',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>👩</span> Nữ
                          </button>
                        </div>
                      </div>

                      <div className={styles.formGroup} style={{ margin: 0 }}>
                        <label className={styles.label} style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                          Số Điện Thoại / Zalo <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Ví dụ: 0912345678"
                          required
                          style={{
                            width: '100%',
                            height: '44px',
                            padding: '0 0.9rem',
                            border: '1.5px solid #e2e8f0',
                            borderRadius: '10px',
                            boxSizing: 'border-box',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            color: '#0f172a',
                            background: '#ffffff',
                            outline: 'none',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Note / Experience field when applying for CTV */}
                  {regType === 'volunteer' && (
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Ghi Chú Kỹ Năng / Kinh Nghiệm Ứng Tuyển</label>
                      <textarea
                        rows={3}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Mô tả kỹ năng, kinh nghiệm hoặc link portfolio / facebook cá nhân..."
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '8px',
                          boxSizing: 'border-box',
                          fontFamily: 'inherit',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  )}

                  <button type="submit" disabled={submitting} className={styles.submitBtn}>
                    {submitting
                      ? 'Đang xử lý đăng ký...'
                      : regType === 'volunteer'
                      ? 'Gửi Đơn Ứng Tuyển Ban Chuyên Trách'
                      : 'Xác Nhận Đăng Ký Tham Gia'}
                  </button>

                  <div className={styles.policyNote}>
                    <strong>Quy định chống vắng mặt (No-show Rule):</strong> Khi đã bấm đăng ký, vui lòng sắp xếp có mặt đúng giờ để check-in. Nếu tích lũy <strong>3 lần vắng mặt</strong> không lý do, tài khoản sẽ <strong>tự động bị khóa (Blacklist)</strong> không thể đăng ký các sự kiện tiếp theo.
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
