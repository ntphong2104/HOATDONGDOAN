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
    role_type?: 'participant' | 'volunteer' | 'organizer';
    note?: string;
  }>>([]);
  const [role, setRole] = useState<'participant' | 'volunteer' | 'organizer'>(initialRole);
  const [mode, setMode] = useState<'checkin' | 'register'>(initialMode);
  const [selectedDeptId, setSelectedDeptId] = useState<string>(initialDepartmentId);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<{
    total: number;
    rejected: number;
    rejected_mssvs: string[];
    warnings_count: number;
    students: Array<{
      mssv: string;
      full_name: string;
      class_id: string;
      in_system: boolean;
      from_excel: boolean;
      warnings: string[];
    }>;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewFilter, setPreviewFilter] = useState<'all' | 'warnings'>('all');

  React.useEffect(() => {
    if (isOpen) {
      if (initialRole) setRole(initialRole);
      if (initialMode) setMode(initialMode);
      if (initialDepartmentId) setSelectedDeptId(initialDepartmentId);
      setFeedback(null);
      setParsedStudents([]);
      setInputText('');
      setFileName(null);
      setShowPreview(false);
      setPreviewData(null);
      setPreviewFilter('all');
    }
  }, [isOpen, initialRole, initialMode, initialDepartmentId]);

  const handleRemoveStudent = (mssvToRemove: string) => {
    if (!previewData) return;
    const targetStudent = previewData.students.find((s) => s.mssv === mssvToRemove);
    const hadWarning = targetStudent && targetStudent.warnings.length > 0;

    const updatedStudents = previewData.students.filter((s) => s.mssv !== mssvToRemove);
    const updatedWarningsCount = previewData.warnings_count - (hadWarning ? 1 : 0);

    setPreviewData({
      ...previewData,
      total: updatedStudents.length,
      warnings_count: Math.max(0, updatedWarningsCount),
      students: updatedStudents,
    });

    setParsedStudents((prev) => prev.filter((s) => s.mssv !== mssvToRemove));
    setInputText((prev) =>
      prev
        .split(/[\r\n,;\t\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && s !== mssvToRemove)
        .join('\n')
    );
  };

  const handleRemoveAllWarnings = () => {
    if (!previewData) return;
    const warningMssvs = new Set(previewData.students.filter((s) => s.warnings.length > 0).map((s) => s.mssv));
    const validOnlyStudents = previewData.students.filter((s) => s.warnings.length === 0);

    setPreviewData({
      ...previewData,
      total: validOnlyStudents.length,
      warnings_count: 0,
      students: validOnlyStudents,
    });

    setParsedStudents((prev) => prev.filter((s) => !warningMssvs.has(s.mssv)));
    setInputText((prev) =>
      prev
        .split(/[\r\n,;\t\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && !warningMssvs.has(s))
        .join('\n')
    );
    setPreviewFilter('all');
  };

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

  // Count rejected (invalid format) entries for warning display
  const allEntries = inputText
    .split(/[\r\n,;\t\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 4);
  const parsedMssvs = parseMssvList(inputText);
  const rejectedCount = allEntries.length - new Set(allEntries).size > 0
    ? allEntries.filter((s) => !isValidMSSV(s)).length
    : Array.from(new Set(allEntries)).filter((s) => !isValidMSSV(s)).length;

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

      // Step 1: Validate first — get preview with warnings
      const validateRes = await fetch(`/api/events/${eventId}/import-students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv_list: parsedMssvs,
          students_data: parsedStudents.length > 0 ? parsedStudents : undefined,
          participate_role: role,
          mode: 'validate',
        }),
      });

      const validateData = await validateRes.json();
      if (!validateData.success) {
        setFeedback({ type: 'error', message: validateData.error || 'Lỗi kiểm tra danh sách' });
        setLoading(false);
        return;
      }

      // If there are warnings, show preview popup
      if (validateData.warnings_count > 0 || validateData.rejected > 0) {
        setPreviewData(validateData);
        setShowPreview(true);
        setLoading(false);
        return;
      }

      // No warnings → import directly
      await doImport();
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', message: 'Lỗi kết nối máy chủ, vui lòng thử lại sau.' });
      setLoading(false);
    }
  };

  const doImport = async (overrideStudents?: Array<{ mssv: string }>) => {
    setLoading(true);
    setFeedback(null);
    setShowPreview(false);

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
        setPreviewData(null);
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

          {/* Preview Warning Popup */}
          {showPreview && previewData && (
            <div style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            }} onClick={() => setShowPreview(false)}>
              <div style={{
                background: '#fff', borderRadius: '12px', maxWidth: '720px', width: '100%',
                maxHeight: '88vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              }} onClick={(e) => e.stopPropagation()}>
                {/* Preview Header */}
                <div style={{
                  padding: '1rem 1.25rem', borderBottom: '1px solid #e5e7eb',
                  background: previewData.warnings_count > 0 ? '#fef3c7' : '#ecfdf5',
                  borderRadius: '12px 12px 0 0',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#1f2937' }}>
                        {previewData.warnings_count > 0 ? '⚠️ Kiểm tra trước khi nạp' : '✅ Danh sách hợp lệ'}
                      </h3>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#4b5563' }}>
                        Tổng cộng: <strong>{previewData.total}</strong> sinh viên
                        {previewData.warnings_count > 0 ? (
                          <> — Tìm thấy <strong style={{ color: '#dc2626' }}>{previewData.warnings_count}</strong> sinh viên có cảnh báo cần kiểm tra</>
                        ) : (
                          <> — Tất cả sinh viên đã sẵn sàng nạp!</>
                        )}
                        {previewData.rejected > 0 && <> (và <strong style={{ color: '#dc2626' }}>{previewData.rejected}</strong> MSSV sai định dạng đã bị loại)</>}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPreview(false)}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#6b7280', fontSize: '1.25rem', lineHeight: 1, padding: '0.2rem',
                      }}
                      title="Đóng cửa sổ"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Rejected MSSVs */}
                {previewData.rejected > 0 && previewData.rejected_mssvs.length > 0 && (
                  <div style={{
                    padding: '0.75rem 1.25rem', background: '#fef2f2', borderBottom: '1px solid #fecaca',
                    fontSize: '0.82rem',
                  }}>
                    <strong style={{ color: '#dc2626' }}>❌ MSSV bị loại (sai format):</strong>
                    <div style={{ marginTop: '0.25rem', color: '#991b1b', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {previewData.rejected_mssvs.join(', ')}
                      {previewData.rejected > previewData.rejected_mssvs.length && ` và ${previewData.rejected - previewData.rejected_mssvs.length} mã khác...`}
                    </div>
                  </div>
                )}

                {/* Filter & Quick Action Toolbar */}
                <div style={{
                  padding: '0.6rem 1.25rem', background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('all')}
                      style={{
                        padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                        border: previewFilter === 'all' ? '1px solid #2563eb' : '1px solid #d1d5db',
                        background: previewFilter === 'all' ? '#eff6ff' : '#fff',
                        color: previewFilter === 'all' ? '#1d4ed8' : '#4b5563',
                        cursor: 'pointer',
                      }}
                    >
                      Tất cả ({previewData.total})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('warnings')}
                      style={{
                        padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                        border: previewFilter === 'warnings' ? '1px solid #d97706' : '1px solid #d1d5db',
                        background: previewFilter === 'warnings' ? '#fef3c7' : '#fff',
                        color: previewFilter === 'warnings' ? '#b45309' : '#4b5563',
                        cursor: 'pointer',
                      }}
                    >
                      ⚠️ Chỉ xem cảnh báo ({previewData.warnings_count})
                    </button>
                  </div>

                  {previewData.warnings_count > 0 && (
                    <button
                      type="button"
                      onClick={handleRemoveAllWarnings}
                      style={{
                        padding: '0.3rem 0.7rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                        border: '1px solid #fecaca', background: '#fee2e2', color: '#b91c1c',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem',
                      }}
                      title="Xóa tất cả sinh viên có cảnh báo ra khỏi danh sách nạp"
                    >
                      <TrashIcon size={13} color="#b91c1c" />
                      Loại bỏ tất cả {previewData.warnings_count} SV cảnh báo
                    </button>
                  )}
                </div>

                {/* Students Table */}
                <div style={{ flex: 1, overflow: 'auto', padding: '0.5rem 1rem' }}>
                  {(() => {
                    const displayedStudents = previewFilter === 'warnings'
                      ? previewData.students.filter((s) => s.warnings.length > 0)
                      : previewData.students;

                    if (displayedStudents.length === 0) {
                      return (
                        <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
                          {previewFilter === 'warnings'
                            ? '✨ Tuyệt vời! Không còn sinh viên nào có cảnh báo lỗi.'
                            : 'Không còn sinh viên nào trong danh sách.'}
                        </div>
                      );
                    }

                    return (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#6b7280', width: '45px' }}>STT</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#6b7280', width: '110px' }}>MSSV</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#6b7280' }}>Họ tên</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#6b7280', width: '90px' }}>Lớp</th>
                            <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#6b7280' }}>Trạng thái</th>
                            <th style={{ padding: '0.5rem', textAlign: 'center', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#6b7280', width: '80px' }}>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedStudents.map((s, idx) => {
                            const hasWarning = s.warnings.length > 0;
                            return (
                              <tr key={s.mssv} style={{
                                background: hasWarning ? '#fef3c7' : idx % 2 === 0 ? '#fff' : '#f9fafb',
                                borderBottom: '1px solid #f3f4f6',
                              }}>
                                <td style={{ padding: '0.4rem 0.5rem', color: '#9ca3af' }}>{idx + 1}</td>
                                <td style={{ padding: '0.4rem 0.5rem', fontFamily: 'monospace', fontWeight: 600 }}>{s.mssv}</td>
                                <td style={{
                                  padding: '0.4rem 0.5rem',
                                  color: s.full_name === s.mssv ? '#dc2626' : '#1f2937',
                                  fontStyle: s.full_name === s.mssv ? 'italic' : 'normal',
                                }}>
                                  {s.full_name === s.mssv ? '⚠️ Không có tên' : s.full_name}
                                </td>
                                <td style={{
                                  padding: '0.4rem 0.5rem',
                                  color: s.class_id === 'PTIT-HCM' ? '#9ca3af' : '#1f2937',
                                }}>{s.class_id}</td>
                                <td style={{ padding: '0.4rem 0.5rem' }}>
                                  {hasWarning ? (
                                    <span style={{
                                      display: 'inline-flex', gap: '0.25rem', flexWrap: 'wrap',
                                    }}>
                                      {s.warnings.map((w, i) => (
                                        <span key={i} style={{
                                          background: '#fde68a', color: '#92400e', padding: '0.1rem 0.4rem',
                                          borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600,
                                          whiteSpace: 'nowrap',
                                        }}>{w}</span>
                                      ))}
                                    </span>
                                  ) : (
                                    <span style={{
                                      background: '#d1fae5', color: '#065f46', padding: '0.1rem 0.4rem',
                                      borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600,
                                    }}>✓ OK</span>
                                  )}
                                </td>
                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStudent(s.mssv)}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '6px',
                                      border: hasWarning ? '1px solid #fca5a5' : '1px solid #e5e7eb',
                                      background: hasWarning ? '#fef2f2' : '#fff',
                                      color: hasWarning ? '#dc2626' : '#6b7280',
                                      cursor: 'pointer',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.2rem',
                                    }}
                                    title={`Xóa ${s.mssv} khỏi danh sách nạp`}
                                  >
                                    <TrashIcon size={12} color={hasWarning ? '#dc2626' : '#6b7280'} />
                                    Xóa
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

                {/* Preview Actions */}
                <div style={{
                  padding: '0.75rem 1.25rem', borderTop: '1px solid #e5e7eb',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#f9fafb', borderRadius: '0 0 12px 12px',
                  flexWrap: 'wrap', gap: '0.5rem',
                }}>
                  <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                    <strong style={{ color: '#059669' }}>✅ {previewData.total - previewData.warnings_count}</strong> hợp lệ &nbsp;|&nbsp;
                    <strong style={{ color: previewData.warnings_count > 0 ? '#d97706' : '#6b7280' }}>⚠️ {previewData.warnings_count}</strong> cần kiểm tra
                    {previewData.rejected > 0 && <> &nbsp;|&nbsp; <strong style={{ color: '#dc2626' }}>❌ {previewData.rejected}</strong> bị loại</>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setShowPreview(false)}
                      style={{
                        padding: '0.5rem 0.85rem', borderRadius: '8px', border: '1px solid #d1d5db',
                        background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
                        color: '#374151',
                      }}
                    >
                      ← Quay lại sửa
                    </button>
                    {previewData.warnings_count > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const validOnes = previewData.students.filter((s) => s.warnings.length === 0);
                          handleRemoveAllWarnings();
                          doImport(validOnes);
                        }}
                        disabled={loading || (previewData.total - previewData.warnings_count) === 0}
                        style={{
                          padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                          background: '#059669', color: '#fff', cursor: 'pointer',
                          fontWeight: 700, fontSize: '0.85rem',
                        }}
                        title="Bỏ qua các sinh viên cảnh báo và chỉ nạp các bạn hợp lệ"
                      >
                        {loading ? 'Đang nạp...' : `✓ Bỏ lỗi & Nạp ${previewData.total - previewData.warnings_count} SV hợp lệ`}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => doImport()}
                      disabled={loading || previewData.total === 0}
                      style={{
                        padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
                        background: previewData.warnings_count > 0 ? '#dc2626' : '#2563eb',
                        color: '#fff', cursor: 'pointer',
                        fontWeight: 700, fontSize: '0.85rem',
                      }}
                    >
                      {loading
                        ? 'Đang nạp...'
                        : previewData.warnings_count > 0
                        ? `⚡ Vẫn nạp tất cả (${previewData.total} SV)`
                        : `✓ Xác nhận nạp ${previewData.total} SV`}
                    </button>
                  </div>
                </div>
              </div>
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
