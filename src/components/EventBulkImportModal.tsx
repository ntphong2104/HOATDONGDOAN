'use client';

import React, { useState } from 'react';
import {
  UploadCloudIcon,
  CloseIcon,
  SpinnerIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  FileExcelIcon,
  UsersIcon,
  TrashIcon,
  ArrowLeftIcon,
} from '@/components/icons';
import { isValidMSSV } from '@/lib/utils/extract-mssv';
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

interface PreviewStudent {
  mssv: string;
  full_name: string;
  class_id: string;
  phone?: string;
  gender?: string;
  department_name?: string;
  role_type?: string;
  in_system: boolean;
  from_excel: boolean;
  is_already_checked_in: boolean;
  checked_in_at: string | null;
  checked_by: string | null;
  is_registered: boolean;
  registered_role: string | null;
  is_duplicate_in_file: boolean;
  duplicate_count: number;
  warnings: string[];
  badges: Array<{ type: 'danger' | 'warning' | 'info' | 'success'; text: string }>;
}

interface PreviewSummary {
  total_valid: number;
  rejected: number;
  in_file_duplicates: number;
  already_checked_in: number;
  already_registered: number;
  not_registered: number;
  not_in_system: number;
  ready_to_import: number;
  capacity: {
    max_participants: number;
    current_count: number;
    new_add_count: number;
    projected_total: number;
    is_overflow: boolean;
    overflow_count: number;
    remaining_slots: number | null;
  };
}

interface PreviewResponse {
  total: number;
  rejected: number;
  rejected_mssvs: string[];
  warnings_count: number;
  target_mode: 'checkin' | 'register';
  summary: PreviewSummary;
  students: PreviewStudent[];
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
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [inputText, setInputText] = useState('');
  const [parsedStudents, setParsedStudents] = useState<Array<{
    mssv: string;
    full_name?: string;
    class_id?: string;
    phone?: string;
    gender?: string;
    department_name?: string;
    role_type?: 'participant' | 'volunteer' | 'organizer';
    note?: string;
  }>>([]);
  const [role, setRole] = useState<'participant' | 'volunteer' | 'organizer'>(initialRole);
  const [mode, setMode] = useState<'checkin' | 'register'>(initialMode);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(initialDepartmentId);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'warnings' | 'already_checked_in' | 'not_registered' | 'ready'>('all');

  React.useEffect(() => {
    if (isOpen) {
      if (initialRole) setRole(initialRole);
      if (initialMode) setMode(initialMode);
      if (initialDepartmentId) setSelectedDeptId(initialDepartmentId);
      setStep('input');
      setFeedback(null);
      setParsedStudents([]);
      setInputText('');
      setFileName(null);
      setPreviewData(null);
      setPreviewFilter('all');
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
          .filter((s) => s.length >= 4 && isValidMSSV(s))
      )
    );
  };

