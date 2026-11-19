'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarIcon,
  CheckCircleIcon,
  TrashIcon,
  RefreshIcon,
} from '@/components/icons';
import type { AcademicSemester } from '@/lib/types';

interface SemesterManagerSectionProps {
  onSaved?: (semesters: AcademicSemester[]) => void;
}

export default function SemesterManagerSection({ onSaved }: SemesterManagerSectionProps) {
  const [semesters, setSemesters] = useState<AcademicSemester[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form thêm mới học kỳ
  const [newName, setNewName] = useState('');
  const [newYear, setNewYear] = useState('2026 - 2027');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const loadSemesters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/semesters', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSemesters(json.data);
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Không thể tải danh sách học kỳ.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSemesters();
  }, [loadSemesters]);

  const persistSemesters = async (updatedList: AcademicSemester[], successText: string) => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/semesters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ semesters: updatedList }),
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSemesters(json.data);
        setStatusMsg({ type: 'success', text: successText });
        onSaved?.(json.data);
      } else {
        setStatusMsg({ type: 'error', text: json.error || 'Lỗi lưu cấu hình học kỳ.' });
      }
    } catch {
      setStatusMsg({ type: 'error', text: 'Lỗi kết nối máy chủ khi lưu học kỳ.' });
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange = (
    idx: number,
    field: keyof AcademicSemester,
    value: string | boolean
  ) => {
    setSemesters((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const handleSetActive = async (idx: number) => {
    const updated = semesters.map((item, i) => ({
      ...item,
      is_active: i === idx,
    }));
    await persistSemesters(updated, `Đã kích hoạt "${updated[idx].name}" làm học kỳ hiện tại.`);
  };

  const handleDelete = async (idx: number) => {
    if (semesters.length <= 1) {
      setStatusMsg({ type: 'error', text: 'Cần giữ lại ít nhất 1 học kỳ trên hệ thống.' });
      return;
    }
    const target = semesters[idx];
    if (!window.confirm(`Xóa học kỳ "${target.name}" khỏi danh sách cấu hình?`)) return;
    const remaining = semesters.filter((_, i) => i !== idx);
    if (!remaining.some((s) => s.is_active) && remaining.length > 0) {
      remaining[0] = { ...remaining[0], is_active: true };
    }
    await persistSemesters(remaining, `Đã xóa học kỳ "${target.name}".`);
  };

  const handleSaveAll = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const s of semesters) {
      if (!s.name.trim() || !s.start_date || !s.end_date) {
        setStatusMsg({ type: 'error', text: 'Vui lòng điền đủ Tên học kỳ, Ngày bắt đầu và Ngày kết thúc.' });
        return;
      }
      if (s.start_date > s.end_date) {
        setStatusMsg({
          type: 'error',
          text: `Học kỳ "${s.name}": Ngày bắt đầu không được lớn hơn ngày kết thúc.`,
        });
        return;
      }
    }
    await persistSemesters(semesters, 'Đã lưu cấu hình thời gian tất cả học kỳ thành công.');
  };

  const handleAddSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName || !newStart || !newEnd) {
      setStatusMsg({ type: 'error', text: 'Vui lòng nhập Tên học kỳ, Từ ngày và Đến ngày.' });
      return;
    }
    if (newStart > newEnd) {
      setStatusMsg({ type: 'error', text: 'Ngày bắt đầu không được lớn hơn ngày kết thúc.' });
      return;
    }

    const generatedId = `HK-${newStart.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const newItem: AcademicSemester = {
      id: generatedId,
      name: trimmedName,
      academic_year: newYear.trim() || `${newStart.slice(0, 4)} - ${newEnd.slice(0, 4)}`,
      start_date: newStart,
      end_date: newEnd,
      is_active: semesters.length === 0,
      notes: newNotes.trim(),
    };

    const updated = [newItem, ...semesters];
    await persistSemesters(updated, `Đã thêm học kỳ "${trimmedName}" (${newStart} → ${newEnd}).`);
    setNewName('');
    setNewStart('');
    setNewEnd('');
    setNewNotes('');
  };

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '1.35rem',
        marginTop: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.15rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          borderBottom: '1px solid #f1f5f9',
          paddingBottom: '0.9rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarIcon size={18} color="#1d4ed8" />
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0f172a' }}>
              Cấu hình &amp; Gán Thời Gian Học Kỳ (Tính Bảng Xếp Hạng)
            </h3>
          </div>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.84rem', color: '#64748b' }}>
            Gán khoảng thời gian <strong>Từ ngày → Đến ngày</strong> cho từng học kỳ. Bảng xếp hạng LCĐ, đơn vị tổ chức và sinh viên sẽ tự động lọc chính xác các sự kiện diễn ra trong khung thời gian đã gán.
          </p>
        </div>

        <button
          type="button"
          onClick={loadSemesters}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.48rem 0.85rem',
            borderRadius: 9,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <RefreshIcon size={14} />
          <span>Tải lại</span>
        </button>
      </div>

      {statusMsg && (
        <div
          style={{
            padding: '0.7rem 0.95rem',
            borderRadius: 10,
            fontSize: '0.85rem',
            fontWeight: 600,
            background: statusMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${statusMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: statusMsg.type === 'success' ? '#15803d' : '#b91c1c',
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Form thêm học kỳ mới */}
      <form
        onSubmit={handleAddSemester}
        style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          padding: '1rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '0.75rem',
          alignItems: 'end',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            Tên học kỳ mới *
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="VD: Học kỳ 1 (2027 - 2028)"
            style={{
              height: 38,
              padding: '0 0.75rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              background: '#ffffff',
            }}
            required
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            Năm học
          </label>
          <input
            type="text"
            value={newYear}
            onChange={(e) => setNewYear(e.target.value)}
            placeholder="2026 - 2027"
            style={{
              height: 38,
              padding: '0 0.75rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              background: '#ffffff',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            Ngày bắt đầu *
          </label>
          <input
            type="date"
            value={newStart}
            onChange={(e) => setNewStart(e.target.value)}
            style={{
              height: 38,
              padding: '0 0.7rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              background: '#ffffff',
            }}
            required
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>
            Ngày kết thúc *
          </label>
          <input
            type="date"
            value={newEnd}
            onChange={(e) => setNewEnd(e.target.value)}
            style={{
              height: 38,
              padding: '0 0.7rem',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              background: '#ffffff',
            }}
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            height: 38,
            padding: '0 1rem',
            borderRadius: 8,
            border: 'none',
            background: '#1d4ed8',
            color: '#ffffff',
            fontSize: '0.84rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Đang lưu...' : 'Thêm học kỳ'}
        </button>
      </form>

      {/* Bảng chỉnh sửa trực tiếp các học kỳ */}
      {loading ? (
        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>
          Đang tải danh sách học kỳ...
        </div>
      ) : (
        <form onSubmit={handleSaveAll} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '0.68rem 0.75rem', fontSize: '0.73rem', color: '#475569', textTransform: 'uppercase' }}>
                    Tên học kỳ
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.68rem 0.75rem', fontSize: '0.73rem', color: '#475569', textTransform: 'uppercase' }}>
                    Từ ngày
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.68rem 0.75rem', fontSize: '0.73rem', color: '#475569', textTransform: 'uppercase' }}>
                    Đến ngày
                  </th>
                  <th style={{ textAlign: 'left', padding: '0.68rem 0.75rem', fontSize: '0.73rem', color: '#475569', textTransform: 'uppercase' }}>
                    Trạng thái
                  </th>
                  <th style={{ textAlign: 'right', padding: '0.68rem 0.75rem', fontSize: '0.73rem', color: '#475569', textTransform: 'uppercase' }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {semesters.map((sem, idx) => (
                  <tr
                    key={sem.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: sem.is_active ? '#eff6ff' : '#ffffff',
                    }}
                  >
                    <td style={{ padding: '0.65rem 0.75rem', minWidth: 210 }}>
                      <input
                        type="text"
                        value={sem.name}
                        onChange={(e) => handleFieldChange(idx, 'name', e.target.value)}
                        style={{
                          width: '100%',
                          height: 34,
                          padding: '0 0.6rem',
                          borderRadius: 7,
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          fontSize: '0.84rem',
                          color: '#0f172a',
                          background: '#ffffff',
                        }}
                      />
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <input
                        type="date"
                        value={sem.start_date}
                        onChange={(e) => handleFieldChange(idx, 'start_date', e.target.value)}
                        style={{
                          height: 34,
                          padding: '0 0.55rem',
                          borderRadius: 7,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.83rem',
                          background: '#ffffff',
                        }}
                      />
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <input
                        type="date"
                        value={sem.end_date}
                        onChange={(e) => handleFieldChange(idx, 'end_date', e.target.value)}
                        style={{
                          height: 34,
                          padding: '0 0.55rem',
                          borderRadius: 7,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.83rem',
                          background: '#ffffff',
                        }}
                      />
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', whiteSpace: 'nowrap' }}>
                      {sem.is_active ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.22rem 0.6rem',
                            borderRadius: 999,
                            background: '#dcfce7',
                            color: '#15803d',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                          }}
                        >
                          <CheckCircleIcon size={13} color="#15803d" />
                          <span>Đang kích hoạt</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetActive(idx)}
                          disabled={saving}
                          style={{
                            padding: '0.25rem 0.65rem',
                            borderRadius: 7,
                            border: '1px solid #bfdbfe',
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            fontSize: '0.76rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Đặt làm kỳ hiện tại
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(idx)}
                        disabled={saving || semesters.length <= 1}
                        title="Xóa học kỳ"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid #fecaca',
                          background: '#fef2f2',
                          color: '#dc2626',
                          cursor: semesters.length <= 1 ? 'not-allowed' : 'pointer',
                          opacity: semesters.length <= 1 ? 0.45 : 1,
                        }}
                      >
                        <TrashIcon size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                height: 38,
                padding: '0 1.25rem',
                borderRadius: 9,
                border: 'none',
                background: '#059669',
                color: '#ffffff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {saving ? 'Đang lưu cấu hình...' : 'Lưu thay đổi thời gian học kỳ'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
