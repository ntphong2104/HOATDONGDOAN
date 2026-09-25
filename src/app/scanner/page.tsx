'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import InAppBrowserWarning from '@/components/InAppBrowserWarning';
import QRScanner from '@/components/QRScanner';
import EventSelector from '@/components/EventSelector';
import RoleSelector from '@/components/RoleSelector';
import ScanResultOverlay from '@/components/ScanResultOverlay';
import {
  ScanCameraIcon,
  QrCodeIcon,
  CheckIcon,
  CloseIcon,
  AlertTriangleIcon,
  ClockIcon,
  HistoryIcon,
  LightbulbIcon,
} from '@/components/icons';
import { audioService } from '@/lib/utils/audio';
import { extractMSSV } from '@/lib/utils/extract-mssv';
import type { SessionUser, ParticipateRole } from '@/lib/types';
import styles from './scanner.module.css';

interface ScanResultState {
  status: 'success' | 'duplicate' | 'error';
  studentName?: string;
  studentClass?: string;
  checkedAt?: string;
  errorMessage?: string;
}

interface ScanHistoryItem {
  id: string;
  mssv: string;
  name: string;
  classId: string;
  time: string;
  status: 'success' | 'duplicate' | 'error';
  message?: string;
}

interface HudState {
  status: 'success' | 'duplicate' | 'error';
  mssv: string;
  studentName?: string;
  studentClass?: string;
  message?: string;
  time: string;
}

