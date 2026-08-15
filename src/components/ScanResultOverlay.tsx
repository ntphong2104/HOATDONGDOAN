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
}

export default function ScanResultOverlay({
  status,
  studentName,
  studentClass,
  checkedAt,
  errorMessage,
  onDone,
  result,
}: ScanResultOverlayProps) {
  useEffect(() => {
    if (onDone && status && status !== 'idle') {
      const timer = setTimeout(onDone, 2000);
      return () => clearTimeout(timer);
    }
  }, [status, onDone]);

  if (result) {
    const isSuccess = result.type === 'success';
    return (
      <div className={styles.overlay}>
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
    <div className={styles.overlay}>
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
