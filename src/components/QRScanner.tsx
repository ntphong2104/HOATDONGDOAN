'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeftIcon, FlashlightIcon, ImageIcon, QRIcon } from '@/components/icons';
import styles from './QRScanner.module.css';

interface QRScannerProps {
  onScan?: (mssv: string) => void;
  onScanSuccess?: (mssv: string) => void;
  onClose?: () => void;
  isPaused?: boolean;
  title?: string;
  subtitle?: string;
  showBottomAction?: boolean;
  bottomActionText?: string;
  onBottomAction?: () => void;
}

export default function QRScanner({
  onScan,
  onScanSuccess,
  onClose,
  isPaused = false,
  title = 'Quét mã QR',
  subtitle = 'Quét mã QR để điểm danh sự kiện Đoàn Thanh Niên',
  showBottomAction = false,
  bottomActionText = 'Đóng máy quét',
  onBottomAction,
}: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraError, setHasCameraError] = useState(false);

  // Zoom and Torch states
  const [zoomLevel, setZoomLevel] = useState(1);
  const [maxZoom, setMaxZoom] = useState(3);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Tap-to-focus indicator
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const scanCallbackRef = useRef(onScanSuccess || onScan);
  useEffect(() => {
    scanCallbackRef.current = onScanSuccess || onScan;
  }, [onScanSuccess, onScan]);

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    try {
      const videoEl = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement | null;
      const stream = videoEl?.srcObject as MediaStream | null;
      if (stream && stream.getVideoTracks().length > 0) {
        return stream.getVideoTracks()[0];
      }
    } catch {}
    return null;
  }, []);

  const applyZoom = useCallback(async (level: number) => {
    const clampedLevel = Math.max(1, Math.min(level, maxZoom));
    setZoomLevel(clampedLevel);

    const track = getVideoTrack();
    let hardwareApplied = false;

    if (track && typeof track.applyConstraints === 'function') {
      try {
        await track.applyConstraints({
          advanced: [{ zoom: clampedLevel } as any],
        });
        hardwareApplied = true;
      } catch {
        hardwareApplied = false;
      }
    }

    // Digital Zoom fallback (CSS scaling on video element)
    const videoEl = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement | null;
    if (videoEl) {
      if (!hardwareApplied && clampedLevel > 1) {
        videoEl.style.transform = `scale(${clampedLevel})`;
      } else {
        videoEl.style.transform = 'scale(1)';
      }
    }
  }, [maxZoom, getVideoTrack]);

  const triggerFocus = useCallback(async (customX?: number, customY?: number) => {
    const container = containerRef.current;
    let pxX = customX;
    let pxY = customY;

    if (container && (pxX === undefined || pxY === undefined)) {
      const rect = container.getBoundingClientRect();
      pxX = rect.width / 2;
      pxY = rect.height / 2;
    }

    if (pxX !== undefined && pxY !== undefined) {
      setFocusPoint({ x: pxX, y: pxY });
      setTimeout(() => setFocusPoint(null), 750);
    }

    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(30);
      } catch {}
    }

    const track = getVideoTrack();
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const caps: any = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && Array.isArray(caps.focusMode)) {
          if (caps.focusMode.includes('continuous')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
          } else if (caps.focusMode.includes('auto')) {
            await track.applyConstraints({ advanced: [{ focusMode: 'auto' } as any] });
          }
        }
      } catch (err) {
        console.warn('Focus constraint error:', err);
      }
    }
  }, [getVideoTrack]);

  const toggleTorch = useCallback(async () => {
    const track = getVideoTrack();
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const nextTorch = !isTorchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch } as any],
        });
        setIsTorchOn(nextTorch);
      } catch (err) {
        console.warn('Torch not supported on this track:', err);
      }
    }
  }, [isTorchOn, getVideoTrack]);

  const startScanner = async () => {
    const scannerId = 'qr-reader-viewport';
    setHasCameraError(false);

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerId, {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        });
      }

      if (scannerRef.current.isScanning) {
        try {
          await scannerRef.current.stop();
        } catch {}
      }

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.85);
        return { width: qrboxSize, height: qrboxSize };
      };

      const config = {
        fps: 25,
        qrbox: qrboxFunction,
        aspectRatio: 1.0,
        videoConstraints: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      await scannerRef.current.start(
        { facingMode },
        config,
        (decodedText) => {
          if (!isPausedRef.current && scanCallbackRef.current) {
            scanCallbackRef.current(decodedText);
          }
        },
        undefined
      );

      // Check capabilities & auto-enable continuous focus
      setTimeout(async () => {
        const track = getVideoTrack();
        if (track && typeof track.getCapabilities === 'function') {
          const caps: any = track.getCapabilities();
          if (caps.zoom) {
            setMaxZoom(Math.min(caps.zoom.max || 3, 4));
          }
          if (caps.torch) {
            setSupportsTorch(true);
          }
          if (caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
            try {
              await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as any] });
            } catch {}
          }
        }
      }, 400);
    } catch (err) {
      console.error('Failed to start camera scanner:', err);
      setHasCameraError(true);
    }
  };

  useEffect(() => {
    let isMounted = true;
    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [facingMode]);

  // Handle Photo Scan from Album ("Chọn từ ảnh")
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;

    try {
      const decodedText = await scannerRef.current.scanFile(file, false);
      if (decodedText && scanCallbackRef.current) {
        scanCallbackRef.current(decodedText);
      }
    } catch (err) {
      alert('Không tìm thấy mã QR hợp lệ trong ảnh này. Vui lòng chọn ảnh khác.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    triggerFocus(e.clientX - rect.left, e.clientY - rect.top);
  };

  return (
    <div
      ref={containerRef}
      className={styles.scannerContainer}
      onClick={handleTap}
    >
      <div id="qr-reader-viewport" className={styles.viewport}></div>

      {/* Hidden file input for "Chọn từ ảnh" */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleImageUpload}
      />

      {/* Top Header: Back Button, Title, Flashlight (BIDV Style) */}
      <div className={styles.topHeader} onClick={(e) => e.stopPropagation()}>
        <div className={styles.headerLeft}>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={styles.iconButton}
              title="Quay lại"
              aria-label="Quay lại"
            >
              <ArrowLeftIcon size={20} />
            </button>
          )}
          <h2 className={styles.headerTitle}>{title}</h2>
        </div>

        {supportsTorch ? (
          <button
            type="button"
            onClick={toggleTorch}
            className={`${styles.iconButton} ${isTorchOn ? styles.torchActive : ''}`}
            title="Bật/Tắt đèn Flash"
            aria-label="Đèn Flash"
          >
            <FlashlightIcon size={20} />
          </button>
        ) : (
          <div style={{ width: 40 }} />
        )}
      </div>

      {/* Top Guidance & Brand Strip */}
      <div className={styles.topGuidance}>
        <p className={styles.guidanceText}>{subtitle}</p>
        <div className={styles.brandStrip}>
          <span>HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG</span>
          <span className={styles.brandDot}>•</span>
          <span>ĐOÀN THANH NIÊN</span>
        </div>
      </div>

      {/* BIDV Style Center Reticle (Vignette Mask + Yellow Brackets + Pulse Flower) */}
      <div className={styles.viewfinderOverlay}>
        <div className={styles.reticleBox}>
          <div className={`${styles.corner} ${styles.topLeft}`}></div>
          <div className={`${styles.corner} ${styles.topRight}`}></div>
          <div className={`${styles.corner} ${styles.bottomLeft}`}></div>
          <div className={`${styles.corner} ${styles.bottomRight}`}></div>

          {/* Glowing Center PTIT Emblem */}
          <div className={styles.centerEmblem}>
            <Image
              src="/logos/logo-ptit.png"
              alt="Logo PTIT"
              width={40}
              height={40}
              priority
              className={styles.centerEmblemImg}
            />
          </div>

          <div className={styles.scanLaser}></div>
        </div>
      </div>

      {/* Tap Focus Ring Indicator */}
      {focusPoint && (
        <div
          className={styles.focusRing}
          style={{ top: `${focusPoint.y}px`, left: `${focusPoint.x}px` }}
        />
      )}

      {/* BIDV Bottom Action Bar */}
      <div className={styles.bottomSection} onClick={(e) => e.stopPropagation()}>
        {/* "Chọn từ ảnh" Button (BIDV Style) */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={styles.galleryButton}
        >
          <ImageIcon size={18} />
          <span>Chọn từ ảnh</span>
        </button>

        {/* Minimalist Zoom Slider: (— O ════ +) */}
        <div className={styles.sliderWrapper}>
          <span
            className={styles.sliderIcon}
            onClick={() => applyZoom(1)}
            style={{ cursor: 'pointer' }}
          >
            —
          </span>
          <input
            type="range"
            min={1}
            max={maxZoom}
            step={0.1}
            value={zoomLevel}
            onChange={(e) => applyZoom(parseFloat(e.target.value))}
            className={styles.zoomSlider}
            aria-label="Thanh phóng to camera"
          />
          <span
            className={styles.sliderIcon}
            onClick={() => applyZoom(maxZoom)}
            style={{ cursor: 'pointer' }}
          >
            +
          </span>
        </div>

        {/* Bottom Action Pill (e.g. "Tạo QR nhận tiền" in BIDV -> "Đóng máy quét") */}
        {showBottomAction && (
          <button
            type="button"
            onClick={onBottomAction || onClose}
            className={styles.bottomActionPill}
          >
            <QRIcon size={20} />
            <span>{bottomActionText}</span>
          </button>
        )}
      </div>

      {/* Paused state */}
      {isPaused && (
        <div className={styles.pausedOverlay}>
          <span>Đang ghi nhận điểm danh...</span>
        </div>
      )}

      {/* Error state */}
      {hasCameraError && (
        <div className={styles.errorOverlay}>
          <span>Không thể truy cập camera. Vui lòng cấp quyền máy ảnh trong trình duyệt.</span>
          <button
            type="button"
            onClick={startScanner}
            style={{
              marginTop: '0.85rem',
              padding: '0.5rem 1.25rem',
              background: '#ffffff',
              color: '#dc2626',
              border: 'none',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Thử lại
          </button>
        </div>
      )}
    </div>
  );
}