  const allEntries = inputText
    .split(/[\r\n,;\t\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 4);
  const parsedMssvs = parseMssvList(inputText);
  const rejectedCount = allEntries.filter((s) => !isValidMSSV(s)).length;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setFeedback(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const buffer = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array' });
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
          role: -1,
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
            colMap.role = normalizedRow.findIndex((c) =>
              c.includes('vai trò') || c.includes('role') || c.includes('đối tượng') || c.includes('hình thức') || c.includes('tư cách') || c.includes('phân loại')
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
          role_type?: 'participant' | 'volunteer' | 'organizer';
          note?: string;
        }> = [];
        const mssvList: string[] = [];

        if (headerRowIdx !== -1 && colMap.mssv !== -1) {
          for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;
            const rawMssv = String(row[colMap.mssv] || '').trim().toUpperCase();
            if (!rawMssv || rawMssv.length < 5 || rawMssv.includes('MSSV') || rawMssv.includes('TỔNG') || rawMssv.includes('DANH SÁCH') || !isValidMSSV(rawMssv)) continue;

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

            let parsedRole: 'participant' | 'volunteer' | 'organizer' | undefined = undefined;
            if (colMap.role !== -1 && row[colMap.role]) {
              const rStr = String(row[colMap.role]).toLowerCase().trim();
              if (rStr.includes('ctv') || rStr.includes('cộng tác') || rStr.includes('tình nguyện') || rStr.includes('volunteer') || rStr.includes('hỗ trợ')) {
                parsedRole = 'volunteer';
              } else if (rStr.includes('btc') || rStr.includes('tổ chức') || rStr.includes('organizer') || rStr.includes('ban tổ chức') || rStr.includes('admin')) {
                parsedRole = 'organizer';
              } else if (rStr.includes('tham gia') || rStr.includes('participant') || rStr.includes('người tham gia') || rStr.includes('sinh viên') || rStr.includes('khán giả') || rStr.includes('sv')) {
                parsedRole = 'participant';
              }
            }

            if (!parsedRole && deptName && deptName.trim()) {
              parsedRole = 'volunteer';
            }

            items.push({
              mssv: rawMssv,
              full_name: fullName || undefined,
              class_id: classId || undefined,
              phone: phone || undefined,
              gender: gender || undefined,
              department_name: deptName || undefined,
              role_type: parsedRole,
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
                  if (isValidMSSV(str) && !str.includes('STT')) {
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
    reader.readAsArrayBuffer(file);
  };

  // Run comprehensive validation check
  const handleValidateAndPreview = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      const res = await fetch(`/api/events/${eventId}/import-students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv_list: parsedMssvs,
          students_data: parsedStudents.length > 0 ? parsedStudents : undefined,
          participate_role: role,
          mode: 'validate',
          target_mode: mode,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setFeedback({ type: 'error', message: data.error || 'Lỗi kiểm tra danh sách' });
        setLoading(false);
        return;
      }

      setPreviewData(data);
      setStep('preview');
      setPreviewFilter('all');
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Lỗi kết nối máy chủ khi kiểm tra danh sách.' });
    } finally {
      setLoading(false);
    }
  };

  // Remove a single student from preview list
  const handleRemoveStudent = (mssvToRemove: string) => {
    if (!previewData) return;
    const target = previewData.students.find((s) => s.mssv === mssvToRemove);
    const updatedStudents = previewData.students.filter((s) => s.mssv !== mssvToRemove);

    const wasWarning = target && target.warnings.length > 0;
    const wasAlreadyCheckedIn = target && target.is_already_checked_in;
    const wasDuplicate = target && target.is_duplicate_in_file;
    const wasNotInSystem = target && !target.in_system;
    const wasNotRegistered = target && !target.is_registered;

    const newWarningsCount = previewData.warnings_count - (wasWarning ? 1 : 0);
    const newSummary = {
      ...previewData.summary,
      total_valid: updatedStudents.length,
      already_checked_in: Math.max(0, previewData.summary.already_checked_in - (wasAlreadyCheckedIn ? 1 : 0)),
      in_file_duplicates: Math.max(0, previewData.summary.in_file_duplicates - (wasDuplicate ? 1 : 0)),
      not_in_system: Math.max(0, previewData.summary.not_in_system - (wasNotInSystem ? 1 : 0)),
      not_registered: Math.max(0, previewData.summary.not_registered - (wasNotRegistered ? 1 : 0)),
    };

    setPreviewData({
      ...previewData,
      total: updatedStudents.length,
      warnings_count: Math.max(0, newWarningsCount),
      summary: newSummary,
      students: updatedStudents,
    });

    setParsedStudents((prev) => prev.filter((s) => s.mssv !== mssvToRemove));
  };

  // Remove all students already checked in
  const handleRemoveAlreadyCheckedIn = () => {
    if (!previewData) return;
    const keptStudents = previewData.students.filter((s) => !s.is_already_checked_in);
    const keptWarnings = keptStudents.filter((s) => s.warnings.length > 0).length;

    setPreviewData({
      ...previewData,
      total: keptStudents.length,
      warnings_count: keptWarnings,
      summary: {
        ...previewData.summary,
        total_valid: keptStudents.length,
        already_checked_in: 0,
      },
      students: keptStudents,
    });
    setParsedStudents((prev) => prev.filter((s) => keptStudents.some((ks) => ks.mssv === s.mssv)));
  };

  // Remove all warnings
  const handleRemoveAllWarnings = () => {
    if (!previewData) return;
    const validOnlyStudents = previewData.students.filter((s) => s.warnings.length === 0);

    setPreviewData({
      ...previewData,
      total: validOnlyStudents.length,
      warnings_count: 0,
      summary: {
        ...previewData.summary,
        total_valid: validOnlyStudents.length,
        already_checked_in: 0,
        in_file_duplicates: 0,
        not_in_system: 0,
        not_registered: 0,
      },
      students: validOnlyStudents,
    });

    setParsedStudents((prev) => prev.filter((s) => validOnlyStudents.some((vs) => vs.mssv === s.mssv)));
    setPreviewFilter('all');
  };

  // Execute the final import
  const doImport = async (overrideStudents?: PreviewStudent[]) => {
    setLoading(true);
    setFeedback(null);

    try {
      const selectedDept = departments.find((d) => d.id === selectedDeptId);
      const activeList =
        overrideStudents ||
        (previewData
          ? previewData.students
          : parsedStudents.length > 0
          ? parsedStudents
          : parsedMssvs.map((m) => ({ mssv: m })));

      const activeMssvs = activeList.map((s) => s.mssv);
      const activeStudentData = parsedStudents.filter((ps) => activeMssvs.includes(ps.mssv));

      const res = await fetch(`/api/events/${eventId}/import-students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv_list: activeMssvs,
          students_data: activeStudentData.length > 0 ? activeStudentData : undefined,
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
        setFeedback({ type: 'error', message: data.error || 'Đã xảy ra lỗi khi nạp danh sách.' });
      }
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Lỗi kết nối máy chủ, vui lòng thử lại sau.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${step === 'preview' ? styles.modalWide : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleArea}>
            <div className={styles.iconWrapper}>
              {step === 'preview' ? (
                <CheckCircleIcon size={22} color="#2563eb" />
              ) : (
                <UploadCloudIcon size={22} color="#1e40af" />
              )}
            </div>
            <div>
              <h2 className={styles.title}>
                {step === 'preview'
                  ? 'Kiểm tra danh sách trước khi nạp'
                  : 'Nạp danh sách MSSV sự kiện'}
              </h2>
              <p className={styles.subtitle}>
                {eventName} • {mode === 'checkin' ? 'Điểm danh có mặt (Check-in)' : 'Đăng ký trước'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={styles.closeButton} type="button" aria-label="Đóng">
            <CloseIcon size={20} />
          </button>
        </div>

        {/* ── STEP 1: INPUT FORM ── */}
        {step === 'input' && (
          <form onSubmit={handleValidateAndPreview} className={styles.body}>
            <div className={styles.permissionBanner}>
              <span className={styles.permissionTag}>Quyền hạn Ban Tổ Chức</span>
              <span>Hệ thống sẽ tự động kiểm tra tính hợp lệ, trùng lặp và tình trạng điểm danh trước khi nạp.</span>
            </div>

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
                  ✨ Đã nhận diện thông tin chi tiết của <strong>{parsedStudents.length}</strong> sinh viên từ file Excel!
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <div className={styles.labelRow}>
                <label className={styles.label}>Hoặc dán danh sách MSSV trực tiếp</label>
                <span className={styles.badgeCount}>
                  <UsersIcon size={14} />
                  <span>{parsedMssvs.length} MSSV hợp lệ</span>
                </span>
                {rejectedCount > 0 && (
                  <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>
                    ⚠ {rejectedCount} mã bị loại (sai format)
                  </span>
                )}
              </div>
              <textarea
                rows={6}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Dán danh sách MSSV vào đây (mỗi dòng một MSSV hoặc cách nhau bằng dấu phẩy, khoảng trắng)&#10;Ví dụ:&#10;N22DCCN001&#10;N22DCCN002&#10;D22CQCN01-N"
                className={styles.textarea}
              />
            </div>

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
                    <span>Đang kiểm tra danh sách...</span>
                  </>
                ) : (
                  <>
                    <CheckCircleIcon size={18} />
                    <span>Kiểm tra danh sách {parsedMssvs.length > 0 ? `(${parsedMssvs.length} SV)` : ''}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* ── STEP 2: COMPREHENSIVE VERIFICATION & PREVIEW ── */}
        {step === 'preview' && previewData && (
          <div className={styles.previewContainer}>
            {/* 1. Capacity Bar & Warning */}
            {previewData.summary?.capacity?.max_participants > 0 && (
              <div
                className={`${styles.capacityCard} ${
                  previewData.summary.capacity.is_overflow ? styles.capacityCardOverflow : ''
                }`}
              >
                <div className={styles.capacityHeader}>
                  <span>
                    🎯 Giới hạn sức chứa:{' '}
                    <strong>{previewData.summary.capacity.max_participants}</strong> sinh viên
                  </span>
                  <span>
                    Hiện tại: {previewData.summary.capacity.current_count} • Nạp thêm: +
                    {previewData.summary.capacity.new_add_count} • Tổng dự kiến:{' '}
                    <strong
                      style={{
                        color: previewData.summary.capacity.is_overflow ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {previewData.summary.capacity.projected_total} /{' '}
                      {previewData.summary.capacity.max_participants}
                    </strong>
                  </span>
                </div>

                <div className={styles.capacityProgressBar}>
                  <div
                    className={styles.capacityProgressFillCurrent}
                    style={{
                      width: `${Math.min(
                        100,
                        (previewData.summary.capacity.current_count /
                          previewData.summary.capacity.max_participants) *
                          100
                      )}%`,
                    }}
                    title={`Đã có: ${previewData.summary.capacity.current_count}`}
                  />
                  <div
                    className={
                      previewData.summary.capacity.is_overflow
                        ? styles.capacityProgressFillOverflow
                        : styles.capacityProgressFillNew
                    }
                    style={{
                      width: `${Math.min(
                        100 -
                          (previewData.summary.capacity.current_count /
                            previewData.summary.capacity.max_participants) *
                            100,
                        (previewData.summary.capacity.new_add_count /
                          previewData.summary.capacity.max_participants) *
                          100
                      )}%`,
                    }}
                    title={`Nạp thêm: ${previewData.summary.capacity.new_add_count}`}
                  />
                </div>

                {previewData.summary.capacity.is_overflow ? (
                  <div style={{ color: '#b91c1c', fontSize: '0.8rem', fontWeight: 700 }}>
                    ⚠️ VƯỢT QUÁ SỨC CHỨA SỰ KIỆN: Dự kiến sẽ có{' '}
                    {previewData.summary.capacity.projected_total} người tham gia (Vượt quá{' '}
                    {previewData.summary.capacity.overflow_count} chỗ). Vui lòng cân nhắc trước khi nạp!
                  </div>
                ) : (
                  <div style={{ color: '#047857', fontSize: '0.8rem', fontWeight: 600 }}>
                    ✓ Sức chứa khả dụng: Sau khi nạp sẽ còn{' '}
                    <strong>{previewData.summary.capacity.remaining_slots}</strong> chỗ trống.
                  </div>
                )}
              </div>
            )}

            {/* 2. Stat Cards Grid */}
            <div className={styles.statGrid}>
              <div className={styles.statCard}>
                <span className={styles.statCardTitle}>Tổng hợp lệ</span>
                <span className={styles.statCardValue}>{previewData.students.length}</span>
              </div>

              {mode === 'checkin' && (
                <div
                  className={styles.statCard}
                  style={{
                    background:
                      previewData.summary.already_checked_in > 0 ? '#fffbeb' : '#ffffff',
                  }}
                >
                  <span
                    className={styles.statCardTitle}
                    style={{
                      color:
                        previewData.summary.already_checked_in > 0 ? '#b45309' : '#64748b',
                    }}
                  >
                    Đã điểm danh rồi
                  </span>
                  <span
                    className={styles.statCardValue}
                    style={{
                      color:
                        previewData.summary.already_checked_in > 0 ? '#d97706' : '#0f172a',
                    }}
                  >
                    {previewData.summary.already_checked_in}
                  </span>
                </div>
              )}

              {mode === 'checkin' && (
                <div className={styles.statCard}>
                  <span className={styles.statCardTitle}>Chưa đăng ký trước</span>
                  <span className={styles.statCardValue} style={{ color: '#6366f1' }}>
                    {previewData.summary.not_registered}
                  </span>
                </div>
              )}

              <div className={styles.statCard}>
                <span className={styles.statCardTitle}>Chưa có tài khoản</span>
                <span className={styles.statCardValue} style={{ color: '#0284c7' }}>
                  {previewData.summary.not_in_system}
                </span>
              </div>

              {previewData.summary.in_file_duplicates > 0 && (
                <div className={styles.statCard} style={{ background: '#fef2f2' }}>
                  <span className={styles.statCardTitle} style={{ color: '#b91c1c' }}>
                    Trùng lặp file
                  </span>
                  <span className={styles.statCardValue} style={{ color: '#dc2626' }}>
                    {previewData.summary.in_file_duplicates}
                  </span>
                </div>
              )}

              {previewData.rejected > 0 && (
                <div className={styles.statCard} style={{ background: '#fef2f2' }}>
                  <span className={styles.statCardTitle} style={{ color: '#b91c1c' }}>
                    Sai format (loại)
                  </span>
                  <span className={styles.statCardValue} style={{ color: '#dc2626' }}>
                    {previewData.rejected}
                  </span>
                </div>
              )}
            </div>

            {/* Rejected MSSVs list */}
            {previewData.rejected > 0 && previewData.rejected_mssvs.length > 0 && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: '#991b1b',
                }}
              >
                <strong>❌ Các mã bị loại trừ do không đúng format MSSV PTIT:</strong>
                <div style={{ marginTop: '0.2rem', fontFamily: 'monospace' }}>
                  {previewData.rejected_mssvs.join(', ')}
                  {previewData.rejected > previewData.rejected_mssvs.length &&
                    ` và ${previewData.rejected - previewData.rejected_mssvs.length} mã khác...`}
                </div>
              </div>
            )}

            {/* 3. Filter Bar & Quick Actions */}
            <div className={styles.filterToolbar}>
              <div className={styles.filterTabs}>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('all')}
                  className={`${styles.filterTabBtn} ${
                    previewFilter === 'all' ? styles.filterTabBtnActive : ''
                  }`}
                >
                  Tất cả ({previewData.students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewFilter('warnings')}
                  className={`${styles.filterTabBtn} ${
                    previewFilter === 'warnings' ? styles.filterTabBtnActive : ''
                  }`}
                >
                  ⚠️ Cần lưu ý ({previewData.warnings_count})
                </button>
                {mode === 'checkin' && previewData.summary.already_checked_in > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('already_checked_in')}
                    className={`${styles.filterTabBtn} ${
                      previewFilter === 'already_checked_in' ? styles.filterTabBtnActive : ''
                    }`}
                  >
                    🔄 Đã điểm danh ({previewData.summary.already_checked_in})
                  </button>
                )}
                {mode === 'checkin' && previewData.summary.not_registered > 0 && (
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('not_registered')}
                    className={`${styles.filterTabBtn} ${
                      previewFilter === 'not_registered' ? styles.filterTabBtnActive : ''
                    }`}
                  >
                    ⚡ Chưa đăng ký ({previewData.summary.not_registered})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewFilter('ready')}
                  className={`${styles.filterTabBtn} ${
                    previewFilter === 'ready' ? styles.filterTabBtnActive : ''
                  }`}
                >
                  ✅ Hợp lệ ({previewData.students.filter((s) => s.warnings.length === 0).length})
                </button>
              </div>

              <div className={styles.quickActions}>
                {mode === 'checkin' && previewData.summary.already_checked_in > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveAlreadyCheckedIn}
                    className={styles.quickBtn}
                    style={{ borderColor: '#fcd34d', background: '#fffbeb', color: '#b45309' }}
                    title="Bỏ qua các bạn đã điểm danh trước đó để tránh ghi đè"
                  >
                    <TrashIcon size={13} color="#b45309" />
                    Bỏ qua {previewData.summary.already_checked_in} bạn đã điểm danh
                  </button>
                )}
                {previewData.warnings_count > 0 && (
                  <button
                    type="button"
                    onClick={handleRemoveAllWarnings}
                    className={`${styles.quickBtn} ${styles.quickBtnDanger}`}
                    title="Loại bỏ tất cả các dòng có cảnh báo"
                  >
                    <TrashIcon size={13} color="#b91c1c" />
                    Loại bỏ tất cả cảnh báo
                  </button>
                )}
              </div>
            </div>

            {/* 4. Table */}
            <div className={styles.tableWrapper}>
              {(() => {
                let displayed = previewData.students;
                if (previewFilter === 'warnings') {
                  displayed = previewData.students.filter((s) => s.warnings.length > 0);
                } else if (previewFilter === 'already_checked_in') {
                  displayed = previewData.students.filter((s) => s.is_already_checked_in);
                } else if (previewFilter === 'not_registered') {
                  displayed = previewData.students.filter((s) => !s.is_registered);
                } else if (previewFilter === 'ready') {
                  displayed = previewData.students.filter((s) => s.warnings.length === 0);
                }

                if (displayed.length === 0) {
                  return (
                    <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
                      Không có sinh viên nào trong bộ lọc này.
                    </div>
                  );
                }

                return (
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        <th style={{ width: '45px' }}>STT</th>
                        <th style={{ width: '120px' }}>MSSV</th>
                        <th>Họ tên</th>
                        <th style={{ width: '100px' }}>Lớp</th>
                        <th>Trạng thái kiểm tra</th>
                        <th style={{ width: '70px', textAlign: 'center' }}>Xóa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((s, idx) => {
                        const hasWarning = s.warnings.length > 0;
                        return (
                          <tr
                            key={s.mssv}
                            style={{
                              background: hasWarning ? '#fffbeb' : '#ffffff',
                            }}
                          >
                            <td style={{ color: '#94a3b8' }}>{idx + 1}</td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.mssv}</td>
                            <td
                              style={{
                                color: s.full_name === s.mssv ? '#dc2626' : '#1e293b',
                                fontStyle: s.full_name === s.mssv ? 'italic' : 'normal',
                              }}
                            >
                              {s.full_name === s.mssv ? '⚠️ Chưa có họ tên' : s.full_name}
                            </td>
                            <td
                              style={{
                                color: s.class_id === 'PTIT-HCM' ? '#94a3b8' : '#1e293b',
                              }}
                            >
                              {s.class_id}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                                {s.badges && s.badges.length > 0 ? (
                                  s.badges.map((b, i) => (
                                    <span
                                      key={i}
                                      className={`${styles.badgePill} ${
                                        b.type === 'danger'
                                          ? styles.badgeDanger
                                          : b.type === 'warning'
                                          ? styles.badgeWarning
                                          : b.type === 'info'
                                          ? styles.badgeInfo
                                          : styles.badgeSuccess
                                      }`}
                                    >
                                      {b.text}
                                    </span>
                                  ))
                                ) : (
                                  <span className={`${styles.badgePill} ${styles.badgeSuccess}`}>
                                    ✓ Hợp lệ
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                onClick={() => handleRemoveStudent(s.mssv)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '0.2rem',
                                  color: '#dc2626',
                                }}
                                title={`Xóa ${s.mssv}`}
                              >
                                <TrashIcon size={14} color="#dc2626" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>

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

            {/* 5. Footer Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid #e2e8f0',
              }}
            >
              <button
                type="button"
                onClick={() => setStep('input')}
                className={styles.cancelButton}
                disabled={loading}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              >
                <ArrowLeftIcon size={16} />
                <span>Quay lại sửa danh sách</span>
              </button>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {mode === 'checkin' && previewData.summary.already_checked_in > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const newOnes = previewData.students.filter((s) => !s.is_already_checked_in);
                      handleRemoveAlreadyCheckedIn();
                      doImport(newOnes);
                    }}
                    disabled={loading || previewData.students.filter((s) => !s.is_already_checked_in).length === 0}
                    style={{
                      padding: '0.65rem 1.25rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#16a34a',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✓ Bỏ qua đã điểm danh & Nạp (
                    {previewData.students.filter((s) => !s.is_already_checked_in).length} SV)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => doImport()}
                  disabled={loading || previewData.students.length === 0}
                  className={styles.submitButton}
                  style={{
                    background:
                      previewData.warnings_count > 0 &&
                      previewData.summary.already_checked_in === 0 &&
                      !previewData.summary.capacity.is_overflow
                        ? '#2563eb'
                        : previewData.summary.capacity.is_overflow
                        ? '#dc2626'
                        : '#2563eb',
                  }}
                >
                  {loading ? (
                    <>
                      <SpinnerIcon size={18} className={styles.spinner} />
                      <span>Đang nạp vào sự kiện...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloudIcon size={18} />
                      <span>
                        Xác nhận nạp ({previewData.students.length} sinh viên)
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