export default function ScannerPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ParticipateRole>('participant');

  // Scanner modes: 'camera' | 'external'
  const [scanMode, setScanMode] = useState<'camera' | 'external'>('camera');
  const externalInputRef = useRef<HTMLInputElement>(null);

  // Camera state
  const [isPaused, setIsPaused] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultState | null>(null);
  const lastScannedRef = useRef<{ code: string; timestamp: number }>({ code: '', timestamp: 0 });

  // External scanner HUD & Session state
  const [hudStatus, setHudStatus] = useState<HudState | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [scanCount, setScanCount] = useState(0);

  useEffect(() => {
    fetch('/api/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUser(data.data);
          const activeList = (data.data.managed_events || []).filter(
            (e: any) => e.status === 'active' && e.is_active !== false
          );
          if (activeList.length > 0) {
            setSelectedEventId(activeList[0].event_id);
          } else if (data.data.tier === 'user') {
            router.push('/');
          }
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [router]);

  // Auto-focus external input when switching to external mode
  useEffect(() => {
    if (scanMode === 'external') {
      const t = setTimeout(() => {
        externalInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [scanMode]);

  // Click on background automatically returns focus to external scanner input
  const handleContainerClick = (e: React.MouseEvent) => {
    if (scanMode !== 'external') return;
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'SELECT' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.closest('select') ||
      target.closest('button')
    ) {
      return;
    }
    externalInputRef.current?.focus();
  };

  // Checkin processor (supports both camera and high-speed external barcode gun)
  const processCheckin = useCallback(
    async (rawData: string, mode: 'camera' | 'external') => {
      if (!selectedEventId) return;

      const dataToSend = rawData.trim();
      const parts = dataToSend.split(':');
      const isDynamicToken = parts.length === 3 && !isNaN(parseInt(parts[1], 10));
      const mssv = isDynamicToken ? dataToSend : extractMSSV(dataToSend) || dataToSend;

      const currentTimeStr = new Date().toLocaleTimeString('vi-VN');

      if (!mssv) {
        audioService.playError();
        if (mode === 'camera') {
          setScanResult({ status: 'error', errorMessage: 'Mã QR không hợp lệ' });
        } else {
          setHudStatus({
            status: 'error',
            mssv: rawData,
            message: 'Mã không đúng định dạng',
            time: currentTimeStr,
          });
          setScanHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random()}`,
              mssv: rawData,
              name: 'Không xác định',
              classId: '',
              time: currentTimeStr,
              status: 'error',
              message: 'Mã không hợp lệ',
            },
            ...prev.slice(0, 19),
          ]);
        }
        return;
      }

      try {
        const res = await fetch('/api/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mssv,
            event_id: selectedEventId,
            participate_role: selectedRole,
          }),
        });

        const result = await res.json();

        if (result.success) {
          audioService.playSuccess();
          const student = result.data?.student || {};
          const studentName = student.full_name || mssv;
          const studentClass = student.class_id || 'PTIT-HCM';

          setScanCount((prev) => prev + 1);

          setScanHistory((prev) => [
            {
              id: `${Date.now()}-${Math.random()}`,
              mssv: student.mssv || mssv,
              name: studentName,
              classId: studentClass,
              time: currentTimeStr,
              status: 'success',
              message: result.message,
            },
            ...prev.slice(0, 19),
          ]);

          if (mode === 'camera') {
            setScanResult({
              status: 'success',
              studentName,
              studentClass,
              checkedAt: result.data.checkin_time,
            });
          } else {
            setHudStatus({
              status: 'success',
              mssv: student.mssv || mssv,
              studentName,
              studentClass,
              message: result.message,
              time: currentTimeStr,
            });
          }
        } else {
          audioService.playError();
          const student = result.data?.student || result.details?.student || {};
          const studentName = student.full_name || mssv;
          const studentClass = student.class_id || '';

          if (res.status === 409) {
            setScanHistory((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                mssv,
                name: studentName,
                classId: studentClass,
                time: currentTimeStr,
                status: 'duplicate',
                message: result.message || 'Đã điểm danh trước đó',
              },
              ...prev.slice(0, 19),
            ]);

            if (mode === 'camera') {
              setScanResult({
                status: 'duplicate',
                studentName,
                studentClass,
                checkedAt: result.checked_at || result.data?.checkin_time,
                errorMessage: result.message || 'Đã điểm danh trước đó',
              });
            } else {
              setHudStatus({
                status: 'duplicate',
                mssv,
                studentName,
                studentClass,
                message: result.message || 'Đã điểm danh trước đó',
                time: currentTimeStr,
              });
            }
          } else {
            const errDetail = result.message || result.error || 'Lỗi điểm danh';
            setScanHistory((prev) => [
              {
                id: `${Date.now()}-${Math.random()}`,
                mssv,
                name: studentName,
                classId: studentClass,
                time: currentTimeStr,
                status: 'error',
                message: errDetail,
              },
              ...prev.slice(0, 19),
            ]);

            if (mode === 'camera') {
              setScanResult({
                status: 'error',
                errorMessage: errDetail,
              });
            } else {
              setHudStatus({
                status: 'error',
                mssv,
                studentName,
                studentClass,
                message: errDetail,
                time: currentTimeStr,
              });
            }
          }
        }
      } catch (err: any) {
        audioService.playError();
        const errDetail = err?.message || 'Lỗi kết nối máy chủ';
        if (mode === 'camera') {
          setScanResult({ status: 'error', errorMessage: errDetail });
        } else {
          setHudStatus({
            status: 'error',
            mssv,
            message: errDetail,
            time: currentTimeStr,
          });
        }
      }
    },
    [selectedEventId, selectedRole]
  );

  // Camera scan handler with 2.5s duplicate protection per same QR token
  const handleCameraScan = async (data: string) => {
    if (isPaused || !selectedEventId) return;

    const now = Date.now();
    const cleanData = data.trim();

    // Prevent immediate re-trigger if the same student holds their phone still in front of lens
    if (
      lastScannedRef.current.code === cleanData &&
      now - lastScannedRef.current.timestamp < 2500
    ) {
      return;
    }

    lastScannedRef.current = { code: cleanData, timestamp: now };
    setIsPaused(true);
    await processCheckin(cleanData, 'camera');
  };

  // External barcode scanner: Instant, non-blocking input submission
  const handleExternalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const input = externalInputRef.current;
    if (!input) return;

    const raw = input.value.trim();
    if (!raw) return;

    // Immediately clear input so the barcode gun can scan the next student right away!
    input.value = '';

    // Fire checkin asynchronously without blocking
    processCheckin(raw, 'external');
  };

  // Dismiss camera result overlay and resume scanning immediately
  const handleDismissResult = () => {
    setScanResult(null);
    setIsPaused(false);
  };

  const handleClearHistory = () => {
    setScanHistory([]);
    setHudStatus(null);
  };

  if (loading) return <div className={styles.loading}>Đang tải cấu hình máy quét...</div>;
  if (!user) return null;

  const isSuperAdmin = user.tier === 'super_admin';
  const isEventAdminOrSuper = isSuperAdmin || user.tier === 'event_admin';
  const activeEvents = (user.managed_events || []).filter(
    (e) => e.status === 'active' && e.is_active !== false
  );

  return (
    <div className={styles.container} onClick={handleContainerClick}>
      <Header
        userName={user.full_name || user.email}
        avatarUrl={user.avatar_url}
        showBack
        backHref="/"
        title="MÁY QUÉT ĐIỂM DANH"
      />
      <main className={styles.main}>
        <InAppBrowserWarning />

        {/* ══ Controls Header: Event, Role & Mode Switcher ══ */}
        <div className={styles.controls}>
          {/* Mode Switcher: Camera vs Máy Quét Ngoài (Available to all authorized users) */}
          <div className={styles.modeToggle}>
            <button
              type="button"
              onClick={() => {
                setScanMode('camera');
                setIsPaused(false);
                setScanResult(null);
              }}
              className={`${styles.modeButton} ${scanMode === 'camera' ? styles.modeButtonActive : ''}`}
            >
              <ScanCameraIcon size={18} color={scanMode === 'camera' ? '#2563eb' : '#64748b'} />
              Quét Camera
            </button>
            <button
              type="button"
              onClick={() => {
                setScanMode('external');
                setIsPaused(false);
                setScanResult(null);
              }}
              className={`${styles.modeButton} ${scanMode === 'external' ? styles.modeButtonActive : ''}`}
            >
              <QrCodeIcon size={18} color={scanMode === 'external' ? '#2563eb' : '#64748b'} />
              Máy Quét Ngoài (Tốc độ cao)
            </button>
          </div>

          {activeEvents.length > 0 ? (
            <EventSelector
              events={activeEvents}
              selectedEventId={selectedEventId}
              onChange={setSelectedEventId}
            />
          ) : (
            <div
              style={{
                padding: '0.85rem 1rem',
                background: '#f8fafc',
                border: '1.5px solid #e2e8f0',
                borderRadius: '10px',
                color: '#64748b',
                fontSize: '0.9rem',
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              Hiện không có sự kiện nào đang mở điểm danh
            </div>
          )}

          {isEventAdminOrSuper ? (
            <RoleSelector selectedRole={selectedRole} onChange={setSelectedRole} />
          ) : (
            <div className={styles.lockedRoleBadge}>
              <span className={styles.lockedRoleLabel}>VAI TRÒ ĐIỂM DANH:</span>
              <span className={styles.lockedRoleValue}>NGƯỜI THAM GIA</span>
            </div>
          )}
        </div>

        {/* ══ Scanner Body ══ */}
        {scanMode === 'camera' ? (
          /* ── Camera Viewport ── */
          <div className={styles.scannerWrapper}>
            {selectedEventId && activeEvents.some((e) => e.event_id === selectedEventId) ? (
              <QRScanner onScanSuccess={handleCameraScan} isPaused={isPaused} />
            ) : (
              <div className={styles.noEvent}>
                {activeEvents.length === 0
                  ? 'Không có sự kiện nào đang diễn ra để quét mã'
                  : 'Vui lòng chọn sự kiện để quét mã'}
              </div>
            )}

            {/* Fast-dismissing modal for camera (800ms auto-close or tap-to-dismiss) */}
            <ScanResultOverlay
              status={scanResult?.status || 'idle'}
              studentName={scanResult?.studentName}
              studentClass={scanResult?.studentClass}
              checkedAt={scanResult?.checkedAt}
              errorMessage={scanResult?.errorMessage}
              onDone={handleDismissResult}
              autoCloseMs={800}
            />
          </div>
        ) : (
          /* ── Rapid External Scanner Mode ── */
          <div className={styles.externalWrapper}>
            <div className={`${styles.externalScanBox} ${styles.externalScanBoxActive}`}>
              <div className={styles.externalHeader}>
                <div className={styles.externalTitle}>
                  <QrCodeIcon size={20} color="#2563eb" />
                  Chế Độ Bắn Mã Siêu Tốc
                </div>
                <div className={styles.readyBadge}>
                  <span className={styles.pulseDot}></span>
                  SẴN SÀNG QUÉT
                </div>
              </div>

              <input
                ref={externalInputRef}
                type="text"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="Đặt con trỏ tại đây & bấm máy quét mã vạch..."
                onKeyDown={handleExternalKeyDown}
                onBlur={() => {
                  setTimeout(() => {
                    if (scanMode === 'external') {
                      const active = document.activeElement;
                      if (!active || (active.tagName !== 'SELECT' && active.tagName !== 'BUTTON')) {
                        externalInputRef.current?.focus();
                      }
                    }
                  }, 250);
                }}
                className={styles.externalInput}
              />

              <div className={styles.externalInputHint}>
                <LightbulbIcon size={14} color="#64748b" />
                Máy bắn mã USB/Bluetooth tự gõ & nhấn Enter tức thì — Không bị gián đoạn hay đơ màn hình!
              </div>
            </div>

            {/* Live Instant HUD Banner (Non-blocking) */}
            {hudStatus && (
              <div
                className={`${styles.hudCard} ${
                  hudStatus.status === 'success'
                    ? styles.hudSuccess
                    : hudStatus.status === 'duplicate'
                    ? styles.hudDuplicate
                    : styles.hudError
                }`}
              >
                <div className={styles.hudTop}>
                  <span className={styles.hudBadge}>
                    {hudStatus.status === 'success' && (
                      <>
                        <CheckIcon size={16} /> THÀNH CÔNG
                      </>
                    )}
                    {hudStatus.status === 'duplicate' && (
                      <>
                        <ClockIcon size={16} /> ĐÃ ĐIỂM DANH TRƯỚC ĐÓ
                      </>
                    )}
                    {hudStatus.status === 'error' && (
                      <>
                        <AlertTriangleIcon size={16} /> CẢNH BÁO / LỖI
                      </>
                    )}
                  </span>
                  <span className={styles.hudTime}>{hudStatus.time}</span>
                </div>

                <div className={styles.hudStudentName}>
                  {hudStatus.studentName || hudStatus.mssv}
                </div>

                <div className={styles.hudStudentMeta}>
                  <span>MSSV: <strong>{hudStatus.mssv}</strong></span>
                  {hudStatus.studentClass && (
                    <span>Lớp: <strong>{hudStatus.studentClass}</strong></span>
                  )}
                </div>

                {hudStatus.message && (
                  <p className={styles.hudMessage}>{hudStatus.message}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══ Session Counter & Stats ══ */}
        <div className={styles.stats}>
          <span>Số lượt điểm danh thành công trong phiên:</span>
          <span className={styles.statHighlight}>{scanCount} sinh viên</span>
        </div>

        {/* ══ Live Scan History Feed (Session Log) ══ */}
        {scanHistory.length > 0 && (
          <div className={styles.historyContainer}>
            <div className={styles.historyHeader}>
              <div className={styles.historyTitle}>
                <HistoryIcon size={16} color="#475569" />
                Lịch sử quét vừa qua ({scanHistory.length})
              </div>
              <button
                type="button"
                onClick={handleClearHistory}
                className={styles.historyClearBtn}
                title="Xoá danh sách hiển thị"
              >
                Xoá lịch sử phiên
              </button>
            </div>

            <div className={styles.historyList}>
              {scanHistory.map((item) => (
                <div
                  key={item.id}
                  className={`${styles.historyItem} ${
                    item.status === 'success'
                      ? styles.historyItemSuccess
                      : item.status === 'duplicate'
                      ? styles.historyItemDuplicate
                      : styles.historyItemError
                  }`}
                >
                  <div className={styles.historyItemLeft}>
                    <div className={styles.historyItemName}>{item.name}</div>
                    <div className={styles.historyItemMeta}>
                      {item.mssv} {item.classId ? `• ${item.classId}` : ''}
                    </div>
                  </div>
                  <div className={styles.historyItemRight}>
                    <span className={styles.historyItemTime}>{item.time}</span>
                    <span
                      className={`${styles.historyItemTag} ${
                        item.status === 'success'
                          ? styles.historyTagSuccess
                          : item.status === 'duplicate'
                          ? styles.historyTagDuplicate
                          : styles.historyTagError
                      }`}
                    >
                      {item.status === 'success'
                        ? 'Hợp lệ'
                        : item.status === 'duplicate'
                        ? 'Trùng lặp'
                        : 'Không hợp lệ'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
