'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import {
  BuildingIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  RefreshIcon,
} from '@/components/icons';

function fmtDateVN(d?: string | null): string {
  if (!d) return '—';
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Chờ duyệt', bg: '#fef3c7', color: '#b45309' },
  approved: { label: 'Đã duyệt (chờ nhận)', bg: '#dbeafe', color: '#1d4ed8' },
  borrowed: { label: 'Đang mượn', bg: '#ede9fe', color: '#6d28d9' },
  returned: { label: 'Đã trả', bg: '#dcfce7', color: '#15803d' },
  rejected: { label: 'Từ chối', bg: '#fee2e2', color: '#b91c1c' },
};

export default function OfficeBorrowPage() {
  const [items, setItems] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [unit, setUnit] = useState<{ unit_code: string; unit_name: string } | null>(null);
  const [activeBan, setActiveBan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Form state
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [purpose, setPurpose] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [borrowDate, setBorrowDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, rRes] = await Promise.all([
        fetch('/api/office/equipment/items', { cache: 'no-store' }),
        fetch('/api/office/equipment/requests', { cache: 'no-store' }),
      ]);
      if (rRes.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const iJson = await iRes.json();
      const rJson = await rRes.json();
      if (iJson.success && Array.isArray(iJson.data)) setItems(iJson.data);
      if (rJson.success && rJson.data) {
        setRequests(rJson.data.requests || []);
        setUnit(rJson.data.unit || null);
        setActiveBan(rJson.data.my_active_ban || null);
      }
    } catch {
      setToast({ type: 'error', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chosenItems = items
      .filter((it) => (selectedQty[it.id] || 0) > 0)
      .map((it) => ({
        item_id: it.id,
        item_name: it.name,
        quantity: selectedQty[it.id],
      }));

    if (chosenItems.length === 0) {
      setToast({ type: 'error', text: 'Vui lòng chọn số lượng cho ít nhất 1 vật phẩm cần mượn.' });
      return;
    }

    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch('/api/office/equipment/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose,
          requester_name: requesterName || unit?.unit_name,
          requester_phone: requesterPhone,
          borrow_date: borrowDate,
          due_date: dueDate,
          items: chosenItems,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setToast({ type: 'success', text: json.message });
        setSelectedQty({});
        setPurpose('');
        await loadData();
      } else {
        setToast({ type: 'error', text: json.error || 'Không thể gửi đơn mượn.' });
      }
    } catch {
      setToast({ type: 'error', text: 'Lỗi kết nối máy chủ.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (forbidden) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Header title="MƯỢN DỤNG CỤ VĂN PHÒNG ĐOÀN" />
        <main style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.25rem' }}>
          <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <AlertTriangleIcon size={36} color="#dc2626" />
            <h2 style={{ marginTop: '0.75rem', color: '#0f172a' }}>Chỉ dành cho tài khoản Đơn vị (LCĐ / CLB / Đội)</h2>
            <p style={{ color: '#64748b', fontSize: '0.92rem' }}>
              Vui lòng đăng nhập bằng tài khoản Liên Chi Đoàn hoặc CLB/Đội trực thuộc để tạo đơn mượn vật phẩm từ Văn phòng Đoàn.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header title="MƯỢN DỤNG CỤ VĂN PHÒNG ĐOÀN" />
      <main style={{ maxWidth: 1120, margin: '0 auto', padding: '1.5rem 1.25rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Hero */}
        <section
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
            borderRadius: 18,
            padding: '1.4rem 1.6rem',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#bfdbfe' }}>
            Văn phòng Đoàn • {unit?.unit_name || 'Đơn vị trực thuộc'}
          </div>
          <h1 style={{ margin: '0.25rem 0', fontSize: '1.45rem', fontWeight: 800 }}>
            Tạo Đơn Mượn Vật Phẩm &amp; Dụng Cụ
          </h1>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#dbeafe' }}>
            Sau khi trả vật phẩm, Admin Văn phòng Đoàn sẽ xác nhận trên hệ thống. Lưu ý: <strong>Trả trễ từ 1 ngày trở lên sẽ tự động bị đánh dấu CẤM MƯỢN</strong>.
          </p>
        </section>

        {/* Cảnh báo cấm mượn */}
        {activeBan && (
          <div
            style={{
              background: '#fef2f2',
              border: '1.5px solid #ef4444',
              borderRadius: 14,
              padding: '1rem 1.2rem',
              color: '#991b1b',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
            }}
          >
            <AlertTriangleIcon size={22} color="#dc2626" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.96rem' }}>
                Đơn vị đang bị CẤM MƯỢN dụng cụ đến ngày {fmtDateVN(activeBan.banned_until)}
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                Lý do: {activeBan.reason}. Vui lòng liên hệ trực tiếp Văn phòng Đoàn để giải quyết.
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div
            style={{
              padding: '0.8rem 1rem',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: '0.87rem',
              background: toast.type === 'success' ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${toast.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
              color: toast.type === 'success' ? '#15803d' : '#b91c1c',
            }}
          >
            {toast.text}
          </div>
        )}

        {/* Form tạo đơn mượn */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem' }}>
          <h2 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BuildingIcon size={18} color="#1d4ed8" /> Chọn vật phẩm &amp; thông tin mượn
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {items.map((it) => {
                const qty = selectedQty[it.id] || 0;
                return (
                  <div
                    key={it.id}
                    style={{
                      border: qty > 0 ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      background: qty > 0 ? '#eff6ff' : '#f8fafc',
                      borderRadius: 12,
                      padding: '0.8rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{it.category}</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem', marginTop: 2 }}>{it.name}</div>
                      <div style={{ fontSize: '0.77rem', color: '#475569', marginTop: 2 }}>
                        Còn sẵn: <strong>{it.available_qty}/{it.total_qty}</strong> {it.unit}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>SL mượn:</span>
                      <input
                        type="number"
                        min={0}
                        max={it.available_qty}
                        value={qty}
                        disabled={Boolean(activeBan) || it.available_qty <= 0}
                        onChange={(e) =>
                          setSelectedQty((prev) => ({
                            ...prev,
                            [it.id]: Math.max(0, Math.min(it.available_qty, Number(e.target.value) || 0)),
                          }))
                        }
                        style={{ width: 68, height: 32, padding: '0 0.5rem', borderRadius: 7, border: '1px solid #cbd5e1', fontWeight: 700, background: '#fff' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.8rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Mục đích / Tên sự kiện *</label>
                <input type="text" required value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="VD: Hội thảo khoa CNTT" style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Người đại diện nhận đồ *</label>
                <input type="text" required value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Họ tên sinh viên phụ trách" style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>SĐT / Zalo liên hệ *</label>
                <input type="text" required value={requesterPhone} onChange={(e) => setRequesterPhone(e.target.value)} placeholder="09xxxxxxxx" style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Ngày mượn *</label>
                <input type="date" required value={borrowDate} onChange={(e) => setBorrowDate(e.target.value)} style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Ngày hẹn trả *</label>
                <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={submitting || Boolean(activeBan)}
                style={{
                  padding: '0.62rem 1.35rem',
                  borderRadius: 10,
                  border: 'none',
                  background: activeBan ? '#94a3b8' : '#1d4ed8',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: activeBan ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Đang gửi đơn...' : 'Gửi đơn mượn vật phẩm'}
              </button>
            </div>
          </form>
        </section>

        {/* Danh sách đơn mượn của đơn vị */}
        <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              Đơn mượn dụng cụ của đơn vị ({requests.length})
            </h2>
            <button type="button" onClick={loadData} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.38rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
              <RefreshIcon size={14} /> Làm mới
            </button>
          </div>

          {loading ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b' }}>Đang tải...</div>
          ) : requests.length === 0 ? (
            <div style={{ padding: '1.25rem', borderRadius: 10, background: '#f8fafc', color: '#64748b', fontSize: '0.86rem' }}>
              Đơn vị chưa có đơn mượn vật phẩm nào.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0.68rem 0.85rem', textAlign: 'left' }}>Mục đích / Sự kiện</th>
                    <th style={{ padding: '0.68rem 0.85rem', textAlign: 'left' }}>Vật phẩm mượn</th>
                    <th style={{ padding: '0.68rem 0.85rem', textAlign: 'left' }}>Thời gian</th>
                    <th style={{ padding: '0.68rem 0.85rem', textAlign: 'center' }}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.pending;
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.purpose}</div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                            Người nhận: {r.requester_name} {r.requester_phone ? `• ${r.requester_phone}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '0.7rem 0.85rem' }}>
                          {(r.items || []).map((it: any, idx: number) => (
                            <div key={idx} style={{ fontSize: '0.81rem' }}>
                              • {it.item_name} <strong>(x{it.quantity})</strong>
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: '0.7rem 0.85rem', whiteSpace: 'nowrap' }}>
                          <div>Mượn: {fmtDateVN(r.borrow_date)}</div>
                          <div>Hạn trả: <strong>{fmtDateVN(r.due_date)}</strong></div>
                          {r.current_overdue_days > 0 && r.status === 'borrowed' && (
                            <div style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.76rem' }}>
                              ⚠ Quá hạn {r.current_overdue_days} ngày!
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.7rem 0.85rem', textAlign: 'center' }}>
                          <span style={{ padding: '3px 9px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 800, background: badge.bg, color: badge.color }}>
                            {badge.label}
                          </span>
                          {r.late_days > 0 && r.status === 'returned' && (
                            <div style={{ color: '#dc2626', fontSize: '0.73rem', fontWeight: 700, marginTop: 3 }}>
                              Trả trễ {r.late_days} ngày
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
