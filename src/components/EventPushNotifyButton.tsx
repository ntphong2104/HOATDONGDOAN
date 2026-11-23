'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ToastProvider';

interface EventPushNotifyButtonProps {
  eventId: string;
  eventName: string;
}

type EventAudience =
  | 'all_registered'
  | 'participants'
  | 'volunteers_accepted'
  | 'volunteers_pending'
  | 'not_checked_in'
  | 'checked_in';

const AUDIENCE_OPTIONS: Array<{ value: EventAudience; label: string; hint: string }> = [
  { value: 'all_registered', label: 'Tất cả người đã đăng ký', hint: 'Cả người tham gia và CTV' },
  { value: 'participants', label: 'Chỉ Người tham gia (Khán giả)', hint: 'Các bạn đăng ký tham dự' },
  { value: 'volunteers_accepted', label: 'Chỉ CTV đã chốt (trúng tuyển)', hint: 'CTV đã được duyệt vào ban' },
  { value: 'volunteers_pending', label: 'Chỉ CTV đang chờ duyệt', hint: 'Ứng viên CTV chưa chốt' },
  { value: 'not_checked_in', label: 'Người đã đăng ký nhưng CHƯA điểm danh', hint: 'Nhắc khẩn trước khi đóng cổng' },
  { value: 'checked_in', label: 'Người ĐÃ điểm danh', hint: 'Gửi khảo sát / cảm ơn sau sự kiện' },
];

export default function EventPushNotifyButton({ eventId, eventName }: EventPushNotifyButtonProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<EventAudience, number> | null>(null);
  const [audience, setAudience] = useState<EventAudience>('all_registered');
  const [title, setTitle] = useState(`📢 ${eventName}`);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setTitle(`📢 ${eventName}`);
    });
    return () => {
      cancelled = true;
    };
  }, [eventName]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/notify`, { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled && json.success && json.data?.counts) {
          setCounts(json.data.counts);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/events/${encodeURIComponent(eventId)}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience,
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        setBody('');
        setOpen(false);
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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: '0.35rem 0.85rem',
          borderRadius: '8px',
          border: '1.5px solid #bfdbfe',
          background: '#eff6ff',
          color: '#1d4ed8',
          fontWeight: 700,
          fontSize: '0.8rem',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
        }}
        title="Gửi thông báo đẩy về điện thoại cho CTV hoặc sinh viên của sự kiện này"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <span>Gửi thông báo</span>
      </button>

      {open && (
        <div
          onClick={() => !sending && setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.48)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            zIndex: 1500,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 500,
              background: '#ffffff',
              borderRadius: 16,
              padding: '1.35rem',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
              color: '#0f172a',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                Gửi thông báo đẩy theo sự kiện
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#475569',
                }}
              >
                ×
              </button>
            </div>

            <p style={{ margin: '0 0 1rem', fontSize: '0.82rem', color: '#64748b', lineHeight: 1.45 }}>
              Thông báo sẽ gửi trực tiếp tới màn hình khóa điện thoại của những sinh viên thuộc nhóm đã chọn (các bạn đã bật thông báo trên app).
            </p>

            <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Nhóm người nhận *
                </label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as EventAudience)}
                  style={{
                    width: '100%',
                    height: 38,
                    padding: '0 0.7rem',
                    borderRadius: 9,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontSize: '0.85rem',
                  }}
                >
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                      {counts ? ` (${counts[opt.value] || 0} SV)` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Tiêu đề thông báo *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    width: '100%',
                    height: 38,
                    padding: '0 0.75rem',
                    borderRadius: 9,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.86rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.77rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Nội dung thông báo *
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={320}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="VD: Các bạn CTV đã chốt vui lòng có mặt lúc 07:15 tại Hội trường A để họp phân công trước giờ đón khách!"
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: 9,
                    border: '1px solid #cbd5e1',
                    fontFamily: 'inherit',
                    fontSize: '0.86rem',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: '0.5rem 0.95rem',
                    borderRadius: 9,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontWeight: 700,
                    fontSize: '0.83rem',
                    cursor: 'pointer',
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  style={{
                    padding: '0.5rem 1.15rem',
                    borderRadius: 9,
                    border: 'none',
                    background: '#1d4ed8',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.83rem',
                    cursor: sending ? 'not-allowed' : 'pointer',
                  }}
                >
                  {sending ? 'Đang gửi...' : 'Gửi thông báo ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
