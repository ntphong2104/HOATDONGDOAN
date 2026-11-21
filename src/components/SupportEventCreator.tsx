'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/ToastProvider';
import { getSelectableCohorts } from '@/lib/utils/cohort';
import { LCD_DEFINITIONS } from '@/lib/utils/lcd';
import {
  CalendarIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
} from '@/components/icons';

interface SupportSessionDraft {
  id: string;
  name: string;
  session_date: string;
  start_time: string;
  end_time: string;
}

interface SupportEventCreatorProps {
  onCreated?: (event: any) => void;
  onCancel?: () => void;
  defaultOrgUnit?: string;
}

function getTodayVN(): string {
  const vn = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return vn.toISOString().split('T')[0];
}

export default function SupportEventCreator({
  onCreated,
  onCancel,
  defaultOrgUnit = 'Văn phòng Đoàn Học Viện',
}: SupportEventCreatorProps) {
  const toast = useToast();
  const [eventName, setEventName] = useState('');
  const [organizationUnit, setOrganizationUnit] = useState(defaultOrgUnit);
  const [semester, setSemester] = useState('');
  const [semesters, setSemesters] = useState<Array<{ id: string; name: string; is_active?: boolean }>>([]);
  const [startDate, setStartDate] = useState(getTodayVN);
  const [endDate, setEndDate] = useState(getTodayVN);
  const [startTime, setStartTime] = useState('07:30');
  const [endTime, setEndTime] = useState('11:30');
  const [participantCount, setParticipantCount] = useState<number | string>(0);
  const [volunteerCount, setVolunteerCount] = useState<number | string>(10);
  const [requireRegistration, setRequireRegistration] = useState(false);
  const [cancellationPolicy, setCancellationPolicy] = useState<'before_2h' | 'disabled'>('before_2h');
  const [notifyStudents, setNotifyStudents] = useState(false);
  const [description, setDescription] = useState('');
  const [allowedCohorts, setAllowedCohorts] = useState<string[]>([]);
  const [allowedLcds, setAllowedLcds] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [useCustomSessions, setUseCustomSessions] = useState(false);
  const [sessions, setSessions] = useState<SupportSessionDraft[]>([
    {
      id: 'sess_1',
      name: 'Ca 1 (Sáng)',
      session_date: getTodayVN(),
      start_time: '07:30',
      end_time: '11:30',
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ event_id: string; event_name: string } | null>(null);

  const cohortOptions = getSelectableCohorts(allowedCohorts);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/semesters', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (!active || !json?.success || !Array.isArray(json.data)) return;
        setSemesters(json.data);
        const activeSem = json.data.find((s: any) => s.is_active) || json.data[0];
        if (activeSem?.name) setSemester(activeSem.name);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const toggleCohort = (c: string) => {
    setAllowedCohorts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const toggleLcd = (code: string) => {
    setAllowedLcds((prev) => (prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]));
  };

  const addSession = () => {
    setSessions((prev) => [
      ...prev,
      {
        id: `sess_${Date.now()}`,
        name: `Ca ${prev.length + 1}`,
        session_date: endDate || startDate || getTodayVN(),
        start_time: '13:30',
        end_time: '17:00',
      },
    ]);
  };

  const removeSession = (id: string) => {
    setSessions((prev) => (prev.length > 1 ? prev.filter((s) => s.id !== id) : prev));
  };

  const updateSession = (id: string, field: keyof SupportSessionDraft, value: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventName.trim() || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/office/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_name: eventName.trim(),
          organization_unit: organizationUnit.trim() || 'Văn phòng Đoàn Học Viện',
          semester: semester.trim(),
          event_date: startDate,
          end_date: endDate || startDate,
          start_time: startTime,
          end_time: endTime,
          participant_count: Number(participantCount) || 0,
          volunteer_count: Number(volunteerCount) || 0,
          require_registration: requireRegistration,
          cancellation_policy: cancellationPolicy,
          allowed_cohorts: allowedCohorts,
          allowed_lcds: allowedLcds,
          description: description.trim(),
          notify_students: notifyStudents,
          sessions: useCustomSessions ? sessions : [],
        }),
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        toast.success(json.message || 'Đã tạo & mở sự kiện hỗ trợ thành công!');
        setLastCreated({ event_id: json.data.event_id, event_name: json.data.event_name });
        setEventName('');
        setDescription('');
        setUseCustomSessions(false);
        onCreated?.(json.data);
      } else {
        toast.error(json.error || 'Không thể tạo sự kiện hỗ trợ.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#334155',
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.52rem 0.72rem',
    borderRadius: 9,
    border: '1px solid #cbd5e1',
    fontSize: '0.86rem',
    background: '#fff',
    color: '#0f172a',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1.5px solid #bbf7d0',
        borderRadius: 16,
        padding: '1.2rem',
        boxShadow: '0 4px 16px rgba(22, 163, 74, 0.06)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
            <CalendarIcon size={18} color="#15803d" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Tạo Sự Kiện Hỗ Trợ Nhanh (Văn Phòng Đoàn)
            </h3>
          </div>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.81rem', color: '#475569', lineHeight: 1.45 }}>
            Dành cho các sự kiện hỗ trợ khẩn cấp <strong>không mượn phòng</strong> và <strong>không cần qua Phòng CTSV / Phòng TC-HC-QT</strong>. Sự kiện được mở ngay để tuyển CTV, đăng ký và điểm danh QR.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#dcfce7', color: '#15803d' }}>
            Không mượn phòng
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8' }}>
            Miễn duyệt CTSV
          </span>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: '#fef9c3', color: '#854d0e' }}>
            Mở ngay
          </span>
        </div>
      </div>

      {lastCreated && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            padding: '0.75rem 0.95rem',
            marginBottom: '1rem',
            borderRadius: 12,
            background: '#f0fdf4',
            border: '1px solid #86efac',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem', color: '#166534', fontWeight: 700 }}>
            <CheckCircleIcon size={17} color="#16a34a" />
            <span>Đã mở sự kiện &ldquo;{lastCreated.event_name}&rdquo; thành công!</span>
          </div>
          <Link
            href={`/admin/events/${lastCreated.event_id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.42rem 0.85rem',
              borderRadius: 8,
              background: '#16a34a',
              color: '#fff',
              fontSize: '0.8rem',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Quản lý &amp; Chiếu QR ➔
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Tên sự kiện hỗ trợ *</label>
            <input
              type="text"
              required
              placeholder="VD: Hỗ trợ đón Tân sinh viên, Hỗ trợ công tác Đại hội..."
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Đơn vị phụ trách</label>
            <input
              type="text"
              value={organizationUnit}
              onChange={(e) => setOrganizationUnit(e.target.value)}
              placeholder="Văn phòng Đoàn Học Viện"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Học kỳ</label>
            {semesters.length > 0 ? (
              <select value={semester} onChange={(e) => setSemester(e.target.value)} style={inputStyle}>
                {semesters.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name} {s.is_active ? '(Hiện tại)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="Tự động theo học kỳ hiện tại"
                style={inputStyle}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Ngày bắt đầu *</label>
            <input
              type="date"
              required
              min={getTodayVN()}
              value={startDate}
              onChange={(e) => {
                const v = e.target.value;
                setStartDate(v);
                if (!endDate || endDate < v) setEndDate(v);
              }}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Ngày kết thúc</label>
            <input
              type="date"
              min={startDate || getTodayVN()}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Giờ bắt đầu</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Giờ kết thúc</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Chỉ tiêu SV tham gia (0 = không mở ĐK SV)</label>
            <input
              type="number"
              min={0}
              max={5000}
              value={participantCount}
              onChange={(e) => {
                const v = e.target.value;
                setParticipantCount(v === '' ? '' : Number(v));
                if (Number(v) > 0) setRequireRegistration(true);
              }}
              style={inputStyle}
            />
            <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: 3 }}>
              Dù trên 50 SV vẫn miễn duyệt CTSV.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Chỉ tiêu CTV hỗ trợ (0 = không tuyển CTV)</label>
            <input
              type="number"
              min={0}
              max={1000}
              value={volunteerCount}
              onChange={(e) => setVolunteerCount(e.target.value === '' ? '' : Number(e.target.value))}
              style={inputStyle}
            />
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
              Nhập &gt; 0 để tự mở cổng tuyển CTV.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Chế độ SV tự hủy tham gia</label>
            <select
              value={cancellationPolicy}
              onChange={(e) => setCancellationPolicy(e.target.value === 'disabled' ? 'disabled' : 'before_2h')}
              style={inputStyle}
            >
              <option value="before_2h">Cho phép hủy trước 2 tiếng</option>
              <option value="disabled">Không thể hủy</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', fontSize: '0.82rem', color: '#334155' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={requireRegistration}
              onChange={(e) => setRequireRegistration(e.target.checked)}
            />
            Yêu cầu đăng ký trước khi điểm danh
          </label>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={notifyStudents}
              onChange={(e) => setNotifyStudents(e.target.checked)}
            />
            Gửi thông báo đẩy tới sinh viên ngay
          </label>

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#1d4ed8',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {showAdvanced ? 'Ẩn tùy chọn nâng cao' : 'Tùy chọn nâng cao (Khóa, LCĐ, Chia ca...)'}
          </button>
        </div>

        {showAdvanced && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '0.9rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div>
              <label style={labelStyle}>Mô tả / Ghi chú nội dung hỗ trợ (tùy chọn)</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nhiệm vụ cụ thể, địa điểm tập trung (không mượn phòng)..."
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Giới hạn Khóa sinh viên (bỏ trống = Tất cả khóa)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {cohortOptions.map((c) => {
                  const active = allowedCohorts.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleCohort(c)}
                      style={{
                        padding: '0.28rem 0.65rem',
                        borderRadius: 999,
                        border: active ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                        background: active ? '#dbeafe' : '#fff',
                        color: active ? '#1e40af' : '#475569',
                        fontWeight: 700,
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={labelStyle}>Giới hạn Liên Chi Đoàn (bỏ trống = Toàn Học viện)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {LCD_DEFINITIONS.map((lcd) => {
                  const active = allowedLcds.includes(lcd.code);
                  return (
                    <button
                      key={lcd.code}
                      type="button"
                      onClick={() => toggleLcd(lcd.code)}
                      style={{
                        padding: '0.28rem 0.65rem',
                        borderRadius: 999,
                        border: active ? '1.5px solid #1d4ed8' : '1px solid #cbd5e1',
                        background: active ? '#dbeafe' : '#fff',
                        color: active ? '#1e40af' : '#475569',
                        fontWeight: 700,
                        fontSize: '0.76rem',
                        cursor: 'pointer',
                      }}
                    >
                      {lcd.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                <input
                  type="checkbox"
                  checked={useCustomSessions}
                  onChange={(e) => setUseCustomSessions(e.target.checked)}
                />
                Tự chia nhiều ca điểm danh (tất cả đều không mượn phòng)
              </label>

              {useCustomSessions && (
                <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(140px, 1.5fr) 135px 95px 95px auto',
                        gap: '0.45rem',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="text"
                        placeholder="Tên ca"
                        value={s.name}
                        onChange={(e) => updateSession(s.id, 'name', e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="date"
                        min={getTodayVN()}
                        value={s.session_date}
                        onChange={(e) => updateSession(s.id, 'session_date', e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="time"
                        value={s.start_time}
                        onChange={(e) => updateSession(s.id, 'start_time', e.target.value)}
                        style={inputStyle}
                      />
                      <input
                        type="time"
                        value={s.end_time}
                        onChange={(e) => updateSession(s.id, 'end_time', e.target.value)}
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => removeSession(s.id)}
                        disabled={sessions.length <= 1}
                        title="Xóa ca"
                        style={{
                          padding: '0.45rem',
                          borderRadius: 8,
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          color: '#dc2626',
                          cursor: sessions.length <= 1 ? 'not-allowed' : 'pointer',
                          opacity: sessions.length <= 1 ? 0.45 : 1,
                        }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  ))}
                  <div>
                    <button
                      type="button"
                      onClick={addSession}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '0.35rem 0.7rem',
                        borderRadius: 8,
                        border: '1px dashed #2563eb',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                      }}
                    >
                      <PlusIcon size={14} /> Thêm ca
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.58rem 1rem',
                borderRadius: 10,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#475569',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Đóng
            </button>
          )}
          <button
            type="submit"
            disabled={submitting || !eventName.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 1.25rem',
              borderRadius: 10,
              border: 'none',
              background: submitting ? '#86efac' : 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(22, 163, 74, 0.25)',
            }}
          >
            <PlusIcon size={16} />
            <span>{submitting ? 'Đang tạo & mở sự kiện...' : 'Tạo & Mở Sự Kiện Hỗ Trợ Ngay'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
