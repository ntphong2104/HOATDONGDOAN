'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/Header';
import { useToast } from '@/components/ToastProvider';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import {
  BuildingIcon,
  AlertTriangleIcon,
  RefreshIcon,
  SearchIcon,
} from '@/components/icons';
import styles from './page.module.css';

function fmtDateVN(d?: string | null): string {
  if (!d) return '—';
  if (d.includes('T')) {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  }
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function normalizeVN(val: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
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

  // Catalog filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Form state
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [basis, setBasis] = useState('');
  const [purpose, setPurpose] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [borrowDate, setBorrowDate] = useState(() => getVietnamDateString(0));
  const [dueDate, setDueDate] = useState(() => getVietnamDateString(0));
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

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
        if (rJson.data.default_requester_name) {
          setRequesterName((prev) => prev || rJson.data.default_requester_name);
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
      if (!cancelled) await loadData();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      if (it.category) set.add(String(it.category).trim());
    }
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = normalizeVN(searchQuery);
    return items.filter((it) => {
      if (selectedCategory !== 'ALL' && String(it.category || '').trim() !== selectedCategory) {
        return false;
      }
      if (q) {
        const hay = normalizeVN(`${it.name || ''} ${it.category || ''} ${it.condition_note || ''}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, selectedCategory]);

  const chosenItems = useMemo(() => {
    return items
      .filter((it) => (selectedQty[it.id] || 0) > 0)
      .map((it) => ({
        item_id: it.id,
        item_name: it.name,
        unit: it.unit || 'Cái',
        quantity: selectedQty[it.id],
      }));
  }, [items, selectedQty]);

  const totalSelectedUnits = useMemo(
    () => chosenItems.reduce((sum, it) => sum + it.quantity, 0),
    [chosenItems]
  );

  const adjustQty = (itemId: string, maxQty: number, delta: number) => {
    setSelectedQty((prev) => {
      const next = Math.max(0, Math.min(maxQty, (prev[itemId] || 0) + delta));
      if (next === 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (chosenItems.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 vật phẩm cần mượn từ danh sách bên trái.');
      return;
    }
    if (dueDate < borrowDate) {
      toast.error('Ngày hẹn trả không thể trước ngày mượn.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/office/equipment/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basis: basis.trim(),
          purpose: purpose.trim(),
          requester_name: requesterName || unit?.unit_name,
          requester_phone: requesterPhone,
          borrow_date: borrowDate,
          due_date: dueDate,
          items: chosenItems.map(({ item_id, item_name, quantity }) => ({
            item_id,
            item_name,
            quantity,
          })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        setSelectedQty({});
        setBasis('');
        setPurpose('');
        await loadData();
      } else {
        toast.error(json.error || 'Không thể gửi đơn mượn.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setSubmitting(false);
    }
  };

  if (forbidden) {
    return (
      <div className={styles.page}>
        <Header title="MƯỢN DỤNG CỤ VĂN PHÒNG ĐOÀN" />
        <main style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.25rem' }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <AlertTriangleIcon size={36} color="#f59e0b" />
            <h2 style={{ marginTop: '0.75rem', fontSize: '1.2rem' }}>Chức năng dành cho Đơn vị trực thuộc</h2>
            <p style={{ color: '#64748b', fontSize: '0.92rem' }}>
              Vui lòng đăng nhập bằng tài khoản Liên Chi Đoàn (LCĐ), Câu lạc bộ / Đội / Nhóm hoặc Ban tổ chức để gửi đơn mượn vật phẩm tại Văn phòng Đoàn.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Header title="MƯỢN DỤNG CỤ VĂN PHÒNG ĐOÀN" />
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroEyebrow}>
            Văn phòng Đoàn • {unit?.unit_name || 'Sinh viên & Đơn vị'}
          </div>
          <h1 className={styles.heroTitle}>Mượn Vật Phẩm &amp; Dụng Cụ</h1>
          <p className={styles.heroSub}>
            Mở cho toàn thể Sinh viên &amp; Đơn vị trực thuộc — vui lòng nêu rõ <strong>cơ sở mượn</strong> và chờ <strong>Văn phòng Đoàn phê duyệt</strong>. Lưu ý:{' '}
            <strong>Trả trễ từ 1 ngày trở lên sẽ tự động bị CẤM MƯỢN</strong>.
          </p>
        </section>

        {/* Cảnh báo cấm mượn */}
        {activeBan && (
          <div className={styles.banBanner}>
            <AlertTriangleIcon size={22} color="#dc2626" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                Đơn vị đang bị CẤM MƯỢN dụng cụ đến ngày {fmtDateVN(activeBan.banned_until)}
              </div>
              <div style={{ fontSize: '0.84rem', marginTop: 4 }}>
                Lý do: {activeBan.reason}. Vui lòng liên hệ trực tiếp Văn phòng Đoàn để giải quyết.
              </div>
            </div>
          </div>
        )}

        {/* Bố cục 2 cột: Trái = Kho vật phẩm, Phải = Phiếu mượn */}
        <div className={styles.borrowGrid}>
          {/* CỘT TRÁI: KHO VẬT PHẨM */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <BuildingIcon size={18} color="#1d4ed8" />
                <span>Kho vật phẩm Văn phòng Đoàn</span>
              </h2>
              <span className={styles.countPill}>
                {filteredItems.length}/{items.length} món
              </span>
            </div>

            <div className={styles.filterBar}>
              <div className={styles.searchWrap}>
                <span className={styles.searchIcon}>
                  <SearchIcon size={15} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm nhanh vật phẩm (VD: loa, micro, áo dài, standee...)"
                  className={styles.searchInput}
                />
              </div>

              {categories.length > 1 && (
                <div className={styles.chipRow}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('ALL')}
                    className={`${styles.chip} ${selectedCategory === 'ALL' ? styles.chipActive : ''}`}
                  >
                    Tất cả
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`${styles.chip} ${selectedCategory === cat ? styles.chipActive : ''}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                Đang tải danh sách kho...
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.86rem', background: '#f8fafc', borderRadius: 10 }}>
                Không tìm thấy vật phẩm phù hợp.
              </div>
            ) : (
              <div className={styles.itemList}>
                {filteredItems.map((it) => {
                  const qty = selectedQty[it.id] || 0;
                  const outOfStock = (it.available_qty || 0) <= 0;
                  const disabled = Boolean(activeBan) || outOfStock;

                  return (
                    <div
                      key={it.id}
                      className={`${styles.itemRow} ${qty > 0 ? styles.itemRowSelected : ''} ${outOfStock ? styles.itemRowOut : ''}`}
                    >
                      <div className={styles.itemInfo}>
                        <div className={styles.itemNameRow}>
                          <span className={styles.itemName}>{it.name}</span>
                          {it.category && <span className={styles.itemCat}>{it.category}</span>}
                        </div>
                        <div className={styles.itemMeta}>
                          {outOfStock ? (
                            <span className={styles.stockLow}>Hết hàng (0/{it.total_qty} {it.unit})</span>
                          ) : (
                            <>
                              Còn sẵn: <strong>{it.available_qty}/{it.total_qty}</strong> {it.unit}
                              {it.condition_note ? ` • ${it.condition_note}` : ''}
                            </>
                          )}
                        </div>
                      </div>

                      <div className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          disabled={disabled || qty <= 0}
                          onClick={() => adjustQty(it.id, it.available_qty, -1)}
                          aria-label={`Giảm số lượng ${it.name}`}
                        >
                          −
                        </button>
                        <span className={styles.stepperVal}>{qty}</span>
                        <button
                          type="button"
                          className={styles.stepperBtn}
                          disabled={disabled || qty >= it.available_qty}
                          onClick={() => adjustQty(it.id, it.available_qty, 1)}
                          aria-label={`Tăng số lượng ${it.name}`}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* CỘT PHẢI: PHIẾU MƯỢN STICKY */}
          <section className={`${styles.card} ${styles.stickyCard}`}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Phiếu mượn vật phẩm</h2>
              {chosenItems.length > 0 && (
                <span className={styles.countPill}>
                  {chosenItems.length} loại • {totalSelectedUnits} món
                </span>
              )}
            </div>

            {/* Tóm tắt danh sách đã chọn */}
            <div className={styles.selectedBox}>
              <div className={styles.selectedHeader}>
                <span className={styles.selectedLabel}>Vật phẩm đã chọn</span>
                {chosenItems.length > 0 && (
                  <button
                    type="button"
                    className={styles.clearBtn}
                    onClick={() => setSelectedQty({})}
                  >
                    Xóa tất cả
                  </button>
                )}
              </div>

              {chosenItems.length === 0 ? (
                <div className={styles.emptyCart}>
                  Chưa chọn vật phẩm nào. Bấm dấu <strong>+</strong> ở kho bên trái để thêm.
                </div>
              ) : (
                <div className={styles.selectedList}>
                  {chosenItems.map((it) => (
                    <div key={it.item_id} className={styles.selectedItem}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>
                        {it.item_name}{' '}
                        <strong style={{ color: '#1d4ed8' }}>
                          (x{it.quantity} {it.unit})
                        </strong>
                      </span>
                      <button
                        type="button"
                        className={styles.removeChipBtn}
                        onClick={() => adjustQty(it.item_id, 0, -it.quantity)}
                        title="Bỏ vật phẩm này"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className={styles.formStack}>
              <div>
                <label className={styles.fieldLabel}>Cơ sở mượn (Lớp / Hoạt động / Đơn vị xác nhận) *</label>
                <input
                  type="text"
                  required
                  value={basis}
                  onChange={(e) => setBasis(e.target.value)}
                  placeholder="VD: Lớp D23CQCN01-N, Đồ án môn học / Sự kiện CLB / Có BCH xác nhận"
                  className={styles.fieldInput}
                />
              </div>

              <div>
                <label className={styles.fieldLabel}>Mục đích / Tên chương trình *</label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="VD: Thuyết trình báo cáo, tổ chức giao lưu, hỗ trợ sự kiện..."
                  className={styles.fieldInput}
                />
              </div>

              <div className={styles.twoCol}>
                <div>
                  <label className={styles.fieldLabel}>Người đại diện nhận đồ *</label>
                  <input
                    type="text"
                    required
                    value={requesterName}
                    onChange={(e) => setRequesterName(e.target.value)}
                    placeholder="Họ tên SV phụ trách"
                    className={styles.fieldInput}
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel}>SĐT / Zalo liên hệ *</label>
                  <input
                    type="text"
                    required
                    value={requesterPhone}
                    onChange={(e) => setRequesterPhone(e.target.value)}
                    placeholder="09xxxxxxxx"
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.twoCol}>
                <div>
                  <label className={styles.fieldLabel}>Ngày mượn *</label>
                  <input
                    type="date"
                    required
                    value={borrowDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      setBorrowDate(next);
                      if (dueDate < next) setDueDate(next);
                    }}
                    className={styles.fieldInput}
                  />
                </div>
                <div>
                  <label className={styles.fieldLabel}>Ngày hẹn trả *</label>
                  <input
                    type="date"
                    required
                    min={borrowDate}
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || Boolean(activeBan) || chosenItems.length === 0}
                className={styles.submitBtn}
              >
                {submitting
                  ? 'Đang gửi đơn...'
                  : chosenItems.length > 0
                  ? `Gửi đơn mượn (${chosenItems.length} loại • ${totalSelectedUnits} món)`
                  : 'Chọn ít nhất 1 vật phẩm để gửi đơn'}
              </button>
            </form>
          </section>
        </div>

        {/* Danh sách đơn mượn của đơn vị */}
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>
              Lịch sử đơn mượn của bạn ({requests.length})
            </h2>
            <button
              type="button"
              onClick={loadData}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '0.38rem 0.75rem',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
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
