'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  SettingsIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  BuildingIcon,
  AlertTriangleIcon,
  FileTextIcon,
  YouthUnionIcon,
} from '@/components/icons';
import { OFFICIAL_UNITS, OFFICIAL_UNIT_GROUPS, resolveUnitForUser } from '@/lib/constants/units';
import { isKhoaUnit } from '@/lib/utils/proposal-logic';
import type { Room } from '@/lib/types';
import styles from './page.module.css';

export default function NewProposalPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Form states
  const [title, setTitle] = useState('');
  const [organizationUnit, setOrganizationUnit] = useState('LCĐ Khoa Công nghệ Thông tin');
  // Use Vietnam timezone (UTC+7) for default date
  const getVNDate = () => {
    const now = new Date();
    const vnTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return vnTime.toISOString().split('T')[0];
  };
  const [startDate, setStartDate] = useState(getVNDate);
  const [startTime, setStartTime] = useState('08:00');
  const [endDate, setEndDate] = useState(getVNDate);
  const [endTime, setEndTime] = useState('11:30');

  const [participantCount, setParticipantCount] = useState<number | string>(60);
  const [volunteerCount, setVolunteerCount] = useState<number | string>(10);
  const [organizerCount, setOrganizerCount] = useState<number | string>(5);

  const handleNumberChange = (setter: React.Dispatch<React.SetStateAction<number | string>>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setter(val === '' ? '' : Number(val));
  };

  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState('Không mượn');

  // Multi-session mode
  const [isMultiSession, setIsMultiSession] = useState(false);
  const [sessionsList, setSessionsList] = useState<ProposalSessionItem[]>([
    {
      id: 'session_1',
      name: 'Buổi 1 (Khai mạc / Toàn thể)',
      session_date: getVNDate(),
      start_time: '08:00',
      end_time: '11:30',
      room_id: '',
      room_name: 'Không mượn',
      participant_count: 60,
      purpose: 'Tổ chức sự kiện chính',
      status: 'pending',
    },
  ]);

  const handleAddSession = () => {
    const nextIdx = sessionsList.length + 1;
    setSessionsList([
      ...sessionsList,
      {
        id: `session_${Date.now()}`,
        name: `Buổi ${nextIdx}`,
        session_date: endDate || startDate || getVNDate(),
        start_time: '08:00',
        end_time: '11:30',
        room_id: '',
        room_name: 'Không mượn',
        participant_count: Number(participantCount) || 60,
        purpose: '',
        status: 'pending',
      },
    ]);
  };

  const handleRemoveSession = (id: string) => {
    if (sessionsList.length <= 1) return;
    setSessionsList(sessionsList.filter((s) => s.id !== id));
  };

  const handleUpdateSession = (id: string, field: keyof ProposalSessionItem, value: any) => {
    setSessionsList(
      sessionsList.map((s) => {
        if (s.id === id) {
          const updated = { ...s, [field]: value };
          if (field === 'room_id') {
            const foundRoom = rooms.find((r) => r.id === value);
            updated.room_name = foundRoom ? foundRoom.room_name : 'Không mượn';
          }
          return updated;
        }
        return s;
      })
    );
  };

  const handleAutoSplitDays = () => {
    if (!startDate || !endDate) return;
    const startObj = new Date(startDate);
    const endObj = new Date(endDate);
    if (isNaN(startObj.getTime()) || isNaN(endObj.getTime()) || startObj > endObj) {
      alert('Vui lòng chọn Ngày bắt đầu và Ngày kết thúc hợp lệ trước');
      return;
    }
    const newSessions: ProposalSessionItem[] = [];
    let cur = new Date(startObj);
    let day = 1;
    while (cur <= endObj && day <= 30) {
      const dateStr = cur.toISOString().split('T')[0];
      const vnDate = cur.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      newSessions.push({
        id: `session_day_${day}`,
        name: `Ngày ${day} (${vnDate})`,
        session_date: dateStr,
        start_time: startTime || '08:00',
        end_time: endTime || '11:30',
        room_id: selectedRoomId || '',
        room_name: selectedRoomName || 'Không mượn',
        participant_count: Number(participantCount) || 60,
        purpose: `Các hoạt động trong ngày ${day}`,
        status: 'pending',
      });
      cur.setDate(cur.getDate() + 1);
      day++;
    }
    setSessionsList(newSessions);
    setIsMultiSession(true);
  };

  const [description, setDescription] = useState('');
  const [planUrl, setPlanUrl] = useState('');

  // Conflict state
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictResult, setConflictResult] = useState<{
    hasChecked: boolean;
    conflict: boolean;
    message?: string;
  }>({ hasChecked: false, conflict: false });

  // Whether the user is Super Admin (can pick any unit) or locked to their own
  const [lockedUnit, setLockedUnit] = useState<string | null>(null);

  // Auto-detect logged-in user unit
  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCurrentUser(data.data);
          const resolved = resolveUnitForUser(data.data);
          setOrganizationUnit(resolved.unitName);
          if (resolved.isLocked) {
            setLockedUnit(resolved.unitName);
          } else {
            setLockedUnit(null);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to detect user unit:', err);
      });
  }, []);

  // Fetch available rooms
  useEffect(() => {
    fetch('/api/rooms')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setRooms(data.data);
        }
      })
      .catch((err) => console.error('Failed to fetch rooms', err));
  }, []);

  // Real-time conflict checker
  useEffect(() => {
    if (!selectedRoomId || selectedRoomName === 'Không mượn') {
      setConflictResult({ hasChecked: false, conflict: false });
      return;
    }

    const startIso = `${startDate}T${startTime}:00`;
    const endIso = `${endDate}T${endTime}:00`;

    const startDt = new Date(startIso);
    const endDt = new Date(endIso);

    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || startDt >= endDt) {
      setConflictResult({ hasChecked: false, conflict: false });
      return;
    }

    setCheckingConflict(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/proposals/check-conflict?room_id=${selectedRoomId}&start=${encodeURIComponent(
            startDt.toISOString()
          )}&end=${encodeURIComponent(endDt.toISOString())}`
        );
        const data = await res.json();
        if (data.success) {
          setConflictResult({
            hasChecked: true,
            conflict: data.conflict,
            message: data.message,
          });
        }
      } catch (err) {
        console.error('Error checking room conflict', err);
      } finally {
        setCheckingConflict(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [selectedRoomId, selectedRoomName, startDate, startTime, endDate, endTime]);

  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rId = e.target.value;
    setSelectedRoomId(rId);
    if (!rId) {
      setSelectedRoomName('Không mượn');
    } else {
      const found = rooms.find((r) => r.id === rId);
      setSelectedRoomName(found ? found.room_name : 'Không mượn');
    }
  };

  const totalPersonnel =
    (Number(participantCount) || 0) +
    (Number(volunteerCount) || 0) +
    (Number(organizerCount) || 0);

  const requiresCtsv = totalPersonnel > 50 || Number(participantCount) > 50;
  const isBorrowing = !!selectedRoomId && selectedRoomName !== 'Không mượn';
  const isDirectFaculty = isKhoaUnit(organizationUnit);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (conflictResult.conflict) {
      setErrorMessage('Phòng đang chọn bị trùng lịch. Vui lòng chọn phòng hoặc thời gian khác.');
      return;
    }

    const startDatetime = new Date(`${startDate}T${startTime}`);
    const endDatetime = new Date(`${endDate}T${endTime}`);

    // Reject past date events (allow 5 min buffer for clock precision)
    const now = new Date();
    const minAllowedTime = new Date(now.getTime() - 5 * 60 * 1000);

    if (startDatetime < minAllowedTime) {
      setErrorMessage('🚫 Thời gian bắt đầu sự kiện không thể ở trong quá khứ! V vui lòng chọn ngày và giờ hiện tại hoặc tương lai.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          organization_unit: organizationUnit,
          description,
          plan_url: planUrl,
          start_date: startDate,
          start_time: startTime,
          end_date: endDate,
          end_time: endTime,
          participant_count: Number(participantCount) || 0,
          volunteer_count: Number(volunteerCount) || 0,
          organizer_count: Number(organizerCount) || 0,
          room_id: isMultiSession ? (sessionsList[0]?.room_id || null) : (selectedRoomId || null),
          room_name: isMultiSession ? (sessionsList[0]?.room_name || 'Không mượn') : selectedRoomName,
          sessions: isMultiSession ? sessionsList : [
            {
              id: 'session_1',
              name: 'Buổi 1 (Buổi chính)',
              session_date: startDate,
              start_time: startTime,
              end_time: endTime,
              room_id: selectedRoomId || null,
              room_name: selectedRoomName,
              participant_count: Number(participantCount) || 0,
              purpose: description || 'Tổ chức sự kiện',
              status: 'pending',
            },
          ],
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert('Đã gửi kế hoạch thành công!');
        router.push(`/admin/proposals/${data.data.id}`);
      } else {
        setErrorMessage(data.error || 'Lỗi gửi kế hoạch');
      }
    } catch (err: any) {
      setErrorMessage('Lỗi kết nối máy chủ');
    } finally {
      setSubmitting(false);
    }
  };

  const isSuperAdmin = currentUser?.tier === 'super_admin' || Boolean((currentUser as any)?.isSuperAdmin);
  const isYouthUnion = currentUser?.tier === 'youth_union' || (currentUser?.email || '').toLowerCase().includes('doanthanhnien');
  const backTarget = isSuperAdmin ? '/super-admin?tab=proposals' : isYouthUnion ? '/admin/proposals' : '/admin';

  return (
    <div className={styles.container}>
      <Header showBack backHref={backTarget} title="TRÌNH KẾ HOẠCH MỞ SỰ KIỆN" />

      <main className={styles.main}>
        {/* Header Breadcrumb */}
        <div style={{ marginBottom: '2rem' }}>
          <Link
            href={isSuperAdmin ? '/super-admin?tab=proposals' : '/admin/proposals'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#2563eb',
              textDecoration: 'none',
              marginBottom: '0.75rem',
            }}
          >
            <ArrowLeftIcon size={16} />
            <span>{isSuperAdmin ? 'Quay lại Bàn Quản Trị Toàn Trường' : 'Xem danh sách kế hoạch đã nộp'}</span>
          </Link>
          <h1 className={styles.title}>
            Đề Xuất / Trình Kế Hoạch Sự Kiện Mới
          </h1>
          <p className={styles.subtitle}>
            Hệ thống phân luồng phê duyệt tự động theo thẩm quyền Đoàn Trường, Phòng CTSV và Phòng TC-HC-QT
          </p>
        </div>

        {errorMessage && (
          <div className={styles.errorAlert}>
            <AlertTriangleIcon size={20} color="#b91c1c" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.formGrid} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* ═══════════════ MỤC 1: THÔNG TIN CƠ BẢN ═══════════════ */}
          <div className={styles.sectionCard}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1.5px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <YouthUnionIcon size={22} color="#1d4ed8" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  1. Thông Tin Chung & Đơn Vị Chủ Trì
                </h2>
                <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.15rem 0 0' }}>
                  Xác định cơ quan tổ chức và tên chương trình
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Tên sự kiện */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                  Tên Sự Kiện / Chương Trình / Hoạt Động <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Hội Thao Sinh Viên PTIT 2026 - Chào Tân Sinh Viên"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={styles.inputField}
                />
              </div>

              {/* Đơn vị tổ chức */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                    Đơn Vị Chủ Trì / Tổ Chức <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  {lockedUnit && !isSuperAdmin && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                      🔒 Đã khóa theo tài khoản cán bộ
                    </span>
                  )}
                </div>

                <select
                  value={organizationUnit}
                  onChange={(e) => setOrganizationUnit(e.target.value)}
                  disabled={!!lockedUnit && !isSuperAdmin}
                  className={styles.selectField}
                  style={{
                    background: lockedUnit && !isSuperAdmin ? '#f8fafc' : '#ffffff',
                    cursor: lockedUnit && !isSuperAdmin ? 'not-allowed' : 'pointer',
                  }}
                >
                  {OFFICIAL_UNIT_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.items.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {isDirectFaculty && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      color: '#166534',
                      fontSize: '0.825rem',
                      fontWeight: 600,
                    }}
                  >
                    <span>⚡ Kế hoạch của cấp <strong>Khoa</strong> sẽ được ưu tiên chuyển thẳng đến <strong>Phòng TC-HC-QT</strong> phê duyệt cấp phòng mà không qua bước Đoàn trường.</span>
                  </div>
                )}
              </div>

              {/* Thời gian tổng thể */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                    Ngày Bắt Đầu:
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className={styles.inputField}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                    Giờ Bắt Đầu:
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={styles.inputField}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                    Ngày Kết Thúc:
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={styles.inputField}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                    Giờ Kết Thúc:
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={styles.inputField}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ MỤC 2: QUY MÔ NHÂN SỰ & THÀNH PHẦN ═══════════════ */}
          <div className={styles.sectionCard}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1.5px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UsersIcon size={20} color="#15803d" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  2. Quy Mô Nhân Sự & Thành Phần Tham Gia
                </h2>
                <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.15rem 0 0' }}>
                  Hệ thống tự động yêu cầu Phòng CTSV thẩm định nếu quy mô sinh viên &gt; 50 người
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>Sinh viên tham gia</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '8px', background: '#dbeafe', color: '#1e40af' }}>
                    Khán giả
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={participantCount}
                  onChange={handleNumberChange(setParticipantCount)}
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    padding: '0.55rem 0.85rem',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#ffffff',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>Cộng tác viên (CTV)</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '8px', background: '#fef3c7', color: '#92400e' }}>
                    Hỗ trợ ban
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={volunteerCount}
                  onChange={handleNumberChange(setVolunteerCount)}
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    padding: '0.55rem 0.85rem',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#ffffff',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>👔 Ban tổ chức (BTC)</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b' }}>
                    Điều hành
                  </span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={organizerCount}
                  onChange={handleNumberChange(setOrganizerCount)}
                  style={{
                    fontSize: '1.35rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    padding: '0.55rem 0.85rem',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '10px',
                    background: '#ffffff',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <div className={styles.totalBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <UsersIcon size={20} color="#166534" />
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#166534' }}>
                  Tổng quy mô toàn sự kiện:
                </span>
              </div>
              <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#15803d' }}>
                {totalPersonnel} người
              </span>
            </div>
          </div>

          {/* ═══════════════ MỤC 3: ĐỊA ĐIỂM & CHI TIẾT CA / BUỔI & KIỂM TRA TRÙNG LỊCH ═══════════════ */}
          <div className={styles.sectionCard}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1.5px solid #f1f5f9',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BuildingIcon size={20} color="#7e22ce" />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    3. Lịch Trình Chi Tiết Các Ca / Buổi & Mượn Phòng
                  </h2>
                  <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.15rem 0 0' }}>
                    Tự động kiểm tra trùng lịch phòng cho từng ca & chuyển Phòng TC-HC-QT duyệt
                  </p>
                </div>
              </div>

              {/* Mode Toggle Buttons */}
              <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.3rem', borderRadius: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsMultiSession(false)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: !isMultiSession ? '#ffffff' : 'transparent',
                    color: !isMultiSession ? '#2563eb' : '#64748b',
                    boxShadow: !isMultiSession ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  1 Buổi Duy Nhất
                </button>
                <button
                  type="button"
                  onClick={() => setIsMultiSession(true)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    background: isMultiSession ? '#ffffff' : 'transparent',
                    color: isMultiSession ? '#7e22ce' : '#64748b',
                    boxShadow: isMultiSession ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  Nhiều Ca / Nhiều Phòng
                </button>
              </div>
            </div>

            {!isMultiSession ? (
              /* ĐƠN BUỔI MODE */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                  Chọn Phòng / Hội Trường / Sân Bãi Học Viện:
                </label>
                <select
                  value={selectedRoomId}
                  onChange={handleRoomChange}
                  className={styles.selectField}
                >
                  <option value="">Không mượn phòng (Tổ chức trực tuyến / Ngoài trường)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_name} (Sức chứa: {r.capacity} người - {r.location})
                    </option>
                  ))}
                </select>

                {selectedRoomId && selectedRoomName !== 'Không mượn' && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '1.1rem 1.35rem',
                      borderRadius: '14px',
                      border: conflictResult.conflict ? '1.5px solid #fca5a5' : '1.5px solid #86efac',
                      background: conflictResult.conflict ? '#fef2f2' : '#f0fdf4',
                      color: conflictResult.conflict ? '#991b1b' : '#166534',
                      fontSize: '0.925rem',
                      lineHeight: 1.5,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    {checkingConflict ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2563eb' }}>
                        <span>Đang kiểm tra lịch trống của phòng với hệ thống...</span>
                      </div>
                    ) : conflictResult.conflict ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangleIcon size={18} color="#b91c1c" />
                        <span><strong style={{ color: '#b91c1c' }}>CẢNH BÁO TRÙNG LỊCH:</strong> {conflictResult.message}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircleIcon size={18} color="#15803d" />
                        <span><strong style={{ color: '#15803d' }}>PHÒNG TRỐNG SẴN SÀNG:</strong> Phòng <strong>{selectedRoomName}</strong> hoàn toàn
                        trống trong khung giờ từ {startTime} ngày {startDate} đến {endTime} ngày {endDate}.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* NHIỀU CA / NHIỀU BUỔI / NHIỀU PHÒNG MODE */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>
                    Danh Sách Các Ca / Buổi Diễn Ra ({sessionsList.length} ca):
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {startDate && endDate && startDate !== endDate && (
                      <button
                        type="button"
                        onClick={handleAutoSplitDays}
                        style={{
                          padding: '0.35rem 0.75rem',
                          background: '#f5f3ff',
                          color: '#6d28d9',
                          border: '1px solid #ddd6fe',
                          borderRadius: '8px',
                          fontSize: '0.785rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ Tự Động Chia Theo Ngày
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleAddSession}
                      style={{
                        padding: '0.35rem 0.85rem',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.785rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Thêm Ca Mới
                    </button>
                  </div>
                </div>

                {/* Session Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {sessionsList.map((sess, idx) => (
                    <div
                      key={sess.id}
                      style={{
                        background: '#f8fafc',
                        border: '1.5px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#7e22ce', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800 }}>
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={sess.name}
                            onChange={(e) => handleUpdateSession(sess.id, 'name', e.target.value)}
                            placeholder={`Tên ca (VD: Ca ${idx + 1}: Vòng Sơ Khảo)`}
                            style={{
                              fontSize: '0.95rem',
                              fontWeight: 800,
                              color: '#0f172a',
                              padding: '0.35rem 0.65rem',
                              border: '1px solid #cbd5e1',
                              borderRadius: '8px',
                              background: '#ffffff',
                              width: '240px',
                            }}
                          />
                        </div>
                        {sessionsList.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSession(sess.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            ✕ Xóa Ca Này
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Ngày:</label>
                          <input
                            type="date"
                            value={sess.session_date}
                            onChange={(e) => handleUpdateSession(sess.id, 'session_date', e.target.value)}
                            style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Bắt đầu:</label>
                          <input
                            type="time"
                            value={sess.start_time}
                            onChange={(e) => handleUpdateSession(sess.id, 'start_time', e.target.value)}
                            style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Kết thúc:</label>
                          <input
                            type="time"
                            value={sess.end_time}
                            onChange={(e) => handleUpdateSession(sess.id, 'end_time', e.target.value)}
                            style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Phòng/Hội trường:</label>
                          <select
                            value={sess.room_id || ''}
                            onChange={(e) => handleUpdateSession(sess.id, 'room_id', e.target.value)}
                            style={{ padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                          >
                            <option value="">Không mượn phòng</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.room_name} ({r.capacity} chỗ)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          value={sess.purpose || ''}
                          onChange={(e) => handleUpdateSession(sess.id, 'purpose', e.target.value)}
                          placeholder="Mục đích sử dụng phòng / Nội dung chính ca này..."
                          style={{
                            flex: 1,
                            padding: '0.45rem 0.75rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.825rem',
                            background: '#ffffff',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════════ MỤC 4: KẾ HOẠCH SƠ BỘ & TÀI LIỆU ĐÍNH KÈM (GOOGLE DRIVE / PDF) ═══════════════ */}
          <div className={styles.sectionCard}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1.5px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FileTextIcon size={20} color="#0284c7" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  4. Kế Hoạch Sơ Bộ & Tài Liệu Đính Kèm (Tùy chọn)
                </h2>
                <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.15rem 0 0' }}>
                  Tóm tắt nội dung chương trình và đính kèm link file kế hoạch hoàn chỉnh để các phòng ban thẩm định
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Mô tả sơ bộ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Tóm tắt mục đích & Kế hoạch sơ bộ:</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Không bắt buộc</span>
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="VD: Hội thảo nhằm trang bị cho sinh viên kỹ năng ứng dụng AI trong học tập và việc làm. Chương trình gồm 3 phần: 1. Khai mạc & phát biểu; 2. Thuyết trình chuyên đề; 3. Q&A và mini game..."
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.925rem',
                    color: '#0f172a',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'border-color 0.2s ease',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#2563eb')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#cbd5e1')}
                />
              </div>

              {/* Link file Google Drive / PDF */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Link File Kế Hoạch Chi Tiết (Google Drive / PDF / Docx):</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Không bắt buộc</span>
                </label>
                <input
                  type="url"
                  value={planUrl}
                  onChange={(e) => setPlanUrl(e.target.value)}
                  placeholder="https://drive.google.com/file/d/... hoặc link tài liệu kế hoạch"
                  className={styles.inputField}
                  style={{ width: '100%' }}
                />

                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    background: '#f8fafc',
                    border: '1px dashed #cbd5e1',
                    fontSize: '0.8rem',
                    color: '#64748b',
                    lineHeight: 1.45,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.45rem',
                  }}
                >
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>💡</span>
                  <span>
                    <strong>Mẹo:</strong> Hãy dán đường link chia sẻ từ Google Drive ở chế độ <i>"Bất kỳ ai có liên kết đều có thể xem"</i>. Hệ thống chỉ lưu đường dẫn URL, giúp bạn linh hoạt cập nhật nội dung file trên Drive bất kỳ lúc nào mà không cần nộp lại đơn.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════ MỤC 5: QUY TRÌNH PHÊ DUYỆT TỰ ĐỘNG ═══════════════ */}
          <div
            style={{
              background: '#ffffff',
              border: '1.5px solid #cbd5e1',
              borderRadius: '20px',
              padding: '1.75rem 2rem',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                marginBottom: '1.5rem',
                paddingBottom: '1rem',
                borderBottom: '1.5px solid #f1f5f9',
              }}
            >
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheckIcon size={20} color="#2563eb" />
              </div>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {isDirectFaculty
                    ? '5. Luồng Mượn Phòng Trực Tiếp Cấp Khoa ➔ Phòng. TC-HC-QT'
                    : '5. Quy Trình Phê Duyệt Tự Động (Đoàn TN → CTSV → Phòng. TC-HC-QT)'}
                </h2>
                <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.2rem 0 0' }}>
                  {isDirectFaculty
                    ? 'Đơn vị Khoa mượn phòng sẽ được ĐẨY THẲNG sang Phòng. TC-HC-QT (Phòng Tổ Chức) để thẩm định và cấp phòng trực tiếp!'
                    : 'Kế hoạch sẽ được gửi trình Đoàn Thanh Niên duyệt trước, sau đó tự động chuyển sang CTSV và Phòng. TC-HC-QT.'}
                </p>
              </div>
            </div>

            {isDirectFaculty && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.9rem 1.15rem',
                  borderRadius: '12px',
                  background: '#fdf4ff',
                  border: '1.5px solid #f0abfc',
                  color: '#86198f',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 700,
                }}
              >
                <span>🏢</span>
                <span>
                  <strong>ĐƠN VỊ KHOA ĐÀO TẠO:</strong> Hồ sơ mượn địa điểm của Khoa được rút gọn, miễn qua Đoàn TN & CTSV, chuyển thẳng tới <strong>Phòng. TC-HC-QT</strong>.
                </span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Bước 1 - Đoàn TN */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  background: isDirectFaculty ? '#f8fafc' : '#ffffff',
                  border: isDirectFaculty ? '1.5px solid #e2e8f0' : '1.5px solid #bbf7d0',
                  borderRadius: '14px',
                  boxShadow: isDirectFaculty ? 'none' : '0 2px 8px rgba(22, 163, 74, 0.06)',
                  opacity: isDirectFaculty ? 0.6 : 1,
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: isDirectFaculty ? '#94a3b8' : '#16a34a',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isDirectFaculty ? '—' : '1'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      Đoàn TNCS Học Viện Duyệt Kế Hoạch
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {isDirectFaculty
                        ? 'Tự động miễn duyệt (Dành riêng cho Đơn vị Khoa)'
                        : 'Đoàn Thanh Niên xét duyệt nội dung, mục đích và tính phù hợp của kế hoạch'}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.3rem 0.75rem',
                    borderRadius: '20px',
                    background: isDirectFaculty ? '#f1f5f9' : '#dcfce7',
                    color: isDirectFaculty ? '#64748b' : '#15803d',
                    border: isDirectFaculty ? '1px solid #e2e8f0' : '1px solid #bbf7d0',
                    textTransform: 'uppercase',
                  }}
                >
                  {isDirectFaculty ? 'Miễn duyệt' : 'Bắt buộc'}
                </span>
              </div>

              {/* Bước 2 - CTSV */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  background: isDirectFaculty || !requiresCtsv ? '#f8fafc' : '#ffffff',
                  border: isDirectFaculty || !requiresCtsv ? '1.5px solid #e2e8f0' : '1.5px solid #bfdbfe',
                  borderRadius: '14px',
                  boxShadow: isDirectFaculty || !requiresCtsv ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.06)',
                  opacity: isDirectFaculty || !requiresCtsv ? 0.65 : 1,
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: isDirectFaculty || !requiresCtsv ? '#94a3b8' : '#2563eb',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isDirectFaculty || !requiresCtsv ? '—' : '2'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      Phòng Công Tác Sinh Viên (CTSV) Thẩm Định
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {isDirectFaculty
                        ? 'Tự động miễn duyệt (Dành riêng cho Đơn vị Khoa)'
                        : requiresCtsv
                        ? 'Kích hoạt thẩm định quy mô lớn (> 50 người)'
                        : 'Tự động miễn duyệt (Quy mô ≤ 50 người, chuyển thẳng)'}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.3rem 0.75rem',
                    borderRadius: '20px',
                    background: isDirectFaculty || !requiresCtsv ? '#f1f5f9' : '#dbeafe',
                    color: isDirectFaculty || !requiresCtsv ? '#64748b' : '#1e40af',
                    border: isDirectFaculty || !requiresCtsv ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                    textTransform: 'uppercase',
                  }}
                >
                  {isDirectFaculty
                    ? 'Miễn duyệt'
                    : requiresCtsv
                    ? 'Bắt buộc (> 50 SV)'
                    : 'Miễn duyệt (≤ 50 SV)'}
                </span>
              </div>

              {/* Bước 3 - Phòng. TC-HC-QT */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  background: isDirectFaculty || isBorrowing ? '#ffffff' : '#f8fafc',
                  border: isDirectFaculty || isBorrowing ? '1.5px solid #fed7aa' : '1.5px solid #e2e8f0',
                  borderRadius: '14px',
                  opacity: isDirectFaculty || isBorrowing ? 1 : 0.65,
                  boxShadow: isDirectFaculty || isBorrowing ? '0 2px 8px rgba(249, 115, 22, 0.08)' : 'none',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: isDirectFaculty || isBorrowing ? '#ea580c' : '#94a3b8',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isDirectFaculty ? '✓' : '3'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      Phòng. TC-HC-QT Thẩm Định & Cấp Phòng
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {isDirectFaculty
                        ? `Đẩy thẳng đến Phòng. TC-HC-QT duyệt & bàn giao phòng: ${selectedRoomName}`
                        : isBorrowing
                        ? `Kích hoạt phê duyệt cấp phòng & bàn giao địa điểm: ${selectedRoomName}`
                        : 'Tự động miễn duyệt (Không mượn phòng học viện)'}
                    </div>
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.3rem 0.75rem',
                    borderRadius: '20px',
                    background: isDirectFaculty || isBorrowing ? '#ffedd5' : '#f1f5f9',
                    color: isDirectFaculty || isBorrowing ? '#c2410c' : '#64748b',
                    border: isDirectFaculty || isBorrowing ? '1px solid #fed7aa' : '1px solid #e2e8f0',
                    textTransform: 'uppercase',
                  }}
                >
                  {isDirectFaculty ? 'Đẩy Thẳng Đến Phòng. TC-HC-QT' : isBorrowing ? 'Kích hoạt (Mượn phòng)' : 'Miễn duyệt'}
                </span>
              </div>
            </div>
          </div>

          {/* ═══════════════ FOOTER ACTION BAR ═══════════════ */}
          <div className={styles.submitBar}>
            <Link
              href="/admin/proposals"
              className={styles.cancelButton}
            >
              Hủy Bỏ
            </Link>

            <button
              type="submit"
              disabled={submitting || (selectedRoomId !== '' && conflictResult.conflict)}
              className={styles.submitButton}
            >
              {submitting
                ? 'Đang gửi hồ sơ...'
                : isDirectFaculty
                ? 'Gửi Trực Tiếp Đến Phòng. TC-HC-QT ➔'
                : 'Gửi Trình Kế Hoạch Phê Duyệt ➔'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
