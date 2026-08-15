'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraFlipIcon } from '@/components/icons';
import styles from './QRScanner.module.css';

interface QRScannerProps {
  onScan?: (mssv: string) => void;
  onScanSuccess?: (mssv: string) => void;
  isPaused?: boolean;
}

export default function QRScanner({ onScan, onScanSuccess, isPaused = false }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraError, setHasCameraError] = useState(false);
  const scanCallback = onScanSuccess || onScan;

  useEffect(() => {
    let isMounted = true;
    const scannerId = 'qr-reader-viewport';

    const startScanner = async () => {
      try {
        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(scannerId);
        }

        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        };

        await scannerRef.current.start(
          { facingMode },
          config,
          (decodedText) => {
            if (!isPaused && scanCallback) {
              scanCallback(decodedText);
            }
          },
          undefined
        );
      } catch (err) {
        if (isMounted) {
          console.error('Failed to start scanner:', err);
          setHasCameraError(true);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [facingMode, isPaused, scanCallback]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className={styles.scannerContainer}>
      <div id="qr-reader-viewport" className={styles.viewport}></div>

      <div className={styles.overlayFrame}>
        <div className={`${styles.corner} ${styles.topLeft}`}></div>
        <div className={`${styles.corner} ${styles.topRight}`}></div>
        <div className={`${styles.corner} ${styles.bottomLeft}`}></div>
        <div className={`${styles.corner} ${styles.bottomRight}`}></div>
      </div>

      {isPaused && (
        <div className={styles.pausedOverlay}>
          <span>Đang xử lý kết quả...</span>
        </div>
      )}

      {hasCameraError && (
        <div className={styles.errorOverlay}>
          <span>Không thể truy cập camera. Vui lòng kiểm tra quyền.</span>
        </div>
      )}

      <button onClick={toggleCamera} className={styles.flipButton} aria-label="Đổi camera">
        <CameraFlipIcon size={24} />
      </button>
    </div>
  );
}
