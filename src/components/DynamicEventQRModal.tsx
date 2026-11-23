'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CloseIcon, LockIcon, SpinnerIcon, QrCodeIcon, MapPinIcon } from '@/components/icons';
import type { ParticipateRole } from '@/lib/types';
import { getVietnamDateString, vnWallClockToUtcMs, formatVnHHMM } from '@/lib/utils/vn-date';
import styles from './DynamicEventQRModal.module.css';

interface DynamicEventQRModalProps {
  eventId: string;
  eventName: string;
  targetRole?: ParticipateRole;
  initialSessionId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function DynamicEventQRModal({
  eventId,
  eventName,
  targetRole = 'participant',
  initialSessionId,
  isOpen,
  onClose,
}: DynamicEventQRModalProps) {
  const [token, setToken] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(true);
  const [qrError, setQrError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('main');
  const [sessionTimeStatus, setSessionTimeStatus] = useState<{ status: 'open' | 'early' | 'late' | 'unknown'; message: string }>({ status: 'open', message: 'Đang mở điểm danh' });

  const roleLabel =
    targetRole === 'volunteer'
      ? 'Cộng tác viên (CTV)'
      : targetRole === 'organizer'
      ? 'Ban tổ chức (BTC)'
      : 'Người tham gia';

  const roleBadgeStyle =
    targetRole === 'volunteer'
      ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde047' }
      : targetRole === 'organizer'
      ? { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }
      : { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' };

  // Load sessions for this event
  useEffect(() => {
    if (!isOpen || !eventId) return;
    let cancelled = false;
    fetch(`/api/events/${eventId}/sessions`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res.success && Array.isArray(res.data?.sessions) && res.data.sessions.length > 0) {
          setSessions(res.data.sessions);
          const preferredSession = initialSessionId
            ? res.data.sessions.find((s: any) => s.id === initialSessionId)
            : null;
          // Try to find the session that matches today's date (Vietnam UTC+7)
          const todayStr = getVietnamDateString(0);
          const todaySession = res.data.sessions.find((s: any) => s.session_date === todayStr);
          if (preferredSession) {
            setSelectedSessionId(preferredSession.id);
          } else if (todaySession) {
            setSelectedSessionId(todaySession.id);
          } else {
            setSelectedSessionId(res.data.sessions[0].id);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, eventId, initialSessionId]);

  // Check time status for selected session (re-evaluated every 30s while open)
  useEffect(() => {
    let cancelled = false;
    if (!selectedSessionId || sessions.length === 0) return;
    const currentSess = sessions.find((s) => s.id === selectedSessionId);

    const evaluateTimeStatus = () => {
      if (cancelled) return;
      if (!currentSess || !currentSess.session_date) {
        setSessionTimeStatus({ status: 'open', message: 'Đang mở điểm danh' });
        return;
      }

      try {
        const nowMs = Date.now();
        const sessDateStr = currentSess.session_date;
        const startTimeStr = currentSess.start_time || '07:30';
        const endTimeStr = currentSess.end_time || '11:30';

        const startMs = vnWallClockToUtcMs(sessDateStr, startTimeStr);
        const endMs = vnWallClockToUtcMs(sessDateStr, endTimeStr);
        if (startMs === null || endMs === null) {
          setSessionTimeStatus({ status: 'open', message: 'Đang mở điểm danh' });
          return;
        }

        const openCheckinMs = startMs - 15 * 60 * 1000; // 15m early
        const closeCheckinMs = endMs + 60 * 60 * 1000; // 1h late

        if (nowMs < openCheckinMs) {
          const earlyHHMM = formatVnHHMM(openCheckinMs);
          setSessionTimeStatus({
            status: 'early',
            message: `Chưa đến giờ điểm danh (Cổng mở lúc ${earlyHHMM})`,
          });
        } else if (nowMs > closeCheckinMs) {
          setSessionTimeStatus({
            status: 'late',
            message: `Đã quá hạn điểm danh (Kết thúc lúc ${endTimeStr})`,
          });
        } else {
          setSessionTimeStatus({
            status: 'open',
            message: `Đang trong khung giờ điểm danh (${startTimeStr} - ${endTimeStr})`,
          });
        }
      } catch {
        setSessionTimeStatus({ status: 'open', message: 'Đang mở điểm danh' });
      }
    };

    queueMicrotask(evaluateTimeStatus);
    const statusInterval = setInterval(evaluateTimeStatus, 30_000);
    return () => {
      cancelled = true;
      clearInterval(statusInterval);
    };
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    if (!isOpen || !eventId) return;

    let isSubscribed = true;
    let isFetching = false;
    let nextRefreshAt = 0;

    const fetchToken = async () => {
      if (isFetching || !isSubscribed) return;
      isFetching = true;
      try {
        const res = await fetch(
          `/api/events/${eventId}/dynamic-qr?role=${targetRole}&session_id=${selectedSessionId}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => ({}));
        if (!isSubscribed) return;
        if (res.ok && data.success && data.data?.token) {
          const expSec = Math.max(1, Number(data.data.expiresInSeconds) || 10);
          setToken(data.data.token);
          setQrError(null);
          // Add 150ms buffer so the next fetch always lands squarely inside the new 10s server window
          nextRefreshAt = Date.now() + expSec * 1000 + 150;
          setSecondsLeft(expSec);
          setLoading(false);
        } else {
          setQrError(data?.error || 'Không thể tải mã QR điểm danh. Đang tự động thử lại...');
          setLoading(false);
          nextRefreshAt = Date.now() + 3000;
        }
      } catch (err) {
        console.error('Failed to fetch dynamic QR token', err);
        if (isSubscribed) {
          setQrError('Mất kết nối máy chủ. Đang tự động thử lại...');
          setLoading(false);
        }
        // Retry cleanly in 2s if network hiccupped
        nextRefreshAt = Date.now() + 2000;
      } finally {
        isFetching = false;
      }
    };

    // Initial fetch — clear stale token from previous session immediately
    queueMicrotask(() => {
      if (!isSubscribed) return;
      setToken('');
      setQrError(null);
      setLoading(true);
      void fetchToken();
    });

    // Sync countdown directly to wall-clock target (250ms tick = zero drift, exact QR flip)
    const intervalId = setInterval(() => {
      if (!isSubscribed || !nextRefreshAt) return;
      const remainingMs = nextRefreshAt - Date.now();
      if (remainingMs <= 0) {
        setSecondsLeft(1);
        fetchToken();
      } else {
        setSecondsLeft(Math.min(10, Math.max(1, Math.ceil(remainingMs / 1000))));
      }
    }, 250);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [isOpen, eventId, targetRole, selectedSessionId]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h3 className={styles.modalTitle}>Mã QR Điểm Danh Động</h3>
            <p className={styles.modalSubtitle}>Chiếu màn hình / máy chiếu để sinh viên tự quét</p>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton} title="Đóng">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <h2 className={styles.eventName}>{eventName}</h2>

          {/* Session Selector & Time Status */}
          {sessions.length > 0 && (
            <div style={{
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '12px',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              width: '100%',
              maxWidth: '440px',
              minWidth: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: 0 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <MapPinIcon size={14} /> Chọn Buổi / Ca Điểm Danh:
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    minWidth: 0,
                    padding: '0.42rem 0.65rem',
                    borderRadius: '8px',
                    border: '1.5px solid #cbd5e1',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.session_date ? `(${s.session_date})` : ''} {s.start_time ? `[${s.start_time} - ${s.end_time}]` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{
                fontSize: '0.775rem',
                fontWeight: 700,
                color: sessionTimeStatus.status === 'open' ? '#166534' : sessionTimeStatus.status === 'early' ? '#b45309' : '#991b1b',
                background: sessionTimeStatus.status === 'open' ? '#f0fdf4' : sessionTimeStatus.status === 'early' ? '#fffbeb' : '#fef2f2',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                border: `1px solid ${sessionTimeStatus.status === 'open' ? '#bbf7d0' : sessionTimeStatus.status === 'early' ? '#fde68a' : '#fecaca'}`,
              }}>
                {sessionTimeStatus.message}
              </div>
            </div>
          )}

          {/* Huy hiệu vai trò cố định (Không có nút bấm thao tác trên màn hình chiếu) */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.4rem 1.25rem',
              borderRadius: '30px',
              fontSize: '0.925rem',
              fontWeight: 800,
              marginBottom: '1.25rem',
              ...roleBadgeStyle,
            }}
          >
            <span>Điểm danh vai trò: {roleLabel}</span>
          </div>

          <div className={styles.timerBar}>
            <div className={styles.pulseDot} />
            <span className={styles.timerText}>
              Đổi mã sau: <span className={styles.timerCountdown}>{secondsLeft}s</span>
            </span>
          </div>

          <div className={styles.qrCard}>
            {qrError && !token ? (
              <div style={{ padding: '2.5rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', textAlign: 'center' }}>
                <span style={{ color: '#b91c1c', fontWeight: 700, fontSize: '0.92rem' }}>{qrError}</span>
                <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Hệ thống sẽ tự động kết nối lại sau vài giây...</span>
              </div>
            ) : loading || !token ? (
              <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                <SpinnerIcon size={36} color="#2563eb" />
                <span style={{ color: '#64748b', fontSize: '0.9rem' }}>Đang tạo mã QR động...</span>
              </div>
            ) : (
              <QRCodeSVG
                value={token}
                size={300}
                level="M"
                includeMargin={true}
              />
            )}
          </div>

          <div className={styles.antiFraudBadge}>
            <LockIcon size={16} color="#16a34a" />
            <span>Mã bảo mật chống gian lận — Tự động đổi mới mỗi 10 giây</span>
          </div>

          <div className={styles.instructions} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
            <QrCodeIcon size={16} color="#2563eb" />
            <span>
              Sinh viên mở ứng dụng ➔ Bấm <strong>&quot;Quét mã sự kiện&quot;</strong> để ghi nhận vai trò <strong>{roleLabel}</strong>.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
