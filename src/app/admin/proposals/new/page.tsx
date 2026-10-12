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
  LockIcon,
  TrashIcon,
  LightbulbIcon,
} from '@/components/icons';
import { OFFICIAL_UNITS, OFFICIAL_UNIT_GROUPS, resolveUnitForUser } from '@/lib/constants/units';
import { isKhoaUnit } from '@/lib/utils/proposal-logic';
import type { Room, ProposalSessionItem } from '@/lib/types';
import {
  deriveBookingSchedule,
  describeConflict,
  describeInternalOverlap,
  findInternalOverlaps,
  formatDateVN,
  type RoomConflict,
} from '@/lib/utils/room-booking';
import styles from './page.module.css';

// Giá trị của lựa chọn "Không mượn phòng" trong ô chọn (khác '' = chưa chọn)
const NO_ROOM_VALUE = '__no_room__';

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

  // room_name '' = chưa chọn địa điểm; 'Không mượn' = người dùng chủ động chọn không mượn phòng
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [selectedRoomName, setSelectedRoomName] = useState('');

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
      room_name: '',
      participant_count: 60,
      purpose: '',
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
        room_name: '',
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

  // Same date & time, another room (e.g. borrow 2 sân at once = 2 ca cùng giờ)
  const handleDuplicateSession = (id: string) => {
    const idx = sessionsList.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const src = sessionsList[idx];
    const copy: ProposalSessionItem = {
      ...src,
      id: `session_${Date.now()}`,
      name: `${src.name} (phòng/sân khác)`,
      room_id: '',
      room_name: '',
      status: 'pending',
    };
    setSessionsList([...sessionsList.slice(0, idx + 1), copy, ...sessionsList.slice(idx + 1)]);
  };

  // Giá trị hiển thị trong ô chọn phòng: '' = chưa chọn, NO_ROOM_VALUE = không mượn, còn lại = id phòng
  const roomSelectValue = (roomId?: string | null, roomName?: string | null) =>
    roomId ? roomId : roomName === 'Không mượn' ? NO_ROOM_VALUE : '';

  const resolveRoomChoice = (value: string) => {
    if (value === NO_ROOM_VALUE) return { room_id: '', room_name: 'Không mượn' };
    if (!value) return { room_id: '', room_name: '' };
    const found = rooms.find((r) => r.id === value);
    return found ? { room_id: found.id, room_name: found.room_name } : { room_id: '', room_name: '' };
  };

  const handleUpdateSession = (id: string, field: keyof ProposalSessionItem, value: any) => {
    setSessionsList(
      sessionsList.map((s) => {
        if (s.id === id) {
          if (field === 'room_id') {
            return { ...s, ...resolveRoomChoice(String(value || '')) };
          }
          return { ...s, [field]: value };
        }
        return s;
      })
    );
  };

  // Sự kiện kéo dài > 1 ngày → bắt buộc khai báo từng ca (chế độ Nhiều Ca)
  const isMultiDay = !!startDate && !!endDate && endDate > startDate;
  const multiDayCount = isMultiDay
    ? Math.round((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000) + 1
    : 1;

  const handleDateRangeChange = (newStart: string, newEnd: string) => {
    setStartDate(newStart);
    setEndDate(newEnd);
    if (newStart && newEnd && newEnd > newStart) {
      setIsMultiSession(true);
    }
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
    while (cur <= endObj && day <= 90) {
      const dateStr = cur.toISOString().split('T')[0];
      const vnDate = cur.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      newSessions.push({
        id: `session_day_${day}`,
        name: `Ngày ${day} (${vnDate})`,
        session_date: dateStr,
        start_time: startTime || '08:00',
        end_time: endTime || '11:30',
        room_id: selectedRoomId || '',
        room_name: selectedRoomName,
        participant_count: Number(participantCount) || 60,
        purpose: '',
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

  // Conflict state (per session / ca)
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [conflictChecked, setConflictChecked] = useState(false);
  const [roomConflicts, setRoomConflicts] = useState<RoomConflict[]>([]);

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

  // Room + sessions exactly as they will be submitted
  const buildBookingPayload = () => ({
    room_id: isMultiSession ? (sessionsList[0]?.room_id || null) : (selectedRoomId || null),
    room_name: isMultiSession ? (sessionsList[0]?.room_name || 'Không mượn') : (selectedRoomName || 'Không mượn'),
    sessions: isMultiSession
      ? sessionsList.map((s) => ({ ...s, room_name: s.room_name || 'Không mượn' }))
      : [
          {
            id: 'session_1',
            name: 'Buổi 1 (Buổi chính)',
            session_date: startDate,
            start_time: startTime,
            end_time: endTime,
            room_id: selectedRoomId || null,
            room_name: selectedRoomName || 'Không mượn',
            participant_count: Number(participantCount) || 0,
            purpose: description || 'Tổ chức sự kiện',
            status: 'pending' as const,
          },
        ],
  });

  // Ca chưa chọn địa điểm (chưa chọn phòng và cũng chưa chọn "Không mượn phòng")
  const sessionsMissingRoom = isMultiSession
    ? sessionsList.filter((s) => !s.room_id && !s.room_name)
    : !selectedRoomId && !selectedRoomName
    ? [{ id: 'session_1', name: 'Buổi chính' }]
    : [];
  const isRoomMissing = (roomId?: string | null, roomName?: string | null) => !roomId && !roomName;

  const isBorrowingAnyRoom = isMultiSession
    ? sessionsList.some((s) => !!s.room_id)
    : !!selectedRoomId && selectedRoomName !== 'Không mượn';

  // Real-time per-session conflict checker
  useEffect(() => {
    if (!isBorrowingAnyRoom || !startDate || !endDate || !startTime || !endTime) {
      setRoomConflicts([]);
      setConflictChecked(false);
      setCheckingConflict(false);
      return;
    }

    let cancelled = false;
    setCheckingConflict(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/proposals/check-conflict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start_date: startDate,
            start_time: startTime,
            end_date: endDate,
            end_time: endTime,
            ...buildBookingPayload(),
          }),
        });
        const data = await res.json();
        if (!cancelled && data.success) {
          setRoomConflicts(Array.isArray(data.conflicts) ? data.conflicts : []);
          setConflictChecked(true);
        }
      } catch (err) {
        console.error('Error checking room conflict', err);
      } finally {
        if (!cancelled) setCheckingConflict(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBorrowingAnyRoom, isMultiSession, sessionsList, selectedRoomId, selectedRoomName, startDate, startTime, endDate, endTime]);

  const conflictsForSession = (sessionId: string) => roomConflicts.filter((c) => c.slot_key === sessionId);

  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const choice = resolveRoomChoice(e.target.value);
    setSelectedRoomId(choice.room_id);
    setSelectedRoomName(choice.room_name);
  };

  const totalPersonnel =
    (Number(participantCount) || 0) +
    (Number(volunteerCount) || 0) +
    (Number(organizerCount) || 0);

  const requiresCtsv = totalPersonnel > 50 || Number(participantCount) > 50;
  const isBorrowing = isBorrowingAnyRoom;
  const isDirectFaculty = isKhoaUnit(organizationUnit);

  // Preview of exactly what will be booked (same logic as the server)
  const bookingPayloadPreview = buildBookingPayload();
  const bookingPreview = deriveBookingSchedule(
    { start_date: startDate, start_time: startTime, end_date: endDate, end_time: endTime, room_id: bookingPayloadPreview.room_id, room_name: bookingPayloadPreview.room_name },
    bookingPayloadPreview.sessions
  );
  const internalOverlaps = findInternalOverlaps(bookingPreview.slots);
  const internalOverlapsForSession = (sessionId: string) =>
    internalOverlaps.filter((o) => o.a_key === sessionId || o.b_key === sessionId);
  const borrowedRoomNames = Array.from(new Set(bookingPreview.slots.map((s) => s.room_name)));
  const borrowedRoomsLabel = borrowedRoomNames.length > 0 ? borrowedRoomNames.join(', ') : 'Không mượn';
  // ── Chặn Enter trong ô input tự động submit form ──
  const preventEnterSubmit = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (isMultiDay) {
      if (!isMultiSession || sessionsList.length < 2) {
        setIsMultiSession(true);
        setErrorMessage(
          `Sự kiện kéo dài ${multiDayCount} ngày nên phải khai báo từng ca (tối thiểu 2 ca) ở mục 3. Bấm "Tự Động Chia Theo Ngày" để tạo nhanh mỗi ngày 1 ca.`
        );
        return;
      }
      const outOfRange = sessionsList.filter((s) => !s.session_date || s.session_date < startDate || s.session_date > endDate);
      if (outOfRange.length > 0) {
        setErrorMessage(
          `Ngày của ${outOfRange.length} ca nằm ngoài thời gian sự kiện (${formatDateVN(startDate)} → ${formatDateVN(endDate)}): ${outOfRange.map((s) => `"${s.name}"`).join(', ')}. Vui lòng sửa lại ngày của các ca này.`
        );
        return;
      }
    }

    if (sessionsMissingRoom.length > 0) {
      setErrorMessage(
        isMultiSession
          ? `Chưa chọn địa điểm cho ${sessionsMissingRoom.length} ca: ${sessionsMissingRoom.map((s) => `"${s.name}"`).join(', ')}. Hãy chọn phòng/sân, hoặc chọn "Không mượn phòng" nếu tổ chức ngoài trường/trực tuyến.`
          : 'Chưa chọn địa điểm. Hãy chọn phòng/sân, hoặc chọn "Không mượn phòng" nếu tổ chức ngoài trường/trực tuyến.'
      );
      return;
    }

    if (internalOverlaps.length > 0) {
      setErrorMessage(internalOverlaps.slice(0, 5).map(describeInternalOverlap).join('\n'));
      return;
    }

    if (roomConflicts.length > 0) {
      setErrorMessage(
        `Có ${roomConflicts.length} ca bị trùng lịch phòng. Vui lòng đổi giờ/ngày hoặc chọn phòng khác cho các ca được đánh dấu đỏ.`
      );
      return;
    }

    if (!planUrl || !planUrl.trim()) {
      setErrorMessage('Vui lòng đính kèm Link File Kế Hoạch Chi Tiết (Google Drive / PDF) trước khi nộp.');
      return;
    }

    const startDatetime = new Date(`${startDate}T${startTime}`);

    // Reject past date events (allow 5 min buffer for clock precision)
    const now = new Date();
    const minAllowedTime = new Date(now.getTime() - 5 * 60 * 1000);

    if (startDatetime < minAllowedTime) {
      setErrorMessage('Thời gian bắt đầu sự kiện không thể ở trong quá khứ! Vui lòng chọn ngày và giờ hiện tại hoặc tương lai.');
      return;
    }

    // Xác nhận trước khi nộp
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn GỬI TRÌNH KẾ HOẠCH này?\n\nSau khi gửi, kế hoạch sẽ được chuyển đến các cấp phê duyệt tương ứng.'
    );
    if (!confirmed) return;

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
          ...buildBookingPayload(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert('Đã gửi kế hoạch thành công!');
        router.push(`/admin/proposals/${data.data.id}`);
      } else {
        if (Array.isArray(data.conflicts)) {
          setRoomConflicts(data.conflicts);
          setConflictChecked(true);
        }
        setErrorMessage(data.error || 'Lỗi gửi kế hoạch');
      }
    } catch (err: any) {
      setErrorMessage('Lỗi kết nối máy chủ');
    } finally {
      setSubmitting(false);
    }
  };

  const isSuperAdmin = currentUser?.tier === 'super_admin' || Boolean((currentUser as any)?.isSuperAdmin);
  const isYouthUnion = currentUser?.tier === 'youth_union';
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
            <span style={{ whiteSpace: 'pre-line' }}>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} onKeyDown={preventEnterSubmit} className={styles.formGrid} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
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
                      <LockIcon size={14} /> Đã khóa theo tài khoản cán bộ
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
                    <span>Kế hoạch của cấp <strong>Khoa</strong> sẽ được ưu tiên chuyển thẳng đến <strong>Phòng TC-HC-QT</strong> phê duyệt cấp phòng mà không qua bước Đoàn trường.</span>
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
                    onChange={(e) => handleDateRangeChange(e.target.value, endDate)}
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
                    onChange={(e) => handleDateRangeChange(startDate, e.target.value)}
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
              {isMultiDay && (
                <p style={{ margin: 0, fontSize: '0.825rem', fontWeight: 600, color: '#6d28d9', lineHeight: 1.5 }}>
                  Sự kiện kéo dài {multiDayCount} ngày nên bắt buộc khai báo từng ca ở mục 3 (Nhiều Ca / Nhiều Phòng).
                </p>
              )}
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
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#334155' }}>Ban tổ chức (BTC)</span>
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
                  onClick={() => { if (!isMultiDay) setIsMultiSession(false); }}
                  disabled={isMultiDay}
                  title={isMultiDay ? 'Sự kiện nhiều ngày phải khai báo từng ca' : undefined}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    border: 'none',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: isMultiDay ? 'not-allowed' : 'pointer',
                    opacity: isMultiDay ? 0.45 : 1,
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
                  value={roomSelectValue(selectedRoomId, selectedRoomName)}
                  onChange={handleRoomChange}
                  className={styles.selectField}
                  style={isRoomMissing(selectedRoomId, selectedRoomName) ? { borderColor: '#f87171' } : undefined}
                >
                  <option value="" disabled>-- Chọn địa điểm --</option>
                  <option value={NO_ROOM_VALUE}>Không mượn phòng (Tổ chức trực tuyến / Ngoài trường)</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.room_name} (Sức chứa: {r.capacity} người - {r.location})
                    </option>
                  ))}
                </select>
                {isRoomMissing(selectedRoomId, selectedRoomName) && (
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>
                    Chưa chọn địa điểm – chọn phòng/sân, hoặc &quot;Không mượn phòng&quot;.
                  </span>
                )}

                {selectedRoomId && selectedRoomName !== 'Không mượn' && (checkingConflict || conflictChecked || roomConflicts.length > 0) && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '1.1rem 1.35rem',
                      borderRadius: '14px',
                      border: roomConflicts.length > 0 ? '1.5px solid #fca5a5' : '1.5px solid #86efac',
                      background: roomConflicts.length > 0 ? '#fef2f2' : '#f0fdf4',
                      color: roomConflicts.length > 0 ? '#991b1b' : '#166534',
                      fontSize: '0.925rem',
                      lineHeight: 1.5,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    {checkingConflict ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#2563eb' }}>
                        <span>Đang kiểm tra lịch trống của phòng với hệ thống...</span>
                      </div>
                    ) : roomConflicts.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <AlertTriangleIcon size={18} color="#b91c1c" />
                          <strong style={{ color: '#b91c1c' }}>CẢNH BÁO TRÙNG LỊCH ({roomConflicts.length}):</strong>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {roomConflicts.slice(0, 8).map((c, i) => (
                            <li key={`${c.other_id}-${c.slot_date}-${i}`}>{describeConflict(c)}</li>
                          ))}
                        </ul>
                        {roomConflicts.length > 8 && (
                          <span style={{ fontSize: '0.85rem' }}>… và {roomConflicts.length - 8} ngày trùng khác.</span>
                        )}
                        <span style={{ fontSize: '0.85rem', color: '#7f1d1d' }}>
                          Hãy đổi khung giờ/ngày tránh các khung trên, hoặc chọn phòng khác.
                        </span>
                      </div>
                    ) : conflictChecked ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircleIcon size={18} color="#15803d" />
                        <span>
                          <strong style={{ color: '#15803d' }}>PHÒNG TRỐNG SẴN SÀNG:</strong> Phòng <strong>{selectedRoomName}</strong> trống{' '}
                          {startDate !== endDate && endTime > startTime
                            ? <>khung <strong>{startTime}–{endTime} mỗi ngày</strong> từ {startDate} đến {endDate}.</>
                            : <>từ {startTime} ngày {startDate} đến {endTime} ngày {endDate}.</>}
                        </span>
                      </div>
                    ) : null}
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
                        Tự Động Chia Theo Ngày
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

                {isMultiDay && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      background: '#f5f3ff',
                      border: '1px solid #ddd6fe',
                      color: '#5b21b6',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      lineHeight: 1.5,
                    }}
                  >
                    Sự kiện kéo dài <strong>{multiDayCount} ngày</strong> ({formatDateVN(startDate)} → {formatDateVN(endDate)}) nên phải khai báo
                    {' '}<strong>từng ca</strong> (tối thiểu 2 ca, ngày của mỗi ca nằm trong khoảng trên). Bấm &quot;Tự Động Chia Theo Ngày&quot; để tạo nhanh
                    mỗi ngày 1 ca, rồi chỉnh lại giờ/phòng của từng ca.
                  </div>
                )}

                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                  Mỗi ca chọn <strong>một</strong> phòng/sân. Cần nhiều phòng/sân cùng lúc thì tạo nhiều ca cùng giờ (bấm &quot;+ Thêm phòng/sân cùng giờ&quot;), mỗi ca chọn một phòng/sân khác nhau. Hệ thống chỉ báo trùng đúng những ca bị trùng với đơn vị khác (đơn cũ của chính tài khoản bạn không tính là trùng).
                </p>

                {/* Session Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {sessionsList.map((sess, idx) => (
                    <div
                      key={sess.id}
                      style={{
                        background: '#f8fafc',
                        border: (sess.room_id && conflictsForSession(sess.id).length > 0) || internalOverlapsForSession(sess.id).length > 0 ? '1.5px solid #fca5a5' : '1.5px solid #e2e8f0',
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
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => handleDuplicateSession(sess.id)}
                            style={{
                              padding: '0.3rem 0.65rem',
                              background: '#f5f3ff',
                              color: '#6d28d9',
                              border: '1px solid #ddd6fe',
                              borderRadius: '8px',
                              fontSize: '0.785rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            + Thêm phòng/sân cùng giờ
                          </button>
                          {sessionsList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSession(sess.id)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#dc2626',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '8px',
                                fontSize: '0.785rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                            >
                              <span><TrashIcon size={14} /> Xóa Ca Này</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Ngày:</label>
                          <input
                            type="date"
                            value={sess.session_date}
                            onChange={(e) => handleUpdateSession(sess.id, 'session_date', e.target.value)}
                            className={styles.sessionField}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Bắt đầu:</label>
                          <input
                            type="time"
                            value={sess.start_time}
                            onChange={(e) => handleUpdateSession(sess.id, 'start_time', e.target.value)}
                            className={styles.sessionField}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Kết thúc:</label>
                          <input
                            type="time"
                            value={sess.end_time}
                            onChange={(e) => handleUpdateSession(sess.id, 'end_time', e.target.value)}
                            className={styles.sessionField}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Phòng/Hội trường:</label>
                          <select
                            value={roomSelectValue(sess.room_id, sess.room_name)}
                            onChange={(e) => handleUpdateSession(sess.id, 'room_id', e.target.value)}
                            className={`${styles.sessionField} ${isRoomMissing(sess.room_id, sess.room_name) ? styles.sessionFieldMissing : ''}`}
                          >
                            <option value="" disabled>-- Chọn địa điểm --</option>
                            <option value={NO_ROOM_VALUE}>Không mượn phòng</option>
                            {rooms.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.room_name} ({r.capacity} chỗ)
                              </option>
                            ))}
                          </select>
                          {isRoomMissing(sess.room_id, sess.room_name) && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>
                              Chưa chọn địa điểm
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
                          Nội dung ca này <span style={{ fontWeight: 500, color: '#94a3b8' }}>(làm gì trong ca – không bắt buộc)</span>:
                        </label>
                        <input
                          type="text"
                          value={sess.purpose || ''}
                          onChange={(e) => handleUpdateSession(sess.id, 'purpose', e.target.value)}
                          placeholder="VD: Khai mạc, Thi đấu vòng bảng, Tập luyện, Bế mạc & trao giải..."
                          className={styles.sessionField}
                        />
                      </div>

                      {internalOverlapsForSession(sess.id).length > 0 && (
                        <div
                          style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            border: '1.5px solid #fca5a5',
                            background: '#fef2f2',
                            color: '#991b1b',
                            fontSize: '0.85rem',
                            lineHeight: 1.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <AlertTriangleIcon size={16} color="#b91c1c" />
                            <strong style={{ color: '#b91c1c' }}>Trùng phòng với ca khác trong chính kế hoạch này:</strong>
                          </div>
                          {internalOverlapsForSession(sess.id).map((o, i) => (
                            <span key={`${o.a_key}-${o.b_key}-${i}`}>{describeInternalOverlap(o)}</span>
                          ))}
                        </div>
                      )}

                      {sess.room_id && conflictsForSession(sess.id).length > 0 && (
                        <div
                          style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            border: '1.5px solid #fca5a5',
                            background: '#fef2f2',
                            color: '#991b1b',
                            fontSize: '0.85rem',
                            lineHeight: 1.5,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.25rem',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <AlertTriangleIcon size={16} color="#b91c1c" />
                            <strong style={{ color: '#b91c1c' }}>Ca này bị trùng lịch phòng:</strong>
                          </div>
                          {conflictsForSession(sess.id).map((c, i) => (
                            <span key={`${c.other_id}-${i}`}>{describeConflict(c)}</span>
                          ))}
                        </div>
                      )}
                      {sess.room_id && conflictChecked && !checkingConflict && conflictsForSession(sess.id).length === 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>
                          <CheckCircleIcon size={14} color="#15803d" />
                          <span>Phòng trống trong ca này</span>
                        </div>
                      )}
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
                  <span>Link File Kế Hoạch Chi Tiết (Google Drive / PDF / Docx): <span style={{ color: '#dc2626' }}>*</span></span>
                  <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>Bắt buộc</span>
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
                  <span style={{ fontSize: '1rem', lineHeight: 1, display: 'flex' }}><LightbulbIcon size={14} /></span>
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
                <BuildingIcon size={18} color="#166534" />
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
                        ? `Đẩy thẳng đến Phòng. TC-HC-QT duyệt & bàn giao phòng: ${borrowedRoomsLabel}`
                        : isBorrowing
                        ? `Kích hoạt phê duyệt cấp phòng & bàn giao địa điểm: ${borrowedRoomsLabel}`
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

          {/* ═══════════════ MỤC 6: BẢNG TỔNG KẾT – KIỂM TRA LẠI TRƯỚC KHI GỬI ═══════════════ */}
          {(() => {
            const fmtDay = (d: string) =>
              d ? new Date(`${d}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
            const rows = isMultiSession
              ? sessionsList.map((s) => ({
                  key: s.id,
                  name: s.name || 'Ca chưa đặt tên',
                  date: fmtDay(s.session_date),
                  time: `${s.start_time || '??'}–${s.end_time || '??'}`,
                  room: s.room_id ? (s.room_name || '') : '',
                  missing: isRoomMissing(s.room_id, s.room_name),
                }))
              : [{
                  key: 'session_1',
                  name: 'Buổi chính',
                  date: startDate !== endDate ? `${formatDateVN(startDate)} → ${formatDateVN(endDate)}` : fmtDay(startDate),
                  time: `${startTime}–${endTime}${bookingPreview.mode === 'daily' ? ' (mỗi ngày)' : ''}`,
                  room: selectedRoomId ? selectedRoomName : '',
                  missing: isRoomMissing(selectedRoomId, selectedRoomName),
                }];
            const roomTotals = borrowedRoomNames.map((name) => ({
              name,
              count: bookingPreview.slots.filter((s) => s.room_name === name).length,
            }));
            const issueCount = roomConflicts.length + internalOverlaps.length + sessionsMissingRoom.length + (planUrl.trim() ? 0 : 1)
              + (isMultiDay && (!isMultiSession || sessionsList.length < 2) ? 1 : 0);
            const cellStyle: React.CSSProperties = { padding: '0.55rem 0.75rem', fontWeight: 700, color: '#0f172a', verticalAlign: 'top' };
            const headStyle: React.CSSProperties = { padding: '0.55rem 0.75rem', textAlign: 'left', fontWeight: 800, color: '#334155', fontSize: '0.78rem', borderBottom: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' };
            const infoLabel: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' };
            const infoValue: React.CSSProperties = { fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' };

            return (
              <div className={styles.sectionCard}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    marginBottom: '1.25rem',
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
                    <CheckCircleIcon size={20} color="#15803d" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      6. Bảng Tổng Kết – Kiểm Tra Lại Trước Khi Gửi
                    </h2>
                    <p style={{ fontSize: '0.825rem', color: '#64748b', margin: '0.15rem 0 0' }}>
                      Đây chính là nội dung các cấp phê duyệt sẽ nhìn thấy
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', padding: '1.1rem', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '14px', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', gridColumn: '1 / -1' }}>
                    <span style={infoLabel}>Tên chương trình</span>
                    <span style={{ ...infoValue, color: title.trim() ? '#0f172a' : '#dc2626' }}>{title.trim() || 'Chưa nhập tên chương trình'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={infoLabel}>Đơn vị</span>
                    <span style={infoValue}>{organizationUnit}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={infoLabel}>Thời gian</span>
                    <span style={infoValue}>
                      {startDate !== endDate ? `${formatDateVN(startDate)} → ${formatDateVN(endDate)}` : formatDateVN(startDate)}
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}> ({startTime}–{endTime})</span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={infoLabel}>Quy mô</span>
                    <span style={infoValue}>
                      {totalPersonnel} người
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b' }}>
                        {' '}({Number(participantCount) || 0} SV, {Number(volunteerCount) || 0} CTV, {Number(organizerCount) || 0} BTC)
                      </span>
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={infoLabel}>File kế hoạch</span>
                    <span style={{ ...infoValue, color: planUrl.trim() ? '#15803d' : '#dc2626' }}>
                      {planUrl.trim() ? 'Đã đính kèm' : 'Chưa đính kèm (bắt buộc)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={infoLabel}>Các cấp duyệt</span>
                    <span style={infoValue}>
                      {[
                        !isDirectFaculty && 'Đoàn TN',
                        !isDirectFaculty && requiresCtsv && 'CTSV',
                        (isDirectFaculty || isBorrowing) && 'Phòng TC-HC-QT',
                      ].filter(Boolean).join(' → ')}
                    </span>
                  </div>
                </div>

                <span style={{ ...infoLabel, display: 'block', marginBottom: '0.5rem' }}>
                  Lịch các ca &amp; phòng/sân ({rows.length} ca)
                </span>
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1.5px solid #e2e8f0' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={headStyle}>Ca</th>
                        <th style={headStyle}>Ngày</th>
                        <th style={headStyle}>Giờ</th>
                        <th style={headStyle}>Phòng / Sân</th>
                        <th style={headStyle}>Tình trạng phòng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const ext = roomConflicts.filter((c) => c.slot_key === r.key);
                        const internal = internalOverlapsForSession(r.key);
                        const bad = ext.length > 0 || internal.length > 0;
                        return (
                          <tr key={r.key} style={{ background: bad ? '#fef2f2' : idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ ...cellStyle, color: '#1e1b4b', whiteSpace: 'nowrap' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: '#7e22ce', color: '#fff', fontSize: '0.7rem', fontWeight: 800, marginRight: '0.4rem' }}>{idx + 1}</span>
                              {r.name}
                            </td>
                            <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{r.date}</td>
                            <td style={{ ...cellStyle, whiteSpace: 'nowrap' }}>{r.time}</td>
                            <td style={{ ...cellStyle, color: r.missing ? '#dc2626' : r.room ? '#0f172a' : '#94a3b8' }}>{r.missing ? 'Chưa chọn địa điểm' : r.room || 'Không mượn'}</td>
                            <td style={{ ...cellStyle, fontWeight: 600 }}>
                              {!r.room ? (
                                <span style={{ color: '#94a3b8' }}>—</span>
                              ) : checkingConflict ? (
                                <span style={{ color: '#2563eb' }}>Đang kiểm tra...</span>
                              ) : bad ? (
                                <span style={{ color: '#b91c1c', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  {internal.map((o, i) => (
                                    <span key={`i-${i}`}>Trùng với ca &quot;{o.a_key === r.key ? o.b_label : o.a_label}&quot; trong kế hoạch này</span>
                                  ))}
                                  {ext.slice(0, 3).map((c, i) => (
                                    <span key={`e-${i}`}>Trùng &quot;{c.other_title}&quot; ({c.other_slot_start_time}–{c.other_slot_end_time} ngày {formatDateVN(c.other_slot_date)})</span>
                                  ))}
                                  {ext.length > 3 && <span>… và {ext.length - 3} khung trùng khác</span>}
                                </span>
                              ) : conflictChecked ? (
                                <span style={{ color: '#15803d', fontWeight: 700 }}>Trống</span>
                              ) : (
                                <span style={{ color: '#94a3b8' }}>Chưa kiểm tra</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {roomTotals.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem' }}>
                    {roomTotals.map((t) => (
                      <span
                        key={t.name}
                        style={{ fontSize: '0.8rem', fontWeight: 700, padding: '0.3rem 0.7rem', borderRadius: '8px', background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}
                      >
                        {t.name}: {t.count} {bookingPreview.mode === 'daily' ? 'ngày' : 'ca'}
                      </span>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    fontSize: '0.875rem',
                    fontWeight: 700,
                    background: issueCount > 0 ? '#fef2f2' : '#f0fdf4',
                    border: issueCount > 0 ? '1px solid #fecaca' : '1px solid #bbf7d0',
                    color: issueCount > 0 ? '#991b1b' : '#166534',
                  }}
                >
                  {issueCount > 0
                    ? `Còn ${issueCount} vấn đề cần sửa trước khi gửi (xem các dòng màu đỏ ở trên).`
                    : checkingConflict
                    ? 'Đang kiểm tra lịch phòng...'
                    : 'Mọi thông tin đã hợp lệ. Kiểm tra lại lần cuối rồi bấm Gửi.'}
                </div>
              </div>
            );
          })()}

          {/* ═══════════════ FOOTER ACTION BAR ═══════════════ */}
          {(errorMessage || roomConflicts.length > 0 || internalOverlaps.length > 0) && (
            <div className={styles.errorAlert} style={{ marginBottom: 0 }}>
              <AlertTriangleIcon size={20} color="#b91c1c" />
              <span style={{ whiteSpace: 'pre-line' }}>
                {errorMessage ||
                  `Có ${roomConflicts.length + internalOverlaps.length} ca bị trùng lịch phòng (xem các ô đỏ ở Mục 3 và Bảng tổng kết). Đổi giờ/ngày hoặc chọn phòng khác để có thể gửi.`}
              </span>
            </div>
          )}
          <div className={styles.submitBar}>
            <Link
              href="/admin/proposals"
              className={styles.cancelButton}
            >
              Hủy Bỏ
            </Link>

            <button
              type="submit"
              disabled={submitting || roomConflicts.length > 0 || internalOverlaps.length > 0}
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
