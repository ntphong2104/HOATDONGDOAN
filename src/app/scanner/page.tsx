'use client';

import { useState, useEffect } from 'react';
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
      });
  }, [router]);

  const handleScan = async (data: string) => {
    if (isPaused || !selectedEventId) return;
    
    setIsPaused(true);
    const mssv = extractMSSV(data);
    
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
  };

  if (loading) return <div className={styles.loading}>Đang tải...</div>;
  if (!user) return null;

  const isEventAdminOrSuper = user.tier === 'super_admin' || user.tier === 'event_admin';
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
        </div>

        <div className={styles.scannerWrapper}>
          {selectedEventId && activeEvents.some(e => e.event_id === selectedEventId) ? (
            <QRScanner onScanSuccess={handleScan} isPaused={isPaused} />
          ) : (
            <div className={styles.noEvent}>
              {activeEvents.length === 0
                ? 'Không có sự kiện nào đang diễn ra để quét mã'
                : 'Vui lòng chọn sự kiện để quét mã'}
            </div>
          )}
          
          <ScanResultOverlay 
            status={scanResult?.status || 'idle'}
            studentName={scanResult?.studentName}
            studentClass={scanResult?.studentClass}
            checkedAt={scanResult?.checkedAt}
            errorMessage={scanResult?.errorMessage}
            onDone={() => {
              setScanResult(null);
              setIsPaused(false);
            }}
          />
        </div>

        <div className={styles.stats}>
          <span>Số lượt quét thành công trong phiên:</span>
          <span className={styles.statHighlight}>{scanCount}</span>
        </div>
      </main>
    </div>
  );
}
