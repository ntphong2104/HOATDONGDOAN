'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ExcelExportButton from '@/components/ExcelExportButton';
import { useToast } from '@/components/ToastProvider';
import {
  BuildingIcon,
  UsersIcon,
  ShieldCheckIcon,
  SearchIcon,
  PlusIcon,
  TrashIcon,
  RefreshIcon,
  CheckCircleIcon,
  CloseIcon,
  AlertTriangleIcon,
  CalendarIcon,
  UploadCloudIcon,
} from '@/components/icons';
import { LCD_DEFINITIONS, type LcdCode } from '@/lib/utils/lcd';
import styles from './LcdManagementSection.module.css';

interface LcdMemberRow {
  mssv: string;
  full_name: string;
  class_id: string;
  email: string;
  cohort: string | null;
  total_attended: number;
  is_delegate: boolean;
  delegate_id: string | null;
  delegate_notes: string | null;
  delegate_expires_at: string | null;
}

interface LcdClassInfo {
  class_id: string;
  student_count: number;
  cohort: string | null;
  delegates: Array<{
    id: string;
    mssv: string;
    full_name: string;
    notes?: string;
    expires_at?: string;
  }>;
}

interface DelegateRow {
  id: string;
  mssv: string;
  email: string;
  full_name: string;
  class_id: string;
  granted_at: string;
  expires_at: string;
  created_by: string;
  is_active: boolean;
  notes?: string;
  lcd_code?: string | null;
  lcd_name?: string | null;
  isExpired: boolean;
  daysLeft: number;
  status: 'active' | 'expired' | 'revoked';
}

interface LcdManagementSectionProps {
  mode: 'members' | 'delegates';
  initialLcdCode: LcdCode;
  canSwitchLcd: boolean;
}

