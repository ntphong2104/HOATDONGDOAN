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
  disabled = false,
}: ExcelExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const formatDateTime = (val?: string) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

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

      // Format records into full, readable Vietnamese structure
      const formattedRows = exportData.map((row: any, index: number) => {
        const formatted: Record<string, any> = {
          'STT': row.stt || index + 1,
          'Mã Số Sinh Viên': row.mssv || '',
          'Họ Và Tên': row.full_name || row.name || '',
          'Lớp Niên Chế': row.class_id || row.class || '',
        };

        if (row.email || row.mssv) {
          formatted['Email Sinh Viên'] = row.email || `${String(row.mssv).toLowerCase()}@student.ptithcm.edu.vn`;
        }

        if (row.event_name) {
          formatted['Tên Sự Kiện'] = row.event_name;
        }

        if (row.semester) {
          formatted['Học Kỳ'] = row.semester;
        }

        if (row.participate_role || row.role_type) {
          const role = row.participate_role || row.role_type;
          formatted['Vai Trò Tham Gia'] =
            role === 'volunteer' || role === 'Cộng tác viên'
              ? 'Cộng tác viên (CTV)'
              : role === 'organizer' || role === 'Ban tổ chức'
              ? 'Ban tổ chức (BTC)'
              : 'Người tham gia (Sinh viên)';
        }

        if (row.checkin_time || row.created_at) {
          formatted['Thời Gian Điểm Danh'] = formatDateTime(row.checkin_time || row.created_at);
        }

        if (row.checked_by) {
          formatted['Hình Thức Điểm Danh'] = row.checked_by;
        }

        formatted['Trạng Thái Ghi Nhận'] = row.status || 'Hợp lệ (Đã ghi nhận ĐRL)';

        if (row.rating_stars !== undefined || row.stars !== undefined) {
          const stars = row.rating_stars ?? row.stars;
          formatted['Đánh Giá (Sao)'] = stars ? `${stars}/5 ⭐` : 'Chưa đánh giá';
        }

        if (row.feedback_note || row.comment || row.notes) {
          formatted['Nhận Xét / Góp Ý'] = row.feedback_note || row.comment || row.notes || '';
        }

        return formatted;
      });

      // Dynamically import xlsx
      const XLSX = await import('xlsx');

      const worksheet = XLSX.utils.json_to_sheet(formattedRows);

      // Auto-fit column widths
      const colWidths = Object.keys(formattedRows[0] || {}).map((key) => {
        let maxLen = key.length;
        formattedRows.forEach((row) => {
          const valStr = row[key] ? String(row[key]) : '';
          if (valStr.length > maxLen) {
            maxLen = valStr.length;
          }
        });
        return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
      });
      worksheet['!cols'] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh Sách');

      const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      XLSX.writeFile(workbook, finalFilename);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Đã xảy ra lỗi khi xuất file Excel');
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
