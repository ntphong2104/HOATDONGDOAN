'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { DownloadIcon } from '@/components/icons';
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

/**
 * Client-side SHA-256 using Web Crypto API (no server calls needed)
 */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a signed QR token locally using the clientKey from the server
 */
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
  clientKey,
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const displayName = studentName || name || studentId || value;

  const [currentToken, setCurrentToken] = useState<string>(value);
  const [expiresIn, setExpiresIn] = useState<number>(WINDOW_SECONDS);

  // Generate token client-side (zero API calls)
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

  // Initial + periodic refresh
  useEffect(() => {
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
  }, [refreshToken]);

  const progressPercent = (expiresIn / WINDOW_SECONDS) * 100;

  return (
    <div className={`${styles.card} ${className}`}>
      <div className={styles.header}>
        <h3 className={styles.name}>{displayName}</h3>
        {studentClass && <p className={styles.classInfo}>{studentClass}</p>}
      </div>
      
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

      {/* Timer bar — only show if using dynamic QR */}
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
      
      <div className={styles.footer}>
        <span className={styles.mssv}>{studentId || value}</span>
      </div>

      {/* Hide download button when using dynamic QR */}
      {!clientKey && (
        <button onClick={() => {
          if (!canvasRef.current) return;
          const canvas = canvasRef.current.querySelector('canvas');
          if (!canvas) return;
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = `QR_${value}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }} className={styles.downloadButton}>
          <DownloadIcon size={18} />
          Lưu ảnh QR
        </button>
      )}
    </div>
  );
}
