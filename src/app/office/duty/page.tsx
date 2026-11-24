'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import DutyMatrixTable from '@/components/DutyMatrixTable';
import { useToast } from '@/components/ToastProvider';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  RefreshIcon,
  UsersIcon,
} from '@/components/icons';

function fmtDateVN(d: string): string {
  const p = String(d || '').split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function fmtTimeVN(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function OfficeDutyPage() {
  const [weekAnchor, setWeekAnchor] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const toast = useToast();

  const loadAll = useCallback(async (anchor?: string) => {
    setLoading(true);
    try {
      const qs = anchor ? `?week_of=${encodeURIComponent(anchor)}` : '';
      const [sRes, aRes] = await Promise.all([
        fetch(`/api/office/duty/schedule${qs}`, { cache: 'no-store' }),
        fetch('/api/office/duty/attendance', { cache: 'no-store' }),
      ]);
      if (sRes.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const sJson = await sRes.json();
      if (sJson.success && sJson.data) {
        setData(sJson.data);
        if (!anchor && sJson.data.workdays?.[0]) {
          setWeekAnchor(sJson.data.workdays[0]);
        }
      } else {
        toast.error(sJson.error || 'Không thể tải lịch trực.');
      }
      if (aRes.ok) {
        const aJson = await aRes.json();
        if (aJson.success && Array.isArray(aJson.data)) {
          setAttendanceHistory(aJson.data);
        }
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await loadAll();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAll]);

  const handleShiftChangeWeek = (deltaDays: number) => {
    const base = weekAnchor || data?.workdays?.[0] || getVietnamDateString(0);
    const next = addDays(base, deltaDays);
    setWeekAnchor(next);
    loadAll(next);
  };

  const handleRegister = async (dutyDate: string, shift: 'morning' | 'afternoon') => {
    const key = `${dutyDate}_${shift}`;
    setBusyKey(key);
    try {
      const res = await fetch('/api/office/duty/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duty_date: dutyDate, shift }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || 'Đăng ký ca thành công!');
        await loadAll(weekAnchor || undefined);
      } else {
        toast.error(json.error || 'Không thể đăng ký ca.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleCancel = async (regId: string) => {
    if (!window.confirm('Xác nhận hủy đăng ký ca trực này?')) return;
    setBusyKey(regId);
    try {
      const res = await fetch(`/api/office/duty/schedule?id=${encodeURIComponent(regId)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || 'Đã hủy ca trực.');
        await loadAll(weekAnchor || undefined);
      } else {
        toast.error(json.error || 'Không thể hủy ca.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleAttendance = async (registrationId: string, action: 'check_in' | 'check_out') => {
    setBusyKey(`${registrationId}_${action}`);
    try {
      const res = await fetch('/api/office/duty/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_id: registrationId, action }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        await loadAll(weekAnchor || undefined);
      } else {
        toast.error(json.error || 'Chấm công thất bại.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setBusyKey(null);
    }
  };

  if (forbidden) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Header title="TRỰC VĂN PHÒNG ĐOÀN" />
        <main style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.25rem' }}>
          <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <AlertTriangleIcon size={36} color="#dc2626" />
            <h2 style={{ marginTop: '0.75rem', color: '#0f172a' }}>Chỉ dành cho CTV Trực Văn phòng Đoàn</h2>
            <p style={{ color: '#64748b', fontSize: '0.92rem' }}>
              Tài khoản của bạn hiện chưa có trong danh sách CTV trực văn phòng. Vui lòng liên hệ Admin Văn phòng Đoàn nếu bạn thuộc đội CTV trực.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const maxPerShift = data?.config?.max_per_shift || 2;
  const myEmail = (data?.volunteer?.email || '').toLowerCase();

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header title="TRỰC VĂN PHÒNG ĐOÀN" />
      <main style={{ maxWidth: 1360, margin: '0 auto', padding: '1.25rem 1.5rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Hero */}
        <section
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderLeft: '3px solid #1d4ed8',
            borderRadius: 16,
            padding: '1.25rem 1.5rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            color: '#0f172a',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#1d4ed8' }}>
              Văn phòng Đoàn • Giờ hành chính Thứ 2 – Thứ 6
            </div>
            <h1 style={{ margin: '0.2rem 0', fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              Đăng Ký &amp; Chấm Công Trực Văn Phòng
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Ca Sáng ({data?.config?.shifts?.morning?.start || '07:30'}–{data?.config?.shifts?.morning?.end || '11:30'}) &amp; Ca Chiều ({data?.config?.shifts?.afternoon?.start || '13:00'}–{data?.config?.shifts?.afternoon?.end || '17:00'}) • Tối đa {maxPerShift} người/ca • Check-in sớm 30p, Check-out trễ 30p qua WiFi VPĐ.
            </p>
          </div>

          {data?.network && (
            <div
              style={{
                background: data.network.allowed ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${data.network.allowed ? '#bbf7d0' : '#fecaca'}`,
                color: data.network.allowed ? '#15803d' : '#b91c1c',
                borderRadius: 12,
                padding: '0.65rem 0.95rem',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ fontWeight: 800 }}>
                {data.network.allowed ? '✓ Mạng WiFi VPĐ hợp lệ' : '⚠ Chưa đúng mạng WiFi VPĐ'}
              </div>
              <div style={{ opacity: 0.9, marginTop: 2, fontFamily: 'monospace' }}>
                IP hiện tại: {data.network.client_ip}
              </div>
            </div>
          )}
        </section>

        {/* Chấm công hôm nay */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ClockIcon size={18} color="#1d4ed8" />
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                Chấm công ca trực hôm nay ({data?.today_vn ? fmtDateVN(data.today_vn) : '—'})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => loadAll(weekAnchor || undefined)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
            >
              <RefreshIcon size={14} /> Làm mới
            </button>
          </div>

          {!data?.today_my_shifts?.length ? (
            <div style={{ padding: '1rem', borderRadius: 10, background: '#f8fafc', color: '#64748b', fontSize: '0.87rem' }}>
              Hôm nay bạn chưa có ca trực nào được đăng ký.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: '0.9rem' }}>
              {data.today_my_shifts.map((sh: any) => {
                const att = sh.attendance;
                const shiftLabel = sh.shift === 'morning' ? data.config.shifts.morning.label : data.config.shifts.afternoon.label;
                return (
                  <div
                    key={sh.id}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: 12,
                      padding: '1rem',
                      background: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.95rem' }}>{shiftLabel}</div>
                    <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                      Check-in: <strong>{fmtTimeVN(att?.check_in_at)}</strong> • Check-out: <strong>{fmtTimeVN(att?.check_out_at)}</strong>
                      {att?.worked_minutes > 0 && ` • ${att.worked_minutes} phút`}
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                      {!att?.check_in_at ? (
                        <button
                          type="button"
                          disabled={busyKey === `${sh.id}_check_in`}
                          onClick={() => handleAttendance(sh.id, 'check_in')}
                          style={{ padding: '0.55rem 1.05rem', borderRadius: 9, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          {busyKey === `${sh.id}_check_in` ? 'Đang xử lý...' : 'Check-in vào ca'}
                        </button>
                      ) : !att?.check_out_at ? (
                        <button
                          type="button"
                          disabled={busyKey === `${sh.id}_check_out`}
                          onClick={() => handleAttendance(sh.id, 'check_out')}
                          style={{ padding: '0.55rem 1.05rem', borderRadius: 9, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                        >
                          {busyKey === `${sh.id}_check_out` ? 'Đang xử lý...' : 'Check-out hết ca'}
                        </button>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#15803d', fontWeight: 800, fontSize: '0.84rem' }}>
                          <CheckCircleIcon size={16} color="#15803d" /> Đã hoàn thành ca trực
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Lịch trực tuần T2 -> T6 */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.2rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CalendarIcon size={18} color="#1d4ed8" />
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                Lịch Trực Tuần ({data?.workdays?.[0] ? `${fmtDateVN(data.workdays[0])} – ${fmtDateVN(data.workdays[4])}` : '...'})
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '0.45rem' }}>
              <button type="button" onClick={() => handleShiftChangeWeek(-7)} style={{ padding: '0.42rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                ← Tuần trước
              </button>
              <button type="button" onClick={() => { setWeekAnchor(''); loadAll(); }} style={{ padding: '0.42rem 0.75rem', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                Tuần này
              </button>
              <button type="button" onClick={() => handleShiftChangeWeek(7)} style={{ padding: '0.42rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                Tuần sau →
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Đang tải lịch trực...</div>
          ) : (
            <>
              <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: '#64748b' }}>
                Bấm vào ô <strong>Sáng / Chiều</strong> trên dòng của bạn (được tô xanh nhạt ở đầu bảng) để tick ✓ đăng ký hoặc bỏ chọn khi đợt đăng ký đang mở.
              </p>
              <DutyMatrixTable
                workdays={data?.workdays || []}
                todayVN={data?.today_vn}
                volunteers={data?.volunteers || []}
                registrations={data?.registrations || []}
                maxPerShift={maxPerShift}
                mode="volunteer"
                currentUserEmail={myEmail}
                openDates={data?.open_dates || []}
                busyKey={busyKey}
                onRegister={(_mssv, dutyDate, shift) => handleRegister(dutyDate, shift)}
                onCancel={handleCancel}
              />
            </>
          )}
        </section>

        {/* Lịch sử chấm công cá nhân */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
            <UsersIcon size={18} color="#1d4ed8" />
            <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              Lịch sử chấm công của bạn ({attendanceHistory.length} ca)
            </h2>
          </div>

          {attendanceHistory.length === 0 ? (
            <div style={{ padding: '1rem', borderRadius: 10, background: '#f8fafc', color: '#64748b', fontSize: '0.85rem' }}>
              Chưa có dữ liệu chấm công.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Ngày trực</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Ca</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Check-in</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Check-out</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Thời lượng</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceHistory.map((a) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>{fmtDateVN(a.duty_date)}</td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>{a.shift === 'morning' ? 'Ca Sáng' : 'Ca Chiều'}</td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>
                        {fmtTimeVN(a.check_in_at)}
                        {a.late_minutes > 0 && <span style={{ color: '#dc2626', fontSize: '0.75rem' }}> (trễ {a.late_minutes}p)</span>}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>{fmtTimeVN(a.check_out_at)}</td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: 700 }}>
                        {a.worked_minutes > 0 ? `${a.worked_minutes} phút` : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            background: a.status === 'completed' ? '#dcfce7' : '#fef3c7',
                            color: a.status === 'completed' ? '#15803d' : '#b45309',
                          }}
                        >
                          {a.status === 'completed' ? 'Hoàn thành' : 'Đang trực'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
