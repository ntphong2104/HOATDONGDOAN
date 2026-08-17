'use client';

import React from 'react';
import Image from 'next/image';
import styles from './DualLogos.module.css';

interface DualLogosProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export default function DualLogos({
  size = 'md',
  showText = false,
  className = '',
}: DualLogosProps) {
  const pixelSize = size === 'sm' ? 28 : size === 'lg' ? 52 : 38;

  return (
    <div className={`${styles.container} ${styles[size]} ${className}`}>
      <div className={styles.logosGroup}>
        {/* Logo PTIT */}
        <div className={styles.logoWrapper} title="Học viện Công nghệ Bưu chính Viễn thông">
          <Image
            src="/logos/logo-ptit.png"
            alt="Logo Học viện Công nghệ Bưu chính Viễn thông Cơ sở tại TP. Hồ Chí Minh"
            width={pixelSize}
            height={pixelSize}
            priority
            sizes={`${pixelSize}px`}
            className={styles.logoImg}
            style={{ width: `${pixelSize}px`, height: `${pixelSize}px`, objectFit: 'contain', aspectRatio: '1 / 1' }}
          />
        </div>

        {/* Logo Đoàn Thanh Niên */}
        <div className={styles.logoWrapper} title="Đoàn TNCS Hồ Chí Minh">
          <Image
            src="/logos/logo-doan.png"
            alt="Logo Đoàn TNCS Hồ Chí Minh Học viện Công nghệ Bưu chính Viễn thông"
            width={pixelSize}
            height={pixelSize}
            priority
            sizes={`${pixelSize}px`}
            className={styles.logoImg}
            style={{ width: `${pixelSize}px`, height: `${pixelSize}px`, objectFit: 'contain', aspectRatio: '1 / 1' }}
          />
        </div>
      </div>

      {showText && (
        <div className={styles.textGroup}>
          <span className={styles.schoolName}>HỌC VIỆN CÔNG NGHỆ BƯU CHÍNH VIỄN THÔNG</span>
          <span className={styles.orgName}>ĐOÀN THANH NIÊN</span>
        </div>
      )}
    </div>
  );
}
