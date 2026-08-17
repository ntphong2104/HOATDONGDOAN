'use client';

import React, { useState } from 'react';
import QRScanner from '@/components/QRScanner';
import { CheckCircleIcon, AlertTriangleIcon } from '@/components/icons';
import { audioService } from '@/lib/utils/audio';
import styles from './StudentSelfScannerModal.module.css';

interface StudentSelfScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function StudentSelfScannerModal({
  isOpen,
  onClose,
  onSuccess,
}: StudentSelfScannerModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{
    status: 'success' | 'duplicate' | 'error';
    eventName?: string;
    message: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleScan = async (scannedData: string) => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const res = await fetch('/api/checkin/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: scannedData }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        audioService.playSuccess();
        setResult({
          status: 'success',
          eventName: data.data.event_name,
          message: 'Điểm danh minh chứng thành công!',
        });
        onSuccess();
      } else if (data.is_duplicate) {
        audioService.playDuplicate();
        setResult({
          status: 'duplicate',
          message: data.error || 'Bạn đã điểm danh sự kiện này rồi!',
        });
      } else {
        audioService.playError();
        setResult({
          status: 'error',
          message: data.error || 'Mã QR không hợp lệ hoặc đã hết hạn',
        });
      }
    } catch (err: any) {
      audioService.playError();
      setResult({
        status: 'error',
        message: 'Lỗi kết nối khi gửi dữ liệu điểm danh',
      });
    }
  };

  const handleDone = () => {
    setResult(null);
    setIsProcessing(false);
    onClose();
  };

  const handleRetry = () => {
    setResult(null);
    setIsProcessing(false);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {!result ? (
          <div className={styles.scannerContainer}>
            <QRScanner
              onScanSuccess={handleScan}
              onClose={onClose}
              isPaused={isProcessing}
              title="Quét mã QR"
              subtitle="Quét mã QR để điểm danh sự kiện Đoàn Thanh Niên"
              showBottomAction={true}
              bottomActionText="Đóng máy quét"
              onBottomAction={onClose}
            />
          </div>
        ) : (
          <div className={styles.resultBox}>
            {result.status === 'success' && (
              <>
                <CheckCircleIcon size={64} color="#16a34a" />
                <h4 className={styles.successTitle}>{result.message}</h4>
                {result.eventName && <p className={styles.eventInfo}>Sự kiện: {result.eventName}</p>}
                <button onClick={handleDone} className={styles.doneButton}>
                  Hoàn tất
                </button>
              </>
            )}

            {result.status === 'duplicate' && (
              <>
                <AlertTriangleIcon size={64} color="#d97706" />
                <h4 style={{ color: '#d97706', margin: 0, fontWeight: 800, fontSize: '1.25rem' }}>
                  Đã Điểm Danh Trước Đó
                </h4>
                <p style={{ color: '#64748b', fontSize: '0.95rem' }}>{result.message}</p>
                <button onClick={handleDone} className={styles.doneButton}>
                  Đóng
                </button>
              </>
            )}

            {result.status === 'error' && (
              <>
                <AlertTriangleIcon size={64} color="#dc2626" />
                <h4 className={styles.errorTitle}>Điểm Danh Thất Bại</h4>
                <p style={{ color: '#64748b', fontSize: '0.95rem' }}>{result.message}</p>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button onClick={handleRetry} className={styles.doneButton} style={{ background: '#475569' }}>
                    Quét lại
                  </button>
                  <button onClick={handleDone} className={styles.doneButton}>
                    Đóng
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
