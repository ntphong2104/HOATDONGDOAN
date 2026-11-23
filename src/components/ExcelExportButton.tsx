'use client';

import React, { useState } from 'react';
import styles from './ExcelExportButton.module.css';
import { SpinnerIcon, DownloadIcon } from '@/components/icons';
import type { StyledColumnSpec } from '@/lib/utils/styled-excel';

interface ExcelExportButtonProps {
  fetchUrl?: string;
  data?: any[];
  filename: string;
  label?: string;
  disabled?: boolean;
  reportTitle?: string;
  reportSubtitle?: string;
  unitTitle?: string;
  sheetName?: string;
}

export default function ExcelExportButton({
  fetchUrl,
  data,
  filename,
  label = 'Tải Excel',
  disabled = false,
  reportTitle,
  reportSubtitle,
  unitTitle,
  sheetName,
}: ExcelExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const formatDateTime = (val?: string) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(d);
      const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
      return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}:${get('second')}`;
    } catch {
      const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      const day = String(vn.getUTCDate()).padStart(2, '0');
      const month = String(vn.getUTCMonth() + 1).padStart(2, '0');
      const year = vn.getUTCFullYear();
      const hours = String(vn.getUTCHours()).padStart(2, '0');
      const minutes = String(vn.getUTCMinutes()).padStart(2, '0');
      const seconds = String(vn.getUTCSeconds()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }
  };

  // Prevent Excel Formula Injection (CWE-1236)
  // Sanitize user-controlled text that starts with =, +, -, @ to prevent formula execution
  const sanitizeForExcel = (val: any): any => {
    if (typeof val === 'string' && val.length > 0 && /^[=+\-@]/.test(val)) {
      return `'${val}`;
    }
    return val;
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

      // Filter out invalid MSSV entries (corrupted data from bad imports)
      const { isValidMSSV } = await import('@/lib/utils/extract-mssv');
      const cleanData = exportData.filter((row: any) => !row.mssv || isValidMSSV(row.mssv));
      const filteredCount = exportData.length - cleanData.length;
      
      if (cleanData.length === 0) {
        alert('Không có dữ liệu hợp lệ để xuất!');
        return;
      }

      if (filteredCount > 0) {
        console.warn(`[ExcelExport] Đã lọc bỏ ${filteredCount} dòng có MSSV không hợp lệ`);
      }

      exportData = cleanData;

      const inferDefaultTitle = (): string => {
        if (reportTitle) return reportTitle;
        const f = filename.toLowerCase();
        if (f.includes('drl')) {
          return 'BẢNG TỔNG HỢP MINH CHỨNG & ĐIỂM RÈN LUYỆN ĐOÀN VIÊN';
        }
        if (f.includes('don-vi')) {
          return 'DANH BẠ ĐƠN VỊ ĐOÀN – HỘI & CÂU LẠC BỘ TRỰC THUỘC';
        }
        if (f.includes('sinh-vien')) {
          return 'DANH SÁCH ĐOÀN VIÊN – SINH VIÊN HỆ THỐNG';
        }
        return 'DANH SÁCH ĐIỂM DANH & MINH CHỨNG HOẠT ĐỘNG ĐOÀN';
      };

      const isUnitDirectory =
        exportData.length > 0 && exportData[0]?.code !== undefined && !exportData[0]?.mssv;

      if (isUnitDirectory) {
        const unitRows = exportData.map((u: any, index: number) => ({
          stt: u.stt || index + 1,
          code: u.code || '',
          name: sanitizeForExcel(u.name || ''),
          type:
            u.type === 'lcd'
              ? 'Liên Chi Đoàn (LCĐ)'
              : u.type === 'clb'
              ? 'CLB / Đội / Nhóm'
              : u.type === 'doan_truong' || u.type === 'school'
              ? 'Đoàn Trường'
              : sanitizeForExcel(String(u.type || 'Đơn vị trực thuộc')),
          email: u.email || '',
        }));

        const columns: StyledColumnSpec[] = [
          { key: 'stt', label: 'STT', align: 'center', width: 7, numFmt: 'rawInt' },
          { key: 'code', label: 'Mã Đơn Vị', align: 'center', width: 16, tone: 'code' },
          { key: 'name', label: 'Tên Đơn Vị / Tổ Chức', align: 'left', width: 38, tone: 'bold' },
          { key: 'type', label: 'Phân Loại', align: 'center', width: 22 },
          { key: 'email', label: 'Email Đơn Vị', align: 'left', width: 34 },
        ];

        const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
        const { downloadStyledSheet } = await import('@/lib/utils/styled-excel');
        downloadStyledSheet({
          filename: finalFilename,
          sheetName: sheetName || 'DanhBa_DonVi',
          reportTitle: inferDefaultTitle(),
          reportSubtitle: reportSubtitle
            ? `${reportSubtitle}  •  Tổng số: ${unitRows.length} đơn vị`
            : `Tổng số: ${unitRows.length} đơn vị trực thuộc`,
          unitTitle,
          columns,
          rows: unitRows,
        });
        return;
      }

      // Format student / check-in records into full, readable Vietnamese structure
      const hasAnyPhone = exportData.some((r: any) => r?.phone !== undefined);
      const hasAnyGender = exportData.some((r: any) => r?.gender !== undefined);

      const formattedRows = exportData.map((row: any, index: number) => {
        const formatted: Record<string, any> = {
          'STT': row.stt || index + 1,
          'Mã Số Sinh Viên': row.mssv || '',
          'Họ Và Tên': sanitizeForExcel(row.full_name || row.name || ''),
          'Lớp Niên Chế': sanitizeForExcel(row.class_id || row.class || ''),
        };

        if (row.khoa !== undefined) {
          formatted['Khóa'] = sanitizeForExcel(row.khoa || '');
        }

        if (hasAnyPhone) {
          formatted['Số Điện Thoại'] = sanitizeForExcel(row.phone || '');
        }

        if (hasAnyGender) {
          formatted['Giới Tính'] = sanitizeForExcel(row.gender || '');
        }

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

        if (row.so_su_kien_tham_gia !== undefined) {
          formatted['Số Sự Kiện Đã Tham Gia'] = Number(row.so_su_kien_tham_gia) || 0;
          formatted['Danh Sách Sự Kiện Đã Tham Gia'] = sanitizeForExcel(
            row.danh_sach_su_kien || 'Chưa tham gia sự kiện nào'
          );
        } else if (row.so_su_kien_drl !== undefined) {
          formatted['Số SK Tham Gia'] = Number(row.so_su_kien_drl) || 0;
          formatted['Chức Vụ Chi Đoàn'] = sanitizeForExcel(row.bch_chi_doan || '—');
        } else {
          formatted['Trạng Thái Ghi Nhận'] = row.status || 'Hợp lệ (Đã ghi nhận ĐRL)';
        }

        if (row.rating_stars !== undefined || row.stars !== undefined) {
          const stars = row.rating_stars ?? row.stars;
          formatted['Đánh Giá (Sao)'] = stars ? `${stars}/5 ★` : 'Chưa đánh giá';
        }

        if (row.feedback_note || row.comment || row.notes) {
          formatted['Nhận Xét / Góp Ý'] = sanitizeForExcel(row.feedback_note || row.comment || row.notes || '');
        }

        return formatted;
      });

      const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
      const { downloadStyledSheet } = await import('@/lib/utils/styled-excel');
      downloadStyledSheet({
        filename: finalFilename,
        sheetName: sheetName || 'DanhSach',
        reportTitle: inferDefaultTitle(),
        reportSubtitle: reportSubtitle
          ? `${reportSubtitle}  •  Tổng số: ${formattedRows.length} bản ghi hợp lệ`
          : `Tổng số: ${formattedRows.length} bản ghi hợp lệ`,
        unitTitle,
        rows: formattedRows,
      });
    } catch (error) {
      console.error('Export failed:', error);
      alert('Đã xảy ra lỗi khi xuất file Excel');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
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
