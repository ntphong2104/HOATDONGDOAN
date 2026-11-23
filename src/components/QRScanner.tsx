'use client';

import React, { useEffect, useRef, useState, useCallback, useId } from 'react';
import Image from 'next/image';
import { Html5Qrcode } from 'html5-qrcode';
import { ArrowLeftIcon, FlashlightIcon, ImageIcon, QRIcon } from '@/components/icons';
import styles from './QRScanner.module.css';

/* ── Global hardware MediaStream tracker ──
 * Guarantees macOS Safari / PWA (AVCaptureSession) & mobile browsers immediately
 * turn off the camera indicator LED even when unmounted mid-getUserMedia() or
 * when html5-qrcode removes <video> without clearing srcObject / load().
 */
const activeScannerStreams = new Set<MediaStream>();
let activeScannerInstances = 0;
let originalGetUserMedia: MediaDevices['getUserMedia'] | null = null;

function stopAndClearMediaStream(stream: MediaStream | null | undefined) {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.enabled = false;
      } catch {}
      try {
        track.stop();
      } catch {}
      try {
        stream.removeTrack(track);
      } catch {}
    });
  } catch {}
  activeScannerStreams.delete(stream);
}

function installCameraStreamTracker() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  if (originalGetUserMedia) return;

  const md = navigator.mediaDevices;
  originalGetUserMedia = md.getUserMedia.bind(md);
  const patched: MediaDevices['getUserMedia'] = async (constraints) => {
    const stream = await originalGetUserMedia!(constraints);
    if (activeScannerInstances <= 0) {
      // Unmounted while waiting for user permission or camera warm-up
      stopAndClearMediaStream(stream);
    } else {
      activeScannerStreams.add(stream);
    }
    return stream;
  };
  try {
    md.getUserMedia = patched;
  } catch {
    originalGetUserMedia = null;
  }
}

function uninstallCameraStreamTrackerIfIdle() {
  if (activeScannerInstances > 0 || !originalGetUserMedia) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    }
  } catch {}
  originalGetUserMedia = null;
}

