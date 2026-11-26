'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { QrCodeIcon } from '@/components/icons';
import styles from './QRCodeDisplay.module.css';

const WINDOW_SECONDS = 10;

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

// Pure-JS SHA-256 fallback for non-HTTPS contexts (e.g., LAN HTTP or older WebViews) where crypto.subtle is unavailable
function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) {
    const j = ascii.charCodeAt(i);
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

async function sha256Hex(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return sha256Fallback(data);
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
      const { token, expiresIn: exp } = await generateLocalToken(value, clientKey);
      setCurrentToken(token);
      setExpiresIn(exp);
      setActivated(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/me/qr-token', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.success && data?.clientKey) {
        setClientKey(data.clientKey);
        const { token, expiresIn: exp } = await generateLocalToken(value, data.clientKey);
        setCurrentToken(token);
        setExpiresIn(exp);
      }
      setActivated(true);
    } catch {
      // Fallback: show static QR
      setActivated(true);
    } finally {
      setLoading(false);
    }
  }, [clientKey, value]);

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

  // Rotate cleanly based on wall-clock 30s window when activated
  useEffect(() => {
    if (!activated || !clientKey) return;

    let lastWindow = -1;
    const syncToken = () => {
      const nowSec = Math.floor(Date.now() / 1000);
      const currentWindow = Math.floor(nowSec / WINDOW_SECONDS);
      setExpiresIn(WINDOW_SECONDS - (nowSec % WINDOW_SECONDS));
      if (currentWindow !== lastWindow) {
        lastWindow = currentWindow;
        refreshToken();
      }
    };

    syncToken();
    const interval = setInterval(syncToken, 1000);
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
            <QRCodeSVG
              value={value}
              size={size}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
              className={styles.qrCode}
            />
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
              className={styles.activateBtn}
            >
              <QrCodeIcon size={18} color="#ffffff" />
              {loading ? 'Đang tạo...' : 'Hiện mã QR điểm danh'}
            </button>
            <span className={styles.activateHint}>
              Mã động tự đổi mỗi 10 giây
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
              bgColor="#ffffff"
              fgColor="#000000"
              className={styles.qrCode}
            />
            <div ref={canvasRef} style={{ display: 'none' }}>
              <QRCodeCanvas value={currentToken} size={1024} level="M" bgColor="#ffffff" fgColor="#000000" />
            </div>
          </div>

          {clientKey && (
            <div style={{ width: '100%', maxWidth: 220, marginTop: '0.15rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                <span>Mã động bảo mật</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: expiresIn <= 3 ? 'var(--status-red-text)' : 'var(--text-brand)', fontWeight: 700 }}>
                  Đổi sau {expiresIn}s
                </span>
              </div>
              <div style={{ width: '100%', height: 4, borderRadius: 999, background: 'var(--border-color)', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: expiresIn <= 3 ? '#ef4444' : '#2563eb',
                    transition: 'width 0.9s linear',
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}

      <div className={styles.footer}>
        <span className={styles.mssv}>{studentId || value}</span>
      </div>
    </div>
  );
}
