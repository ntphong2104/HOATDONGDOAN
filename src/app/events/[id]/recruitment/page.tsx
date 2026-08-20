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
import styles from '../register/page.module.css';

export default function EventRecruitmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [event, setEvent] = useState<Event | null>(null);
  const [myRegistration, setMyRegistration] = useState<EventRegistration | null>(null);
  const [penaltyStatus, setPenaltyStatus] = useState<UserPenalty | null>(null);
  const [registrationWindow, setRegistrationWindow] = useState<{ isOpen: boolean; cutoffTime?: string; reason?: string } | null>(null);
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
        setMyRegistration(data.data.myRegistration || null);
        setPenaltyStatus(data.data.penaltyStatus || null);
        setRegistrationWindow(data.data.registrationWindow || null);
        if (data.data.event?.departments?.length > 0) {
          setSelectedDeptId(data.data.event.departments[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load recruitment info', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchRegistrationData();
  }, [resolvedParams.id]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      router.push(`/login?redirect=/events/${resolvedParams.id}/recruitment`);
      return;
    }

    if (penaltyStatus?.is_blacklisted) {
      alert('Tài khoản của bạn đang bị khóa Blacklist.');
      return;
    }

    if (!selectedDeptId && event?.departments && event.departments.length > 0) {
      alert('Vui lòng chọn Ban ứng tuyển!');
      return;
    }

    if (selectedDeptId && event?.departments) {
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
          role_type: 'volunteer',
          department_id: selectedDeptId || null,
          department_name: selectedDept?.name || 'Ban CTV',
          gender,
          phone,
          note,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã gửi đơn ứng tuyển thành công! Ban tổ chức sẽ duyệt hồ sơ của bạn.');
        fetchRegistrationData();
      } else {
        alert(data.error || 'Lỗi nộp đơn');
      }
    } catch (err) {
      alert('Lỗi kết nối mạng');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRegistration = async () => {
    if (!confirm('Bạn có chắc chắn muốn rút đơn ứng tuyển?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/register`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã rút đơn ứng tuyển');
        fetchRegistrationData();
      } else {
        alert(data.error || 'Lỗi');
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
        <Header showBack backHref="/" title="CỔNG TUYỂN DỤNG BAN CHUYÊN TRÁCH" />
        <div style={{ textAlign: 'center', padding: '5rem' }}>
          <SpinnerIcon size={36} color="var(--primary-600)" />
          <p style={{ marginTop: '0.75rem', color: '#64748b', fontWeight: 600 }}>
            Đang tải thông tin tuyển dụng...
          </p>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className={styles.container}>
        <Header showBack backHref="/" title="CỔNG TUYỂN DỤNG BAN CHUYÊN TRÁCH" />
        <div style={{ textAlign: 'center', padding: '5rem' }}>
          <h3>Không tìm thấy thông tin sự kiện.</h3>
          <Link href="/">Quay lại trang chủ</Link>
        </div>
      </div>
    );
  }

  const isBlacklisted = penaltyStatus?.is_blacklisted;
  const isVolunteerApplied = myRegistration && (myRegistration.role_type === 'volunteer' || myRegistration.department_id);

  return (
    <div className={styles.container}>
      <Header showBack backHref="/" title="CỔNG TUYỂN DỤNG BAN CHUYÊN TRÁCH" />

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.headerArea}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
              <DualLogos size="md" />
            </div>
            <span
              style={{
                display: 'inline-block',
                background: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #bfdbfe',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 800,
                marginBottom: '0.5rem',
              }}
            >
              TUYỂN DỤNG BAN CHUYÊN TRÁCH & CTV
            </span>
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
              <span className={styles.infoLabel}>Vị Trí Tuyển</span>
              <span className={styles.infoValue}>
                {event.departments?.length || 0} Ban chuyên trách
              </span>
            </div>

            <div className={styles.infoBox}>
              <span className={styles.infoLabel}>Trạng Thái</span>
              <span
                className={styles.infoValue}
                style={{ color: registrationWindow?.isOpen ? '#16a34a' : '#dc2626' }}
              >
                {registrationWindow?.isOpen ? '🟢 Đang mở nhận đơn' : '🔴 Đã đóng cổng'}
              </span>
            </div>
          </div>

          {/* Switch link to Participant Registration */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.85rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <span style={{ color: '#475569' }}>Bạn chỉ muốn tham gia nhận điểm rèn luyện (Khán giả)?</span>
            <Link
              href={`/events/${event.event_id}/register`}
              style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}
            >
              Đăng ký tham gia sự kiện ➔
            </Link>
          </div>

          {/* BLACKLIST WARNING */}
          {isBlacklisted && (
            <div className={styles.blacklistAlert}>
              <h3 className={styles.blacklistTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangleIcon size={20} color="#b91c1c" />
                <span>TÀI KHOẢN CỦA BẠN ĐANG BỊ KHÓA (BLACKLIST)</span>
              </h3>
              <p className={styles.blacklistDesc}>
                Bạn đã vắng mặt <strong>{penaltyStatus.missed_count} lần</strong> không lý do trong các sự kiện trước.
              </p>
            </div>
          )}

          {/* ALREADY APPLIED STATUS */}
          {isVolunteerApplied && !isBlacklisted && (
            <div className={styles.successCard}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  marginBottom: '0.75rem',
                  background:
                    myRegistration.review_status === 'accepted'
                      ? '#dcfce7'
                      : myRegistration.review_status === 'rejected'
                      ? '#fee2e2'
                      : '#fef3c7',
                  color:
                    myRegistration.review_status === 'accepted'
                      ? '#15803d'
                      : myRegistration.review_status === 'rejected'
                      ? '#b91c1c'
                      : '#b45309',
                }}
              >
                {myRegistration.review_status === 'accepted'
                  ? '✓ ĐÃ TRÚNG TUYỂN CTV'
                  : myRegistration.review_status === 'rejected'
                  ? '✕ ĐÃ TỪ CHỐI'
                  : '⏳ ĐƠN ĐANG CHỜ PHÊ DUYỆT'}
              </span>

              <h3 style={{ margin: '0 0 0.5rem 0', color: '#0f172a', fontSize: '1.15rem', fontWeight: 800 }}>
                {myRegistration.review_status === 'accepted'
                  ? `Chúc mừng bạn đã trúng tuyển vào ${myRegistration.department_name || 'Ban CTV'}!`
                  : `Bạn đã nộp đơn ứng tuyển vào ${myRegistration.department_name || 'Ban CTV'}`}
              </h3>
              <p style={{ margin: '0 0 1.25rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                MSSV: <strong>{myRegistration.mssv}</strong> • Ban: <strong>{myRegistration.department_name || 'Cộng tác viên'}</strong>
              </p>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <Link
                  href="/"
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    borderRadius: '10px',
                    textDecoration: 'none',
                  }}
                >
                  Về Trang Cá Nhân
                </Link>

                <button
                  type="button"
                  onClick={handleCancelRegistration}
                  disabled={submitting}
                  className={styles.cancelBtn}
                  style={{ width: 'auto', padding: '0 1rem' }}
                >
                  Rút Đơn
                </button>
              </div>
            </div>
          )}

          {/* RECRUITMENT CLOSED BANNER */}
          {(!registrationWindow?.isOpen || event.is_recruitment_open === false) && !isBlacklisted && (
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
                CỔNG TUYỂN DỤNG CTV ĐÃ ĐÓNG
              </h3>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {event.is_recruitment_open === false
                  ? 'Ban tổ chức đã đóng cổng nhận hồ sơ ứng tuyển CTV để hoàn tất công tác tổ chức và phân công nhiệm vụ.'
                  : registrationWindow?.reason || 'Cổng tuyển dụng CTV đã đóng theo thời hạn quy định (trước 24 giờ).'}
              </p>
              <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                Bạn vẫn có thể đăng ký tham gia với tư cách khán giả nếu cổng đăng ký tham dự còn mở.
              </div>
            </div>
          )}

          {/* APPLICATION FORM */}
          {!isVolunteerApplied && !isBlacklisted && registrationWindow?.isOpen && event.is_recruitment_open !== false && (
            <form onSubmit={handleApply} className={styles.formSection}>
              {!currentUser ? (
                <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Vui lòng đăng nhập để nộp đơn ứng tuyển Ban chuyên trách.
                  </p>
                  <Link
                    href={`/login?redirect=/events/${event.event_id}/recruitment`}
                    className={styles.submitBtn}
                    style={{ textDecoration: 'none' }}
                  >
                    Đăng Nhập Để Ứng Tuyển
                  </Link>
                </div>
              ) : (
                <>
                  {/* Department list */}
                  <div className={styles.formGroup}>
                    <label className={styles.label}>1. Chọn Ban Bạn Muốn Ứng Tuyển *</label>
                    {(!event.departments || event.departments.length === 0) ? (
                      <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: '10px', color: '#64748b', fontSize: '0.875rem' }}>
                        Ban tổ chức đang tuyển Cộng tác viên chung cho toàn bộ sự kiện.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {event.departments.map((dept) => {
                          const isSelected = selectedDeptId === dept.id;
                          return (
                            <div
                              key={dept.id}
                              onClick={() => setSelectedDeptId(dept.id)}
                              style={{
                                padding: '0.85rem 1rem',
                                borderRadius: '12px',
                                border: isSelected ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                                background: isSelected ? '#eff6ff' : '#ffffff',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.925rem' }}>
                                  {dept.name}
                                </span>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                  <span
                                    style={{
                                      fontSize: '0.7rem',
                                      fontWeight: 800,
                                      padding: '0.15rem 0.5rem',
                                      borderRadius: '12px',
                                      background:
                                        dept.gender_req === 'male'
                                          ? '#dbeafe'
                                          : dept.gender_req === 'female'
                                          ? '#fce7f3'
                                          : '#dcfce7',
                                      color:
                                        dept.gender_req === 'male'
                                          ? '#1e40af'
                                          : dept.gender_req === 'female'
                                          ? '#be185d'
                                          : '#166534',
                                    }}
                                  >
                                    {dept.gender_req === 'male'
                                      ? 'Yêu cầu Nam'
                                      : dept.gender_req === 'female'
                                      ? 'Yêu cầu Nữ'
                                      : 'Nam & Nữ'}
                                  </span>
                                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                    (Chỉ tiêu: {dept.quota})
                                  </span>
                                </div>
                              </div>
                              {dept.description && (
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.4 }}>
                                  {dept.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Student info */}
                  <div className={styles.formGroup}>
                    <label className={styles.label}>2. Thông Tin Ứng Viên</label>
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

                  {/* Gender & Phone */}
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

                  {/* Note / Experience */}
                  <div className={styles.formGroup}>
                    <label className={styles.label}>3. Kinh Nghiệm & Kỹ Năng Phù Hợp</label>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Mô tả kỹ năng, kinh nghiệm hoạt động hoặc link portfolio / facebook cá nhân..."
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

                  <button type="submit" disabled={submitting} className={styles.submitBtn}>
                    {submitting ? 'Đang gửi hồ sơ...' : 'Nộp Đơn Ứng Tuyển Ban Chuyên Trách'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
