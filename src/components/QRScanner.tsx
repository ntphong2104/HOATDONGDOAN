'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CameraFlipIcon, FlashlightIcon, FocusIcon, ZoomInIcon, ZoomOutIcon } from '@/components/icons';
import styles from './QRScanner.module.css';

interface QRScannerProps {
  onScan?: (mssv: string) => void;
  onScanSuccess?: (mssv: string) => void;
  isPaused?: boolean;
}

export default function QRScanner({ onScan, onScanSuccess, isPaused = false }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasCameraError, setHasCameraError] = useState(false);

  // Zoom and Torch states
  const [zoomLevel, setZoomLevel] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(5);
  const [zoomStep, setZoomStep] = useState(0.1);
  const [supportsTorch, setSupportsTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isFocusing, setIsFocusing] = useState(false);

  // Focus touch effect
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

    // Digital Zoom Fallback (CSS scaling on video element)
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
    setIsFocusing(true);
    setTimeout(() => setIsFocusing(false), 800);

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
      setTimeout(() => setFocusPoint(null), 800);
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
        console.warn('Focus constraint not supported:', err);
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
        fps: 20,
        qrbox: qrboxFunction,
        aspectRatio: 1.0,
      };

      await scannerRef.current.start(
        { facingMode: facingMode === 'environment' ? 'environment' : 'user' },
        config,
        (decodedText) => {
          if (!isPausedRef.current && scanCallbackRef.current) {
            scanCallbackRef.current(decodedText);
          }
        },
        undefined
      );

      // Check zoom / torch capabilities
      setTimeout(() => {
        const track = getVideoTrack();
        if (track && typeof track.getCapabilities === 'function') {
          const caps: any = track.getCapabilities();
          if (caps.zoom) {
            setMinZoom(caps.zoom.min || 1);
            setMaxZoom(caps.zoom.max || 5);
            setZoomStep(caps.zoom.step || 0.1);
          } else {
            setMaxZoom(4);
            setMinZoom(1);
          }
          if (caps.torch) {
            setSupportsTorch(true);
          }
        }
      }, 500);
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

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    triggerFocus(e.clientX - rect.left, e.clientY - rect.top);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setZoomLevel(1);
    setIsTorchOn(false);
  };

  return (
    <div
      ref={containerRef}
      className={styles.scannerContainer}
      onClick={handleTap}
    >
      <div id="qr-reader-viewport" className={styles.viewport}></div>

      {/* Tap Focus Ring Indicator */}
      {focusPoint && (
        <div
          className={styles.focusRing}
          style={{ top: `${focusPoint.y}px`, left: `${focusPoint.x}px` }}
        />
      )}

      {/* Top Controls: Camera Flip, Focus Button, Flashlight */}
      <div className={styles.topControls}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleCamera();
          }}
          className={styles.controlButton}
          title="Đổi camera trước / sau"
          aria-label="Đổi camera"
        >
          <CameraFlipIcon size={20} />
        </button>

        {/* Dedicated Focus Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            triggerFocus();
          }}
          className={`${styles.controlButton} ${isFocusing ? styles.torchActive : ''}`}
          title="Lấy nét camera ngay"
          aria-label="Lấy nét"
          style={{
            background: isFocusing ? '#eab308' : 'rgba(15, 23, 42, 0.75)',
            color: isFocusing ? '#0f172a' : '#facc15',
            borderColor: isFocusing ? '#fde047' : 'rgba(250, 204, 21, 0.3)',
          }}
        >
          <FocusIcon size={20} />
        </button>

        <div className={styles.qualityBadge}>HD • 20 FPS</div>

        {supportsTorch ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleTorch();
            }}
            className={`${styles.controlButton} ${isTorchOn ? styles.torchActive : ''}`}
            title="Bật/Tắt đèn Flash"
            aria-label="Đèn Flash"
          >
            <FlashlightIcon size={20} />
          </button>
        ) : (
          <div style={{ width: 44 }} />
        )}
      </div>

      {/* Center Reticle / Aim Frame with Laser */}
      <div className={styles.overlayFrame}>
        <div className={styles.reticleBox}>
          <div className={`${styles.corner} ${styles.topLeft}`}></div>
          <div className={`${styles.corner} ${styles.topRight}`}></div>
          <div className={`${styles.corner} ${styles.bottomLeft}`}></div>
          <div className={`${styles.corner} ${styles.bottomRight}`}></div>
          <div className={styles.scanLaser}></div>
        </div>
      </div>

      {/* Bottom Controls: Zoom Preset Pills & Slider */}
      <div
        className={styles.bottomControls}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.zoomPillsContainer}>
          {[1, 2, 3, 5].map((preset) => (
            <button
              key={preset}
              type="button"
              className={`${styles.zoomPill} ${
                Math.abs(zoomLevel - preset) < 0.2 ? styles.zoomPillActive : ''
              }`}
              onClick={() => applyZoom(preset)}
            >
              {preset}x
            </button>
          ))}
        </div>

        <div className={styles.zoomSliderWrapper}>
          <ZoomOutIcon size={16} color="#94a3b8" />
          <input
            type="range"
            min={minZoom}
            max={maxZoom}
            step={zoomStep}
            value={zoomLevel}
            onChange={(e) => applyZoom(parseFloat(e.target.value))}
            className={styles.zoomSlider}
            aria-label="Thanh trượt phóng to camera"
          />
          <ZoomInIcon size={16} color="#94a3b8" />
        </div>

        <span className={styles.helperText}>
          Chạm màn hình để lấy nét • Chọn 2x / 3x để quét từ xa
        </span>
      </div>

      {/* Paused state */}
      {isPaused && (
        <div className={styles.pausedOverlay}>
          <span>Đang xử lý kết quả...</span>
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
              padding: '0.5rem 1rem',
              background: '#ffffff',
              color: '#dc2626',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '0.85rem',
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

