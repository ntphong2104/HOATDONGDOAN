'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LCD_DEFINITIONS } from '@/lib/utils/lcd';
import { useToast } from '@/components/ToastProvider';
import { RefreshIcon } from '@/components/icons';

export default function PushBroadcastManager() {
  const toast = useToast();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [targetType, setTargetType] = useState<'all' | 'lcd' | 'event'>('all');
  const [targetValue, setTargetValue] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('/events');

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/push/broadcast', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
      }
    } catch {
      // Ignore silent load errors if migration not yet applied
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (!cancelled) await loadStats();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadStats]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || sending) return;
    if (targetType === 'lcd' && !targetValue) {
      toast.error('Vui lòng chọn Liên Chi Đoàn.');
      return;
    }
    if (targetType === 'event' && !targetValue) {
      toast.error('Vui lòng chọn sự kiện.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/admin/push/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || '/',
          target_type: targetType,
          target_value: targetValue,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        setTitle('');
        setBody('');
        loadStats();
      } else {
        toast.error(json.error || 'Không thể gửi thông báo.');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '1.35rem',
        marginTop: '1.25rem',
        boxShadow: '0 2px 10px rgba(15, 23, 42, 0.03)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
            Gửi Thông Báo Đẩy (Web Push — iPhone / Android / Máy tính)
          </h3>
          <p style={{ margin: '0.28rem 0 0', fontSize: '0.83rem', color: '#64748b' }}>
            Gửi thông báo trực tiếp tới màn hình khóa của đoàn viên, LCĐ hoặc danh sách SV đã đăng ký sự kiện.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStats}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '0.42rem 0.8rem',
            borderRadius: 9,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            fontSize: '0.8rem',
            fontWeight: 700,
            color: '#334155',
            cursor: 'pointer',
          }}
        >
          <RefreshIcon size={14} /> Làm mới
        </button>
      </div>

      {/* Live device counters */}
      {stats && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.65rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af' }}>THIẾT BỊ ĐANG BẬT</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1d4ed8' }}>{stats.totalActiveDevices || 0}</div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534' }}>TÀI KHOẢN</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#15803d' }}>{stats.uniqueUsers || 0}</div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>IPHONE / ANDROID / PC</div>
            <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {stats.byDevice?.ios_pwa || 0} / {stats.byDevice?.android || 0} / {stats.byDevice?.desktop || 0}
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Form */}
      <form onSubmit={handleBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Đối tượng nhận
            </label>
            <select
              value={targetType}
              onChange={(e) => {
                setTargetType(e.target.value as 'all' | 'lcd' | 'event');
                setTargetValue('');
              }}
              style={{ width: '100%', height: 38, padding: '0 0.7rem', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff' }}
            >
              <option value="all">Toàn bộ thiết bị đã bật thông báo</option>
              <option value="lcd">Theo 1 trong 8 Liên Chi Đoàn</option>
              <option value="event">Sinh viên đã đăng ký 1 sự kiện</option>
            </select>
          </div>

          {targetType === 'lcd' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Chọn Liên Chi Đoàn *
              </label>
              <select
                required
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                style={{ width: '100%', height: 38, padding: '0 0.7rem', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="">-- Chọn LCĐ --</option>
                {LCD_DEFINITIONS.map((lcd) => (
                  <option key={lcd.code} value={lcd.code}>
                    {lcd.shortName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'event' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                Chọn Sự kiện đang mở *
              </label>
              <select
                required
                value={targetValue}
                onChange={(e) => {
                  const evId = e.target.value;
                  setTargetValue(evId);
                  if (evId) setUrl(`/events/${evId}/register`);
                }}
                style={{ width: '100%', height: 38, padding: '0 0.7rem', borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff' }}
              >
                <option value="">-- Chọn sự kiện --</option>
                {(stats?.activeEvents || []).map((ev: any) => (
                  <option key={ev.event_id} value={ev.event_id}>
                    {ev.event_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Đường dẫn khi bấm vào thông báo
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/events"
              style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 9, border: '1px solid #cbd5e1' }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
            Tiêu đề thông báo *
          </label>
          <input
            type="text"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Nhắc lịch điểm danh sự kiện tối nay lúc 18:00"
            style={{ width: '100%', height: 38, padding: '0 0.75rem', borderRadius: 9, border: '1px solid #cbd5e1' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
            Nội dung thông báo *
          </label>
          <textarea
            required
            rows={2}
            maxLength={320}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="VD: Các bạn sinh viên đã đăng ký vui lòng có mặt trước 15 phút và mở sẵn mã QR cá nhân."
            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: 9, border: '1px solid #cbd5e1', fontFamily: 'inherit', fontSize: '0.86rem' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={sending}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: 10,
              border: 'none',
              background: '#1d4ed8',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: sending ? 'not-allowed' : 'pointer',
            }}
          >
            {sending ? 'Đang gửi thông báo...' : 'Gửi thông báo ngay'}
          </button>
        </div>
      </form>

      {/* Recent Broadcast Logs */}
      {Array.isArray(stats?.recentLogs) && stats.recentLogs.length > 0 && (
        <div style={{ marginTop: '1.15rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.9rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#475569', marginBottom: '0.5rem' }}>
            Lịch sử gửi gần đây
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {stats.recentLogs.slice(0, 5).map((log: any) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 9,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <strong style={{ color: '#0f172a' }}>{log.title}</strong>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{log.body}</div>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803d', whiteSpace: 'nowrap' }}>
                  ✓ {log.delivered_count}/{log.total_targets} thiết bị
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
