'use client';

import React, { useRef } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { DownloadIcon } from '@/components/icons';
import styles from './QRCodeDisplay.module.css';

interface QRCodeDisplayProps {
  value: string;
  studentName?: string;
  name?: string;
  studentId?: string;
  studentClass?: string;
  className?: string;
  size?: number;
}

export default function QRCodeDisplay({
  value,
  studentName,
  name,
  studentId,
  studentClass,
  className = '',
  size = 256,
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const displayName = studentName || name || studentId || value;

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current.querySelector('canvas');
    if (!canvas) return;

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR_${value}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={`${styles.card} ${className}`}>
      <div className={styles.header}>
        <h3 className={styles.name}>{displayName}</h3>
        {studentClass && <p className={styles.classInfo}>{studentClass}</p>}
      </div>
      
      <div className={styles.qrContainer}>
        {/* SVG for display (crisp rendering) */}
        <QRCodeSVG 
          value={value} 
          size={size} 
          level="M" 
          includeMargin={false}
          className={styles.qrCode}
        />
        
        {/* Hidden Canvas for download */}
        <div ref={canvasRef} style={{ display: 'none' }}>
          <QRCodeCanvas value={value} size={1024} level="M" />
        </div>
      </div>
      
      <div className={styles.footer}>
        <span className={styles.mssv}>{studentId || value}</span>
      </div>

      <button onClick={handleDownload} className={styles.downloadButton}>
        <DownloadIcon size={18} />
        Lưu ảnh QR
      </button>
    </div>
  );
}
