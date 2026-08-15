'use client';

import React, { useEffect, useState } from 'react';
import { detectInAppBrowser, InAppBrowserInfo } from '@/lib/utils/detect-browser';
import { AlertTriangleIcon } from '@/components/icons';
import styles from './InAppBrowserWarning.module.css';

export default function InAppBrowserWarning() {
  const [browserInfo, setBrowserInfo] = useState<InAppBrowserInfo | null>(null);

  useEffect(() => {
    const info = detectInAppBrowser();
    if (info.isInApp) {
      setBrowserInfo(info);
    }
  }, []);

  if (!browserInfo) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div className={styles.iconContainer}>
          <AlertTriangleIcon size={32} />
        </div>
        <h2 className={styles.title}>Trình duyệt không hỗ trợ</h2>
        <p className={styles.message}>
          Bạn đang sử dụng trình duyệt tích hợp của {browserInfo.browserName || 'ứng dụng'}. 
          Trình duyệt này có thể chặn tính năng camera để quét mã QR.
        </p>
        <div className={styles.instructions}>
          <p>Vui lòng mở liên kết bằng trình duyệt gốc của máy:</p>
          <ul>
            <li>iOS: Nhấn vào biểu tượng <strong>Safari</strong> hoặc <strong>Mở trong trình duyệt</strong></li>
            <li>Android: Mở bằng <strong>Chrome</strong></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