function releaseVideosInRoot(root: ParentNode | null | undefined) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  try {
    const videos = root.querySelectorAll('video');
    videos.forEach((videoEl) => {
      const video = videoEl as HTMLVideoElement;
      try {
        stopAndClearMediaStream(video.srcObject as MediaStream | null);
      } catch {}
      try {
        video.pause();
      } catch {}
      try {
        video.srcObject = null;
      } catch {}
      try {
        video.removeAttribute('src');
        video.load();
      } catch {}
      try {
        video.remove();
      } catch {}
    });
  } catch {}
}

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
  const rawId = useId();
  const scannerId = `qr-reader-viewport-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isMountedRef = useRef(true);
  const effectGenRef = useRef(0);
  const transitionPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const facingModeRef = useRef<'environment' | 'user'>('environment');
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const forceReleaseCameraHardware = useCallback(
    (viewportEl?: HTMLDivElement | null, containerEl?: HTMLDivElement | null) => {
      releaseVideosInRoot(viewportEl || viewportRef.current);
      releaseVideosInRoot(containerEl || containerRef.current);
      if (typeof document !== 'undefined') {
        releaseVideosInRoot(document.getElementById(scannerId));
      }
      for (const stream of Array.from(activeScannerStreams)) {
        stopAndClearMediaStream(stream);
      }
    },
    [scannerId]
  );

  const getVideoTrack = useCallback((): MediaStreamTrack | null => {
    try {
      const videoEl =
        (viewportRef.current?.querySelector('video') as HTMLVideoElement | null) ||
        (typeof document !== 'undefined'
          ? (document.querySelector(`#${scannerId} video`) as HTMLVideoElement | null)
          : null);
      const stream = videoEl?.srcObject as MediaStream | null;
      if (stream && stream.getVideoTracks().length > 0) {
        return stream.getVideoTracks()[0];
      }
    } catch {}
    return null;
  }, [scannerId]);

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
    const videoEl =
      (viewportRef.current?.querySelector('video') as HTMLVideoElement | null) ||
      (document.querySelector(`#${scannerId} video`) as HTMLVideoElement | null);
    if (videoEl) {
      if (!hardwareApplied && clampedLevel > 1) {
        videoEl.style.transform = `scale(${clampedLevel})`;
      } else {
        videoEl.style.transform = 'scale(1)';
      }
    }
  }, [maxZoom, getVideoTrack, scannerId]);

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
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        focusTimerRef.current = null;
        if (isMountedRef.current) setFocusPoint(null);
      }, 750);
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

  const startScanner = useCallback(async (gen: number, targetFacingMode: 'environment' | 'user') => {
    const shouldContinue = () => isMountedRef.current && effectGenRef.current === gen;
    if (!shouldContinue()) return;
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

      if (!shouldContinue()) return;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxSize = Math.floor(minEdge * 0.85);
        return { width: qrboxSize, height: qrboxSize };
      };

      const config = {
        fps: 15,
        qrbox: qrboxFunction,
        videoConstraints: {
          facingMode: { ideal: targetFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      await scannerRef.current.start(
        { facingMode: targetFacingMode },
        config,
        (decodedText) => {
          if (!isPausedRef.current && scanCallbackRef.current) {
            scanCallbackRef.current(decodedText);
          }
        },
        undefined
      );

      // Record any attached video MediaStream as tracked hardware resource
      try {
        const videoEl =
          (viewportRef.current?.querySelector('video') as HTMLVideoElement | null) ||
          (document.querySelector(`#${scannerId} video`) as HTMLVideoElement | null);
        const attachedStream = videoEl?.srcObject as MediaStream | null;
        if (attachedStream) activeScannerStreams.add(attachedStream);
      } catch {}

      // Immediately release hardware camera if unmounted or switched while start() was awaiting permissions
      if (!shouldContinue()) {
        if (scannerRef.current && scannerRef.current.isScanning) {
          try {
            await scannerRef.current.stop();
          } catch {}
        }
        forceReleaseCameraHardware();
        return;
      }

      // Check capabilities & auto-enable continuous focus
      if (capsTimerRef.current) clearTimeout(capsTimerRef.current);
      capsTimerRef.current = setTimeout(async () => {
        capsTimerRef.current = null;
        if (!shouldContinue()) return;
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
      forceReleaseCameraHardware();
      if (shouldContinue()) {
        console.error('Failed to start camera scanner:', err);
        setHasCameraError(true);
      }
    }
  }, [scannerId, getVideoTrack, forceReleaseCameraHardware]);

  useEffect(() => {
    const capturedViewportEl = viewportRef.current;
    const capturedContainerEl = containerRef.current;

    activeScannerInstances += 1;
    installCameraStreamTracker();
    isMountedRef.current = true;
    facingModeRef.current = facingMode;
    const gen = ++effectGenRef.current;

    const runStart = () => startScanner(gen, facingMode);
    transitionPromiseRef.current = transitionPromiseRef.current.then(runStart, runStart);

    const stopEverythingNow = () => {
      effectGenRef.current++;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
      forceReleaseCameraHardware(capturedViewportEl, capturedContainerEl);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const stopOnHide = async () => {
          effectGenRef.current++;
          if (scannerRef.current && scannerRef.current.isScanning) {
            try {
              await scannerRef.current.stop();
            } catch {}
          }
          forceReleaseCameraHardware(capturedViewportEl, capturedContainerEl);
        };
        transitionPromiseRef.current = transitionPromiseRef.current.then(stopOnHide, stopOnHide);
      } else if (isMountedRef.current) {
        const resumeGen = ++effectGenRef.current;
        const resumeStart = () => startScanner(resumeGen, facingModeRef.current);
        transitionPromiseRef.current = transitionPromiseRef.current.then(resumeStart, resumeStart);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', stopEverythingNow);
      window.addEventListener('beforeunload', stopEverythingNow);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      activeScannerInstances = Math.max(0, activeScannerInstances - 1);
      isMountedRef.current = false;
      effectGenRef.current++;
      if (focusTimerRef.current) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      if (capsTimerRef.current) {
        clearTimeout(capsTimerRef.current);
        capsTimerRef.current = null;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', stopEverythingNow);
        window.removeEventListener('beforeunload', stopEverythingNow);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      // 1) Synchronous camera release immediately on route change / unmount
      forceReleaseCameraHardware(capturedViewportEl, capturedContainerEl);

      // 2) Serialized stop after any pending Html5Qrcode transition + second sweep
      const runStop = async () => {
        if (scannerRef.current) {
          if (scannerRef.current.isScanning) {
            try {
              await scannerRef.current.stop();
            } catch {}
          }
          try {
            scannerRef.current.clear();
          } catch {}
          scannerRef.current = null;
        }
        forceReleaseCameraHardware(capturedViewportEl, capturedContainerEl);
        uninstallCameraStreamTrackerIfIdle();
      };
      transitionPromiseRef.current = transitionPromiseRef.current.then(runStop, runStop);
    };
  }, [facingMode, startScanner, forceReleaseCameraHardware]);

  // Handle Photo Scan from Album ("Chọn từ ảnh")
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const runFileScan = async () => {
      const wasScanning = Boolean(scannerRef.current?.isScanning);
      if (wasScanning && scannerRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {}
      }

      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerId, {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        });
      }

      let decodedText: string | null = null;
      try {
        decodedText = await scannerRef.current.scanFile(file, false);
      } catch {
        alert('Không tìm thấy mã QR hợp lệ trong ảnh này. Vui lòng chọn ảnh khác.');
      }

      if (decodedText && scanCallbackRef.current) {
        scanCallbackRef.current(decodedText);
      }

      if (wasScanning && isMountedRef.current) {
        await startScanner(effectGenRef.current, facingModeRef.current);
      }
    };

    try {
      transitionPromiseRef.current = transitionPromiseRef.current.then(runFileScan, runFileScan);
      await transitionPromiseRef.current;
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

  const handleRetryCamera = () => {
    const gen = ++effectGenRef.current;
    const runRetry = () => startScanner(gen, facingModeRef.current);
    transitionPromiseRef.current = transitionPromiseRef.current.then(runRetry, runRetry);
  };

  return (
    <div
      ref={containerRef}
      className={styles.scannerContainer}
      onClick={handleTap}
    >
      <div id={scannerId} ref={viewportRef} className={styles.viewport}></div>

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
            onClick={handleRetryCamera}
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
