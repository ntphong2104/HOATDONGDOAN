'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { QrCodeIcon } from '@/components/icons';
import styles from './QRCodeDisplay.module.css';

const WINDOW_SECONDS = 30;

interface QRCodeDisplayProps {
  value: string;
  studentName?: string;
  name?: string;
  studentId?: string;
  studentClass?: string;
  className?: string;
  size?: number;
  clientKey?: string;
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function generateLocalToken(mssv: string, clientKey: string): Promise<{
  token: string;
  expiresIn: number;
}> {
  const nowSec = Math.floor(Date.now() / 1000);
  const currentWindow = Math.floor(nowSec / WINDOW_SECONDS);
  const data = `${mssv}:${currentWindow}:${clientKey}`;
  const hash = await sha256Hex(data);
  const signature = hash.substring(0, 12);
  const token = `${mssv}:${currentWindow}:${signature}`;
  const expiresIn = WINDOW_SECONDS - (nowSec % WINDOW_SECONDS);
  return { token, expiresIn };
}

export default function QRCodeDisplay({
  value,
  studentName,
  name,
  studentId,
  studentClass,
  className = '',
  size = 256,
  clientKey: initialClientKey,
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const displayName = studentName || name || studentId || value;

  // States
  const [activated, setActivated] = useState(false);
  const [clientKey, setClientKey] = useState<string | null>(initialClientKey || null);
  const [currentToken, setCurrentToken] = useState<string>(value);
  const [expiresIn, setExpiresIn] = useState<number>(WINDOW_SECONDS);
  const [loading, setLoading] = useState(false);

  // Fetch clientKey from API (one-time, when button pressed)
  const activateQR = useCallback(async () => {
    if (clientKey) {
      setActivated(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/me/qr-token');
      const data = await res.json();
      if (data.success && data.clientKey) {
        setClientKey(data.clientKey);
        setActivated(true);
      }
    } catch {
      // Fallback: show static QR
      setActivated(true);
    } finally {
      setLoading(false);
    }
  }, [clientKey]);

  // Generate token client-side
  const refreshToken = useCallback(async () => {
    if (!clientKey) {
      setCurrentToken(value);
      return;
    }
    try {
      const { token, expiresIn: exp } = await generateLocalToken(value, clientKey);
      setCurrentToken(token);
      setExpiresIn(exp);
    } catch {
      setCurrentToken(value);
    }
  }, [value, clientKey]);

  // Rotate every second when activated
  useEffect(() => {
    if (!activated || !clientKey) return;

    refreshToken();
    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          refreshToken();
          return WINDOW_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activated, clientKey, refreshToken]);

  const progressPercent = (expiresIn / WINDOW_SECONDS) * 100;

  return (
    <div className={`${styles.card} ${className}`}>
      <div className={styles.header}>
        <h3 className={styles.name}>{displayName}</h3>
        {studentClass && <p className={styles.classInfo}>{studentClass}</p>}
      </div>

      {!activated ? (
        /* ═══ INACTIVE STATE: Blurred QR + Button ═══ */
        <div style={{ position: 'relative' }}>
          <div className={styles.qrContainer} style={{ filter: 'blur(12px)', opacity: 0.3, pointerEvents: 'none' }}>
            <QRCodeSVG value={value} size={size} level="M" includeMargin={false} className={styles.qrCode} />
          </div>
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
          }}>
            <button
              onClick={activateQR}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.5rem',
                borderRadius: '14px',
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                color: '#ffffff',
                fontSize: '0.95rem',
                fontWeight: 800,
                cursor: loading ? 'wait' : 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
            >
              <QrCodeIcon size={22} color="#ffffff" />
              {loading ? 'Đang tạo...' : 'Mã QR Của Tôi'}
            </button>
            <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
              Bấm để hiện mã QR điểm danh
            </span>
          </div>
        </div>
      ) : (
        /* ═══ ACTIVE STATE: Dynamic QR ═══ */
        <>
          <div className={styles.qrContainer}>
            <QRCodeSVG
              value={currentToken}
              size={size}
              level="M"
              includeMargin={false}
              className={styles.qrCode}
            />
            <div ref={canvasRef} style={{ display: 'none' }}>
              <QRCodeCanvas value={currentToken} size={1024} level="M" />
            </div>
          </div>

          {clientKey && (
            <>
              <div style={{
                width: '100%',
                height: '4px',
                background: '#e2e8f0',
                borderRadius: '2px',
                overflow: 'hidden',
                margin: '0.35rem 0',
              }}>
                <div style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: progressPercent > 30 ? '#22c55e' : progressPercent > 10 ? '#f59e0b' : '#ef4444',
                  borderRadius: '2px',
                  transition: 'width 1s linear, background 0.5s ease',
                }} />
              </div>
              <p style={{
                margin: '0 0 0.25rem',
                fontSize: '0.7rem',
                color: '#94a3b8',
                textAlign: 'center',
                fontWeight: 600,
              }}>
                🔄 Mã QR tự đổi mỗi 30s • Ảnh chụp sẽ hết hạn
              </p>
            </>
          )}
        </>
      )}

      <div className={styles.footer}>
        <span className={styles.mssv}>{studentId || value}</span>
      </div>
    </div>
  );
}
