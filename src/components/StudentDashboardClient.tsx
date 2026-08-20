'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import RoleBadge from '@/components/RoleBadge';
import StudentSelfScannerModal from '@/components/StudentSelfScannerModal';
import DataTable from '@/components/DataTable';
import ExcelExportButton from '@/components/ExcelExportButton';
import {
  ShieldCheckIcon,
  SettingsIcon,
  ScanCameraIcon,
  CheckCircleIcon,
  ClockIcon,
  UsersIcon,
  CloseIcon,
  CalendarIcon,
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
}

export default function StudentDashboardClient({
  user,
  tier,
  initialHistory,
  initialRegistrations = [],
}: StudentDashboardClientProps) {
  const [currentUser, setCurrentUser] = useState(user);
  const [history, setHistory] = useState<HistoryItem[]>(initialHistory);
  const [registeredEvents, setRegisteredEvents] = useState<any[]>(initialRegistrations);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [userGender, setUserGender] = useState(user.gender || 'Nam');
  const [userPhone, setUserPhone] = useState(user.phone || '');
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

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

  const fetchRegisteredEvents = async () => {
    setLoadingRegistrations(true);
    try {
      const res = await fetch('/api/me/registrations');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRegisteredEvents(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const checkDelegateStatus = async () => {
    try {
      const res = await fetch('/api/me/class-lookup');
      const data = await res.json();
      if (data.success && data.data?.isDelegate) {
        setDelegateInfo(data.data);
        fetchClassStudents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const syncUserProfile = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        setCurrentUser((prev) => ({
          ...prev,
          mssv: d.mssv || prev.mssv,
          full_name: (d.full_name && !d.full_name.includes('@')) ? d.full_name : prev.full_name,
          class_id: (d.class_id && d.class_id !== 'PTIT-HCM') ? d.class_id : prev.class_id,
          gender: d.gender || prev.gender,
          phone: d.phone || prev.phone,
        }));
        if (d.gender) setUserGender(d.gender);
        if (d.phone) setUserPhone(d.phone);
      }
    } catch {}
  };

  useEffect(() => {
    checkDelegateStatus();
    syncUserProfile();
    fetchRegisteredEvents();
  }, []);

  const fetchClassStudents = async (query?: string) => {
    setLoadingClass(true);
    try {
      const url = query ? `/api/me/class-lookup/students?q=${encodeURIComponent(query)}` : '/api/me/class-lookup/students';
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

  useEffect(() => {
    checkDelegateStatus();
  }, []);

  return (
    <>
      {/* Switch back to admin banner if viewing as student */}
      {tier !== 'user' && (
        <div
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1.5px solid #bfdbfe',
            borderRadius: '14px',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
            boxShadow: '0 2px 6px rgba(37, 99, 235, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div>
              <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#1e40af', display: 'block' }}>
                Không gian Cán bộ Đoàn — {user.full_name || user.mssv}
              </span>
              <span style={{ fontSize: '0.775rem', color: '#3b82f6', fontWeight: 600 }}>
                Bạn đang xem Cổng Sinh Viên cá nhân. Sử dụng các lối tắt bên phải để vào Bàn Quản Trị.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link
              href="/admin/proposals"
              style={{
                background: '#ffffff',
                color: '#1d4ed8',
                border: '1.5px solid #bfdbfe',
                padding: '0.45rem 0.9rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>Trình Kế Hoạch ➔</span>
            </Link>

            <Link
              href={
                tier === 'super_admin'
                  ? '/super-admin'
                  : tier === 'youth_union' || tier === 'ctsv' || tier === 'facility'
                  ? '/admin/proposals'
                  : '/admin'
              }
              style={{
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 800,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
              }}
            >
              <span>Bàn Quản Trị Sự Kiện ➔</span>
            </Link>
          </div>
        </div>
      )}

      {/* Student Personal QR Code & Profile Info (2-Card Responsive Grid) */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.75rem',
          alignItems: 'stretch',
        }}
      >
        {/* Card 1: Mã QR Điểm Danh Cá Nhân */}
        <QRCodeDisplay
          value={currentUser.mssv}
          studentName={currentUser.full_name}
          studentClass={currentUser.class_id}
          studentId={currentUser.mssv}
        />

        {/* Card 2: Hồ Sơ Đoàn Viên & Thông Tin Cá Nhân */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1.25rem',
          }}
        >
          <div>
            {/* Header with Avatar & Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)',
                }}
              >
                {currentUser.full_name ? currentUser.full_name.trim().charAt(0).toUpperCase() : 'S'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {currentUser.full_name || 'Đoàn Viên / Sinh Viên'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                  Hồ Sơ Đoàn Viên Học Viện
                </span>
              </div>
            </div>

            {/* Info Grid List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>Mã Số Sinh Viên</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: '0.9rem' }}>
                  {currentUser.mssv}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>Chi Đoàn / Lớp</span>
                <span style={{ fontWeight: 700, color: '#334155', fontSize: '0.875rem' }}>
                  {currentUser.class_id || 'BCH-DOAN'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>Giới tính</span>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.825rem',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    background: userGender === 'Nam' ? '#dbeafe' : '#fce7f3',
                    color: userGender === 'Nam' ? '#1d4ed8' : '#be185d',
                  }}
                >
                  {userGender === 'Nam' ? 'Nam' : 'Nữ'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>Số Điện Thoại / Zalo</span>
                <span style={{ fontWeight: 700, color: userPhone ? '#0f172a' : '#94a3b8', fontSize: '0.875rem' }}>
                  {userPhone || 'Chưa cập nhật'}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.825rem', color: '#64748b', fontWeight: 600 }}>Sự kiện đã tham gia</span>
                <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '0.9rem' }}>
                  {history.length} hoạt động
                </span>
              </div>
            </div>
          </div>

          {/* Edit Profile Button */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              background: '#eff6ff',
              color: '#2563eb',
              border: '1.5px solid #bfdbfe',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease',
            }}
          >
            <span>Chỉnh Sửa Giới Tính & Số Điện Thoại</span>
          </button>
        </div>
      </section>

      {/* Modal Chỉnh Sửa Hồ Sơ */}
      {showProfileModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
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
              borderRadius: '16px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
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
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <CloseIcon size={20} />
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
                    alert('Đã lưu thông tin hồ sơ thành công!');
                    setShowProfileModal(false);
                  } else {
                    alert(data.error || 'Lỗi cập nhật');
                  }
                } catch {
                  alert('Lỗi kết nối');
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
                  style={{ width: '100%', padding: '0.65rem', border: '1.5px solid #cbd5e1', borderRadius: '8px', background: '#ffffff', fontWeight: 600 }}
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
                  style={{ width: '100%', padding: '0.65rem', border: '1.5px solid #cbd5e1', borderRadius: '8px', boxSizing: 'border-box', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  style={{ padding: '0.5rem 1rem', background: '#f1f5f9', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer' }}
                >
                  {savingProfile ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Button to Scan Event Dynamic QR */}
      <div className={styles.scanEventSection}>
        <button
          onClick={() => setShowScanner(true)}
          className={styles.scanEventButton}
        >
          <ScanCameraIcon size={22} color="#ffffff" />
          <span>Quét Mã QR Sự Kiện Trên Màn Hình</span>
        </button>
        <p className={styles.scanHelpText}>
          Dùng camera điện thoại quét mã QR động đổi liên tục trên máy chiếu/màn hình để tự điểm danh
        </p>
      </div>



      {/* My Registered Events Section */}
      <section className={styles.historySection} style={{ marginBottom: '1.75rem' }}>
        <div className={styles.historyHeader}>
          <h2 className={styles.historyTitle}>
            <CalendarIcon size={20} color="#2563eb" />
            Sự Kiện Tôi Đã Đăng Ký ({registeredEvents.length})
          </h2>
        </div>
        {loadingRegistrations ? (
          <p style={{ textAlign: 'center', padding: '1rem', color: '#64748b', fontSize: '0.85rem' }}>
            Đang tải sự kiện đã đăng ký...
          </p>
        ) : registeredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
              Bạn chưa đăng ký tham gia sự kiện nào. Khi bạn đăng ký tham gia qua link của Ban Tổ Chức, sự kiện sẽ hiển thị tại đây.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '1rem' }}>
            {registeredEvents.map((ev) => (
              <div
                key={ev.id || ev.event_id}
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '1.15rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.85rem',
                  boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.725rem', fontWeight: 800, background: '#eff6ff', color: '#2563eb', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>
                      {ev.semester || 'Học Kỳ Mới'}
                    </span>
                    {ev.attended ? (
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                        Đã điểm danh tham gia
                      </span>
                    ) : ev.role_type === 'volunteer' && ev.review_status === 'pending' ? (
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                        Đang chờ duyệt CTV
                      </span>
                    ) : ev.role_type === 'volunteer' && ev.review_status === 'rejected' ? (
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                        Chưa trúng tuyển CTV
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.15rem 0.45rem', borderRadius: '12px' }}>
                        Đã đăng ký (Chờ điểm danh)
                      </span>
                    )}
                  </div>

                  <h3 style={{ margin: '0.2rem 0 0.4rem', fontSize: '0.975rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>
                    {ev.event_name}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem', color: '#475569' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <ClockIcon size={14} color="#2563eb" />
                      <span>{ev.event_date ? new Date(ev.event_date).toLocaleDateString('vi-VN') : 'Chưa xếp ngày'} {ev.start_time ? `(${ev.start_time}${ev.end_time ? ` - ${ev.end_time}` : ''})` : ''}</span>
                    </div>
                    {ev.location && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span>📍 {ev.location}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <span style={{ fontWeight: 600 }}>Vai trò:</span>
                      <span style={{
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '6px',
                        background: ev.role_type === 'volunteer' ? '#f5f3ff' : '#ecfdf5',
                        color: ev.role_type === 'volunteer' ? '#6d28d9' : '#047857',
                        border: `1px solid ${ev.role_type === 'volunteer' ? '#ddd6fe' : '#a7f3d0'}`
                      }}>
                        {ev.role_type === 'volunteer' ? `Cộng tác viên ${ev.department_name ? `(${ev.department_name})` : ''}` : 'Người tham gia'}
                      </span>
                    </div>

                    {ev.session_ratio && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <span style={{ fontWeight: 600 }}>Điểm danh ca:</span>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '6px',
                          background: ev.session_count > 0 ? '#eff6ff' : '#f8fafc',
                          color: ev.session_count > 0 ? '#2563eb' : '#64748b',
                          border: '1px solid #bfdbfe'
                        }}>
                          {ev.session_ratio} {ev.session_names?.length ? `(${ev.session_names.join(', ')})` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <Link
                  href={`/events/${ev.event_id}/register`}
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
                    textAlign: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>Xem Phiếu Đăng Ký / Chi Tiết</span>
                  <span>➔</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Check-in History of Current Student */}
      <section className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h2 className={styles.historyTitle}>
            <CheckCircleIcon size={20} color="#2563eb" />
            Lịch sử điểm danh minh chứng cá nhân ({history.length})
          </h2>
        </div>
        {history.length === 0 ? (
          <p className={styles.emptyHistory}>Bạn chưa có lượt điểm danh nào.</p>
        ) : (
          <ul className={styles.historyList}>
            {history.map((item, idx) => (
              <li key={idx} className={styles.historyItem}>
                <div className={styles.historyMeta}>
                  <span className={styles.eventName}>{item.event_name}</span>
                  <span className={styles.semester}>
                    <ClockIcon size={14} />
                    Ngày tổ chức: {item.event_date ? new Date(item.event_date).toLocaleDateString('vi-VN') : new Date(item.checkin_time).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div className={styles.historyDetails}>
                  <RoleBadge role={item.participate_role} />
                  <span className={styles.time}>{new Date(item.checkin_time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* DELEGATE SECTION: TRA CỨU DANH SÁCH & ĐIỂM RÈN LUYỆN CHI ĐOÀN */}
      {delegateInfo?.isDelegate && (
        <section className={styles.historySection} style={{ marginTop: '2rem', border: '2px solid #bfdbfe' }}>
          <div
            style={{
              background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
              color: '#ffffff',
              padding: '1.25rem 1.5rem',
              borderRadius: '12px',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255, 255, 255, 0.2)', padding: '0.2rem 0.65rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase' }}>
                <ShieldCheckIcon size={14} color="#ffffff" /> Quyền Ban Chấp Hành Chi Đoàn (Bí Thư / Phó Bí Thư)
              </div>
              <h3 style={{ margin: '0.4rem 0 0.2rem', fontSize: '1.1rem', fontWeight: 800 }}>
                Tra Cứu Hoạt Động & Chấm Điểm Rèn Luyện Chi Đoàn {delegateInfo.class_id}
              </h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#e0e7ff' }}>
                Quyền hạn tra cứu danh sách, lịch sử sự kiện và minh chứng của đoàn viên thuộc Chi đoàn (Lớp) {delegateInfo.class_id}.
              </p>
            </div>
            <div style={{ background: '#ffffff', color: '#1e3a8a', padding: '0.5rem 1rem', borderRadius: '10px', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>
              <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>Thời Hạn Còn Lại</div>
              <div style={{ color: '#16a34a', fontSize: '1.1rem' }}>{delegateInfo.daysLeft} ngày</div>
            </div>
          </div>

          <div className={styles.historyHeader} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 className={styles.historyTitle} style={{ color: '#1e40af' }}>
                <UsersIcon size={20} color="#2563eb" />
                Danh Sách Đoàn Viên Chi Đoàn {delegateInfo.class_id} ({classStudents.length})
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Tra cứu số sự kiện đã tham gia và xem chi tiết minh chứng để phục vụ chấm Điểm Rèn Luyện (ĐRL)
              </p>
            </div>
            <ExcelExportButton
              data={classStudents.map((s, idx) => ({
                stt: idx + 1,
                mssv: s.mssv,
                full_name: s.full_name,
                class_id: s.class_id,
                email: s.email,
                so_su_kien_tham_gia: s.total_attended,
              }))}
              filename={`danh-sach-drl-chidoan-${delegateInfo.class_id}.xlsx`}
              label={`Xuất Excel ĐRL Chi Đoàn ${delegateInfo.class_id}`}
            />
          </div>

          <DataTable
            columns={[
              {
                key: 'stt',
                label: 'STT',
                render: (_, __) => null, // fallback
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
                label: 'Sự Kiện Đã Tham Gia',
                render: (val) => (
                  <span
                    style={{
                      padding: '0.25rem 0.65rem',
                      borderRadius: '12px',
                      fontWeight: 800,
                      fontSize: '0.85rem',
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
            emptyMessage={`Không tìm thấy sinh viên nào trong lớp ${delegateInfo.class_id}.`}
            pageSize={50}
            onSearchChange={(q) => fetchClassStudents(q)}
          />
        </section>
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
            <div style={{ padding: '1.25rem 1.5rem', background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                style={{ background: 'rgba(255, 255, 255, 0.2)', border: 'none', color: '#ffffff', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
                <div style={{ padding: '2rem 1.5rem', textAlign: 'center', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: '14px', color: '#b91c1c' }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>⚠️</div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.35rem' }}>
                    {classmateHistoryError}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>
                    Vui lòng liên hệ Đoàn Trường nếu bạn cần cấp lại quyền Ban cán sự lớp.
                  </div>
                </div>
              ) : classmateHistory ? (
                <>
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '12px', padding: '0.85rem 1rem', marginBottom: '1.25rem' }}>
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
                            <th style={{ padding: '0.7rem 0.9rem' }}>Thời Gian Điểm Danh</th>
                            <th style={{ padding: '0.7rem 0.9rem' }}>Vai Trò</th>
                          </tr>
                        </thead>
                        <tbody>
                          {classmateHistory.history.map((h: any) => (
                            <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '0.7rem 0.9rem', fontWeight: 700, color: '#0f172a' }}>
                                {h.event_name}
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
                                    background: h.participate_role === 'volunteer' ? '#fef3c7' : h.participate_role === 'organizer' ? '#f3e8ff' : '#dcfce7',
                                    color: h.participate_role === 'volunteer' ? '#b45309' : h.participate_role === 'organizer' ? '#7e22ce' : '#15803d',
                                  }}
                                >
                                  {h.participate_role === 'volunteer' ? 'Tình Nguyện Viên' : h.participate_role === 'organizer' ? 'Ban Tổ Chức' : 'Người Tham Gia'}
                                </span>
                              </td>
                            </tr>
                          ))}
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
                style={{ padding: '0.45rem 1rem', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
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
