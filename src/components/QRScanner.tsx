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
    setTimeout(() => setIsFocusing(false), 900);

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
      setTimeout(() => setFocusPoint(null), 900);
    }

    // Haptic vibration feedback on mobile
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(35);
      } catch {}
    }

    const track = getVideoTrack();
    if (track && typeof track.applyConstraints === 'function') {
      try {
        const caps: any = track.getCapabilities ? track.getCapabilities() : {};
        const focusModes: string[] = caps.focusMode || [];

        const normX = container && pxX !== undefined ? pxX / container.clientWidth : 0.5;
        const normY = container && pxY !== undefined ? pxY / container.clientHeight : 0.5;

        const advancedObj: any = {};

        if (focusModes.includes('continuous')) {
          advancedObj.focusMode = 'continuous';
        } else if (focusModes.includes('auto')) {
          advancedObj.focusMode = 'auto';
        }

        if (caps.pointsOfInterest) {
          advancedObj.pointsOfInterest = [{ x: normX, y: normY }];
        }

        if (Object.keys(advancedObj).length > 0) {
          await track.applyConstraints({ advanced: [advancedObj] });
        } else if (caps.zoom) {
          // iOS / WebKit camera ISP focus trigger: micro zoom nudge forces hardware ISP to refocus
          const curZoom = zoomLevel;
          const delta = curZoom >= (caps.zoom.max || 5) ? -0.05 : 0.05;
          await track.applyConstraints({ advanced: [{ zoom: curZoom + delta } as any] });
          await new Promise((r) => setTimeout(r, 80));
          await track.applyConstraints({ advanced: [{ zoom: curZoom } as any] });
        }
      } catch (err) {
        console.warn('Hardware focus cycle failed, applying software enhancement:', err);
      }
    }

    // Enhance video frame contrast for projection screens / low light
    const videoEl = document.querySelector('#qr-reader-viewport video') as HTMLVideoElement | null;
    if (videoEl) {
      videoEl.style.filter = 'contrast(1.12) brightness(1.03) saturate(1.05)';
    }
  }, [getVideoTrack, zoomLevel]);

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

  // Touch gesture handling: Pinch-to-zoom, single tap-to-focus, double-tap zoom
  const touchStateRef = useRef<{
    initialDist: number;
    initialZoom: number;
    startTime: number;
    startX: number;
    startY: number;
    lastTapTime: number;
  }>({
    initialDist: 0,
    initialZoom: 1,
    startTime: 0,
    startX: 0,
    startY: 0,
    lastTapTime: 0,
  });

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStateRef.current.initialDist = dist;
      touchStateRef.current.initialZoom = zoomLevel;
    } else if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = e.currentTarget.getBoundingClientRect();
      touchStateRef.current.initialDist = 0;
      touchStateRef.current.startX = touch.clientX - rect.left;
      touchStateRef.current.startY = touch.clientY - rect.top;
      touchStateRef.current.startTime = Date.now();
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchStateRef.current.initialDist > 0) {
      const newDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = newDist / touchStateRef.current.initialDist;
      const targetZoom = Math.max(minZoom, Math.min(maxZoom, touchStateRef.current.initialZoom * factor));
      applyZoom(Math.round(targetZoom * 10) / 10);
    }
  };

  const handleTouchEnd = () => {
    const { startX, startY, startTime, initialDist, lastTapTime } = touchStateRef.current;
    const now = Date.now();
    const duration = now - startTime;

    if (initialDist === 0 && duration < 250) {
      // Check double tap
      if (now - lastTapTime < 300) {
        // Toggle 2.5x / 1x zoom
        applyZoom(zoomLevel > 1.8 ? 1 : 2.5);
        touchStateRef.current.lastTapTime = 0;
      } else {
        // Single tap -> Trigger focus
        triggerFocus(startX, startY);
        touchStateRef.current.lastTapTime = now;
      }
    }
  };

  const startScanner = async () => {
    const scannerId = 'qr-reader-viewport';
    setHasCameraError(false);

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
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

      // Responsive wide scanning area (85% of viewfinder)
      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.88);
        return { width: qrboxSize, height: qrboxSize };
      };

      const config = {
        fps: 25, // High frame rate for instant recognition
        qrbox: qrboxFunction,
        aspectRatio: 0.75,
        videoConstraints: {
          facingMode: { ideal: facingMode },
          width: { min: 720, ideal: 1920, max: 3840 },
          height: { min: 720, ideal: 1080, max: 2160 },
          advanced: [{ focusMode: 'continuous' } as any],
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

      // Check camera capabilities after start
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
        // Initial autofocus kick
        triggerFocus();
      }, 500);
    } catch (err) {
      console.error('Failed to start camera scanner:', err);
      setHasCameraError(true);
    }
  };

  useEffect(() => {
    let isMounted = true;
    startScanner();

    // Auto-focus heartbeat every 5 seconds to prevent camera lens locking
    const focusInterval = setInterval(() => {
      if (isMounted && !isPausedRef.current && scannerRef.current?.isScanning) {
        triggerFocus();
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(focusInterval);
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
    setZoomLevel(1);
    setIsTorchOn(false);
  };

  return (
    <div
      ref={containerRef}
      className={styles.scannerContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        triggerFocus(e.clientX - rect.left, e.clientY - rect.top);
      }}
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

        <div className={styles.qualityBadge}>HD • 25 FPS</div>

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
        onTouchStart={(e) => e.stopPropagation()}
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
          Chạm để lấy nét • Chạm 2 lần để phóng 2.5x • Vuốt 2 ngón tay zoom
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

