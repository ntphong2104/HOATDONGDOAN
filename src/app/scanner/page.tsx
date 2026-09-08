'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import InAppBrowserWarning from '@/components/InAppBrowserWarning';
import QRScanner from '@/components/QRScanner';
import EventSelector from '@/components/EventSelector';
import RoleSelector from '@/components/RoleSelector';
import ScanResultOverlay from '@/components/ScanResultOverlay';
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

export default function ScannerPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ParticipateRole>('participant');
  
  const [isPaused, setIsPaused] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultState | null>(null);
  const [scanCount, setScanCount] = useState(0);

  // External scanner mode (super_admin only)
  const [scanMode, setScanMode] = useState<'camera' | 'external'>('camera');
  const externalInputRef = useRef<HTMLInputElement>(null);
  const [externalProcessing, setExternalProcessing] = useState(false);

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

  // Auto-focus external input when in external mode
  useEffect(() => {
    if (scanMode === 'external' && externalInputRef.current) {
      externalInputRef.current.focus();
    }
  }, [scanMode, scanResult]);

  // Process checkin (shared between camera and external)
  const processCheckin = useCallback(async (rawData: string) => {
    if (!selectedEventId) return;

    const dataToSend = rawData.trim();
    
    // Detect dynamic QR token format: MSSV:window:signature
    const parts = dataToSend.split(':');
    const isDynamicToken = parts.length === 3 && !isNaN(parseInt(parts[1], 10));
    
    // Dynamic token → send raw to server for verification
    // Plain MSSV → extract using regex
    const mssv = isDynamicToken ? dataToSend : (extractMSSV(dataToSend) || dataToSend);
    
    if (!mssv) {
      audioService.playError();
      setScanResult({ status: 'error', errorMessage: 'Mã QR không hợp lệ' });
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
        setScanResult({
          status: 'success',
          studentName: result.data.student.full_name,
          studentClass: result.data.student.class_id,
          checkedAt: result.data.checkin_time,
        });
        setScanCount(prev => prev + 1);
      } else {
        audioService.playError();
        if (res.status === 409) {
          setScanResult({
            status: 'duplicate',
            studentName: result.data?.student?.full_name || result.details?.student?.full_name,
            studentClass: result.data?.student?.class_id || result.details?.student?.class_id,
            checkedAt: result.checked_at || result.data?.checkin_time,
            errorMessage: result.message || 'Đã điểm danh trước đó',
          });
        } else {
          setScanResult({
            status: 'error',
            errorMessage: result.message || 'Lỗi điểm danh',
          });
        }
      }
    } catch (err) {
      audioService.playError();
      setScanResult({ status: 'error', errorMessage: 'Lỗi kết nối' });
    }
  }, [selectedEventId, selectedRole]);

  // Camera scan handler
  const handleScan = async (data: string) => {
    if (isPaused || !selectedEventId) return;
    setIsPaused(true);
    await processCheckin(data);
  };

  // External scanner: handle Enter key from barcode scanner
  const handleExternalScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const input = externalInputRef.current;
    if (!input || !input.value.trim() || externalProcessing) return;

    const scannedValue = input.value.trim();
    input.value = '';
    
    setExternalProcessing(true);
    setScanResult(null);
    await processCheckin(scannedValue);
    setExternalProcessing(false);

    // Re-focus input for next scan
    setTimeout(() => {
      if (externalInputRef.current) {
        externalInputRef.current.focus();
      }
    }, 100);
  };

  // Clear result and re-focus for external mode
  const handleDismissResult = () => {
    setScanResult(null);
    setIsPaused(false);
    if (scanMode === 'external' && externalInputRef.current) {
      setTimeout(() => externalInputRef.current?.focus(), 100);
    }
  };

  if (loading) return <div className={styles.loading}>Đang tải...</div>;
  if (!user) return null;

  const isSuperAdmin = user.tier === 'super_admin';
  const isEventAdminOrSuper = isSuperAdmin || user.tier === 'event_admin';
  const activeEvents = (user.managed_events || []).filter(
    (e) => e.status === 'active' && e.is_active !== false
  );

  return (
    <div className={styles.container}>
      <Header userName={user.full_name || user.email} avatarUrl={user.avatar_url} showBack backHref="/" title="MÁY QUÉT ĐIỂM DANH" />
      <main className={styles.main}>
        <InAppBrowserWarning />
        
        <div className={styles.controls}>
          {activeEvents.length > 0 ? (
            <EventSelector 
              events={activeEvents} 
              selectedEventId={selectedEventId} 
              onChange={setSelectedEventId} 
            />
          ) : (
            <div style={{ padding: '0.85rem 1rem', background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '10px', color: '#64748b', fontSize: '0.9rem', textAlign: 'center', fontWeight: 600 }}>
              Hiện không có sự kiện nào đang mở điểm danh
            </div>
          )}
          {isEventAdminOrSuper ? (
            <RoleSelector 
              selectedRole={selectedRole} 
              onChange={setSelectedRole} 
            />
          ) : (
            <div className={styles.lockedRoleBadge}>
              <span className={styles.lockedRoleLabel}>VAI TRÒ ĐIỂM DANH:</span>
              <span className={styles.lockedRoleValue}>NGƯỜI THAM GIA</span>
            </div>
          )}

          {/* Mode toggle — super_admin only */}
          {isSuperAdmin && (
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              background: '#f1f5f9',
              borderRadius: '12px',
              padding: '4px',
            }}>
              <button
                onClick={() => setScanMode('camera')}
                style={{
                  flex: 1,
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: scanMode === 'camera' ? '#ffffff' : 'transparent',
                  color: scanMode === 'camera' ? '#2563eb' : '#64748b',
                  boxShadow: scanMode === 'camera' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                📷 Camera
              </button>
              <button
                onClick={() => setScanMode('external')}
                style={{
                  flex: 1,
                  padding: '0.55rem 1rem',
                  borderRadius: '10px',
                  border: 'none',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: scanMode === 'external' ? '#ffffff' : 'transparent',
                  color: scanMode === 'external' ? '#2563eb' : '#64748b',
                  boxShadow: scanMode === 'external' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                🔫 Máy Quét Ngoài
              </button>
            </div>
          )}
        </div>

        <div className={styles.scannerWrapper}>
          {scanMode === 'camera' ? (
            /* ═══ CAMERA MODE ═══ */
            selectedEventId && activeEvents.some(e => e.event_id === selectedEventId) ? (
              <QRScanner onScanSuccess={handleScan} isPaused={isPaused} />
            ) : (
              <div className={styles.noEvent}>
                {activeEvents.length === 0
                  ? 'Không có sự kiện nào đang diễn ra để quét mã'
                  : 'Vui lòng chọn sự kiện để quét mã'}
              </div>
            )
          ) : (
            /* ═══ EXTERNAL SCANNER MODE ═══ */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.25rem',
              padding: '2.5rem 1.5rem',
              minHeight: '280px',
              background: 'linear-gradient(135deg, #f0f9ff 0%, #eff6ff 50%, #f5f3ff 100%)',
              borderRadius: '16px',
              border: '2px dashed #bfdbfe',
            }}>
              <div style={{
                fontSize: '3.5rem',
                lineHeight: 1,
                animation: 'pulse 2s ease-in-out infinite',
              }}>
                🔫
              </div>
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 800, color: '#1e40af' }}>
                  Chế Độ Máy Quét Ngoài
                </h3>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                  Kết nối máy quét USB/Bluetooth → Bấm vào ô bên dưới → Quét mã QR
                </p>
              </div>

              <div style={{ width: '100%', maxWidth: '400px', position: 'relative' }}>
                <input
                  ref={externalInputRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  placeholder={externalProcessing ? '⏳ Đang xử lý...' : '📡 Chờ quét mã...'}
                  disabled={externalProcessing}
                  onKeyDown={handleExternalScan}
                  onBlur={() => {
                    // Auto re-focus after 500ms (barcode scanners sometimes cause blur)
                    setTimeout(() => {
                      if (scanMode === 'external' && externalInputRef.current) {
                        externalInputRef.current.focus();
                      }
                    }, 500);
                  }}
                  style={{
                    width: '100%',
                    padding: '1rem 1.25rem',
                    borderRadius: '14px',
                    border: `2.5px solid ${externalProcessing ? '#f59e0b' : '#2563eb'}`,
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    outline: 'none',
                    background: externalProcessing ? '#fffbeb' : '#ffffff',
                    color: '#1e293b',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
                    transition: 'border-color 0.2s, background 0.2s',
                    caretColor: '#2563eb',
                  }}
                />
                <div style={{
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.72rem',
                  color: '#94a3b8',
                  fontWeight: 600,
                }}>
                  💡 Ô input tự động nhận dữ liệu từ máy quét
                </div>
              </div>
            </div>
          )}
          
          <ScanResultOverlay 
            status={scanResult?.status || 'idle'}
            studentName={scanResult?.studentName}
            studentClass={scanResult?.studentClass}
            checkedAt={scanResult?.checkedAt}
            errorMessage={scanResult?.errorMessage}
            onDone={handleDismissResult}
          />
        </div>

        <div className={styles.stats}>
          <span>Số lượt quét thành công trong phiên:</span>
          <span className={styles.statHighlight}>{scanCount}</span>
        </div>
      </main>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
