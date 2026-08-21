'use client';

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloudIcon,
  CloseIcon,
  SpinnerIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  FileExcelIcon,
  UsersIcon,
} from '@/components/icons';
import styles from './EventBulkImportModal.module.css';

interface EventBulkImportModalProps {
  eventId: string;
  eventName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialRole?: 'participant' | 'volunteer' | 'organizer';
  initialMode?: 'checkin' | 'register';
  departments?: Array<{ id: string; name: string }>;
  initialDepartmentId?: string;
}

export default function EventBulkImportModal({
  eventId,
  eventName,
  isOpen,
  onClose,
  onSuccess,
  initialRole = 'participant',
  initialMode = 'checkin',
  departments = [],
  initialDepartmentId = '',
}: EventBulkImportModalProps) {
  const [inputText, setInputText] = useState('');
  const [role, setRole] = useState<'participant' | 'volunteer' | 'organizer'>(initialRole);
  const [mode, setMode] = useState<'checkin' | 'register'>(initialMode);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(initialDepartmentId);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (initialRole) setRole(initialRole);
      if (initialMode) setMode(initialMode);
      if (initialDepartmentId) setSelectedDeptId(initialDepartmentId);
      setFeedback(null);
    }
  }, [isOpen, initialRole, initialMode, initialDepartmentId]);

  if (!isOpen) return null;

  // Extract valid MSSVs from text
  const parseMssvList = (text: string): string[] => {
    return Array.from(
      new Set(
        text
          .split(/[\r\n,;\t\s]+/)
          .map((s) => s.trim().toUpperCase())
          .filter((s) => s.length >= 4 && s.length <= 20)
      )
    );
  };

  const parsedMssvs = parseMssvList(inputText);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const extracted: string[] = [];
        rows.forEach((row) => {
          if (Array.isArray(row)) {
            row.forEach((cell) => {
              if (cell) {
                const str = String(cell).trim().toUpperCase();
                // Match standard PTIT MSSV patterns like N22DCCN..., D22CQCN..., etc.
                if (/^[A-Z0-9_-]{6,15}$/.test(str) && !str.includes('MSSV') && !str.includes('STT')) {
                  extracted.push(str);
                }
              }
            });
          }
        });

        if (extracted.length > 0) {
          const combined = Array.from(new Set([...parsedMssvs, ...extracted]));
          setInputText(combined.join('\n'));
        } else {
          setFeedback({
            type: 'error',
            message: 'Không tìm thấy cột MSSV hợp lệ trong file Excel. Vui lòng kiểm tra lại.',
          });
        }
      } catch (err: any) {
        console.error('File parse error:', err);
        setFeedback({
          type: 'error',
          message: 'Lỗi đọc file Excel. Vui lòng thử lại hoặc dán danh sách trực tiếp.',
        });
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedMssvs.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Vui lòng nhập hoặc dán ít nhất một mã số sinh viên hợp lệ.',
      });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const selectedDept = departments.find((d) => d.id === selectedDeptId);
      const res = await fetch(`/api/events/${eventId}/import-students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv_list: parsedMssvs,
          participate_role: role,
          mode,
          department_id: role === 'volunteer' ? (selectedDeptId || null) : null,
          department_name: role === 'volunteer' ? (selectedDept ? selectedDept.name : 'Ban CTV') : null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || `Đã nạp thành công ${data.count} sinh viên!`,
        });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Đã xảy ra lỗi khi nạp danh sách.',
        });
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({
        type: 'error',
        message: 'Lỗi kết nối máy chủ, vui lòng thử lại sau.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerTitleArea}>
            <div className={styles.iconWrapper}>
              <UploadCloudIcon size={22} color="#1e40af" />
            </div>
            <div>
              <h2 className={styles.title}>Nạp danh sách MSSV sự kiện</h2>
              <p className={styles.subtitle}>{eventName}</p>
            </div>
          </div>
          <button onClick={onClose} className={styles.closeButton} type="button" aria-label="Đóng">
            <CloseIcon size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.body}>
          {/* Permission notice banner */}
          <div className={styles.permissionBanner}>
            <span className={styles.permissionTag}>Quyền hạn Ban Tổ Chức</span>
            <span>Ban Tổ Chức và Ban Quản Trị có quyền nạp trực tiếp danh sách MSSV tham gia, CTV hoặc điểm danh sự kiện.</span>
          </div>

          {/* Configuration Grid */}
          <div className={styles.configGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Hình thức nạp vào sự kiện</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as any)}
                className={styles.select}
              >
                <option value="checkin">Ghi nhận điểm danh có mặt ngay (Check-in)</option>
                <option value="register">Thêm vào danh sách đã đăng ký trước</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Vai trò tham gia</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className={styles.select}
              >
                <option value="participant">Người tham gia (Khán giả)</option>
                <option value="volunteer">Cộng tác viên (CTV)</option>
                <option value="organizer">Ban tổ chức (BTC)</option>
              </select>
            </div>

            {role === 'volunteer' && departments && departments.length > 0 && (
              <div className={styles.formGroup} style={{ gridColumn: 'span 2' }}>
                <label className={styles.label}>Phân bổ vào Ban Chuyên Trách</label>
                <select
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  className={styles.select}
                >
                  <option value="">-- Ban CTV Chung --</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* File Upload Area */}
          <div className={styles.formGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>Tải file Excel / CSV (Tùy chọn)</label>
              {fileName && <span className={styles.fileName}>{fileName}</span>}
            </div>
            <label className={styles.dropZone}>
              <FileExcelIcon size={24} color="#16a34a" />
              <div className={styles.dropZoneText}>
                <span className={styles.dropZonePrimary}>Bấm để chọn file Excel (.xlsx, .xls, .csv)</span>
                <span className={styles.dropZoneSecondary}>Hệ thống tự động quét và trích xuất cột MSSV</span>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className={styles.hiddenFileInput}
              />
            </label>
          </div>

          {/* Direct Text Input Area */}
          <div className={styles.formGroup}>
            <div className={styles.labelRow}>
              <label className={styles.label}>Hoặc dán danh sách MSSV trực tiếp</label>
              <span className={styles.badgeCount}>
                <UsersIcon size={14} />
                <span>{parsedMssvs.length} MSSV hợp lệ</span>
              </span>
            </div>
            <textarea
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Dán danh sách MSSV vào đây (mỗi dòng một MSSV hoặc cách nhau bằng dấu phẩy, khoảng trắng)&#10;Ví dụ:&#10;N22DCCN001&#10;N22DCCN002&#10;D22CQCN01-N"
              className={styles.textarea}
            />
          </div>

          {/* Feedback message */}
          {feedback && (
            <div className={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}>
              {feedback.type === 'success' ? (
                <CheckCircleIcon size={18} color="#16a34a" />
              ) : (
                <AlertTriangleIcon size={18} color="#dc2626" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className={styles.actions}>
            <button
              type="button"
              onClick={onClose}
              className={styles.cancelButton}
              disabled={loading}
            >
              Hủy
            </button>
            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading || parsedMssvs.length === 0}
            >
              {loading ? (
                <>
                  <SpinnerIcon size={18} className={styles.spinner} />
                  <span>Đang xử lý nạp...</span>
                </>
              ) : (
                <>
                  <UploadCloudIcon size={18} />
                  <span>Xác nhận nạp {parsedMssvs.length > 0 ? `(${parsedMssvs.length} SV)` : ''}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
