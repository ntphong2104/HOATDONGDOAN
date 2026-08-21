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
  const [parsedStudents, setParsedStudents] = useState<Array<{
    mssv: string;
    full_name?: string;
    class_id?: string;
    phone?: string;
    gender?: string;
    department_name?: string;
    note?: string;
  }>>([]);
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
      setParsedStudents([]);
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
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        let headerRowIdx = -1;
        let colMap: Record<string, number> = {
          mssv: -1,
          fullName: -1,
          hoLot: -1,
          ten: -1,
          classId: -1,
          phone: -1,
          gender: -1,
          dept: -1,
          note: -1,
        };

        for (let i = 0; i < Math.min(rows.length, 12); i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const normalizedRow = row.map((cell) => String(cell || '').trim().toLowerCase());

          const mIdx = normalizedRow.findIndex((c) =>
            c.includes('mssv') || c.includes('mã sv') || c.includes('mã sinh viên') || c.includes('mã số sv') || c === 'id' || c.includes('student id')
          );

          if (mIdx !== -1) {
            headerRowIdx = i;
            colMap.mssv = mIdx;
            colMap.fullName = normalizedRow.findIndex((c) =>
              c.includes('họ và tên') || c.includes('họ tên') || c.includes('họ & tên') || c.includes('tên sinh viên') || c.includes('full name')
            );
            colMap.hoLot = normalizedRow.findIndex((c) =>
              c.includes('họ lót') || c.includes('họ đệm') || c === 'họ'
            );
            colMap.ten = normalizedRow.findIndex((c, idx) =>
              idx !== colMap.fullName && (c === 'tên' || c === 'name')
            );
            colMap.classId = normalizedRow.findIndex((c) =>
              c.includes('lớp') || c.includes('class') || c.includes('chi đoàn')
            );
            colMap.phone = normalizedRow.findIndex((c) =>
              c.includes('sđt') || c.includes('điện thoại') || c.includes('phone') || c.includes('zalo') || c.includes('số dt') || c.includes('sdt')
            );
            colMap.gender = normalizedRow.findIndex((c) =>
              c.includes('giới tính') || c.includes('phái') || c.includes('gender') || c.includes('nam/nữ')
            );
            colMap.dept = normalizedRow.findIndex((c) =>
              c.includes('ban') || c.includes('vị trí') || c.includes('bộ phận') || c.includes('chuyên trách') || c.includes('department') || c.includes('ca trực') || c.includes('buổi')
            );
            colMap.note = normalizedRow.findIndex((c) =>
              c.includes('ghi chú') || c.includes('kỹ năng') || c.includes('nhiệm vụ') || c.includes('note')
            );
            break;
          }
        }

        const items: Array<{
          mssv: string;
          full_name?: string;
          class_id?: string;
          phone?: string;
          gender?: string;
          department_name?: string;
          note?: string;
        }> = [];
        const mssvList: string[] = [];

        if (headerRowIdx !== -1 && colMap.mssv !== -1) {
          for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;
            const rawMssv = String(row[colMap.mssv] || '').trim().toUpperCase();
            if (!rawMssv || rawMssv.length < 5 || rawMssv.includes('MSSV') || rawMssv.includes('TỔNG') || rawMssv.includes('DANH SÁCH')) continue;

            let fullName = '';
            if (colMap.fullName !== -1 && row[colMap.fullName]) {
              fullName = String(row[colMap.fullName]).trim();
            } else if (colMap.hoLot !== -1 && row[colMap.hoLot]) {
              const ho = String(row[colMap.hoLot]).trim();
              const ten = colMap.ten !== -1 && row[colMap.ten] ? String(row[colMap.ten]).trim() : '';
              fullName = `${ho} ${ten}`.trim();
            }

            let classId = colMap.classId !== -1 && row[colMap.classId] ? String(row[colMap.classId]).trim() : '';
            let phone = colMap.phone !== -1 && row[colMap.phone] ? String(row[colMap.phone]).trim() : '';
            let gender = colMap.gender !== -1 && row[colMap.gender] ? String(row[colMap.gender]).trim() : '';
            if (gender) {
              gender = gender.toLowerCase().includes('nam') || gender.toLowerCase() === 'm' ? 'Nam' : 'Nữ';
            }
            let deptName = colMap.dept !== -1 && row[colMap.dept] ? String(row[colMap.dept]).trim() : '';
            let note = colMap.note !== -1 && row[colMap.note] ? String(row[colMap.note]).trim() : '';

            items.push({
              mssv: rawMssv,
              full_name: fullName || undefined,
              class_id: classId || undefined,
              phone: phone || undefined,
              gender: gender || undefined,
              department_name: deptName || undefined,
              note: note || undefined,
            });
            mssvList.push(rawMssv);
          }
        }

        // Fallback if header finding didn't catch structured data
        if (items.length === 0) {
          rows.forEach((row) => {
            if (Array.isArray(row)) {
              row.forEach((cell) => {
                if (cell) {
                  const str = String(cell).trim().toUpperCase();
                  if (/^[A-Z0-9_-]{6,15}$/.test(str) && !str.includes('MSSV') && !str.includes('STT')) {
                    items.push({ mssv: str });
                    mssvList.push(str);
                  }
                }
              });
            }
          });
        }

        if (items.length > 0) {
          const uniqueItemsMap = new Map<string, typeof items[0]>();
          items.forEach((item) => {
            if (!uniqueItemsMap.has(item.mssv)) {
              uniqueItemsMap.set(item.mssv, item);
            }
          });
          const uniqueItems = Array.from(uniqueItemsMap.values());
          setParsedStudents(uniqueItems);
          setInputText(uniqueItems.map((i) => i.mssv).join('\n'));
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
          students_data: parsedStudents.length > 0 ? parsedStudents : undefined,
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
                <span className={styles.dropZoneSecondary}>Hệ thống tự động nhận diện Họ tên, Lớp, SĐT, Ban, Giới tính...</span>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className={styles.hiddenFileInput}
              />
            </label>

            {parsedStudents.length > 0 && parsedStudents.some((s) => s.full_name || s.class_id || s.phone) && (
              <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', fontSize: '0.8rem', color: '#047857', fontWeight: 600 }}>
                ✨ Đã nhận diện thông tin chi tiết của <strong>{parsedStudents.length}</strong> sinh viên (gồm Họ tên, Lớp, SĐT, Ban...) từ file Excel!
              </div>
            )}
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