function normalizeVN(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

function getDefaultTermEndDate(): string {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-06-30`;
}

export default function LcdManagementSection({
  mode,
  initialLcdCode,
  canSwitchLcd,
}: LcdManagementSectionProps) {
  const toast = useToast();
  const [selectedLcd, setSelectedLcd] = useState<LcdCode>(initialLcdCode);

  const [loadingMembers, setLoadingMembers] = useState(true);
  const [lcdInfo, setLcdInfo] = useState<{ code: LcdCode; name: string; shortName: string } | null>(null);
  const [summary, setSummary] = useState({
    total_students: 0,
    total_classes: 0,
    classes_with_delegate: 0,
    classes_without_delegate_count: 0,
    active_delegates: 0,
  });
  const [classes, setClasses] = useState<LcdClassInfo[]>([]);
  const [classesWithoutDelegate, setClassesWithoutDelegate] = useState<string[]>([]);
  const [students, setStudents] = useState<LcdMemberRow[]>([]);

  const [delegates, setDelegates] = useState<DelegateRow[]>([]);
  const [loadingDelegates, setLoadingDelegates] = useState(false);

  // Members filters
  const [memberSearch, setMemberSearch] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [cohortFilter, setCohortFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // Delegate form state (Single / Bulk)
  const [grantMode, setGrantMode] = useState<'single' | 'bulk'>('single');
  const [singleMssv, setSingleMssv] = useState('');
  const [bulkMssvText, setBulkMssvText] = useState('');
  const [roleTitle, setRoleTitle] = useState('Bí thư Chi đoàn');
  const [extraNote, setExtraNote] = useState('');
  const [termPreset, setTermPreset] = useState<'term_end' | '365' | '180' | '30' | 'custom'>('term_end');
  const [customExpiryDate, setCustomExpiryDate] = useState(getDefaultTermEndDate);
  const [submittingGrant, setSubmittingGrant] = useState(false);
  const [bulkErrors, setBulkErrors] = useState<Array<{ mssv: string; reason: string }>>([]);
  const [delegateSearch, setDelegateSearch] = useState('');

  // Proof modal state
  const [selectedStudent, setSelectedStudent] = useState<LcdMemberRow | null>(null);
  const [studentHistory, setStudentHistory] = useState<any | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const loadMembersData = useCallback(async (lcdCode: LcdCode) => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/lcd/members?lcd=${encodeURIComponent(lcdCode)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setLcdInfo(json.data.lcd);
        setSummary(json.data.summary);
        setClasses(json.data.classes || []);
        setClassesWithoutDelegate(json.data.classes_without_delegate || []);
        setStudents(json.data.students || []);
      } else {
        toast.error(json.error || 'Không thể tải danh sách đoàn viên');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ khi tải danh sách đoàn viên');
    } finally {
      setLoadingMembers(false);
    }
  }, [toast]);

  const loadDelegatesData = useCallback(async (lcdCode: LcdCode) => {
    setLoadingDelegates(true);
    try {
      const res = await fetch(`/api/admin/delegates?lcd=${encodeURIComponent(lcdCode)}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setDelegates(json.data);
      }
    } catch {
      toast.error('Lỗi tải danh sách BCH Chi đoàn');
    } finally {
      setLoadingDelegates(false);
    }
  }, [toast]);

  useEffect(() => {
    setClassFilter('ALL');
    setCohortFilter('ALL');
    setPage(1);
    loadMembersData(selectedLcd);
    loadDelegatesData(selectedLcd);
  }, [selectedLcd, loadMembersData, loadDelegatesData]);

  const cohorts = useMemo(() => {
    const s = new Set<string>();
    for (const st of students) {
      if (st.cohort) s.add(st.cohort);
    }
    return Array.from(s).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = normalizeVN(memberSearch);
    return students.filter((st) => {
      if (classFilter !== 'ALL' && st.class_id !== classFilter) return false;
      if (cohortFilter !== 'ALL' && st.cohort !== cohortFilter) return false;
      if (q) {
        const hay = normalizeVN(`${st.mssv} ${st.full_name} ${st.class_id} ${st.email}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [students, memberSearch, classFilter, cohortFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const pagedStudents = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredStudents.slice(start, start + PAGE_SIZE);
  }, [filteredStudents, page, totalPages]);

  const filteredDelegates = useMemo(() => {
    const q = normalizeVN(delegateSearch);
    if (!q) return delegates;
    return delegates.filter((d) =>
      normalizeVN(`${d.mssv} ${d.full_name} ${d.class_id} ${d.notes || ''} ${d.created_by || ''}`).includes(q)
    );
  }, [delegates, delegateSearch]);

  const buildTermPayload = () => {
    if (termPreset === 'term_end') {
      return { expires_at: getDefaultTermEndDate() };
    }
    if (termPreset === 'custom') {
      return { expires_at: customExpiryDate };
    }
    return { duration_days: Number(termPreset) };
  };

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkErrors([]);

    const payloadBase = {
      role_title: roleTitle,
      notes: extraNote.trim() || undefined,
      ...buildTermPayload(),
    };

    let body: Record<string, any>;
    if (grantMode === 'single') {
      const clean = singleMssv.trim().toUpperCase();
      if (!clean) {
        toast.warning('Vui lòng nhập MSSV của đoàn viên cần cấp quyền BCH Chi đoàn');
        return;
      }
      body = { ...payloadBase, mssv: clean };
    } else {
      // Extract all PTIT-style MSSVs from pasted Excel / Google Sheet text
      const matches = bulkMssvText.toUpperCase().match(/[A-Z]\d{2}[A-Z]{2,5}\d{2,4}/g) || [];
      const fallbackTokens =
        matches.length > 0
          ? matches
          : bulkMssvText
              .split(/[\s,;|\t\n]+/)
              .map((t) => t.trim().toUpperCase())
              .filter((t) => t.length >= 6);

      const unique = Array.from(new Set(fallbackTokens));
      if (unique.length === 0) {
        toast.warning('Không tìm thấy MSSV nào hợp lệ trong nội dung đã dán');
        return;
      }
      body = { ...payloadBase, mssvs: unique };
    }

    setSubmittingGrant(true);
    try {
      const res = await fetch('/api/admin/delegates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || 'Đã cấp quyền BCH Chi đoàn thành công!');
        setSingleMssv('');
        if (grantMode === 'bulk') {
          setBulkMssvText('');
          if (Array.isArray(json.errors) && json.errors.length > 0) {
            setBulkErrors(json.errors);
          }
        }
        await Promise.all([loadDelegatesData(selectedLcd), loadMembersData(selectedLcd)]);
      } else {
        toast.error(json.error || 'Không thể cấp quyền BCH Chi đoàn');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ');
    } finally {
      setSubmittingGrant(false);
    }
  };

  const handleQuickGrantFromMember = async (st: LcdMemberRow) => {
    const confirmed = window.confirm(
      `Cấp quyền BCH Chi đoàn lớp ${st.class_id} cho ${st.full_name} (${st.mssv}) theo nhiệm kỳ đến ${new Date(getDefaultTermEndDate()).toLocaleDateString('vi-VN')}?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/delegates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv: st.mssv,
          role_title: 'BCH Chi đoàn',
          expires_at: getDefaultTermEndDate(),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || 'Đã cấp quyền BCH Chi đoàn thành công!');
        await Promise.all([loadDelegatesData(selectedLcd), loadMembersData(selectedLcd)]);
      } else {
        toast.error(json.error || 'Không thể cấp quyền');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ');
    }
  };

  const handleRenewDelegate = async (d: DelegateRow) => {
    const confirmed = window.confirm(
      `Gia hạn quyền BCH Chi đoàn lớp ${d.class_id} cho ${d.full_name} (${d.mssv}) thêm 1 nhiệm kỳ (12 tháng)?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch('/api/admin/delegates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: d.id, duration_days: 365 }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || 'Đã gia hạn nhiệm kỳ thành công!');
        await Promise.all([loadDelegatesData(selectedLcd), loadMembersData(selectedLcd)]);
      } else {
        toast.error(json.error || 'Lỗi gia hạn quyền');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ');
    }
  };

  const handleRevokeDelegate = async (d: DelegateRow) => {
    const confirmed = window.confirm(
      `Thu hồi quyền BCH Chi đoàn lớp ${d.class_id} của ${d.full_name} (${d.mssv})?`
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/delegates?id=${encodeURIComponent(d.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || 'Đã thu hồi quyền BCH Chi đoàn');
        await Promise.all([loadDelegatesData(selectedLcd), loadMembersData(selectedLcd)]);
      } else {
        toast.error(json.error || 'Lỗi thu hồi quyền');
      }
    } catch {
      toast.error('Lỗi kết nối máy chủ');
    }
  };

  const openStudentHistoryModal = async (st: LcdMemberRow) => {
    setSelectedStudent(st);
    setStudentHistory(null);
    setHistoryError('');
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/admin/students/${encodeURIComponent(st.mssv)}/history`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.data) {
        setStudentHistory(json.data);
      } else {
        setHistoryError(json.error || 'Không thể tải minh chứng của sinh viên');
      }
    } catch {
      setHistoryError('Lỗi kết nối máy chủ khi tải minh chứng');
    } finally {
      setLoadingHistory(false);
    }
  };

  const currentLcdName = lcdInfo?.name || LCD_DEFINITIONS.find((d) => d.code === selectedLcd)?.name || selectedLcd;
  const currentLcdShort = lcdInfo?.shortName || LCD_DEFINITIONS.find((d) => d.code === selectedLcd)?.shortName || selectedLcd;

  return (
    <div className={styles.wrapper}>
      {/* ── LCĐ Context Banner ── */}
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <span className={styles.bannerEyebrow}>
            <BuildingIcon size={14} color="#bfdbfe" />
            <span>Quản trị Liên Chi Đoàn trực thuộc</span>
          </span>
          <h2 className={styles.bannerTitle}>{currentLcdName}</h2>
          <p className={styles.bannerSub}>
            {mode === 'members'
              ? 'Quản lý toàn bộ đoàn viên, theo dõi số hoạt động ĐRL theo từng Chi đoàn và xuất báo cáo Excel.'
              : 'Phân quyền Ban Chấp Hành Chi Đoàn (Bí thư / Phó Bí thư / BCS lớp) theo nhiệm kỳ để lớp tự tra cứu minh chứng ĐRL.'}
          </p>
        </div>

        {canSwitchLcd && (
          <select
            value={selectedLcd}
            onChange={(e) => setSelectedLcd(e.target.value as LcdCode)}
            className={styles.lcdSelect}
            aria-label="Chọn Liên Chi Đoàn"
          >
            {LCD_DEFINITIONS.map((lcd) => (
              <option key={lcd.code} value={lcd.code}>
                {lcd.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── KPI Summary Row ── */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Tổng Đoàn viên</span>
          <span className={styles.kpiValue} style={{ color: '#1d4ed8' }}>
            {loadingMembers ? '—' : summary.total_students}
          </span>
          <span className={styles.kpiHint}>Thuộc {currentLcdShort}</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Tổng Chi đoàn (Lớp)</span>
          <span className={styles.kpiValue}>{loadingMembers ? '—' : summary.total_classes}</span>
          <span className={styles.kpiHint}>Phân lớp tự động theo ngành</span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Chi đoàn đã có BCH</span>
          <span className={styles.kpiValue} style={{ color: '#15803d' }}>
            {loadingMembers ? '—' : `${summary.classes_with_delegate}/${summary.total_classes}`}
          </span>
          <span className={styles.kpiHint}>
            {summary.classes_without_delegate_count > 0
              ? `Còn ${summary.classes_without_delegate_count} lớp chưa gán`
              : 'Đã phủ đủ tất cả Chi đoàn'}
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>BCH Chi đoàn hoạt động</span>
          <span className={styles.kpiValue} style={{ color: '#7c3aed' }}>
            {loadingMembers ? '—' : summary.active_delegates}
          </span>
          <span className={styles.kpiHint}>Có quyền tra cứu ĐRL lớp</span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════ */}
      {/* MODE 1: ĐOÀN VIÊN & CHI ĐOÀN CỦA LCĐ              */}
      {/* ══════════════════════════════════════════════════ */}
      {mode === 'members' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle}>
              <UsersIcon size={18} color="#2563eb" />
              <span>
                Danh sách Đoàn viên {currentLcdShort} ({filteredStudents.length})
              </span>
            </h3>

            <ExcelExportButton
              data={filteredStudents.map((s, idx) => ({
                stt: idx + 1,
                mssv: s.mssv,
                full_name: s.full_name,
                class_id: s.class_id,
                khoa: s.cohort || '',
                email: s.email,
                so_su_kien_drl: s.total_attended,
                bch_chi_doan: s.is_delegate ? s.delegate_notes || 'BCH Chi đoàn' : '',
              }))}
              filename={`drl-${selectedLcd.toLowerCase()}${classFilter !== 'ALL' ? `-${classFilter}` : ''}.xlsx`}
              label={
                classFilter !== 'ALL'
                  ? `Xuất Excel Chi đoàn ${classFilter}`
                  : `Xuất Excel toàn ${currentLcdShort}`
              }
            />
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>
                <SearchIcon size={15} />
              </span>
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo MSSV, Họ tên, Lớp..."
                className={styles.searchInput}
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setPage(1);
              }}
              className={styles.selectInput}
              aria-label="Lọc theo Chi đoàn"
            >
              <option value="ALL">Tất cả Chi đoàn ({classes.length})</option>
              {classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.class_id} ({c.student_count} SV{c.delegates.length > 0 ? ` • ${c.delegates.length} BCH` : ''})
                </option>
              ))}
            </select>

            <select
              value={cohortFilter}
              onChange={(e) => {
                setCohortFilter(e.target.value);
                setPage(1);
              }}
              className={styles.selectInput}
              aria-label="Lọc theo Khóa"
            >
              <option value="ALL">Tất cả Khóa</option>
              {cohorts.map((co) => (
                <option key={co} value={co}>
                  Khóa {co}
                </option>
              ))}
            </select>
          </div>

          {loadingMembers ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>
              Đang tải dữ liệu đoàn viên {currentLcdShort}...
            </div>
          ) : pagedStudents.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
              Không tìm thấy đoàn viên nào phù hợp điều kiện lọc.
            </div>
          ) : (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>STT</th>
                      <th>MSSV</th>
                      <th>Họ và tên</th>
                      <th>Chi đoàn (Lớp)</th>
                      <th>Hoạt động ĐRL</th>
                      <th>BCH Chi đoàn</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedStudents.map((st, idx) => (
                      <tr key={st.mssv}>
                        <td style={{ color: '#64748b', fontWeight: 600 }}>
                          {(page - 1) * PAGE_SIZE + idx + 1}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1d4ed8' }}>
                          {st.mssv}
                        </td>
                        <td style={{ fontWeight: 700 }}>{st.full_name}</td>
                        <td style={{ fontWeight: 600, color: '#334155' }}>{st.class_id}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${st.total_attended > 0 ? styles.badgeSuccess : styles.badgeNeutral}`}
                          >
                            {st.total_attended} sự kiện
                          </span>
                        </td>
                        <td>
                          {st.is_delegate ? (
                            <span className={`${styles.badge} ${styles.badgeInfo}`}>
                              <ShieldCheckIcon size={12} color="#1d4ed8" />
                              <span>Đang là BCH</span>
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              onClick={() => openStudentHistoryModal(st)}
                            >
                              Minh chứng
                            </button>
                            {!st.is_delegate && (
                              <button
                                type="button"
                                className={styles.secondaryBtn}
                                style={{ background: '#f5f3ff', borderColor: '#ddd6fe', color: '#6d28d9' }}
                                onClick={() => handleQuickGrantFromMember(st)}
                              >
                                <PlusIcon size={12} />
                                <span>Cấp BCH</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={styles.pagination}>
                <span>
                  Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredStudents.length)} trên tổng{' '}
                  {filteredStudents.length} đoàn viên
                </span>
                <div className={styles.pageBtns}>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    className={styles.pageBtn}
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ══════════════════════════════════════════════════ */}
      {/* MODE 2: BAN CHẤP HÀNH CHI ĐOÀN THEO NHIỆM KỲ      */}
      {/* ══════════════════════════════════════════════════ */}
      {mode === 'delegates' && (
        <>
          {/* Add BCH Chi Đoàn Card */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <ShieldCheckIcon size={18} color="#2563eb" />
                <span>Cấp quyền Ban Chấp Hành Chi Đoàn theo nhiệm kỳ</span>
              </h3>

              <div className={styles.modeSwitch}>
                <button
                  type="button"
                  onClick={() => {
                    setGrantMode('single');
                    setBulkErrors([]);
                  }}
                  className={`${styles.modeBtn} ${grantMode === 'single' ? styles.modeBtnActive : ''}`}
                >
                  Thêm 1 sinh viên
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGrantMode('bulk');
                    setBulkErrors([]);
                  }}
                  className={`${styles.modeBtn} ${grantMode === 'bulk' ? styles.modeBtnActive : ''}`}
                >
                  Nạp hàng loạt (Sheet/Excel)
                </button>
              </div>
            </div>

            <form onSubmit={handleGrantSubmit}>
              {grantMode === 'single' ? (
                <div className={styles.formGrid}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>MSSV Đoàn viên thuộc {currentLcdShort} *</label>
                    <input
                      type="text"
                      value={singleMssv}
                      onChange={(e) => setSingleMssv(e.target.value)}
                      placeholder="VD: N25DCCN018"
                      className={styles.textInput}
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Chức vụ tại Chi đoàn</label>
                    <select
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      className={styles.selectInput}
                      style={{ height: 40 }}
                    >
                      <option value="Bí thư Chi đoàn">Bí thư Chi đoàn</option>
                      <option value="Phó Bí thư Chi đoàn">Phó Bí thư Chi đoàn</option>
                      <option value="Ủy viên BCH Chi đoàn">Ủy viên BCH Chi đoàn</option>
                      <option value="Lớp trưởng / Ban cán sự">Lớp trưởng / Ban cán sự</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Thời hạn nhiệm kỳ</label>
                    <select
                      value={termPreset}
                      onChange={(e) => setTermPreset(e.target.value as any)}
                      className={styles.selectInput}
                      style={{ height: 40 }}
                    >
                      <option value="term_end">Theo nhiệm kỳ (đến 30/06/{new Date(getDefaultTermEndDate()).getFullYear()})</option>
                      <option value="365">12 tháng (1 nhiệm kỳ)</option>
                      <option value="180">6 tháng (1 học kỳ)</option>
                      <option value="30">30 ngày (đợt chấm ĐRL)</option>
                      <option value="custom">Tự chọn ngày kết thúc nhiệm kỳ</option>
                    </select>
                  </div>

                  {termPreset === 'custom' && (
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Ngày kết thúc nhiệm kỳ</label>
                      <input
                        type="date"
                        value={customExpiryDate}
                        onChange={(e) => setCustomExpiryDate(e.target.value)}
                        className={styles.textInput}
                        required
                      />
                    </div>
                  )}

                  <div className={styles.field} style={{ gridColumn: termPreset === 'custom' ? 'span 1' : 'span 2' }}>
                    <label className={styles.fieldLabel}>Ghi chú nhiệm kỳ (không bắt buộc)</label>
                    <input
                      type="text"
                      value={extraNote}
                      onChange={(e) => setExtraNote(e.target.value)}
                      placeholder="VD: Nhiệm kỳ 2026 - 2027"
                      className={styles.textInput}
                    />
                  </div>

                  <button type="submit" disabled={submittingGrant} className={styles.primaryBtn}>
                    <PlusIcon size={16} />
                    <span>{submittingGrant ? 'Đang cấp quyền...' : 'Cấp quyền BCH Chi đoàn'}</span>
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>
                      Dán danh sách MSSV BCH Chi đoàn thuộc {currentLcdShort} (copy thẳng từ cột MSSV trong Google Sheet / Excel)
                    </label>
                    <textarea
                      rows={5}
                      value={bulkMssvText}
                      onChange={(e) => setBulkMssvText(e.target.value)}
                      placeholder={'N25DCCN001\nN25DCCN015\nN24DCCN042\n(Hỗ trợ dán cả bảng, hệ thống tự tách mã MSSV hợp lệ)'}
                      className={styles.textareaInput}
                      required
                    />
                  </div>

                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Chức vụ chung</label>
                      <select
                        value={roleTitle}
                        onChange={(e) => setRoleTitle(e.target.value)}
                        className={styles.selectInput}
                        style={{ height: 40 }}
                      >
                        <option value="BCH Chi đoàn">BCH Chi đoàn (Bí thư / Phó Bí thư)</option>
                        <option value="Bí thư Chi đoàn">Bí thư Chi đoàn</option>
                        <option value="Phó Bí thư Chi đoàn">Phó Bí thư Chi đoàn</option>
                        <option value="Ủy viên BCH Chi đoàn">Ủy viên BCH Chi đoàn</option>
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>Thời hạn nhiệm kỳ</label>
                      <select
                        value={termPreset}
                        onChange={(e) => setTermPreset(e.target.value as any)}
                        className={styles.selectInput}
                        style={{ height: 40 }}
                      >
                        <option value="term_end">Theo nhiệm kỳ (đến 30/06/{new Date(getDefaultTermEndDate()).getFullYear()})</option>
                        <option value="365">12 tháng (1 nhiệm kỳ)</option>
                        <option value="180">6 tháng (1 học kỳ)</option>
                        <option value="custom">Tự chọn ngày kết thúc</option>
                      </select>
                    </div>

                    <button type="submit" disabled={submittingGrant} className={styles.primaryBtn}>
                      <UploadCloudIcon size={16} />
                      <span>{submittingGrant ? 'Đang nạp hàng loạt...' : 'Nạp hàng loạt BCH Chi đoàn'}</span>
                    </button>
                  </div>

                  {termPreset === 'custom' && (
                    <div className={styles.field} style={{ maxWidth: 260 }}>
                      <label className={styles.fieldLabel}>Ngày kết thúc nhiệm kỳ</label>
                      <input
                        type="date"
                        value={customExpiryDate}
                        onChange={(e) => setCustomExpiryDate(e.target.value)}
                        className={styles.textInput}
                        required
                      />
                    </div>
                  )}
                </div>
              )}

              {bulkErrors.length > 0 && (
                <div className={styles.bulkErrorBox}>
                  <div style={{ fontWeight: 800, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangleIcon size={15} color="#b91c1c" />
                    <span>Các dòng bị bỏ qua ({bulkErrors.length}):</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    {bulkErrors.slice(0, 15).map((err, i) => (
                      <li key={i}>
                        <strong>{err.mssv}</strong>: {err.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          </section>

          {/* Classes without BCH callout */}
          {classesWithoutDelegate.length > 0 && (
            <div className={styles.missingClassesBox}>
              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangleIcon size={16} color="#d97706" />
                <span>
                  Các Chi đoàn thuộc {currentLcdShort} chưa có BCH trên hệ thống ({classesWithoutDelegate.length} lớp):
                </span>
              </div>
              <div className={styles.classChips}>
                {classesWithoutDelegate.slice(0, 30).map((cls) => (
                  <span key={cls} className={styles.classChip}>
                    {cls}
                  </span>
                ))}
                {classesWithoutDelegate.length > 30 && (
                  <span className={styles.classChip}>+{classesWithoutDelegate.length - 30} lớp khác</span>
                )}
              </div>
            </div>
          )}

          {/* Active & Expired BCH Table */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>
                <UsersIcon size={18} color="#2563eb" />
                <span>Danh sách BCH Chi đoàn thuộc {currentLcdShort} ({filteredDelegates.length})</span>
              </h3>

              <div className={styles.searchWrap} style={{ maxWidth: 320 }}>
                <span className={styles.searchIcon}>
                  <SearchIcon size={15} />
                </span>
                <input
                  type="text"
                  value={delegateSearch}
                  onChange={(e) => setDelegateSearch(e.target.value)}
                  placeholder="Tìm MSSV, họ tên, lớp..."
                  className={styles.searchInput}
                />
              </div>
            </div>

            {loadingDelegates ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                Đang tải danh sách BCH Chi đoàn...
              </div>
            ) : filteredDelegates.length === 0 ? (
              <div style={{ padding: '2.25rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                Chưa có BCH Chi đoàn nào được gán cho {currentLcdShort}. Hãy thêm bằng biểu mẫu phía trên.
              </div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>MSSV</th>
                      <th>Họ và tên</th>
                      <th>Chi đoàn</th>
                      <th>Chức vụ / Ghi chú</th>
                      <th>Hạn nhiệm kỳ</th>
                      <th>Người cấp</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDelegates.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1d4ed8' }}>{d.mssv}</td>
                        <td style={{ fontWeight: 700 }}>{d.full_name}</td>
                        <td style={{ fontWeight: 700 }}>{d.class_id}</td>
                        <td style={{ fontSize: '0.82rem', color: '#475569' }}>{d.notes || 'BCH Chi đoàn'}</td>
                        <td>
                          {d.status === 'active' ? (
                            <span className={`${styles.badge} ${d.daysLeft <= 15 ? styles.badgeWarning : styles.badgeSuccess}`}>
                              <CalendarIcon size={12} />
                              <span>
                                {new Date(d.expires_at).toLocaleDateString('vi-VN')} ({d.daysLeft} ngày)
                              </span>
                            </span>
                          ) : (
                            <span className={`${styles.badge} ${styles.badgeDanger}`}>
                              Hết hạn ({new Date(d.expires_at).toLocaleDateString('vi-VN')})
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{d.created_by}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className={styles.secondaryBtn}
                              onClick={() => handleRenewDelegate(d)}
                              title="Gia hạn thêm 1 nhiệm kỳ (12 tháng)"
                            >
                              <RefreshIcon size={13} />
                              <span>Gia hạn</span>
                            </button>
                            <button
                              type="button"
                              className={styles.dangerBtn}
                              onClick={() => handleRevokeDelegate(d)}
                            >
                              <TrashIcon size={13} />
                              <span>Thu hồi</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── Modal Xem Minh Chứng ĐRL của Đoàn viên ── */}
      {selectedStudent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setSelectedStudent(null)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              maxWidth: '720px',
              width: '100%',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '1.15rem 1.4rem',
                background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                color: '#ffffff',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#bfdbfe' }}>
                  Minh chứng Điểm Rèn Luyện • {currentLcdShort}
                </div>
                <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.15rem', fontWeight: 800 }}>
                  {selectedStudent.full_name} ({selectedStudent.mssv})
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#e0e7ff', marginTop: '0.15rem' }}>
                  Chi đoàn: {selectedStudent.class_id} • {selectedStudent.email}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CloseIcon size={16} color="#ffffff" />
              </button>
            </div>

            <div style={{ padding: '1.35rem', overflowY: 'auto', flex: 1 }}>
              {loadingHistory ? (
                <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                  Đang tải lịch sử minh chứng...
                </div>
              ) : historyError ? (
                <div className={styles.bulkErrorBox}>{historyError}</div>
              ) : studentHistory ? (
                <>
                  <div
                    style={{
                      background: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      borderRadius: '12px',
                      padding: '0.8rem 1rem',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534' }}>
                      Tổng số hoạt động đã điểm danh hợp lệ
                    </span>
                    <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <CheckCircleIcon size={18} color="#15803d" />
                      <span>{studentHistory.total_attended} sự kiện</span>
                    </span>
                  </div>

                  {studentHistory.history && studentHistory.history.length > 0 ? (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Sự kiện</th>
                            <th>Số buổi</th>
                            <th>Thời gian check-in</th>
                            <th>Vai trò</th>
                          </tr>
                        </thead>
                        <tbody>
                          {studentHistory.history.map((h: any) => (
                            <tr key={h.id}>
                              <td style={{ fontWeight: 700 }}>{h.event_name}</td>
                              <td>
                                <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                                  {h.session_count || 1}/{h.total_sessions || 1} buổi
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                {new Date(h.checkin_time).toLocaleString('vi-VN')}
                              </td>
                              <td>
                                <span className={`${styles.badge} ${styles.badgeInfo}`}>
                                  {h.participate_role === 'volunteer'
                                    ? 'Cộng tác viên'
                                    : h.participate_role === 'organizer'
                                    ? 'Ban tổ chức'
                                    : 'Người tham gia'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
                      Đoàn viên này chưa có lượt điểm danh sự kiện nào.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
