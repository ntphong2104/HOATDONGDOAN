'use client';

import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Header from '@/components/Header';
import DutyMatrixTable from '@/components/DutyMatrixTable';
import { useToast } from '@/components/ToastProvider';
import {
  CalendarIcon,
  UsersIcon,
  SettingsIcon,
  BuildingIcon,
  DownloadIcon,
  TrashIcon,
  AlertTriangleIcon,
  RefreshIcon,
} from '@/components/icons';

type AdminTab = 'schedule' | 'volunteers' | 'windows_network' | 'equipment';

function fmtDateVN(d?: string | null): string {
  if (!d) return '—';
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
  const [newItemName, setNewItemName] = useState('');
  const [newItemCat, setNewItemCat] = useState('Dụng cụ sự kiện');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState('Cái');

  const showMsg = useCallback((type: 'success' | 'error', text: string) => {
    if (type === 'success') toast.success(text);
    else toast.error(text);
  }, [toast]);

  const loadSchedule = useCallback(async (anchor?: string) => {
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
    const aJson = await aRes.json();
    if (aJson.success && Array.isArray(aJson.data)) setAttendanceList(aJson.data);
  }, []);

  const loadVolunteers = useCallback(async () => {
    const res = await fetch('/api/office/duty/volunteers', { cache: 'no-store' });
    if (res.status === 403) return setForbidden(true);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) setVolunteers(json.data);
  }, []);

  const loadWindowsAndConfig = useCallback(async () => {
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
  }, []);

  const loadEquipment = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadSchedule();
    loadVolunteers();
    loadWindowsAndConfig();
    loadEquipment();
  }, [loadSchedule, loadVolunteers, loadWindowsAndConfig, loadEquipment]);

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
    } finally {
      setSavingVol(false);
    }
  };

  const handleDeleteVolunteer = async (mssv: string) => {
    if (!window.confirm(`Xóa ${mssv} khỏi danh sách CTV trực?`)) return;
    const res = await fetch(`/api/office/duty/volunteers?mssv=${encodeURIComponent(mssv)}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showMsg('success', json.message);
      loadVolunteers();
    } else showMsg('error', json.error || 'Lỗi xóa');
  };

  const handleCreateWindow = async (e: React.FormEvent) => {
    e.preventDefault();
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
  };

  const handleToggleWindow = async (w: any) => {
    const res = await fetch('/api/office/duty/windows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, is_active: !w.is_active }),
    });
    const json = await res.json();
    if (json.success) loadWindowsAndConfig();
  };

  const handleDeleteWindow = async (id: string) => {
    if (!window.confirm('Xóa đợt đăng ký này?')) return;
    const res = await fetch(`/api/office/duty/windows?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) loadWindowsAndConfig();
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
    const res = await fetch('/api/office/equipment/requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    });
    const json = await res.json();
    if (json.success) {
      showMsg('success', json.message);
      loadEquipment();
    } else showMsg('error', json.error || 'Lỗi xử lý đơn');
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
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
  };

  const handleDeleteItem = async (id: string) => {
    if (!window.confirm('Ẩn vật phẩm này khỏi danh mục kho VPĐ?')) return;
    const res = await fetch(`/api/office/equipment/items?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) loadEquipment();
  };

  const handleUnban = async (id: string) => {
    if (!window.confirm('Gỡ lệnh cấm mượn dụng cụ cho đơn vị này?')) return;
    const res = await fetch(`/api/office/equipment/bans?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showMsg('success', json.message);
      loadEquipment();
    }
  };

  const handleExportAttendance = () => {
    const rows = attendanceList.map((a, idx) => ({
      STT: idx + 1,
      'Ngày trực': fmtDateVN(a.duty_date),
      Ca: a.shift === 'morning' ? 'Ca Sáng' : 'Ca Chiều',
      MSSV: a.mssv,
      'Họ tên': a.full_name || a.mssv,
      'Giờ Check-in': fmtDateTimeVN(a.check_in_at),
      'IP Check-in': a.check_in_ip || '',
      'Đi trễ (phút)': a.late_minutes || 0,
      'Giờ Check-out': fmtDateTimeVN(a.check_out_at),
      'IP Check-out': a.check_out_ip || '',
      'Tổng phút trực': a.worked_minutes || 0,
      'Trạng thái': a.status === 'completed' ? 'Hoàn thành' : 'Chưa check-out',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'ChamCong_VPD');
    XLSX.writeFile(wb, `ChamCong_TrucVanPhongDoan_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  if (forbidden) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Header title="QUẢN TRỊ VĂN PHÒNG ĐOÀN" />
        <main style={{ maxWidth: 720, margin: '3rem auto', padding: '0 1.25rem' }}>
          <div style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 16, padding: '2rem', textAlign: 'center' }}>
            <AlertTriangleIcon size={36} color="#dc2626" />
            <h2 style={{ marginTop: '0.75rem' }}>Không có quyền truy cập</h2>
            <p style={{ color: '#64748b' }}>
              Trang này chỉ dành cho tài khoản <strong>Admin Văn phòng Đoàn</strong> hoặc <strong>Super Admin</strong>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const activeBans = bans.filter((b) => b.is_active && new Date(b.banned_until).getTime() > Date.now());

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header title="QUẢN TRỊ VĂN PHÒNG ĐOÀN" />
      <main style={{ maxWidth: 1220, margin: '0 auto', padding: '1.5rem 1.25rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
        {/* Hero */}
        <section
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 65%, #0369a1 100%)',
            borderRadius: 18,
            padding: '1.35rem 1.6rem',
            color: '#fff',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.73rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fde047' }}>
              Bàn làm việc Admin Văn phòng Đoàn
            </div>
            <h1 style={{ margin: '0.2rem 0', fontSize: '1.45rem', fontWeight: 800 }}>
              Quản Lý Trực Văn Phòng &amp; Mượn Dụng Cụ
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#dbeafe' }}>
              Quản lý danh sách CTV trực, mở đợt đăng ký, kiểm soát chấm công qua WiFi VPĐ, duyệt mượn và tự động cấm mượn khi trả trễ.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 10, padding: '0.55rem 0.9rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{volunteers.length}</div>
              <div style={{ fontSize: '0.72rem', color: '#dbeafe' }}>CTV trực</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.14)', borderRadius: 10, padding: '0.55rem 0.9rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{requests.filter((r) => r.status === 'pending' || r.status === 'borrowed').length}</div>
              <div style={{ fontSize: '0.72rem', color: '#dbeafe' }}>Đơn đang xử lý</div>
            </div>
            <div style={{ background: activeBans.length > 0 ? 'rgba(220,38,38,0.45)' : 'rgba(255,255,255,0.14)', borderRadius: 10, padding: '0.55rem 0.9rem', textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>{activeBans.length}</div>
              <div style={{ fontSize: '0.72rem', color: '#dbeafe' }}>Đơn vị bị cấm</div>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {[
            { id: 'schedule' as AdminTab, label: 'Lịch trực & Chấm công', icon: <CalendarIcon size={15} /> },
            { id: 'volunteers' as AdminTab, label: `Danh sách CTV trực (${volunteers.length})`, icon: <UsersIcon size={15} /> },
            { id: 'windows_network' as AdminTab, label: 'Đợt đăng ký & Mạng VPĐ', icon: <SettingsIcon size={15} /> },
            { id: 'equipment' as AdminTab, label: `Mượn dụng cụ & Cấm mượn (${requests.length})`, icon: <BuildingIcon size={15} /> },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.55rem 1rem',
                borderRadius: 10,
                border: activeTab === t.id ? '1px solid #1d4ed8' : '1px solid #e2e8f0',
                background: activeTab === t.id ? '#1d4ed8' : '#fff',
                color: activeTab === t.id ? '#fff' : '#334155',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* TAB 1: Lịch trực & Chấm công */}
        {activeTab === 'schedule' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.2rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>
                  Lịch trực tuần ({scheduleData?.workdays?.[0] ? `${fmtDateVN(scheduleData.workdays[0])} – ${fmtDateVN(scheduleData.workdays[4])}` : '...'})
                </h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={() => { const n = addDays(weekAnchor || scheduleData?.workdays?.[0], -7); setWeekAnchor(n); loadSchedule(n); }} style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>← Tuần trước</button>
                  <button type="button" onClick={() => { setWeekAnchor(''); loadSchedule(); }} style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Tuần này</button>
                  <button type="button" onClick={() => { const n = addDays(weekAnchor || scheduleData?.workdays?.[0], 7); setWeekAnchor(n); loadSchedule(n); }} style={{ padding: '0.38rem 0.7rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>Tuần sau →</button>
                </div>
              </div>

              <p style={{ margin: '0 0 0.85rem', fontSize: '0.82rem', color: '#64748b' }}>
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
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Nhật ký Chấm công CTV ({attendanceList.length})</h2>
                <button type="button" onClick={handleExportAttendance} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                  <DownloadIcon size={15} /> Xuất Excel chấm công
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
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
                      <tr><td colSpan={6} style={{ padding: '1.2rem', textAlign: 'center', color: '#64748b' }}>Chưa có lượt chấm công nào.</td></tr>
                    ) : attendanceList.map((a) => (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700 }}>{fmtDateVN(a.duty_date)}</td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>{a.shift === 'morning' ? 'Sáng' : 'Chiều'}</td>
                        <td style={{ padding: '0.65rem 0.8rem' }}><strong>{a.full_name}</strong> <span style={{ color: '#64748b', fontFamily: 'monospace' }}>({a.mssv})</span></td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          {fmtDateTimeVN(a.check_in_at)}
                          {a.late_minutes > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}> (trễ {a.late_minutes}p)</span>}
                          <div style={{ fontSize: '0.73rem', color: '#64748b', fontFamily: 'monospace' }}>{a.check_in_ip || ''}</div>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>
                          {fmtDateTimeVN(a.check_out_at)}
                          <div style={{ fontSize: '0.73rem', color: '#64748b', fontFamily: 'monospace' }}>{a.check_out_ip || ''}</div>
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
          <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Nạp Danh sách CTV Trực Văn phòng</h2>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: '#64748b' }}>
                Chỉ các MSSV nằm trong danh sách này mới nhìn thấy mục <strong>Trực văn phòng</strong> trên menu và được đăng ký lịch trực. Bạn có thể nhập 1 MSSV hoặc dán cả cột MSSV từ Excel / Google Sheet.
              </p>
            </div>

            <form onSubmit={handleAddVolunteers} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <textarea
                rows={4}
                value={bulkMssvInput}
                onChange={(e) => setBulkMssvInput(e.target.value)}
                placeholder={'Dán 1 hoặc nhiều MSSV cách nhau bằng dấu phẩy hoặc xuống dòng:\nN22DCCN158\nN23DCAT012\nN24DCVT045'}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '0.85rem' }}
                required
              />
              <div>
                <button type="submit" disabled={savingVol} style={{ padding: '0.55rem 1.2rem', borderRadius: 9, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  {savingVol ? 'Đang nạp...' : 'Thêm vào danh sách CTV trực'}
                </button>
              </div>
            </form>

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>MSSV</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Họ tên</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Lớp</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Email</th>
                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {volunteers.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: '1.2rem', textAlign: 'center', color: '#64748b' }}>Chưa có CTV trực nào.</td></tr>
                  ) : volunteers.map((v) => (
                    <tr key={v.mssv} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 0.85rem', fontFamily: 'monospace', fontWeight: 700, color: '#0369a1' }}>{v.mssv}</td>
                      <td style={{ padding: '0.65rem 0.85rem', fontWeight: 700 }}>{v.full_name}</td>
                      <td style={{ padding: '0.65rem 0.85rem' }}>{v.class_id}</td>
                      <td style={{ padding: '0.65rem 0.85rem', color: '#64748b' }}>{v.email}</td>
                      <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>
                        <button type="button" onClick={() => handleDeleteVolunteer(v.mssv)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
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
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.9rem', fontSize: '1.05rem', fontWeight: 800 }}>Mở Đợt Đăng Ký Lịch Trực</h2>
              <form onSubmit={handleCreateWindow} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'end', marginBottom: '1rem', padding: '0.9rem', background: '#f8fafc', borderRadius: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Tên đợt *</label>
                  <input type="text" required value={winTitle} onChange={(e) => setWinTitle(e.target.value)} placeholder="VD: Trực tuần 12 (23/11 – 27/11)" style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Áp dụng từ ngày *</label>
                  <input type="date" required value={winFrom} onChange={(e) => setWinFrom(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Áp dụng đến ngày *</label>
                  <input type="date" required value={winTo} onChange={(e) => setWinTo(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Mở đăng ký lúc *</label>
                  <input type="datetime-local" required value={winOpen} onChange={(e) => setWinOpen(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.6rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Đóng đăng ký lúc *</label>
                  <input type="datetime-local" required value={winClose} onChange={(e) => setWinClose(e.target.value)} style={{ width: '100%', height: 36, padding: '0 0.6rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                </div>
                <button type="submit" style={{ height: 36, borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>Mở đợt đăng ký</button>
              </form>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Tên đợt</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Ngày trực áp dụng</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Khung giờ mở đăng ký</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {windows.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>Chưa có đợt đăng ký nào.</td></tr>
                    ) : windows.map((w) => (
                      <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.65rem 0.8rem', fontWeight: 700 }}>{w.title}</td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>{fmtDateVN(w.apply_from)} → {fmtDateVN(w.apply_to)}</td>
                        <td style={{ padding: '0.65rem 0.8rem' }}>{fmtDateTimeVN(w.open_at)} → {fmtDateTimeVN(w.close_at)}</td>
                        <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>
                          <button type="button" onClick={() => handleToggleWindow(w)} style={{ padding: '3px 9px', borderRadius: 999, border: 'none', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', background: w.is_active ? '#dcfce7' : '#f1f5f9', color: w.is_active ? '#15803d' : '#64748b' }}>
                            {w.is_active ? 'Đang bật' : 'Đã tắt'}
                          </button>
                        </td>
                        <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>
                          <button type="button" onClick={() => handleDeleteWindow(w.id)} style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>Xóa</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Cấu hình Mạng WiFi VPĐ & Giờ ca */}
            {config && (
              <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem' }}>
                <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.05rem', fontWeight: 800 }}>Cấu hình Mạng WiFi VPĐ &amp; Khung giờ Check-in/out</h2>
                <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', alignItems: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.86rem', fontWeight: 700, cursor: 'pointer' }}>
                      <input type="checkbox" checked={config.require_ip_check} onChange={(e) => setConfig({ ...config, require_ip_check: e.target.checked })} />
                      Bắt buộc kết nối đúng IP mạng WiFi Văn phòng Đoàn khi Check-in / Check-out
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#475569', cursor: 'pointer' }}>
                      <input type="checkbox" checked={config.allow_localhost} onChange={(e) => setConfig({ ...config, allow_localhost: e.target.checked })} />
                      Cho phép localhost (khi test máy cá nhân)
                    </label>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475569' }}>
                        Danh sách IP mạng WiFi VPĐ được phép (mỗi dòng 1 IP, hỗ trợ tiền tố dạng 113.161.72.*)
                      </label>
                      {clientIp && (
                        <button
                          type="button"
                          onClick={() => {
                            const cur = ipsText.split('\n').map((s) => s.trim()).filter(Boolean);
                            if (!cur.includes(clientIp)) setIpsText([...cur, clientIp].join('\n'));
                          }}
                          style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          + Thêm IP mạng hiện tại ({clientIp})
                        </button>
                      )}
                    </div>
                    <textarea rows={3} value={ipsText} onChange={(e) => setIpsText(e.target.value)} placeholder="VD: 113.161.72.10" style={{ width: '100%', padding: '0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: '0.84rem' }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Tối đa người / ca</label>
                      <input type="number" min={1} max={10} value={config.max_per_shift} onChange={(e) => setConfig({ ...config, max_per_shift: Number(e.target.value) || 2 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Check-in sớm (phút)</label>
                      <input type="number" min={0} max={120} value={config.early_checkin_minutes} onChange={(e) => setConfig({ ...config, early_checkin_minutes: Number(e.target.value) || 0 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Check-out trễ (phút)</label>
                      <input type="number" min={0} max={120} value={config.late_checkout_minutes} onChange={(e) => setConfig({ ...config, late_checkout_minutes: Number(e.target.value) || 0 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>Số ngày cấm mượn khi trễ</label>
                      <input type="number" min={1} max={365} value={config.ban_days_on_late_return} onChange={(e) => setConfig({ ...config, ban_days_on_late_return: Number(e.target.value) || 30 })} style={{ width: '100%', height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1' }} />
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
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Đơn mượn dụng cụ từ LCĐ / CLB ({requests.length})</h2>
                <button type="button" onClick={loadEquipment} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.38rem 0.75rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                  <RefreshIcon size={14} /> Làm mới
                </button>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Đơn vị &amp; Mục đích</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Vật phẩm</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'left' }}>Hạn trả</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ padding: '0.65rem 0.8rem', textAlign: 'right' }}>Xử lý</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: '1.2rem', textAlign: 'center', color: '#64748b' }}>Chưa có đơn mượn nào.</td></tr>
                    ) : requests.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: r.current_overdue_days > 0 && r.status === 'borrowed' ? '#fef2f2' : undefined }}>
                        <td style={{ padding: '0.68rem 0.8rem' }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{r.unit_name}</div>
                          <div style={{ fontSize: '0.8rem', color: '#334155' }}>{r.purpose}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{r.requester_name} • {r.requester_phone || r.requester_email}</div>
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem' }}>
                          {(r.items || []).map((it: any, i: number) => (
                            <div key={i}>• {it.item_name} <strong>(x{it.quantity})</strong></div>
                          ))}
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem', whiteSpace: 'nowrap' }}>
                          <div>{fmtDateVN(r.borrow_date)} → <strong>{fmtDateVN(r.due_date)}</strong></div>
                          {r.current_overdue_days > 0 && r.status === 'borrowed' && (
                            <div style={{ color: '#dc2626', fontWeight: 800, fontSize: '0.75rem' }}>⚠ Trễ {r.current_overdue_days} ngày!</div>
                          )}
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem', textAlign: 'center', fontWeight: 700 }}>
                          {r.status === 'pending' && <span style={{ color: '#b45309' }}>Chờ duyệt</span>}
                          {r.status === 'approved' && <span style={{ color: '#1d4ed8' }}>Đã duyệt</span>}
                          {r.status === 'borrowed' && <span style={{ color: '#6d28d9' }}>Đang mượn</span>}
                          {r.status === 'returned' && <span style={{ color: '#15803d' }}>Đã trả {r.late_days > 0 ? `(trễ ${r.late_days}d)` : ''}</span>}
                          {r.status === 'rejected' && <span style={{ color: '#dc2626' }}>Từ chối</span>}
                        </td>
                        <td style={{ padding: '0.68rem 0.8rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', gap: 5 }}>
                            {r.status === 'pending' && (
                              <>
                                <button type="button" onClick={() => handleRequestAction(r.id, 'approve')} style={{ padding: '4px 9px', borderRadius: 7, border: 'none', background: '#1d4ed8', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Duyệt</button>
                                <button type="button" onClick={() => handleRequestAction(r.id, 'reject')} style={{ padding: '4px 9px', borderRadius: 7, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>Từ chối</button>
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
            </section>

            {/* Đơn vị bị cấm mượn */}
            <section style={{ background: '#fff', border: '1px solid #fecaca', borderRadius: 16, padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.02rem', fontWeight: 800, color: '#991b1b' }}>
                Đơn vị đang bị Cấm Mượn ({activeBans.length})
              </h2>
              {activeBans.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>Hiện không có đơn vị nào bị cấm mượn dụng cụ.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {activeBans.map((b) => (
                    <div key={b.id} style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '0.75rem 0.9rem', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#991b1b' }}>{b.unit_name} (Cấm đến {fmtDateVN(b.banned_until)})</div>
                        <div style={{ fontSize: '0.8rem', color: '#7f1d1d' }}>{b.reason}</div>
                      </div>
                      <button type="button" onClick={() => handleUnban(b.id)} style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#fff', color: '#15803d', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                        Gỡ cấm mượn
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Danh mục kho vật phẩm */}
            <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '1.25rem' }}>
              <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.02rem', fontWeight: 800 }}>Danh mục Vật phẩm kho VPĐ ({items.length})</h2>
              <form onSubmit={handleAddItem} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', alignItems: 'end', marginBottom: '0.9rem', padding: '0.8rem', background: '#f8fafc', borderRadius: 10 }}>
                <input type="text" required value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder="Tên vật phẩm *" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                <input type="text" value={newItemCat} onChange={(e) => setNewItemCat(e.target.value)} placeholder="Nhóm" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                <input type="number" min={1} value={newItemQty} onChange={(e) => setNewItemQty(Number(e.target.value) || 1)} placeholder="Số lượng" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                <input type="text" value={newItemUnit} onChange={(e) => setNewItemUnit(e.target.value)} placeholder="Đơn vị (Cái/Bộ)" style={{ height: 36, padding: '0 0.65rem', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff' }} />
                <button type="submit" style={{ height: 36, borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}>Thêm vật phẩm</button>
              </form>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.65rem' }}>
                {items.map((it) => (
                  <div key={it.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.7rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem' }}>{it.name}</div>
                      <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                        {it.category} • Còn {it.available_qty}/{it.total_qty} {it.unit}
                      </div>
                    </div>
                    <button type="button" onClick={() => handleDeleteItem(it.id)} title="Ẩn vật phẩm" style={{ border: 'none', background: '#fef2f2', color: '#dc2626', width: 28, height: 28, borderRadius: 7, cursor: 'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
