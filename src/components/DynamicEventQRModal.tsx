'use client';

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CloseIcon, LockIcon, SpinnerIcon } from '@/components/icons';
import type { ParticipateRole } from '@/lib/types';
import styles from './DynamicEventQRModal.module.css';

interface DynamicEventQRModalProps {
  eventId: string;
  eventName: string;
  targetRole?: ParticipateRole;
  isOpen: boolean;
  onClose: () => void;
}

export default function DynamicEventQRModal({
  eventId,
  eventName,
  targetRole = 'participant',
  isOpen,
  onClose,
}: DynamicEventQRModalProps) {
  const [token, setToken] = useState<string>('');
  const [secondsLeft, setSecondsLeft] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(true);

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

  useEffect(() => {
    if (!isOpen || !eventId) return;

    let intervalId: NodeJS.Timeout;
    let isSubscribed = true;

    const fetchToken = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/dynamic-qr?role=${targetRole}`);
        const data = await res.json();
        if (data.success && isSubscribed) {
          setToken(data.data.token);
          setSecondsLeft(data.data.expiresInSeconds || 10);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to fetch dynamic QR token', err);
      }
    };

    // Initial fetch
    setLoading(true);
    fetchToken();

    // 1-second countdown ticker
    intervalId = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchToken();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [isOpen, eventId, targetRole]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h3 className={styles.modalTitle}>Mã QR Điểm Danh Động</h3>
            <p className={styles.modalSubtitle}>Chiếu màn hình / máy chiếu để sinh viên tự quét</p>
          </div>
          <button onClick={onClose} className={styles.closeButton} title="Đóng">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className={styles.body}>
          <h2 className={styles.eventName}>{eventName}</h2>

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
            {loading || !token ? (
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

          <div className={styles.instructions}>
            📱 Sinh viên mở ứng dụng ➔ Bấm <strong>"Quét mã sự kiện"</strong> để ghi nhận vai trò <strong>{roleLabel}</strong>.
          </div>
        </div>
      </div>
    </div>
  );
}
