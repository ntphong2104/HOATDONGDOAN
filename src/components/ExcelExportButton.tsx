'use client';

import React, { useState } from 'react';
import styles from './ExcelExportButton.module.css';
import { SpinnerIcon, DownloadIcon } from '@/components/icons';

interface ExcelExportButtonProps {
  fetchUrl?: string;
  data?: any[];
  filename: string;
  label?: string;
  disabled?: boolean;
}

export default function ExcelExportButton({
  fetchUrl,
  data,
  filename,
  label = 'Tải Excel',
  disabled = false
}: ExcelExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    try {
      setIsLoading(true);
      
      let exportData = data;
      if (!exportData && fetchUrl) {
        const response = await fetch(fetchUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const json = await response.json();
        exportData = json.data?.checkins || json.data || [];
      }
      
      if (!Array.isArray(exportData) || exportData.length === 0) {
        alert('Không có dữ liệu để xuất!');
        return;
      }

      // Dynamically import xlsx to avoid huge bundle sizes
      const XLSX = await import('xlsx');
      
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      
      const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      XLSX.writeFile(workbook, finalFilename);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Đã xảy ra lỗi khi xuất file');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button 
      className={styles.button}
      onClick={handleExport}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <SpinnerIcon className={styles.spinner} size={18} />
      ) : (
        <DownloadIcon className={styles.icon} size={18} />
      )}
      {isLoading ? 'Đang xử lý...' : label}
    </button>
  );
}
