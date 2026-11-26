'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import DutyMatrixTable from '@/components/DutyMatrixTable';
import SupportEventCreator from '@/components/SupportEventCreator';
import { useToast } from '@/components/ToastProvider';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import {
  CalendarIcon,
  UsersIcon,
  SettingsIcon,
  BuildingIcon,
  DownloadIcon,
  TrashIcon,
  AlertTriangleIcon,
  RefreshIcon,
  PlusIcon,
} from '@/components/icons';

type AdminTab = 'schedule' | 'volunteers' | 'windows_network' | 'equipment' | 'support_events';

const isBanStillActive = (bannedUntil: string) => new Date(bannedUntil).getTime() > Date.now();

function resolveWindowBadge(w: any): {
  label: string;
  bg: string;
  color: string;
  title: string;
} {
  let state: string = w?.window_state || '';
  if (!state) {
    const nowMs = Date.now();
    const openMs = new Date(w?.open_at).getTime();
    const closeMs = new Date(w?.close_at).getTime();
    const todayStr = getVietnamDateString(0);
    const applyTo = String(w?.apply_to || '').slice(0, 10);
    if (!w?.is_active) state = 'disabled';
    else if (applyTo && todayStr > applyTo) state = 'ended';
    else if (Number.isFinite(closeMs) && nowMs > closeMs) state = 'closed';
    else if (Number.isFinite(openMs) && nowMs < openMs) state = 'upcoming';
    else state = 'open';
  }

  switch (state) {
    case 'disabled':
      return {
        label: 'Đã tắt',
        bg: 'var(--bg-muted)',
        color: 'var(--text-muted)',
        title: 'Đợt đăng ký đang tắt thủ công (bấm để bật lại)',
      };
    case 'ended':
      return {
        label: 'Đã kết thúc',
        bg: 'var(--bg-muted)',
        color: 'var(--text-muted)',
        title: 'Đã qua cả thời gian mở đăng ký và tuần trực áp dụng',
      };
    case 'closed':
      return {
        label: 'Đã đóng ĐK',
        bg: 'var(--tint-amber-bg)',
        color: 'var(--status-amber-text)',
        title: 'Đã hết thời hạn mở đăng ký tự động (CTV không thể đăng ký/hủy thêm)',
      };
    case 'upcoming':
      return {
        label: 'Sắp mở',
        bg: 'var(--tint-blue-bg)',
        color: 'var(--text-brand)',
        title: 'Đã lên lịch, sẽ tự mở khi tới giờ (bấm để tắt)',
      };
    default:
      return {
        label: 'Đang mở ĐK',
        bg: 'var(--tint-green-strong)',
        color: 'var(--status-green-text)',
        title: 'Đang trong khung giờ cho phép CTV đăng ký (bấm để tạm tắt)',
      };
  }
}

