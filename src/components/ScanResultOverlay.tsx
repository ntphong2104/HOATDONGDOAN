'use client';

import React, { useEffect } from 'react';
import styles from './ScanResultOverlay.module.css';

import { CheckIcon, CloseIcon } from '@/components/icons';

interface ScanResultOverlayProps {
  status?: 'success' | 'duplicate' | 'error' | 'idle';
  studentName?: string;
  studentClass?: string;
  checkedAt?: string;
  errorMessage?: string;
  onDone?: () => void;
  result?: { type: 'success' | 'error'; message: string; info?: string } | null;
  autoCloseMs?: number;
}

export default function ScanResultOverlay({
  status,
  studentName,
  studentClass,
  checkedAt,
  errorMessage,
  onDone,
  result,
  autoCloseMs,
}: ScanResultOverlayProps) {
  useEffect(() => {
    if (onDone && status && status !== 'idle') {
      const defaultDuration = status === 'success' ? 900 : 1800;
      const duration = autoCloseMs !== undefined ? autoCloseMs : defaultDuration;
      const timer = setTimeout(onDone, duration);
      return () => clearTimeout(timer);
    }
  }, [status, onDone, autoCloseMs]);

  if (result) {
    const isSuccess = result.type === 'success';
    return (
      <div className={styles.overlay} onClick={onDone} style={{ cursor: 'pointer' }}>
        <div className={`${styles.card} ${styles[result.type]}`}>
          <div className={styles.iconWrapper}>
            {isSuccess ? <CheckIcon size={32} /> : <CloseIcon size={32} />}
          </div>
          <h2 className={styles.title}>{result.message}</h2>
          {result.info && <p className={styles.message}>{result.info}</p>}
        </div>
      </div>
    );
  }

  if (!status || status === 'idle') return null;

  const isSuccess = status === 'success';
  const isDuplicate = status === 'duplicate';

  return (
    <div className={styles.overlay} onClick={onDone} style={{ cursor: 'pointer' }}>
      <div className={`${styles.card} ${styles[status]}`}>
        <div className={styles.iconWrapper}>
          {isSuccess && <CheckIcon size={32} />}
          {(isDuplicate || status === 'error') && <CloseIcon size={32} />}
        </div>

        <h2 className={styles.title}>
          {isSuccess ? 'Thành công' : isDuplicate ? 'Đã điểm danh' : 'Lỗi'}
        </h2>

        {studentName && (
          <div className={styles.studentInfo}>
            <p className={styles.name}>{studentName}</p>
            {studentClass && <p className={styles.classInfo}>{studentClass}</p>}
          </div>
        )}

        {isDuplicate && checkedAt && (
          <p className={styles.message}>
            Đã điểm danh lúc: {new Date(checkedAt).toLocaleTimeString('vi-VN')}
          </p>
        )}

        {status === 'error' && errorMessage && (
          <p className={styles.message}>{errorMessage}</p>
        )}
      </div>
    </div>
  );
}