function fmtDateVN(d?: string | null): string {
  if (!d) return '—';
  if (d.includes('T')) {
    const dt = new Date(d);
    if (!isNaN(dt.getTime())) {
      return dt.toLocaleDateString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    }
  }
  const p = String(d).split('T')[0].split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function fmtDateTimeVN(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
}

function addDays(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function OfficeAdminPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('schedule');
  const [forbidden, setForbidden] = useState(false);

  // Schedule & Attendance
  const [weekAnchor, setWeekAnchor] = useState('');
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [attendanceList, setAttendanceList] = useState<any[]>([]);
  const [busyCellKey, setBusyCellKey] = useState<string | null>(null);

  // Volunteers
  const [volunteers, setVolunteers] = useState<any[]>([]);
  const [bulkMssvInput, setBulkMssvInput] = useState('');
  const [savingVol, setSavingVol] = useState(false);

  // Windows & Network Config
  const [windows, setWindows] = useState<any[]>([]);
  const [winTitle, setWinTitle] = useState('');
  const [winFrom, setWinFrom] = useState('');
  const [winTo, setWinTo] = useState('');
  const [winOpen, setWinOpen] = useState('');
  const [winClose, setWinClose] = useState('');

  const [config, setConfig] = useState<any>(null);
  const [clientIp, setClientIp] = useState('');
  const [ipsText, setIpsText] = useState('');
  const [savingCfg, setSavingCfg] = useState(false);

  // Equipment & Bans
  const [items, setItems] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [reqFilter, setReqFilter] = useState<'all' | 'pending' | 'active' | 'done'>('all');
  const [reqPage, setReqPage] = useState(1);
  const REQ_PAGE_SIZE = 10;
  const [newItemName, setNewItemName] = useState('');
  const [newItemCat, setNewItemCat] = useState('Dụng cụ sự kiện');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('Cái');

  // Support Events (VPĐ tạo nhanh không mượn phòng & miễn duyệt CTSV)
  const [supportEvents, setSupportEvents] = useState<any[]>([]);
  const [loadingSupportEvents, setLoadingSupportEvents] = useState(false);

  const showMsg = useCallback((type: 'success' | 'error', text: string) => {
    if (type === 'success') toast.success(text);
    else toast.error(text);
  }, [toast]);

  const loadSchedule = useCallback(async (anchor?: string) => {
    try {
      const qs = anchor ? `?week_of=${encodeURIComponent(anchor)}` : '';
      const [sRes, aRes] = await Promise.all([
        fetch(`/api/office/duty/schedule${qs}`, { cache: 'no-store' }),
        fetch('/api/office/duty/attendance', { cache: 'no-store' }),
      ]);
      if (sRes.status === 403) {
        setForbidden(true);
        return;
      }
      const sJson = await sRes.json();
      if (sJson.success && sJson.data) {
        if (!sJson.data.is_admin) {
          setForbidden(true);
          return;
        }
        setScheduleData(sJson.data);
        if (!anchor && sJson.data.workdays?.[0]) {
          setWeekAnchor(sJson.data.workdays[0]);
        }
      }
      if (aRes.ok) {
        const aJson = await aRes.json();
        if (aJson.success && Array.isArray(aJson.data)) setAttendanceList(aJson.data);
      }
    } catch {
      toast.error('Lỗi tải lịch trực văn phòng.');
    }
  }, [toast]);

  const loadVolunteers = useCallback(async () => {
    try {
      const res = await fetch('/api/office/duty/volunteers', { cache: 'no-store' });
      if (res.status === 403) return setForbidden(true);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setVolunteers(json.data);
    } catch {
      toast.error('Lỗi tải danh sách CTV trực.');
    }
  }, [toast]);

  const loadWindowsAndConfig = useCallback(async () => {
    try {
      const [wRes, cRes] = await Promise.all([
        fetch('/api/office/duty/windows', { cache: 'no-store' }),
        fetch('/api/office/duty/config', { cache: 'no-store' }),
      ]);
      if (wRes.status === 403) return setForbidden(true);
      const wJson = await wRes.json();
      if (wJson.success && Array.isArray(wJson.data)) setWindows(wJson.data);
      const cJson = await cRes.json();
      if (cJson.success && cJson.data) {
        setConfig(cJson.data.config);
        setClientIp(cJson.data.client_ip || '');
        setIpsText((cJson.data.config?.allowed_ips || []).join('\n'));
      }
    } catch {
      toast.error('Lỗi tải cấu hình trực văn phòng.');
    }
  }, [toast]);

  const loadEquipment = useCallback(async () => {
    try {
      const [iRes, rRes, bRes] = await Promise.all([
        fetch('/api/office/equipment/items', { cache: 'no-store' }),
        fetch('/api/office/equipment/requests', { cache: 'no-store' }),
        fetch('/api/office/equipment/bans', { cache: 'no-store' }),
      ]);
      const iJson = await iRes.json();
      const rJson = await rRes.json();
      const bJson = await bRes.json();
      if (iJson.success && Array.isArray(iJson.data)) setItems(iJson.data);
      if (rJson.success && rJson.data) setRequests(rJson.data.requests || []);
      if (bJson.success && Array.isArray(bJson.data)) setBans(bJson.data);
    } catch {
      toast.error('Lỗi tải dữ liệu kho dụng cụ.');
    }
  }, [toast]);

  const loadSupportEvents = useCallback(async () => {
    setLoadingSupportEvents(true);
    try {
      const res = await fetch('/api/office/events', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setSupportEvents(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSupportEvents(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (typeof window !== 'undefined') {
        const tabParam = new URLSearchParams(window.location.search).get('tab');
        if (
          tabParam === 'schedule' ||
          tabParam === 'volunteers' ||
          tabParam === 'windows_network' ||
          tabParam === 'equipment' ||
          tabParam === 'support_events'
        ) {
          setActiveTab(tabParam);
        }
      }
      loadSchedule();
      loadVolunteers();
      loadWindowsAndConfig();
      loadEquipment();
      loadSupportEvents();
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSchedule, loadVolunteers, loadWindowsAndConfig, loadEquipment, loadSupportEvents]);

  // Handlers
  const handleMatrixRegister = async (mssv: string, dutyDate: string, shift: 'morning' | 'afternoon') => {
    const key = `${mssv}_${dutyDate}_${shift}`;
    setBusyCellKey(key);
    try {
      const res = await fetch('/api/office/duty/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv, duty_date: dutyDate, shift }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        await loadSchedule(weekAnchor || undefined);
      } else {
        showMsg('error', json.error || 'Lỗi gán ca trực');
      }
    } catch {
      showMsg('error', 'Lỗi kết nối khi gán ca trực');
    } finally {
      setBusyCellKey(null);
    }
  };

  const handleRemoveReg = async (id: string) => {
    setBusyCellKey(id);
    try {
      const res = await fetch(`/api/office/duty/schedule?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showMsg('success', 'Đã gỡ khỏi ca trực.');
        await loadSchedule(weekAnchor || undefined);
      } else showMsg('error', json.error || 'Lỗi xóa');
    } catch {
      showMsg('error', 'Lỗi kết nối khi gỡ ca trực');
    } finally {
      setBusyCellKey(null);
    }
  };

  const handleAddVolunteers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkMssvInput.trim()) return;
    setSavingVol(true);
    try {
      const res = await fetch('/api/office/duty/volunteers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssvs: [bulkMssvInput] }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        setBulkMssvInput('');
        loadVolunteers();
      } else showMsg('error', json.error || 'Lỗi thêm CTV');
    } catch {
      showMsg('error', 'Lỗi kết nối khi thêm CTV');
    } finally {
      setSavingVol(false);
    }
  };

  const handleDeleteVolunteer = async (mssv: string) => {
    if (!window.confirm(`Xóa ${mssv} khỏi danh sách CTV trực?`)) return;
    try {
      const res = await fetch(`/api/office/duty/volunteers?mssv=${encodeURIComponent(mssv)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        loadVolunteers();
      } else showMsg('error', json.error || 'Lỗi xóa');
    } catch {
      showMsg('error', 'Lỗi kết nối khi xóa CTV');
    }
  };

  const handleCreateWindow = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/office/duty/windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: winTitle,
          apply_from: winFrom,
          apply_to: winTo,
          open_at: winOpen,
          close_at: winClose,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        setWinTitle('');
        loadWindowsAndConfig();
      } else showMsg('error', json.error || 'Lỗi mở đợt đăng ký');
    } catch {
      showMsg('error', 'Lỗi kết nối khi mở đợt đăng ký');
    }
  };

  const handleToggleWindow = async (w: any) => {
    try {
      const res = await fetch('/api/office/duty/windows', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: w.id, is_active: !w.is_active }),
      });
      const json = await res.json();
      if (json.success) loadWindowsAndConfig();
      else showMsg('error', json.error || 'Không thể cập nhật đợt đăng ký');
    } catch {
      showMsg('error', 'Lỗi kết nối khi cập nhật đợt đăng ký');
    }
  };

  const handleDeleteWindow = async (id: string) => {
    if (!window.confirm('Xóa đợt đăng ký này?')) return;
    try {
      const res = await fetch(`/api/office/duty/windows?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) loadWindowsAndConfig();
      else showMsg('error', 'Không thể xóa đợt đăng ký');
    } catch {
      showMsg('error', 'Lỗi kết nối khi xóa đợt đăng ký');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSavingCfg(true);
    try {
      const allowed_ips = ipsText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/office/duty/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, allowed_ips }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        loadWindowsAndConfig();
      } else showMsg('error', json.error || 'Lỗi lưu cấu hình');
    } catch {
      showMsg('error', 'Lỗi kết nối khi lưu cấu hình');
    } finally {
      setSavingCfg(false);
    }
  };

  const handleRequestAction = async (id: string, action: 'approve' | 'handover' | 'return' | 'reject') => {
    const confirmMap: Record<string, string> = {
      approve: 'Duyệt đơn mượn dụng cụ này?',
      handover: 'Xác nhận đã bàn giao vật phẩm cho đơn vị?',
      return: 'Xác nhận đơn vị ĐÃ TRẢ đầy đủ dụng cụ? (Nếu trễ >= 1 ngày hệ thống sẽ tự động cấm mượn)',
      reject: 'Từ chối đơn mượn này?',
    };
    if (!window.confirm(confirmMap[action])) return;
    try {
      const res = await fetch('/api/office/equipment/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        loadEquipment();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('hdd:pending-counts-changed'));
        }
      } else showMsg('error', json.error || 'Lỗi xử lý đơn');
    } catch {
      showMsg('error', 'Lỗi kết nối khi xử lý đơn mượn');
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    try {
      const res = await fetch('/api/office/equipment/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemName.trim(),
          category: newItemCat,
          total_qty: newItemQty,
          unit: newItemUnit,
        }),
      });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        setNewItemName('');
        loadEquipment();
      } else showMsg('error', json.error || 'Lỗi thêm vật phẩm');
    } catch {
      showMsg('error', 'Lỗi kết nối khi thêm vật phẩm');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Ẩn vật phẩm này khỏi danh mục kho VPĐ?')) return;
    try {
      const res = await fetch(`/api/office/equipment/items?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.ok) loadEquipment();
      else showMsg('error', 'Không thể ẩn vật phẩm');
    } catch {
      showMsg('error', 'Lỗi kết nối khi ẩn vật phẩm');
    }
  };

  const handleUnban = async (id: string) => {
    if (!window.confirm('Gỡ lệnh cấm mượn dụng cụ cho đơn vị này?')) return;
    try {
      const res = await fetch(`/api/office/equipment/bans?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showMsg('success', json.message);
        loadEquipment();
      } else showMsg('error', json.error || 'Không thể gỡ lệnh cấm');
    } catch {
      showMsg('error', 'Lỗi kết nối khi gỡ lệnh cấm');
    }
  };

  const handleExportAttendance = async () => {
    const { downloadStyledSheet } = await import('@/lib/utils/styled-excel');
    const rows = attendanceList.map((a, idx) => ({
      stt: idx + 1,
      duty_date: fmtDateVN(a.duty_date),
      shift: a.shift === 'morning' ? 'Ca Sáng' : 'Ca Chiều',
      mssv: a.mssv,
      full_name: a.full_name || a.mssv,
      check_in_at: fmtDateTimeVN(a.check_in_at),
      check_in_ip: a.check_in_ip || '—',
      late_minutes: a.late_minutes || 0,
      check_out_at: fmtDateTimeVN(a.check_out_at),
      check_out_ip: a.check_out_ip || '—',
      worked_minutes: a.worked_minutes || 0,
      status: a.status === 'completed' ? 'Hoàn thành' : 'Chưa check-out',
    }));
    const totalWorkedMinutes = attendanceList.reduce(
      (sum, a) => sum + (Number(a.worked_minutes) || 0),
      0
    );
    const totalLateMinutes = attendanceList.reduce(
      (sum, a) => sum + (Number(a.late_minutes) || 0),
      0
    );
    const completedCount = attendanceList.filter((a) => a.status === 'completed').length;

    downloadStyledSheet({
      filename: `ChamCong_TrucVanPhongDoan_${getVietnamDateString(0)}.xlsx`,
      sheetName: 'ChamCong_VPD',
      reportTitle: 'BẢNG CHẤM CÔNG TRỰC VĂN PHÒNG ĐOÀN THANH NIÊN',
      reportSubtitle: `Tổng số ca ghi nhận: ${rows.length} ca  •  Đã hoàn thành: ${completedCount} ca`,
      unitTitle: 'VĂN PHÒNG ĐOÀN HỌC VIỆN PTIT HCM',
      showSignatureBlock: true,
      columns: [
        { key: 'stt', label: 'STT', align: 'center', width: 7, numFmt: 'rawInt' },
        { key: 'duty_date', label: 'Ngày Trực', align: 'center', width: 14 },
        { key: 'shift', label: 'Ca Trực', align: 'center', width: 13 },
        { key: 'mssv', label: 'MSSV', align: 'center', width: 15, tone: 'code' },
        { key: 'full_name', label: 'Họ Và Tên', align: 'left', width: 26, tone: 'bold' },
        { key: 'check_in_at', label: 'Giờ Check-in', align: 'center', width: 19 },
        { key: 'check_in_ip', label: 'IP Check-in', align: 'center', width: 16 },
        { key: 'late_minutes', label: 'Đi Trễ (Phút)', align: 'right', width: 14, numFmt: 'int' },
        { key: 'check_out_at', label: 'Giờ Check-out', align: 'center', width: 19 },
        { key: 'check_out_ip', label: 'IP Check-out', align: 'center', width: 16 },
        { key: 'worked_minutes', label: 'Tổng Phút Trực', align: 'right', width: 16, numFmt: 'int' },
        { key: 'status', label: 'Trạng Thái', align: 'center', width: 17 },
      ],
      rows,
      summaryRow: {
        stt: '',
        duty_date: 'TỔNG CỘNG',
        shift: `${rows.length} ca`,
        mssv: '',
        full_name: `${completedCount}/${rows.length} ca đã hoàn thành`,
        check_in_at: '',
        check_in_ip: '',
        late_minutes: totalLateMinutes,
        check_out_at: '',
        check_out_ip: '',
        worked_minutes: totalWorkedMinutes,
        status: `${(totalWorkedMinutes / 60).toFixed(1)} giờ`,
      },
    });
  };

  if (forbidden) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <Header title="QUẢN TRỊ VĂN PHÒNG ĐOÀN" />
        <main style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.25rem' }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--tint-red-border)', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <AlertTriangleIcon size={36} color="var(--status-red-text)" />
            <h2 style={{ marginTop: '0.75rem' }}>Không có quyền truy cập</h2>
            <p style={{ color: 'var(--text-muted)' }}>
              Trang này chỉ dành cho tài khoản <strong>Admin Văn phòng Đoàn</strong> hoặc <strong>Super Admin</strong>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const activeBans = bans.filter((b) => b.is_active && isBanStillActive(b.banned_until));
  const pendingBorrowCount = requests.filter((r) => r.status === 'pending').length;
  const activeBorrowCount = requests.filter((r) => r.status === 'approved' || r.status === 'borrowed').length;
  const doneBorrowCount = requests.filter((r) => r.status === 'returned' || r.status === 'rejected').length;

  const STATUS_PRIORITY: Record<string, number> = {
    pending: 0,
    borrowed: 1,
    approved: 2,
    returned: 3,
    rejected: 4,
  };

  const sortedFilteredRequests = [...requests]
    .filter((r) => {
      if (reqFilter === 'pending') return r.status === 'pending';
      if (reqFilter === 'active') return r.status === 'approved' || r.status === 'borrowed';
      if (reqFilter === 'done') return r.status === 'returned' || r.status === 'rejected';
      return true;
    })
    .sort((a, b) => {
      const pa = STATUS_PRIORITY[a.status] ?? 9;
      const pb = STATUS_PRIORITY[b.status] ?? 9;
      if (pa !== pb) return pa - pb;
      // Within borrowed, overdue items come first
      if (a.status === 'borrowed' && b.status === 'borrowed') {
        const oa = Number(a.current_overdue_days) || 0;
        const ob = Number(b.current_overdue_days) || 0;
        if (oa !== ob) return ob - oa;
      }
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

  const reqTotalPages = Math.max(1, Math.ceil(sortedFilteredRequests.length / REQ_PAGE_SIZE));
  const safeReqPage = Math.min(reqPage, reqTotalPages);
  const paginatedRequests = sortedFilteredRequests.slice(
    (safeReqPage - 1) * REQ_PAGE_SIZE,
    safeReqPage * REQ_PAGE_SIZE
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Header title="QUẢN TRỊ VĂN PHÒNG ĐOÀN" />
      <main style={{ maxWidth: 1360, margin: '0 auto', padding: '1.25rem 1.5rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        {/* Hero */}
        <section
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderLeft: '3px solid var(--brand-accent)',
            borderRadius: 16,
            padding: '1.25rem 1.5rem',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            color: 'var(--text-primary)',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-brand)' }}>
              Bàn làm việc Admin Văn phòng Đoàn
            </div>
            <h1 style={{ margin: '0.2rem 0', fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Quản Lý Trực Văn Phòng &amp; Mượn Dụng Cụ
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Quản lý danh sách CTV trực, mở đợt đăng ký, kiểm soát chấm công qua WiFi VPĐ, duyệt mượn và tự động cấm mượn khi trả trễ.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.55rem 0.9rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{volunteers.length}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>CTV trực</div>
            </div>
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-color)', borderRadius: 12, padding: '0.55rem 0.9rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{requests.filter((r) => r.status === 'pending' || r.status === 'borrowed').length}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Đơn đang xử lý</div>
            </div>
            <div
              style={{
                background: activeBans.length > 0 ? 'var(--tint-red-bg)' : 'var(--bg-subtle)',
                border: activeBans.length > 0 ? '1px solid var(--tint-red-border)' : '1px solid var(--border-color)',
                borderRadius: 12,
                padding: '0.55rem 0.9rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: activeBans.length > 0 ? 'var(--status-red-text)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{activeBans.length}</div>
              <div style={{ fontSize: '0.72rem', color: activeBans.length > 0 ? 'var(--status-red-text)' : 'var(--text-muted)', fontWeight: 600 }}>Đơn vị bị cấm</div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            { id: 'schedule' as AdminTab, label: 'Lịch trực & Chấm công', icon: <CalendarIcon size={15} />, alertCount: 0 },
            { id: 'volunteers' as AdminTab, label: `Danh sách CTV trực (${volunteers.length})`, icon: <UsersIcon size={15} />, alertCount: 0 },
            { id: 'windows_network' as AdminTab, label: 'Đợt đăng ký & Mạng VPĐ', icon: <SettingsIcon size={15} />, alertCount: 0 },
            { id: 'equipment' as AdminTab, label: 'Mượn dụng cụ & Cấm mượn', icon: <BuildingIcon size={15} />, alertCount: pendingBorrowCount },
            { id: 'support_events' as AdminTab, label: `Sự kiện hỗ trợ (${supportEvents.length})`, icon: <PlusIcon size={15} />, alertCount: 0 },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.55rem 1rem',
                borderRadius: 10,
                border: activeTab === t.id ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                background: activeTab === t.id ? '#1d4ed8' : 'var(--bg-surface)',
                color: activeTab === t.id ? '#fff' : 'var(--text-body)',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
              }}
            >
              {t.icon} {t.label}
              {t.alertCount > 0 && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 20,
                    height: 20,
                    padding: '0 6px',
                    borderRadius: 999,
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    lineHeight: 1,
                    boxShadow: activeTab === t.id ? '0 0 0 2px rgba(255,255,255,0.85)' : 'none',
                  }}
                >
                  {t.alertCount > 99 ? '99+' : t.alertCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TAB 1: Lịch trực & Chấm công */}
        {activeTab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.2rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Lịch trực tuần ({scheduleData?.workdays?.[0] ? `${fmtDateVN(scheduleData.workdays[0])} – ${fmtDateVN(scheduleData.workdays[4])}` : '...'})
                </h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => { const n = addDays(weekAnchor || scheduleData?.workdays?.[0], -7); setWeekAnchor(n); loadSchedule(n); }} style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>← Tuần trước</button>
                  <button type="button" onClick={() => { setWeekAnchor(''); loadSchedule(); }} style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid var(--tint-blue-border)', background: 'var(--tint-blue-bg)', color: 'var(--text-brand)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Tuần này</button>
                  <button type="button" onClick={() => { const n = addDays(weekAnchor || scheduleData?.workdays?.[0], 7); setWeekAnchor(n); loadSchedule(n); }} style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Tuần sau →</button>
                </div>
              </div>

              <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Bấm trực tiếp vào ô <strong>Sáng / Chiều</strong> tương ứng với từng CTV để tick ✓ xếp lịch hoặc bỏ chọn (tối đa {scheduleData?.config?.max_per_shift || 2} người/ca).
              </p>

              <DutyMatrixTable
                workdays={scheduleData?.workdays || []}
                todayVN={scheduleData?.today_vn}
                volunteers={volunteers.length > 0 ? volunteers : (scheduleData?.volunteers || [])}
                registrations={scheduleData?.registrations || []}
                maxPerShift={scheduleData?.config?.max_per_shift || 2}
                mode="admin"
                busyKey={busyCellKey}
                onRegister={handleMatrixRegister}
                onCancel={handleRemoveReg}
              />
            </section>

            {/* Nhật ký chấm công */}
            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Nhật ký Chấm công CTV ({attendanceList.length})</h2>
                <button type="button" onClick={handleExportAttendance} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <DownloadIcon size={15} /> Xuất Excel chấm công
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Ngày</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Ca</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>CTV</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Check-in / IP</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Check-out / IP</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Tổng phút</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceList.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có lượt chấm công nào.</td></tr>
                    ) : attendanceList.map((a) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700 }}>{fmtDateVN(a.duty_date)}</td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>{a.shift === 'morning' ? 'Sáng' : 'Chiều'}</td>
                        <td style={{ padding: '0.65rem 0.8rem' }}><strong>{a.full_name}</strong> <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>({a.mssv})</span></td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          {fmtDateTimeVN(a.check_in_at)}
                          {a.late_minutes > 0 && <span style={{ color: 'var(--status-red-text)', fontWeight: 700 }}> (trễ {a.late_minutes}p)</span>}
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.check_in_ip || ''}</div>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          {fmtDateTimeVN(a.check_out_at)}
                          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{a.check_out_ip || ''}</div>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: 700 }}>{a.worked_minutes || 0}p</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: Danh sách CTV trực */}
        {activeTab === 'volunteers' && (
          <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Nạp Danh sách CTV Trực Văn phòng</h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                Chỉ các MSSV nằm trong danh sách này mới nhìn thấy mục <strong>Trực văn phòng</strong> trên menu và được đăng ký lịch trực. Bạn có thể nhập 1 MSSV hoặc dán cả cột MSSV từ Excel / Google Sheet.
              </p>
            </div>

            <form onSubmit={handleAddVolunteers} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <textarea
                rows={4}
                value={bulkMssvInput}
                onChange={(e) => setBulkMssvInput(e.target.value)}
                placeholder={'Dán 1 hoặc nhiều MSSV cách nhau bằng dấu phẩy hoặc xuống dòng:\nN22DCCN158\nN23DCAT012\nN24DCVT045'}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-strong)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                required
              />
              <div>
                <button type="submit" disabled={savingVol} style={{ padding: '0.55rem 1.2rem', borderRadius: 9, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  {savingVol ? 'Đang nạp...' : 'Thêm vào danh sách CTV trực'}
                </button>
              </div>
            </form>

            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>MSSV</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Họ tên</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Lớp</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {volunteers.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có CTV trực nào.</td></tr>
                  ) : volunteers.map((v) => (
                    <tr key={v.mssv} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-brand)' }}>{v.mssv}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>{v.full_name}</td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>{v.class_id}</td>
                      <td style={{ padding: '0.65rem 0.85rem', color: 'var(--text-muted)' }}>{v.email}</td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                        <button type="button" onClick={() => handleDeleteVolunteer(v.mssv)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--tint-red-border)', background: 'var(--tint-red-bg)', color: 'var(--status-red-text)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                          <TrashIcon size={13} /> Xóa
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 3: Đợt đăng ký & Cấu hình Mạng VPĐ */}
        {activeTab === 'windows_network' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* Mở đợt đăng ký */}
            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', fontWeight: 800 }}>Mở Đợt Đăng Ký Lịch Trực</h2>
              <form onSubmit={handleCreateWindow} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem', padding: '0.9rem', background: 'var(--bg-subtle)', borderRadius: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Tên đợt *</label>
                  <input type="text" required value={winTitle} onChange={(e) => setWinTitle(e.target.value)} placeholder="VD: Trực tuần 12 (23/11 – 27/11)" style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Áp dụng từ ngày *</label>
                  <input type="date" required value={winFrom} onChange={(e) => setWinFrom(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Áp dụng đến ngày *</label>
                  <input type="date" required value={winTo} onChange={(e) => setWinTo(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Mở đăng ký lúc *</label>
                  <input type="datetime-local" required value={winOpen} onChange={(e) => setWinOpen(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.6rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Đóng đăng ký lúc *</label>
                  <input type="datetime-local" required value={winClose} onChange={(e) => setWinClose(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.6rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                </div>
                <button type="submit" style={{ height: 36, borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>Mở đợt đăng ký</button>
              </form>

              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Tên đợt</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Ngày trực áp dụng</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Khung giờ mở đăng ký</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windows.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Chưa có đợt đăng ký nào.</td></tr>
                    ) : windows.map((w) => {
                      const badge = resolveWindowBadge(w);
                      return (
                        <tr key={w.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700 }}>{w.title}</td>
                          <td style={{ padding: '0.65rem 0.8rem' }}>{fmtDateVN(w.apply_from)} → {fmtDateVN(w.apply_to)}</td>
                          <td style={{ padding: '0.65rem 0.8rem' }}>{fmtDateTimeVN(w.open_at)} → {fmtDateTimeVN(w.close_at)}</td>
                          <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>
                            <button
                              type="button"
                              title={badge.title}
                              onClick={() => handleToggleWindow(w)}
                              style={{ padding: '3px 10px', borderRadius: 999, border: 'none', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: badge.bg, color: badge.color }}
                            >
                              {badge.label}
                            </button>
                          </td>
                          <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>
                            <button type="button" onClick={() => handleDeleteWindow(w.id)} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid var(--tint-red-border)', background: 'var(--tint-red-bg)', color: 'var(--status-red-text)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Xóa</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Cấu hình Mạng WiFi VPĐ & Giờ ca */}
            {config && (
              <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.25rem' }}>
                <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.05rem', fontWeight: 800 }}>Cấu hình Mạng WiFi VPĐ &amp; Khung giờ Check-in/out</h2>
                <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' }}>
                      <input type="checkbox" checked={config.require_ip_check} onChange={(e) => setConfig({ ...config, require_ip_check: e.target.checked })} />
                      Bắt buộc kết nối đúng IP mạng WiFi Văn phòng Đoàn khi Check-in / Check-out
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={config.allow_localhost} onChange={(e) => setConfig({ ...config, allow_localhost: e.target.checked })} />
                      Cho phép localhost (khi test máy cá nhân)
                    </label>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        Danh sách IP mạng WiFi VPĐ được phép (mỗi dòng 1 IP, hỗ trợ tiền tố dạng 113.161.72.*)
                      </label>
                      {clientIp && (
                        <button
                          type="button"
                          onClick={() => {
                            const cur = ipsText.split('\n').map((s) => s.trim()).filter(Boolean);
                            if (!cur.includes(clientIp)) setIpsText([...cur, clientIp].join('\n'));
                          }}
                          style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid var(--tint-blue-border)', background: 'var(--tint-blue-bg)', color: 'var(--text-brand)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          + Thêm IP mạng hiện tại ({clientIp})
                        </button>
                      )}
                    </div>
                    <textarea rows={3} value={ipsText} onChange={(e) => setIpsText(e.target.value)} placeholder="VD: 113.161.72.10" style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', fontFamily: 'monospace', fontSize: '0.84rem' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Tối đa người / ca</label>
                      <input type="number" min={1} max={10} value={config.max_per_shift} onChange={(e) => setConfig({ ...config, max_per_shift: Number(e.target.value) || 2 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Check-in sớm (phút)</label>
                      <input type="number" min={0} max={120} value={config.early_checkin_minutes} onChange={(e) => setConfig({ ...config, early_checkin_minutes: Number(e.target.value) || 0 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Check-out trễ (phút)</label>
                      <input type="number" min={0} max={120} value={config.late_checkout_minutes} onChange={(e) => setConfig({ ...config, late_checkout_minutes: Number(e.target.value) || 0 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>Số ngày cấm mượn khi trễ</label>
                      <input type="number" min={1} max={365} value={config.ban_days_on_late_return} onChange={(e) => setConfig({ ...config, ban_days_on_late_return: Number(e.target.value) || 30 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)' }} />
                    </div>
                  </div>

                  <div>
                    <button type="submit" disabled={savingCfg} style={{ padding: '0.55rem 1.25rem', borderRadius: 9, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                      {savingCfg ? 'Đang lưu...' : 'Lưu cấu hình VPĐ'}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </div>
        )}

        {/* TAB 4: Mượn dụng cụ & Cấm mượn */}
        {activeTab === 'equipment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* Đơn mượn từ LCĐ / CLB */}
            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Đơn mượn dụng cụ từ LCĐ / CLB ({requests.length})</h2>
                <button type="button" onClick={loadEquipment} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.38rem 0.75rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-subtle)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                  <RefreshIcon size={14} /> Làm mới
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.85rem' }}>
                {[
                  { id: 'all' as const, label: `Tất cả (${requests.length})` },
                  { id: 'pending' as const, label: `Chờ duyệt (${pendingBorrowCount})`, alert: pendingBorrowCount > 0 },
                  { id: 'active' as const, label: `Đang mượn / Chờ giao (${activeBorrowCount})` },
                  { id: 'done' as const, label: `Đã xong (${doneBorrowCount})` },
                ].map((f) => {
                  const active = reqFilter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => { setReqFilter(f.id); setReqPage(1); }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '0.32rem 0.72rem',
                        borderRadius: 999,
                        border: active ? '1px solid var(--brand-accent)' : '1px solid var(--border-color)',
                        background: active ? '#1d4ed8' : 'var(--bg-surface)',
                        color: active ? '#fff' : 'var(--text-body)',
                        fontSize: '0.77rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {f.alert && (
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: active ? '#fde047' : '#ef4444' }} />
                      )}
                      {f.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Đơn vị &amp; Mục đích</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Vật phẩm</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Hạn trả</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequests.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '1.2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Không có đơn mượn nào trong mục này.</td></tr>
                    ) : paginatedRequests.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)', background: r.current_overdue_days > 0 && r.status === 'borrowed' ? 'var(--tint-red-bg)' : undefined }}>
                        <td style={{ padding: '0.68rem 0.8rem' }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{r.unit_name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>{r.purpose}</div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{r.requester_name} • {r.requester_phone || r.requester_email}</div>
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem' }}>
                          {(r.items || []).map((it: any, i: number) => (
                            <div key={i}>• {it.item_name} <strong>(x{it.quantity})</strong></div>
                          ))}
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem', whiteSpace: 'nowrap' }}>
                          <div>{fmtDateVN(r.borrow_date)} → <strong>{fmtDateVN(r.due_date)}</strong></div>
                          {r.current_overdue_days > 0 && r.status === 'borrowed' && (
                            <div style={{ color: 'var(--status-red-text)', fontWeight: 800, fontSize: '0.75rem' }}>⚠ Trễ {r.current_overdue_days} ngày!</div>
                          )}
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem', textAlign: 'center', fontWeight: 700 }}>
                          {r.status === 'pending' && <span style={{ color: 'var(--status-amber-text)' }}>Chờ duyệt</span>}
                          {r.status === 'approved' && <span style={{ color: 'var(--text-brand)' }}>Đã duyệt</span>}
                          {r.status === 'borrowed' && <span style={{ color: 'var(--status-purple-text)' }}>Đang mượn</span>}
                          {r.status === 'returned' && <span style={{ color: 'var(--status-green-text)' }}>Đã trả {r.late_days > 0 ? `(trễ ${r.late_days}d)` : ''}</span>}
                          {r.status === 'rejected' && <span style={{ color: 'var(--status-red-text)' }}>Từ chối</span>}
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 5 }}>
                            {r.status === 'pending' && (
                              <>
                                <button type="button" onClick={() => handleRequestAction(r.id, 'approve')} style={{ padding: '4px 9px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Duyệt</button>
                                <button type="button" onClick={() => handleRequestAction(r.id, 'reject')} style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid var(--tint-red-border)', background: 'var(--tint-red-bg)', color: 'var(--status-red-text)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Từ chối</button>
                              </>
                            )}
                            {r.status === 'approved' && (
                              <button type="button" onClick={() => handleRequestAction(r.id, 'handover')} style={{ padding: '4px 9px', borderRadius: 7, border: 'none', background: '#7c3aed', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Xác nhận giao đồ</button>
                            )}
                            {r.status === 'borrowed' && (
                              <button type="button" onClick={() => handleRequestAction(r.id, 'return')} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Xác nhận đã trả</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reqTotalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.85rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>
                    Hiển thị {(safeReqPage - 1) * REQ_PAGE_SIZE + 1}–{Math.min(safeReqPage * REQ_PAGE_SIZE, sortedFilteredRequests.length)} / {sortedFilteredRequests.length} đơn
                  </span>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <button
                      type="button"
                      disabled={safeReqPage <= 1}
                      onClick={() => setReqPage((p) => Math.max(1, p - 1))}
                      style={{ padding: '0.32rem 0.7rem', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', color: safeReqPage <= 1 ? 'var(--text-subtle)' : 'var(--text-primary)', fontWeight: 700, cursor: safeReqPage <= 1 ? 'not-allowed' : 'pointer' }}
                    >
                      ← Trước
                    </button>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      Trang {safeReqPage} / {reqTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeReqPage >= reqTotalPages}
                      onClick={() => setReqPage((p) => Math.min(reqTotalPages, p + 1))}
                      style={{ padding: '0.32rem 0.7rem', borderRadius: 7, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)', color: safeReqPage >= reqTotalPages ? 'var(--text-subtle)' : 'var(--text-primary)', fontWeight: 700, cursor: safeReqPage >= reqTotalPages ? 'not-allowed' : 'pointer' }}
                    >
                      Sau →
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Đơn vị bị cấm mượn */}
            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--tint-red-border)', borderRadius: 16, padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.02rem', fontWeight: 800, color: 'var(--status-red-text)' }}>
                Đơn vị đang bị Cấm Mượn ({activeBans.length})
              </h2>
              {activeBans.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Hiện không có đơn vị nào bị cấm mượn dụng cụ.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {activeBans.map((b) => (
                    <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.75rem 0.9rem', borderRadius: 10, background: 'var(--tint-red-bg)', border: '1px solid var(--tint-red-border)' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: 'var(--status-red-text)' }}>{b.unit_name} (Cấm đến {fmtDateVN(b.banned_until)})</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--status-red-text)' }}>{b.reason}</div>
                      </div>
                      <button type="button" onClick={() => handleUnban(b.id)} style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid var(--tint-green-border)', background: 'var(--bg-surface)', color: 'var(--status-green-text)', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                        Gỡ cấm mượn
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Danh mục kho vật phẩm */}
            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.02rem', fontWeight: 800 }}>Danh mục Vật phẩm kho VPĐ ({items.length})</h2>
              <form onSubmit={handleAddItem} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', alignItems: 'end', marginBottom: '0.9rem', padding: '0.8rem', background: 'var(--bg-subtle)', borderRadius: 10 }}>
                <input type="text" required value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Tên vật phẩm *" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                <input type="text" value={newItemCat} onChange={(e) => setNewItemCat(e.target.value)} placeholder="Nhóm" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                <input type="number" min={1} value={newItemQty} onChange={(e) => setNewItemQty(Number(e.target.value) || 1)} placeholder="Số lượng" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                <input type="text" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} placeholder="Đơn vị (Cái/Bộ)" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-surface)' }} />
                <button type="submit" style={{ height: 36, borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}>Thêm vật phẩm</button>
              </form>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.65rem' }}>
                {items.map((it) => (
                  <div key={it.id} style={{ border: '1px solid var(--border-color)', borderRadius: 10, padding: '0.7rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>{it.name}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                        {it.category} • Còn {it.available_qty}/{it.total_qty} {it.unit}
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDeleteItem(it.id)} title="Ẩn vật phẩm" style={{ border: 'none', background: 'var(--tint-red-bg)', color: 'var(--status-red-text)', width: 28, height: 28, borderRadius: 7, cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 5: Sự kiện hỗ trợ nhanh (Không mượn phòng • Không qua CTSV) */}
        {activeTab === 'support_events' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <SupportEventCreator onCreated={() => loadSupportEvents()} />

            <section style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: 16, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Danh sách Sự kiện hỗ trợ đã tạo ({supportEvents.length})
                </h2>
                <button
                  type="button"
                  onClick={loadSupportEvents}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '0.4rem 0.75rem',
                    borderRadius: 8,
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-surface)',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  <RefreshIcon size={14} /> Làm mới
                </button>
              </div>

              {loadingSupportEvents && supportEvents.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Đang tải danh sách sự kiện hỗ trợ...</div>
              ) : supportEvents.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', padding: '1rem', background: 'var(--bg-subtle)', borderRadius: 10 }}>
                  Chưa có sự kiện hỗ trợ nào được tạo. Hãy điền biểu mẫu phía trên để mở nhanh sự kiện không mượn phòng &amp; miễn duyệt CTSV.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.8rem' }}>
                  {supportEvents.map((ev) => {
                    const isClosed = ev.status === 'closed' || ev.is_past_deadline;
                    return (
                      <div
                        key={ev.event_id}
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: 12,
                          padding: '0.9rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.65rem',
                          background: 'var(--bg-surface)',
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: 999,
                                background: isClosed ? 'var(--bg-muted)' : 'var(--tint-green-strong)',
                                color: isClosed ? 'var(--text-secondary)' : 'var(--status-green-text)',
                              }}
                            >
                              {isClosed ? 'Đã kết thúc' : 'Đang mở'}
                            </span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                              {ev.semester || 'Chưa xếp kỳ'}
                            </span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '0.94rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                            {ev.event_name}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>Ngày: <strong>{fmtDateVN(ev.event_date)}</strong> ({String(ev.start_time || '').slice(0, 5)} – {String(ev.end_time || '').slice(0, 5)})</span>
                            <span>Đơn vị: {ev.organization_unit || 'Văn phòng Đoàn Học Viện'}</span>
                            <span>
                              Chỉ tiêu: <strong>{ev.max_participants || 0} SV</strong> • <strong>{ev.max_volunteers || 0} CTV</strong> • Không mượn phòng
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <Link
                            href={`/admin/events/${ev.event_id}`}
                            style={{
                              flex: 1,
                              textAlign: 'center',
                              padding: '0.45rem 0.7rem',
                              borderRadius: 8,
                              background: '#1d4ed8',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              textDecoration: 'none',
                            }}
                          >
                            Quản lý &amp; QR ➔
                          </Link>
                          <Link
                            href={`/events/${ev.event_id}/register`}
                            style={{
                              padding: '0.45rem 0.7rem',
                              borderRadius: 8,
                              border: '1px solid var(--border-strong)',
                              background: 'var(--bg-subtle)',
                              color: 'var(--text-body)',
                              fontWeight: 700,
                              fontSize: '0.78rem',
                              textDecoration: 'none',
                            }}
                          >
                            Trang ĐK
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
