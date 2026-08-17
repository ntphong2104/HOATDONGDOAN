'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/components/Header';
import DualLogos from '@/components/DualLogos';
import StatCard from '@/components/StatCard';
import FileUploadZone from '@/components/FileUploadZone';
import ExcelExportButton from '@/components/ExcelExportButton';
import MaintenanceToggle from '@/components/MaintenanceToggle';
import DataTable from '@/components/DataTable';
import {
  UsersIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  SettingsIcon,
  ShieldCheckIcon,
  BuildingIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  CloseIcon,
  MenuIcon,
  SidebarIcon,
  TrashIcon,
} from '@/components/icons';
import { OFFICIAL_UNITS } from '@/lib/constants/units';
import { getStageLabel } from '@/lib/utils/proposal-logic';
import { isSameUnit } from '@/lib/utils/rating-logic';
import { getEffectiveEventStatus, isEventPastDeadline } from '@/lib/utils/event-logic';
import type { Event, User, EventProposal, Room, UserPenalty } from '@/lib/types';
import styles from './page.module.css';

type SuperAdminTab = 'events' | 'proposals' | 'officers' | 'rooms' | 'units' | 'students' | 'delegates' | 'blacklist' | 'settings';

function SuperAdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as SuperAdminTab | null;

  const [activeTab, setActiveTab] = useState<SuperAdminTab>(tabParam || 'events');
  const [selectedUnitFilter, setSelectedUnitFilter] = useState<string | null>(null);
  const [isUnitsMenuOpen, setIsUnitsMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const switchTab = (tab: SuperAdminTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('superadmin_active_tab', tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
  };

  const [stats, setStats] = useState({ events: 0, checkins: 0, students: 0 });
  const [events, setEvents] = useState<Event[]>([]);
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [officers, setOfficers] = useState<any[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [penalties, setPenalties] = useState<UserPenalty[]>([]);
  const [delegates, setDelegates] = useState<any[]>([]);

  // Loading states for smooth initial render without flashing defaults
  const [statsLoading, setStatsLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [officersLoading, setOfficersLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [penaltiesLoading, setPenaltiesLoading] = useState(true);
  const [delegatesLoading, setDelegatesLoading] = useState(true);
  const [proposalStatusFilter, setProposalStatusFilter] = useState<'all' | 'pending' | 'active' | 'closed'>('all');
  const [eventStatusFilter, setEventStatusFilter] = useState<'all' | 'pending' | 'active' | 'closed'>('all');

  // Form states for Officer Role Management
  const [officerEmail, setOfficerEmail] = useState('');
  const [officerFullName, setOfficerFullName] = useState('');
  const [officerRoleTier, setOfficerRoleTier] = useState<UserTier>('youth_union');
  const [officerUnitCode, setOfficerUnitCode] = useState('BCH_DOAN');
  const [officerNotes, setOfficerNotes] = useState('');
  const [grantingOfficer, setGrantingOfficer] = useState(false);
  const [officerFilter, setOfficerFilter] = useState<string>('all');

  // Form states for Room creation
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState(100);
  const [newRoomLocation, setNewRoomLocation] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Form states for Blacklist Manual Ban
  const [banMssv, setBanMssv] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);

  // Form states for Class Delegates Grant
  const [grantMssv, setGrantMssv] = useState('');
  const [grantNotes, setGrantNotes] = useState('');
  const [granting, setGranting] = useState(false);

  // Modal for assigning event admin / checker
  const [assignModalEvent, setAssignModalEvent] = useState<Event | null>(null);
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>('LCD_CNTT');
  const [customEmail, setCustomEmail] = useState<string>('lcdcntt@student.ptithcm.edu.vn');
  const [selectedRoleType, setSelectedRoleType] = useState<'event_admin' | 'checker'>('event_admin');
  const [submittingRole, setSubmittingRole] = useState(false);

  // Student activity history lookup modal
  const [selectedStudentMssv, setSelectedStudentMssv] = useState<string | null>(null);
  const [studentHistoryData, setStudentHistoryData] = useState<any | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (tabParam) {
      setActiveTab(tabParam);
      try {
        localStorage.setItem('superadmin_active_tab', tabParam);
      } catch {}
    } else if (typeof window !== 'undefined') {
      try {
        const savedTab = localStorage.getItem('superadmin_active_tab') as SuperAdminTab | null;
        if (
          savedTab &&
          ['events', 'proposals', 'officers', 'rooms', 'units', 'students', 'delegates', 'blacklist', 'settings'].includes(
            savedTab
          )
        ) {
          setActiveTab(savedTab);
          const url = new URL(window.location.href);
          url.searchParams.set('tab', savedTab);
          window.history.replaceState(null, '', url.toString());
        }
      } catch {}
    }
  }, [tabParam]);

  useEffect(() => {
    const verifySuperAdmin = async () => {
      try {
        const res = await fetch('/api/me');
        if (!res.ok) {
          window.location.replace('/login');
          return;
        }
        const data = await res.json();
        if (!data.success || (data.data?.tier !== 'super_admin' && !data.data?.isSuperAdmin)) {
          window.location.replace('/');
          return;
        }
      } catch {
        window.location.replace('/login');
      }
    };

    verifySuperAdmin();

    const handlePageShow = () => {
      verifySuperAdmin();
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  useEffect(() => {
    // Primary critical data (load first for instant UI response)
    Promise.all([fetchStats(), fetchEvents(), fetchProposals()]).catch((e) => console.error(e));
    // Secondary data
    Promise.all([
      fetchStudents(),
      fetchOfficers(),
      fetchRooms(),
      fetchPenalties(),
      fetchDelegates(),
    ]).catch((e) => console.error(e));
  }, []);

  const fetchOfficers = async () => {
    try {
      const res = await fetch('/api/admin/officers');
      const data = await res.json();
      if (data.success) {
        setOfficers(data.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOfficersLoading(false);
    }
  };

  const grantOfficerRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!officerEmail || grantingOfficer) return;
    setGrantingOfficer(true);
    try {
      let unitName = 'Đoàn TNCS Học Viện Cơ Sở TP.HCM';
      if (officerRoleTier === 'super_admin') unitName = 'Ban Quản Trị Toàn Trường';
      else if (officerRoleTier === 'ctsv') unitName = 'Phòng Công Tác Sinh Viên (CTSV)';
      else if (officerRoleTier === 'facility') unitName = 'Phòng Quản Trị CSVC & Tổ Chức';
      else if (officerRoleTier === 'event_admin') {
        const foundUnit = OFFICIAL_UNITS.find((u) => u.code === officerUnitCode);
        unitName = foundUnit?.name || officerUnitCode;
      }

      const res = await fetch('/api/admin/officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: officerEmail,
          full_name: officerFullName,
          role_tier: officerRoleTier,
          unit_code: officerRoleTier === 'event_admin' ? officerUnitCode : 'BCH_DOAN',
          unit_name: unitName,
          notes: officerNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setOfficerEmail('');
        setOfficerFullName('');
        setOfficerNotes('');
        fetchOfficers();
      } else {
        alert(data.error || 'Lỗi phân quyền cán bộ');
      }
    } catch (e) {
      alert('Lỗi kết nối máy chủ');
    } finally {
      setGrantingOfficer(false);
    }
  };

  const revokeOfficerRole = async (officer: any) => {
    if (officer.isRootAdmin || officer.email.toLowerCase() === 'n22dccn158@student.ptithcm.edu.vn') {
      alert('BẢO VỆ BẤT BIẾN: Không thể thu hồi quyền của Super Admin Gốc của hệ thống!');
      return;
    }

    const officerDisplayName = officer.full_name || officer.email;
    const roleLabel =
      officer.role_tier === 'super_admin'
        ? 'Super Admin'
        : officer.role_tier === 'youth_union'
        ? 'Đoàn Học Viện'
        : officer.role_tier === 'ctsv'
        ? 'Phòng CTSV'
        : officer.role_tier === 'facility'
        ? 'Phòng CSVC'
        : 'Admin Đơn vị LCĐ';

    if (!confirm(`Xác nhận THU HỒI QUYỀN "${roleLabel}" của cán bộ ${officerDisplayName} (${officer.email})?`)) {
      return;
    }

    // Optimistic UI removal
    setOfficers((prev) =>
      prev.filter(
        (o) =>
          !(
            o.email.toLowerCase() === officer.email.toLowerCase() &&
            (officer.role_tier ? o.role_tier === officer.role_tier : true)
          )
      )
    );

    try {
      const res = await fetch(
        `/api/admin/officers?email=${encodeURIComponent(officer.email)}&role_tier=${encodeURIComponent(
          officer.role_tier
        )}&id=${encodeURIComponent(officer.id || '')}`,
        { method: 'DELETE' }
      );
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchOfficers();
      } else {
        alert(data.error || 'Lỗi thu hồi quyền');
        fetchOfficers();
      }
    } catch (e) {
      alert('Lỗi kết nối máy chủ');
      fetchOfficers();
    }
  };

  const filteredEvents = React.useMemo(() => {
    if (!selectedUnitFilter) return events;
    return events.filter((ev) => {
      return (
        isSameUnit(ev.created_by, selectedUnitFilter) ||
        (ev.event_name || '').toLowerCase().includes(selectedUnitFilter.toLowerCase())
      );
    });
  }, [events, selectedUnitFilter]);

  const pendingProposals = React.useMemo(() => {
    let list = proposals.filter((p) => p.status === 'pending');
    if (selectedUnitFilter) {
      list = list.filter((p) => isSameUnit(p.organization_unit, selectedUnitFilter));
    }
    return list;
  }, [proposals, selectedUnitFilter]);

  const getProposalDisplayStatus = React.useCallback((p: EventProposal) => {
    if (p.status === 'rejected') {
      return {
        type: 'rejected' as const,
        label: '● Đã từ chối',
        badgeBg: '#fef2f2',
        badgeColor: '#b91c1c',
        badgeBorder: '#fecaca',
      };
    }
    if (p.status === 'pending') {
      return {
        type: 'pending' as const,
        label: `⏳ Chờ: ${getStageLabel(p.current_stage)}`,
        badgeBg: '#fffbeb',
        badgeColor: '#b45309',
        badgeBorder: '#fde68a',
      };
    }
    // p.status === 'approved'
    const matchedEvent = events.find((e) => e.event_id === (p as any).event_id || (p.title && e.event_name === p.title));
    const isPast = matchedEvent
      ? isEventPastDeadline(matchedEvent)
      : isEventPastDeadline({ event_date: p.start_date, end_time: p.end_time });

    if (isPast) {
      return {
        type: 'closed' as const,
        label: '● Đã kết thúc',
        badgeBg: '#f8fafc',
        badgeColor: '#64748b',
        badgeBorder: '#e2e8f0',
      };
    }

    return {
      type: 'active' as const,
      label: '● Đang mở điểm danh',
      badgeBg: '#f0fdf4',
      badgeColor: '#15803d',
      badgeBorder: '#bbf7d0',
    };
  }, [events]);

  const filteredProposals = React.useMemo(() => {
    let list = proposals;
    if (selectedUnitFilter) {
      list = list.filter((p) => isSameUnit(p.organization_unit, selectedUnitFilter));
    }

    if (proposalStatusFilter !== 'all') {
      list = list.filter((p) => {
        const displayStatus = getProposalDisplayStatus(p);
        if (proposalStatusFilter === 'pending') return displayStatus.type === 'pending';
        if (proposalStatusFilter === 'active') return displayStatus.type === 'active';
        if (proposalStatusFilter === 'closed') return displayStatus.type === 'closed' || displayStatus.type === 'rejected';
        return true;
      });
    }

    // Sort: Chờ duyệt lên đầu -> Đang mở/sắp tới -> Đã đóng/Từ chối xuống cuối cùng
    return [...list].sort((a, b) => {
      const statusA = getProposalDisplayStatus(a);
      const statusB = getProposalDisplayStatus(b);

      const score = (type: string) => {
        if (type === 'pending') return 1;
        if (type === 'active') return 2;
        if (type === 'closed') return 3;
        return 4; // rejected
      };

      const diff = score(statusA.type) - score(statusB.type);
      if (diff !== 0) return diff;

      // Secondary sort: mới nhất lên trước
      return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime();
    });
  }, [proposals, selectedUnitFilter, proposalStatusFilter, getProposalDisplayStatus]);

  const proposalCounts = React.useMemo(() => {
    const base = selectedUnitFilter
      ? proposals.filter((p) => isSameUnit(p.organization_unit, selectedUnitFilter))
      : proposals;
    let pending = 0;
    let active = 0;
    let closed = 0;

    for (const p of base) {
      const st = getProposalDisplayStatus(p);
      if (st.type === 'pending') pending++;
      else if (st.type === 'active') active++;
      else closed++;
    }

    return { all: base.length, pending, active, closed };
  }, [proposals, selectedUnitFilter, getProposalDisplayStatus]);

  const fetchPenalties = async () => {
    try {
      const res = await fetch('/api/admin/blacklist');
      const data = await res.json();
      if (data.success) {
        setPenalties(data.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setPenaltiesLoading(false);
    }
  };

  const unbanStudent = async (mssv: string) => {
    if (!confirm(`Xác nhận mở khóa và xóa sinh viên ${mssv} khỏi Danh Sách Đen?`)) return;
    try {
      const res = await fetch('/api/admin/blacklist/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchPenalties();
      } else {
        alert(data.error || 'Lỗi mở khóa');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    }
  };

  const manualBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!banMssv) return;
    setBanning(true);
    try {
      const res = await fetch('/api/admin/blacklist/ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv: banMssv, reason: banReason }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setBanMssv('');
        setBanReason('');
        fetchPenalties();
      } else {
        alert(data.error || 'Lỗi thêm vào blacklist');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setBanning(false);
    }
  };

  const fetchStats = async () => {
    try {
      const statsRes = await fetch('/api/admin/stats');
      const statsData = await statsRes.json();
      if (statsData.success) {
        setStats(statsData.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const eventsRes = await fetch('/api/events');
      const eventsData = await eventsRes.json();
      if (eventsData.success) {
        setEvents(Array.isArray(eventsData.data) ? eventsData.data : []);
      }
    } catch (err) {
      console.error('fetchEvents error:', err);
    } finally {
      setEventsLoading(false);
    }
  };

  const fetchProposals = async () => {
    try {
      const res = await fetch('/api/proposals');
      const data = await res.json();
      if (data.success && data.data) {
        setProposals(Array.isArray(data.data) ? data.data : []);
      }
    } catch (err) {
      console.error('fetchProposals error:', err);
    } finally {
      setProposalsLoading(false);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success && data.data) {
        setRooms(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRoomsLoading(false);
    }
  };

  const fetchStudents = async (query?: string) => {
    setStudentsLoading(true);
    try {
      const url = query ? `/api/admin/students?q=${encodeURIComponent(query)}` : '/api/admin/students';
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setStudents(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setStudentsLoading(false);
    }
  };

  const openStudentHistory = async (student: { mssv: string; full_name?: string; class_id?: string; email?: string } | string) => {
    const mssv = typeof student === 'string' ? student : student.mssv;
    const initialUser = typeof student === 'object' ? student : { mssv, full_name: mssv, class_id: '', email: '' };

    setSelectedStudentMssv(mssv);
    setStudentHistoryData({
      user: initialUser,
      total_attended: 0,
      penalty: { missed_count: 0, is_blacklisted: false },
      history: [],
    });
    setHistoryLoading(true);

    try {
      const res = await fetch(`/api/admin/students/history?mssv=${encodeURIComponent(mssv)}`);
      const data = await res.json();
      if (data.success && data.data) {
        setStudentHistoryData(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchDelegates = async () => {
    try {
      const res = await fetch('/api/admin/delegates');
      const data = await res.json();
      if (data.success) {
        setDelegates(data.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDelegatesLoading(false);
    }
  };

  const grantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantMssv || granting) return;
    setGranting(true);
    try {
      const res = await fetch('/api/admin/delegates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv: grantMssv, notes: grantNotes }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setGrantMssv('');
        setGrantNotes('');
        fetchDelegates();
      } else {
        alert(data.error || 'Lỗi cấp quyền');
      }
    } catch (e) {
      alert('Lỗi kết nối máy chủ');
    } finally {
      setGranting(false);
    }
  };

  const revokePermission = async (id: string, name: string) => {
    if (!confirm(`Xác nhận thu hồi quyền Ban cán sự tra cứu ĐRL của ${name}?`)) return;
    try {
      const res = await fetch(`/api/admin/delegates?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchDelegates();
      } else {
        alert(data.error || 'Lỗi thu hồi');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName || creatingRoom) return;
    setCreatingRoom(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: newRoomName,
          capacity: newRoomCapacity,
          location: newRoomLocation,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewRoomName('');
        setNewRoomCapacity(100);
        setNewRoomLocation('');
        fetchRooms();
        alert('Đã thêm phòng mới thành công!');
      } else {
        alert(data.error || 'Lỗi thêm phòng');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingRoom(false);
    }
  };

  const editRoom = async (room: Room) => {
    const newName = prompt('Nhập tên phòng mới:', room.room_name);
    if (!newName || !newName.trim()) return;

    const newCapStr = prompt('Nhập sức chứa (người):', String(room.capacity || 100));
    const newCap = Number(newCapStr) || room.capacity;

    const newLoc = prompt('Nhập vị trí cụ thể:', room.location || '');

    try {
      const res = await fetch(`/api/rooms/${room.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_name: newName.trim(),
          capacity: newCap,
          location: newLoc !== null ? newLoc.trim() : room.location,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã cập nhật thông tin phòng thành công!');
        fetchRooms();
      } else {
        alert(data.error || 'Lỗi cập nhật');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  const deleteRoom = async (id: string, name: string) => {
    if (!confirm(`Bạn có chắc muốn xóa phòng "${name}"?`)) return;
    try {
      const res = await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchRooms();
      } else {
        alert(data.error || 'Lỗi xóa phòng');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const approveProposal = async (id: string) => {
    if (!confirm('Xác nhận phê duyệt giai đoạn này của kế hoạch?')) return;
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã duyệt thành công!');
        fetchProposals();
        fetchEvents();
        fetchStats();
      } else {
        alert(data.error || 'Lỗi duyệt');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  const rejectProposal = async (id: string) => {
    const reason = prompt('Nhập lý do từ chối kế hoạch này:', 'Chưa đạt yêu cầu nội dung/địa điểm');
    if (!reason) return;

    try {
      const res = await fetch(`/api/proposals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã từ chối kế hoạch');
        fetchProposals();
      } else {
        alert(data.error || 'Lỗi từ chối');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  const toggleEventStatus = async (eventId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === 'active' ? 'closed' : 'active';
    try {
      const res = await fetch(`/api/events/${eventId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchEvents();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const assignAdmin = async (eventId: string) => {
    const email = prompt('Nhập email của Admin nhỏ (Event Admin) hoặc CTV:');
    if (!email) return;
    const roleType = confirm('Chọn OK để gán làm Admin Sự Kiện (Event Admin), hoặc Cancel để gán làm CTV Quét Mã (Checker)?') 
      ? 'event_admin' 
      : 'checker';

    try {
      const res = await fetch(`/api/events/${eventId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role_type: roleType }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Gán quyền thành công!');
        fetchEvents();
      } else {
        alert(data.error || 'Không thể gán quyền');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  const removeAdmin = async (eventId: string, roleId: number, email: string) => {
    if (!confirm(`Bạn có chắc muốn thu hồi quyền của ${email}?`)) return;
    try {
      const res = await fetch(`/api/events/${eventId}/roles/${roleId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchEvents();
      } else {
        alert(data.error || 'Lỗi thu hồi quyền');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    }
  };

  const handleDeleteEvent = async (eventId: string, eventName: string) => {
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN sự kiện "${eventName}"?\n\nToàn bộ dữ liệu điểm danh, phân quyền và đánh giá liên quan sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Đã xóa thành công sự kiện "${eventName}"!`);
        fetchEvents();
        fetchStats();
      } else {
        alert(data.message || data.error || 'Không thể xóa sự kiện');
      }
    } catch (err: any) {
      alert(`Đã xảy ra lỗi: ${err.message || 'Lỗi kết nối'}`);
    }
  };

  return (
    <div className={styles.container}>
      <Header
        showBack={false}
        title="BẢNG QUẢN TRỊ TOÀN TRƯỜNG"
        showSidebarToggle={true}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        isSidebarOpen={isSidebarOpen}
      />

      {/* OVERLAY BACKDROP */}
      {isSidebarOpen && (
        <div
          className={styles.drawerBackdrop}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* SLIDE-OUT OFF-CANVAS DRAWER */}
      <aside className={`${styles.drawer} ${isSidebarOpen ? styles.drawerOpen : styles.drawerClosed}`}>
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <DualLogos size="sm" />
            <span className={styles.drawerHeaderTitle}>Menu Quản Trị</span>
          </div>
          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={() => setIsSidebarOpen(false)}
            title="Đóng menu quản trị"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        <nav className={styles.navTabs} aria-label="Khu vực quản trị">
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'events' ? styles.tabActive : ''}`}
            onClick={() => switchTab('events')}
          >
            <div className={styles.tabButtonLeft}>
              <CalendarIcon size={18} />
              <span>Quản lý Sự kiện</span>
            </div>
            <span className={styles.tabBadge}>{events.length}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'proposals' ? styles.tabActive : ''}`}
            onClick={() => switchTab('proposals')}
          >
            <div className={styles.tabButtonLeft}>
              <ShieldCheckIcon size={18} />
              <span>Duyệt Kế Hoạch</span>
            </div>
            <span className={styles.tabBadge}>
              {proposals.filter((p) => p.status === 'pending').length}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'officers' ? styles.tabActive : ''}`}
            onClick={() => switchTab('officers')}
          >
            <div className={styles.tabButtonLeft}>
              <UsersIcon size={18} />
              <span>Cán Bộ & Phân Quyền</span>
            </div>
            <span
              className={styles.tabBadge}
              style={{
                background: officers.length > 0 ? '#dc2626' : undefined,
                color: officers.length > 0 ? '#ffffff' : undefined,
                fontWeight: 800,
              }}
            >
              {officers.length}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'rooms' ? styles.tabActive : ''}`}
            onClick={() => switchTab('rooms')}
          >
            <div className={styles.tabButtonLeft}>
              <SettingsIcon size={18} />
              <span>Địa Điểm & Phòng</span>
            </div>
            <span className={styles.tabBadge}>{rooms.length}</span>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <button
              type="button"
              className={`${styles.tabButton} ${activeTab === 'units' || isUnitsMenuOpen ? styles.tabActive : ''}`}
              onClick={() => {
                setIsUnitsMenuOpen(!isUnitsMenuOpen);
                switchTab('units');
              }}
              style={{ justifyContent: 'space-between' }}
            >
              <div className={styles.tabButtonLeft}>
                <BuildingIcon size={18} />
                <span>Các Đơn Vị Trực Thuộc</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className={styles.tabBadge}>{OFFICIAL_UNITS.length}</span>
                {isUnitsMenuOpen ? <ChevronDownIcon size={16} /> : <ChevronRightIcon size={16} />}
              </div>
            </button>

            {/* Sổ xuống danh sách 24 đơn vị để chọn lọc */}
            {isUnitsMenuOpen && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                  padding: '0.5rem 0.35rem',
                  background: '#f8fafc',
                  border: '1.5px solid #cbd5e1',
                  borderRadius: '14px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.03)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUnitFilter(null);
                    switchTab('events');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.65rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: selectedUnitFilter === null ? '#dbeafe' : 'transparent',
                    color: selectedUnitFilter === null ? '#1e40af' : '#334155',
                    fontWeight: selectedUnitFilter === null ? 800 : 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span>Tất cả đơn vị (Toàn trường)</span>
                  {selectedUnitFilter === null && <span>✓</span>}
                </button>

                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', padding: '0.4rem 0.65rem 0.15rem' }}>
                  Đoàn Thanh Niên Học Viện
                </div>
                {OFFICIAL_UNITS.filter((u) => u.type.includes('Đoàn')).map((unit) => (
                  <button
                    key={unit.code}
                    type="button"
                    onClick={() => {
                      setSelectedUnitFilter(unit.name);
                      switchTab('events');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: selectedUnitFilter === unit.name ? '#2563eb' : 'transparent',
                      color: selectedUnitFilter === unit.name ? '#ffffff' : '#334155',
                      fontWeight: selectedUnitFilter === unit.name ? 800 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {unit.name}
                    </span>
                    {selectedUnitFilter === unit.name && <span>✓</span>}
                  </button>
                ))}

                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', padding: '0.4rem 0.65rem 0.15rem' }}>
                  8 Liên Chi Đoàn Khoa
                </div>
                {OFFICIAL_UNITS.filter((u) => u.type.includes('LCĐ')).map((unit) => (
                  <button
                    key={unit.code}
                    type="button"
                    onClick={() => {
                      setSelectedUnitFilter(unit.name);
                      switchTab('events');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: selectedUnitFilter === unit.name ? '#2563eb' : 'transparent',
                      color: selectedUnitFilter === unit.name ? '#ffffff' : '#334155',
                      fontWeight: selectedUnitFilter === unit.name ? 800 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {unit.name}
                    </span>
                    {selectedUnitFilter === unit.name && <span>✓</span>}
                  </button>
                ))}

                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', padding: '0.5rem 0.65rem 0.15rem' }}>
                  16 CLB / Đội / Nhóm
                </div>
                {OFFICIAL_UNITS.filter((u) => !u.type.includes('LCĐ') && !u.type.includes('Đoàn')).map((unit) => (
                  <button
                    key={unit.code}
                    type="button"
                    onClick={() => {
                      setSelectedUnitFilter(unit.name);
                      switchTab('events');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.65rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: selectedUnitFilter === unit.name ? '#2563eb' : 'transparent',
                      color: selectedUnitFilter === unit.name ? '#ffffff' : '#334155',
                      fontWeight: selectedUnitFilter === unit.name ? 800 : 500,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {unit.name}
                    </span>
                    {selectedUnitFilter === unit.name && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'students' ? styles.tabActive : ''}`}
            onClick={() => switchTab('students')}
          >
            <div className={styles.tabButtonLeft}>
              <UsersIcon size={18} />
              <span>Quản lý Sinh viên</span>
            </div>
            <span className={styles.tabBadge}>{stats.students || students.length}</span>
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'delegates' ? styles.tabActive : ''}`}
            onClick={() => switchTab('delegates')}
          >
            <div className={styles.tabButtonLeft}>
              <CheckCircleIcon size={18} />
              <span>BCH Chi Đoàn (ĐRL)</span>
            </div>
            <span
              className={styles.tabBadge}
              style={{
                background: delegates.filter((d) => d.status === 'active').length > 0 ? '#2563eb' : undefined,
                color: delegates.filter((d) => d.status === 'active').length > 0 ? '#ffffff' : undefined,
              }}
            >
              {delegates.filter((d) => d.status === 'active').length}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'blacklist' ? styles.tabActive : ''}`}
            onClick={() => switchTab('blacklist')}
          >
            <div className={styles.tabButtonLeft}>
              <ShieldCheckIcon size={18} />
              <span>Danh Sách Đen</span>
            </div>
            <span
              className={styles.tabBadge}
              style={{
                background: penalties.filter((p) => p.is_blacklisted).length > 0 ? '#ef4444' : undefined,
                color: penalties.filter((p) => p.is_blacklisted).length > 0 ? '#ffffff' : undefined,
              }}
            >
              {penalties.filter((p) => p.is_blacklisted).length}
            </span>
          </button>

          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'settings' ? styles.tabActive : ''}`}
            onClick={() => switchTab('settings')}
          >
            <div className={styles.tabButtonLeft}>
              <ShieldCheckIcon size={18} />
              <span>Bảo trì hệ thống</span>
            </div>
          </button>
        </nav>

        <div className={styles.sidebarFooter}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Hệ thống PTIT HCM v2.0</div>
          <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
            <span>Máy chủ hoạt động ổn định</span>
          </div>
        </div>
      </aside>

      {/* MAIN DASHBOARD CONTENT */}
      <main className={styles.main}>
        <div className={styles.contentArea}>
            {/* Luxury Hero Banner */}
            {/* Admin Header Banner */}
            <div className={styles.heroBanner}>
              <div className={styles.heroLeft}>
                <h1 className={styles.heroTitle}>
                  <span className={styles.heroLine1}>Quản Trị Hệ Thống Sự Kiện Đoàn Học Viện Công Nghệ Bưu Chính Viễn Thông</span>
                  <span className={styles.heroLine2}>Cơ Sở Tại TP. Hồ Chí Minh</span>
                </h1>
              </div>

              <div className={styles.heroRight}>
                <div className={styles.heroQuickActions}>
                  <Link href="/admin/proposals/new" className={`${styles.heroBtn} ${styles.heroBtnPrimary}`}>
                    <PlusIcon size={15} />
                    <span>Trình Kế Hoạch Sự Kiện</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Global Statistics Cards */}
            <section className={styles.statsGrid}>
              <StatCard
                title="Tổng sinh viên"
                value={stats.students || students.length}
                loading={statsLoading}
                color="primary"
                icon={<UsersIcon size={20} />}
                subtitle="Dữ liệu sinh viên toàn trường"
                onClick={() => switchTab('students')}
                isActive={activeTab === 'students'}
              />
              <StatCard
                title="Tổng sự kiện"
                value={stats.events || events.length}
                loading={statsLoading}
                color="warning"
                icon={<CalendarIcon size={20} />}
                subtitle="Sự kiện Đoàn Thanh Niên hoạt động"
                onClick={() => switchTab('events')}
                isActive={activeTab === 'events'}
              />
              <StatCard
                title="Lượt điểm danh"
                value={stats.checkins}
                loading={statsLoading}
                color="success"
                icon={<CheckCircleIcon size={20} />}
                subtitle="Lượt quét minh chứng hợp lệ"
                onClick={() => switchTab('events')}
                isActive={activeTab === 'events'}
              />
            </section>

        {/* TAB 1: QUẢN LÝ SỰ KIỆN */}
        {activeTab === 'events' && (
          <div className={styles.tabContent}>
            {/* Danh sách sự kiện & kế hoạch */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <CalendarIcon size={20} color="#2563eb" />
                    Danh Sách Sự Kiện & Kế Hoạch Toàn Trường ({pendingProposals.length + filteredEvents.length})
                  </h2>
                  {selectedUnitFilter && (
                    <p className={styles.sectionSubtitle}>
                      Đang lọc hiển thị theo đơn vị: <strong style={{ color: '#2563eb' }}>{selectedUnitFilter}</strong>
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {selectedUnitFilter && (
                    <button
                      type="button"
                      onClick={() => setSelectedUnitFilter(null)}
                      style={{
                        background: '#eff6ff',
                        border: '1.5px solid #bfdbfe',
                        color: '#2563eb',
                        borderRadius: '8px',
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Bỏ lọc đơn vị (Xem tất cả)
                    </button>
                  )}
                  <Link
                    href="/admin/proposals/new"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      padding: '0.5rem 1rem',
                      background: '#2563eb',
                      color: '#ffffff',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <PlusIcon size={16} />
                    <span>Trình Kế Hoạch Mới</span>
                  </Link>
                </div>
              </div>

              {/* Bộ lọc trạng thái kiểu Pills (Tất cả, Chờ duyệt, Đang mở, Đã đóng) */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setEventStatusFilter('all')}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: eventStatusFilter === 'all' ? '#2563eb' : '#e2e8f0',
                    background: eventStatusFilter === 'all' ? '#2563eb' : '#ffffff',
                    color: eventStatusFilter === 'all' ? '#ffffff' : '#475569',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Tất cả ({pendingProposals.length + filteredEvents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setEventStatusFilter('pending')}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: eventStatusFilter === 'pending' ? '#d97706' : '#fed7aa',
                    background: eventStatusFilter === 'pending' ? '#d97706' : '#fffbeb',
                    color: eventStatusFilter === 'pending' ? '#ffffff' : '#b45309',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Chờ duyệt ({pendingProposals.length})
                </button>
                <button
                  type="button"
                  onClick={() => setEventStatusFilter('active')}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: eventStatusFilter === 'active' ? '#16a34a' : '#bbf7d0',
                    background: eventStatusFilter === 'active' ? '#16a34a' : '#f0fdf4',
                    color: eventStatusFilter === 'active' ? '#ffffff' : '#15803d',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Đang mở ({filteredEvents.filter((ev) => getEffectiveEventStatus(ev) === 'active').length})
                </button>
                <button
                  type="button"
                  onClick={() => setEventStatusFilter('closed')}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: eventStatusFilter === 'closed' ? '#475569' : '#e2e8f0',
                    background: eventStatusFilter === 'closed' ? '#475569' : '#f8fafc',
                    color: eventStatusFilter === 'closed' ? '#ffffff' : '#64748b',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Đã đóng ({filteredEvents.filter((ev) => getEffectiveEventStatus(ev) === 'closed').length})
                </button>
              </div>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tên sự kiện</th>
                      <th>Thời gian & Địa điểm</th>
                      <th>Trạng thái</th>
                      <th>Ban quản trị & Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventsLoading && proposalsLoading ? (
                      <tr>
                        <td colSpan={4} className={styles.emptyState} style={{ padding: '3.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#64748b' }}>
                            <div className={styles.tableSpinner}></div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang tải danh sách sự kiện & kế hoạch...</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <>
                        {/* 1. HỒ SƠ CHỜ DUYỆT (Khi chọn filter 'all' hoặc 'pending') */}
                        {(eventStatusFilter === 'all' || eventStatusFilter === 'pending') &&
                          pendingProposals.map((p) => (
                            <tr
                              key={`prop-${p.id}`}
                              style={{ background: '#fffdfa' }}
                              className={styles.clickableRow}
                              onClick={() => router.push(`/admin/proposals/${p.id}`)}
                              title="Bấm vào để xem hồ sơ kế hoạch"
                            >
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <Link
                                    href={`/admin/proposals/${p.id}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.4rem',
                                      color: '#1e40af',
                                      fontWeight: 800,
                                      fontSize: '0.975rem',
                                      textDecoration: 'none',
                                    }}
                                    className={styles.eventName}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span>{p.title}</span>
                                    <span style={{ fontSize: '0.85rem', color: '#2563eb' }}>➔</span>
                                  </Link>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.775rem', color: '#64748b' }}>
                                    <span style={{ padding: '0.15rem 0.5rem', background: '#ffedd5', color: '#9a3412', borderRadius: '4px', fontWeight: 700 }}>
                                      {p.organization_unit}
                                    </span>
                                    <span>•</span>
                                    <span>{p.created_by}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.825rem' }}>
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                    {new Date(p.start_date).toLocaleDateString('vi-VN')} ({p.start_time?.slice(0, 5)} - {p.end_time?.slice(0, 5)})
                                  </span>
                                  <span style={{ color: '#475569' }}>
                                    {p.room_name || 'Hội trường / Phòng họp'} • {p.total_count} người
                                  </span>
                                </div>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '0.35rem 0.75rem',
                                    background: '#fffbeb',
                                    color: '#b45309',
                                    border: '1.5px solid #fde68a',
                                    borderRadius: '20px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {getStageLabel(p.current_stage)}
                                </span>
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                                  <button
                                    type="button"
                                    onClick={() => approveProposal(p.id)}
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      background: '#16a34a',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Duyệt cấp này
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => rejectProposal(p.id)}
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      background: '#fef2f2',
                                      color: '#dc2626',
                                      border: '1px solid #fecaca',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Từ chối
                                  </button>
                                  <Link
                                    href={`/admin/proposals/${p.id}`}
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      background: '#eff6ff',
                                      color: '#2563eb',
                                      border: '1px solid #bfdbfe',
                                      borderRadius: '8px',
                                      fontSize: '0.8rem',
                                      fontWeight: 700,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    Xem Hồ Sơ ➔
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}

                        {/* 2. SỰ KIỆN ĐÃ DUYỆT (Khi chọn filter 'all', 'active', hoặc 'closed') */}
                        {eventStatusFilter !== 'pending' &&
                          filteredEvents
                            .filter((event) => {
                              if (eventStatusFilter === 'active') return getEffectiveEventStatus(event) === 'active';
                              if (eventStatusFilter === 'closed') return getEffectiveEventStatus(event) === 'closed';
                              return true;
                            })
                            .map((event) => (
                              <tr
                                key={event.event_id}
                                onClick={() => router.push(`/admin/events/${event.event_id}`)}
                                className={styles.clickableRow}
                                title="Bấm vào dòng này để mở trang quản trị sự kiện"
                              >
                                <td>
                                  <Link
                                    href={`/admin/events/${event.event_id}`}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.4rem',
                                      color: '#1e40af',
                                      fontWeight: 800,
                                      fontSize: '0.975rem',
                                      textDecoration: 'none',
                                    }}
                                    className={styles.eventName}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span>{event.event_name}</span>
                                    <span style={{ fontSize: '0.85rem', color: '#2563eb' }}>➔</span>
                                  </Link>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{event.event_date ? new Date(event.event_date).toLocaleDateString('vi-VN') : 'Hôm nay'}</span>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                      {event.start_time?.slice(0, 5)} - {event.end_time?.slice(0, 5) || '22:00'}
                                    </span>
                                  </div>
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                  {(() => {
                                    const isPast = isEventPastDeadline(event);
                                    const effectiveStatus = getEffectiveEventStatus(event);
                                    return (
                                      <button
                                        onClick={() => toggleEventStatus(event.event_id, effectiveStatus)}
                                        className={`${styles.statusBadge} ${effectiveStatus === 'active' ? styles.statusActive : styles.statusClosed}`}
                                        title={isPast ? 'Sự kiện đã hết thời gian (tự động đóng sau 1 giờ)' : 'Nhấn để Bật/Tắt trạng thái sự kiện'}
                                      >
                                        <span className={effectiveStatus === 'active' ? styles.dotActive : styles.dotClosed}></span>
                                        {effectiveStatus === 'active' ? 'Đang mở' : 'Đã đóng'}
                                      </button>
                                    );
                                  })()}
                                </td>
                                <td onClick={(e) => e.stopPropagation()}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', width: '100%' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'flex-start' }}>
                                      {(event as any).event_roles && (event as any).event_roles.length > 0 ? (
                                        (event as any).event_roles.map((r: any) => (
                                          <span key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.775rem', color: '#1e40af' }}>
                                            {r.email}
                                            <button 
                                              onClick={() => removeAdmin(event.event_id, r.id, r.email)} 
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 'bold', padding: '0 2px' }} 
                                              title="Thu hồi quyền"
                                            >
                                              ×
                                            </button>
                                          </span>
                                        ))
                                      ) : (
                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Chưa gán</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssignModalEvent(event);
                                          setSelectedUnitCode('LCD_CNTT');
                                          const defaultUnit = OFFICIAL_UNITS.find((u) => u.code === 'LCD_CNTT');
                                          setCustomEmail(defaultUnit ? defaultUnit.email : '');
                                          setSelectedRoleType('event_admin');
                                        }}
                                        className={styles.actionButton}
                                      >
                                        Gán Admin Đơn Vị
                                      </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                      <Link
                                        href={`/admin/events/${event.event_id}`}
                                        style={{
                                          padding: '0.45rem 0.85rem',
                                          borderRadius: '8px',
                                          border: '1.5px solid #bfdbfe',
                                          background: '#eff6ff',
                                          color: '#1d4ed8',
                                          fontSize: '0.8rem',
                                          fontWeight: 700,
                                          textDecoration: 'none',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.35rem',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={`Vào trang quản trị sự kiện "${event.event_name}"`}
                                      >
                                        <span>Vào Sự Kiện</span>
                                        <span>➔</span>
                                      </Link>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteEvent(event.event_id, event.event_name)}
                                        style={{
                                          padding: '0.45rem 0.8rem',
                                          borderRadius: '8px',
                                          border: '1.5px solid #fecaca',
                                          background: '#fff1f2',
                                          color: '#dc2626',
                                          fontSize: '0.8rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.35rem',
                                          transition: 'all 0.15s ease',
                                        }}
                                        title={`Xóa sự kiện "${event.event_name}"`}
                                      >
                                        <TrashIcon size={14} />
                                        <span>Xóa</span>
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ))}

                        {/* Empty state check across both pendingProposals and filteredEvents */}
                        {((eventStatusFilter === 'pending' && pendingProposals.length === 0) ||
                          (eventStatusFilter === 'active' && filteredEvents.filter((ev) => getEffectiveEventStatus(ev) === 'active').length === 0) ||
                          (eventStatusFilter === 'closed' && filteredEvents.filter((ev) => getEffectiveEventStatus(ev) === 'closed').length === 0) ||
                          (eventStatusFilter === 'all' && pendingProposals.length === 0 && filteredEvents.length === 0)) && (
                          <tr>
                            <td colSpan={4} className={styles.emptyState}>
                              Không có sự kiện hoặc kế hoạch nào {selectedUnitFilter ? `của đơn vị ${selectedUnitFilter}` : ''} phù hợp bộ lọc
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: DUYỆT KẾ HOẠCH ĐA TẦNG */}
        {activeTab === 'proposals' && (
          <div className={styles.tabContent}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <ShieldCheckIcon size={20} color="#c2410c" />
                    Danh Sách Kế Hoạch Trình Duyệt ({filteredProposals.length})
                  </h2>
                  {selectedUnitFilter && (
                    <p className={styles.sectionSubtitle}>
                      Đang lọc kế hoạch của đơn vị: <strong style={{ color: '#c2410c' }}>{selectedUnitFilter}</strong>
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                  {selectedUnitFilter && (
                    <button
                      type="button"
                      onClick={() => setSelectedUnitFilter(null)}
                      style={{
                        background: '#fff7ed',
                        border: '1px solid #fed7aa',
                        color: '#c2410c',
                        borderRadius: '8px',
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Bỏ lọc đơn vị
                    </button>
                  )}
                  <Link
                    href="/admin/proposals/new"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 1rem',
                      background: '#2563eb',
                      color: '#ffffff',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    <PlusIcon size={16} />
                    <span>Trình Kế Hoạch Mới</span>
                  </Link>
                </div>
              </div>

              {/* Bộ lọc trạng thái kế hoạch */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem', marginBottom: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('all')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: proposalStatusFilter === 'all' ? '#2563eb' : '#e2e8f0',
                    background: proposalStatusFilter === 'all' ? '#2563eb' : '#ffffff',
                    color: proposalStatusFilter === 'all' ? '#ffffff' : '#475569',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  Tất cả ({proposalCounts.all})
                </button>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('pending')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: proposalStatusFilter === 'pending' ? '#d97706' : '#fed7aa',
                    background: proposalStatusFilter === 'pending' ? '#d97706' : '#fffbeb',
                    color: proposalStatusFilter === 'pending' ? '#ffffff' : '#b45309',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ⏳ Chờ duyệt ({proposalCounts.pending})
                </button>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('active')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: proposalStatusFilter === 'active' ? '#16a34a' : '#bbf7d0',
                    background: proposalStatusFilter === 'active' ? '#16a34a' : '#f0fdf4',
                    color: proposalStatusFilter === 'active' ? '#ffffff' : '#15803d',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  🟢 Đang mở sự kiện ({proposalCounts.active})
                </button>
                <button
                  type="button"
                  onClick={() => setProposalStatusFilter('closed')}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '20px',
                    border: '1.5px solid',
                    borderColor: proposalStatusFilter === 'closed' ? '#475569' : '#e2e8f0',
                    background: proposalStatusFilter === 'closed' ? '#475569' : '#f8fafc',
                    color: proposalStatusFilter === 'closed' ? '#ffffff' : '#64748b',
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  ⚪ Đã kết thúc / Đóng ({proposalCounts.closed})
                </button>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ minWidth: '220px' }}>Chương trình & Đơn vị</th>
                      <th style={{ minWidth: '190px' }}>Thời gian & Quy mô</th>
                      <th style={{ minWidth: '160px' }}>Địa điểm</th>
                      <th style={{ minWidth: '170px', textAlign: 'center' }}>Trạng thái</th>
                      <th style={{ minWidth: '140px', textAlign: 'right' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposalsLoading ? (
                      <tr>
                        <td colSpan={5} className={styles.emptyState} style={{ padding: '3.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#64748b' }}>
                            <div className={styles.tableSpinner}></div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang tải danh sách kế hoạch sự kiện...</span>
                          </div>
                        </td>
                      </tr>
                    ) : filteredProposals.length === 0 ? (
                      <tr><td colSpan={5} className={styles.emptyState}>Không có kế hoạch nào phù hợp bộ lọc</td></tr>
                    ) : (
                      filteredProposals.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <Link
                                href={`/admin/proposals/${p.id}`}
                                style={{
                                  fontWeight: 800,
                                  color: '#1e40af',
                                  textDecoration: 'none',
                                  fontSize: '0.925rem',
                                  lineHeight: 1.35,
                                }}
                              >
                                {p.title}
                              </Link>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#64748b' }}>
                                <span style={{ fontWeight: 600, color: '#334155' }}>{p.organization_unit}</span>
                                <span style={{ color: '#cbd5e1' }}>•</span>
                                <span>{p.created_by}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem' }}>
                              <span style={{ fontWeight: 600, color: '#0f172a' }}>
                                {new Date(p.start_date).toLocaleDateString('vi-VN')} ({p.start_time.slice(0, 5)} - {p.end_time.slice(0, 5)})
                              </span>
                              <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '0.8rem' }}>
                                👥 {p.total_count} người ({p.participant_count} SV, {p.volunteer_count} CTV)
                              </span>
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
                              📍 {p.room_name || 'Hội trường / Phòng họp'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {(() => {
                              const displayStatus = getProposalDisplayStatus(p);
                              return (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.35rem',
                                    padding: '0.4rem 0.85rem',
                                    background: displayStatus.badgeBg,
                                    color: displayStatus.badgeColor,
                                    border: `1.5px solid ${displayStatus.badgeBorder || '#e2e8f0'}`,
                                    borderRadius: '20px',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {displayStatus.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'flex-end' }}>
                              {p.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => approveProposal(p.id)}
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      background: '#16a34a',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '8px',
                                      fontWeight: 700,
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    Duyệt cấp này
                                  </button>
                                  <button
                                    onClick={() => rejectProposal(p.id)}
                                    style={{
                                      padding: '0.4rem 0.75rem',
                                      background: '#fee2e2',
                                      color: '#b91c1c',
                                      border: '1px solid #fecaca',
                                      borderRadius: '8px',
                                      fontWeight: 700,
                                      fontSize: '0.8rem',
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    Từ chối
                                  </button>
                                </>
                              )}
                              <Link
                                href={`/admin/proposals/${p.id}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.4rem 0.75rem',
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '8px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  textDecoration: 'none',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Xem tiến độ ➔
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB: CÁN BỘ & PHÂN QUYỀN ĐA TÀI KHOẢN */}
        {activeTab === 'officers' && (
          <div className={styles.tabContent}>
            {/* Header & Stat Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ background: '#ffffff', borderRadius: '14px', padding: '1.25rem', border: '1.5px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Tổng Cán Bộ Cấp Quyền</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0f172a', marginTop: '0.35rem' }}>{officers.length}</div>
              </div>
              <div style={{ background: '#ffffff', borderRadius: '14px', padding: '1.25rem', border: '1.5px solid #fee2e2', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#dc2626', textTransform: 'uppercase' }}>Super Admin</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#dc2626', marginTop: '0.35rem' }}>
                  {officers.filter((o) => o.role_tier === 'super_admin').length}
                </div>
              </div>
              <div style={{ background: '#ffffff', borderRadius: '14px', padding: '1.25rem', border: '1.5px solid #dcfce7', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>Đoàn Học Viện</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#16a34a', marginTop: '0.35rem' }}>
                  {officers.filter((o) => o.role_tier === 'youth_union').length}
                </div>
              </div>
              <div style={{ background: '#ffffff', borderRadius: '14px', padding: '1.25rem', border: '1.5px solid #dbeafe', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2563eb', textTransform: 'uppercase' }}>Phòng CTSV</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#2563eb', marginTop: '0.35rem' }}>
                  {officers.filter((o) => o.role_tier === 'ctsv').length}
                </div>
              </div>
              <div style={{ background: '#ffffff', borderRadius: '14px', padding: '1.25rem', border: '1.5px solid #ffedd5', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ea580c', textTransform: 'uppercase' }}>Phòng CSVC</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ea580c', marginTop: '0.35rem' }}>
                  {officers.filter((o) => o.role_tier === 'facility').length}
                </div>
              </div>
              <div style={{ background: '#ffffff', borderRadius: '14px', padding: '1.25rem', border: '1.5px solid #f3e8ff', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase' }}>Các Đơn Vị (LCĐ/CLB)</span>
                <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#7c3aed', marginTop: '0.35rem' }}>
                  {officers.filter((o) => o.role_tier === 'event_admin').length}
                </div>
              </div>
            </div>

            {/* Form Cấp Quyền Cán Bộ Mới Card */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1.5px solid #cbd5e1',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                padding: '1.75rem',
                marginBottom: '1.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#fee2e2', color: '#991b1b', padding: '0.25rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <ShieldCheckIcon size={14} color="#991b1b" /> Phân Quyền Đa Tài Khoản Cho Cán Bộ
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0.4rem 0 0.2rem' }}>
                    Thêm & Gán Quyền Cán Bộ / Ban Chấp Hành
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
                    Cấp quyền cho cán bộ, chuyên viên, Bí thư/Phó Bí thư sử dụng tài khoản Google cá nhân của trường (@ptithcm.edu.vn hoặc @student.ptithcm.edu.vn) để duyệt hồ sơ và quản lý hoạt động.
                  </p>
                </div>
              </div>

              <form onSubmit={grantOfficerRole} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Email Cán Bộ / Sinh Viên *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="VD: nguyenvana@ptithcm.edu.vn"
                    value={officerEmail}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOfficerEmail(val);
                      // Auto populate name if exists in students list
                      const matched = students.find((s) => s.email?.toLowerCase() === val.trim().toLowerCase());
                      if (matched && !officerFullName) {
                        setOfficerFullName(matched.full_name || '');
                      }
                    }}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Họ và Tên Cán Bộ
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Nguyễn Văn A (Để trống tự lấy)"
                    value={officerFullName}
                    onChange={(e) => setOfficerFullName(e.target.value)}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Cấp Quyền / Vai Trò *
                  </label>
                  <select
                    value={officerRoleTier}
                    onChange={(e) => setOfficerRoleTier(e.target.value as UserTier)}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="youth_union">Đoàn Thanh Niên Học Viện</option>
                    <option value="ctsv">Phòng Công Tác Sinh Viên (CTSV)</option>
                    <option value="facility">Phòng Quản Trị CSVC & Tổ Chức</option>
                    <option value="event_admin">Ban Chấp Hành LCĐ / CLB</option>
                    <option value="super_admin">Super Admin (Toàn Quyền Quản Trị)</option>
                  </select>
                </div>

                {officerRoleTier === 'event_admin' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                      Chọn Đơn Vị LCĐ / CLB Phụ Trách *
                    </label>
                    <select
                      value={officerUnitCode}
                      onChange={(e) => setOfficerUnitCode(e.target.value)}
                      style={{
                        width: '100%',
                        height: '44px',
                        padding: '0 0.85rem',
                        border: '1.5px solid #cbd5e1',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#f8fafc',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      {OFFICIAL_UNITS.map((u) => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.code})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Chức Vụ / Ghi Chú Phân Công
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Ủy viên BTV, Chuyên viên, Bí thư LCĐ..."
                    value={officerNotes}
                    onChange={(e) => setOfficerNotes(e.target.value)}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="submit"
                    disabled={grantingOfficer}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 1.25rem',
                      background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: grantingOfficer ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)',
                    }}
                  >
                    <PlusIcon size={16} />
                    <span>{grantingOfficer ? 'Đang cấp quyền...' : 'Gán Quyền Cán Bộ'}</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Bảng Danh Sách Cán Bộ Đang Có Quyền */}
            <section className={styles.section}>
              <div className={styles.sectionHeader} style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <UsersIcon size={20} color="#dc2626" />
                    Danh Sách Cán Bộ & Phân Quyền Hệ Thống ({officers.length})
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    Mọi cán bộ trong danh sách này khi đăng nhập bằng Google cá nhân sẽ có đầy đủ thẩm quyền tương ứng.
                  </p>
                </div>

                {/* Filter Pill Tabs */}
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { key: 'all', label: 'Tất cả' },
                    { key: 'super_admin', label: 'Super Admin' },
                    { key: 'youth_union', label: 'Đoàn Học Viện' },
                    { key: 'ctsv', label: 'Phòng CTSV' },
                    { key: 'facility', label: 'Phòng CSVC' },
                    { key: 'event_admin', label: 'LCĐ/CLB' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setOfficerFilter(f.key)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '8px',
                        border: officerFilter === f.key ? '1.5px solid #dc2626' : '1px solid #cbd5e1',
                        background: officerFilter === f.key ? '#fee2e2' : '#ffffff',
                        color: officerFilter === f.key ? '#991b1b' : '#64748b',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Cán Bộ / Tài Khoản</th>
                      <th>Cấp Thẩm Quyền</th>
                      <th>Đơn Vị Phụ Trách</th>
                      <th>Chức Vụ / Ghi Chú</th>
                      <th>Ngày Cấp & Người Cấp</th>
                      <th style={{ textAlign: 'center' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {officersLoading ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                          Đang tải danh sách cán bộ...
                        </td>
                      </tr>
                    ) : officers.filter((o) => officerFilter === 'all' || o.role_tier === officerFilter).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                          Chưa có cán bộ nào trong mục này.
                        </td>
                      </tr>
                    ) : (
                      officers
                        .filter((o) => officerFilter === 'all' || o.role_tier === officerFilter)
                        .map((officer) => (
                          <tr key={officer.id || officer.email}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                                  {officer.full_name || officer.email}
                                </strong>
                                <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace' }}>
                                  {officer.email}
                                </span>
                                {officer.mssv && (
                                  <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>
                                    MSSV: {officer.mssv} {officer.class_id ? `• Lớp ${officer.class_id}` : ''}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              {officer.role_tier === 'super_admin' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 800 }}>
                                  <ShieldCheckIcon size={14} color="#991b1b" />
                                  <span>Super Admin</span>
                                </span>
                              ) : officer.role_tier === 'youth_union' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontSize: '0.8rem', fontWeight: 800 }}>
                                  <CheckCircleIcon size={14} color="#166534" />
                                  <span>Đoàn Học Viện</span>
                                </span>
                              ) : officer.role_tier === 'ctsv' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: '#dbeafe', color: '#1e40af', fontSize: '0.8rem', fontWeight: 800 }}>
                                  <UsersIcon size={14} color="#1e40af" />
                                  <span>Phòng CTSV</span>
                                </span>
                              ) : officer.role_tier === 'facility' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: '#ffedd5', color: '#9a3412', fontSize: '0.8rem', fontWeight: 800 }}>
                                  <BuildingIcon size={14} color="#9a3412" />
                                  <span>Phòng CSVC</span>
                                </span>
                              ) : (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.3rem 0.65rem', borderRadius: '8px', background: '#f3e8ff', color: '#6b21a8', fontSize: '0.8rem', fontWeight: 800 }}>
                                  <SettingsIcon size={14} color="#6b21a8" />
                                  <span>Admin LCĐ / CLB</span>
                                </span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                                {officer.unit_name || officer.unit_code || '—'}
                              </span>
                            </td>
                            <td>
                              <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                                {officer.notes || '—'}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#64748b' }}>
                                <span>{new Date(officer.created_at).toLocaleDateString('vi-VN')}</span>
                                <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>Bởi: {officer.created_by || 'Super Admin'}</span>
                              </div>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {officer.isRootAdmin || officer.email.toLowerCase() === 'n22dccn158@student.ptithcm.edu.vn' ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 800, color: '#16a34a', background: '#f0fdf4', padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                  <ShieldCheckIcon size={13} color="#16a34a" />
                                  <span>Admin Gốc</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => revokeOfficerRole(officer)}
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    background: '#fee2e2',
                                    color: '#dc2626',
                                    border: '1px solid #fca5a5',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Thu Hồi Quyền
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: QUẢN LÝ PHÒNG & SÂN BÃI */}
        {activeTab === 'rooms' && (
          <div className={styles.tabContent}>
            {/* Thêm phòng mới */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <SettingsIcon size={20} color="#2563eb" />
                    Thêm Phòng / Hội Trường / Sân Bãi Mới
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    Quản lý danh mục phòng ốc phục vụ tổ chức và kiểm tra trùng lịch tự động
                  </p>
                </div>
              </div>

              <form onSubmit={createRoom} className={styles.roomFormGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Tên Phòng / Địa Điểm</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Hội trường 2B, Sân bóng đá..."
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Sức chứa (Người)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newRoomCapacity}
                    onChange={(e) => setNewRoomCapacity(Number(e.target.value))}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Vị trí cụ thể</label>
                  <input
                    type="text"
                    placeholder="VD: Tầng 2, Tòa nhà B"
                    value={newRoomLocation}
                    onChange={(e) => setNewRoomLocation(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <button type="submit" disabled={creatingRoom} className={styles.submitBtn}>
                  <PlusIcon size={16} />
                  <span>{creatingRoom ? 'Đang thêm...' : 'Thêm Địa Điểm Mới'}</span>
                </button>
              </form>
            </section>

            {/* Danh sách phòng */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <SettingsIcon size={20} color="#2563eb" />
                  Danh Sách Phòng & Sân Bãi Trong Hệ Thống ({rooms.length})
                </h2>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Tên Phòng / Sân Bãi</th>
                      <th>Sức Chứa</th>
                      <th>Vị Trí</th>
                      <th>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomsLoading ? (
                      <tr>
                        <td colSpan={4} className={styles.emptyState} style={{ padding: '3.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#64748b' }}>
                            <div className={styles.tableSpinner}></div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang tải danh sách phòng & sân bãi...</span>
                          </div>
                        </td>
                      </tr>
                    ) : rooms.length === 0 ? (
                      <tr><td colSpan={4} className={styles.emptyState}>Chưa có phòng nào</td></tr>
                    ) : (
                      rooms.map((r) => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>{r.room_name}</td>
                          <td>
                            <span style={{ padding: '0.2rem 0.5rem', background: '#eff6ff', color: '#1e40af', borderRadius: '6px', fontWeight: 600, fontSize: '0.85rem' }}>
                              {r.capacity} người
                            </span>
                          </td>
                          <td style={{ color: '#64748b', fontSize: '0.9rem' }}>{r.location || 'Khuôn viên trường'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <button
                                onClick={() => editRoom(r)}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  border: '1px solid #bfdbfe',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Sửa
                              </button>
                              <button
                                onClick={() => deleteRoom(r.id, r.room_name)}
                                style={{
                                  padding: '0.3rem 0.6rem',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB: 24 ĐƠN VỊ TỔ CHỨC (LCĐ & CLB) */}
        {activeTab === 'units' && (
          <div className={styles.tabContent}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <BuildingIcon size={20} color="#2563eb" />
                    Danh Sách Các Đơn Vị Trực Thuộc (Đoàn Trường, 8 LCĐ & 16 CLB/Đội/Nhóm)
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    Các đơn vị tổ chức có quyền nộp kế hoạch chương trình và quản lý sự kiện trong hệ thống
                  </p>
                </div>
                <ExcelExportButton
                  data={OFFICIAL_UNITS.map((u, idx) => ({
                    stt: idx + 1,
                    code: u.code,
                    name: u.name,
                    type: u.type,
                    email: u.email,
                  }))}
                  filename="danh-sach-24-don-vi-doan-hoi-ptit.xlsx"
                  label="Xuất Excel 24 đơn vị"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af' }}>LIÊN CHI ĐOÀN KHOA</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e3a8a', marginTop: '0.25rem' }}>8 Đơn vị</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Quản lý hoạt động Đoàn các Khoa</div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '14px', padding: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534' }}>CLB / ĐỘI / NHÓM</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#14532d', marginTop: '0.25rem' }}>16 Đơn vị</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Học thuật, văn thể mỹ, tình nguyện</div>
                </div>
              </div>

              <DataTable
                columns={[
                  { key: 'code', label: 'Mã Định Danh' },
                  { key: 'name', label: 'Tên Đơn Vị' },
                  { key: 'type', label: 'Phân Loại' },
                  { key: 'email', label: 'Email Đăng Nhập Chính Thức' },
                ]}
                data={OFFICIAL_UNITS}
                searchable={true}
                searchPlaceholder="Tìm kiếm theo tên LCĐ, CLB..."
                emptyMessage="Không tìm thấy đơn vị phù hợp."
              />
            </section>
          </div>
        )}

        {/* TAB 4: QUẢN LÝ SINH VIÊN */}
        {activeTab === 'students' && (
          <div className={styles.tabContent}>
            {/* Nạp danh sách sinh viên */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <UsersIcon size={20} color="#16a34a" />
                  Nạp danh sách sinh viên bằng file Excel
                </h2>
              </div>
              <FileUploadZone
                onUploadSuccess={() => {
                  fetchStats();
                  fetchStudents();
                }}
                accept=".xlsx, .xls"
              />
            </section>

            {/* Danh sách sinh viên */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <UsersIcon size={20} color="#16a34a" />
                  Danh sách sinh viên trong hệ thống ({stats.students || students.length})
                </h2>
                <ExcelExportButton
                  data={students.map((s, idx) => ({
                    stt: idx + 1,
                    mssv: s.mssv,
                    full_name: s.full_name,
                    class_id: s.class_id,
                    email: s.email,
                  }))}
                  filename="danh-sach-sinh-vien-ptit.xlsx"
                  label="Xuất Excel danh sách"
                />
              </div>
              <DataTable
                columns={[
                  {
                    key: 'mssv',
                    label: 'MSSV',
                    render: (val) => (
                      <span style={{ fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {val}
                      </span>
                    ),
                  },
                  {
                    key: 'full_name',
                    label: 'Họ và tên',
                    render: (val) => <span style={{ fontWeight: 700, color: '#0f172a' }}>{val}</span>,
                  },
                  { key: 'class_id', label: 'Lớp' },
                  { key: 'email', label: 'Email', render: (val) => <span style={{ color: '#64748b' }}>{val}</span> },
                  {
                    key: 'actions',
                    label: 'Tra Cứu Hoạt Động',
                    render: (_, row) => (
                      <button
                        type="button"
                        onClick={() => openStudentHistory(row as any)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.4rem 0.85rem',
                          background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                          border: '1px solid #bfdbfe',
                          color: '#1e40af',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(37, 99, 235, 0.1)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <CheckCircleIcon size={14} />
                        <span>Xem Lịch Sử Điểm Danh</span>
                      </button>
                    ),
                  },
                ]}
                data={students}
                loading={studentsLoading}
                searchable={true}
                searchPlaceholder="Tìm kiếm theo MSSV, họ tên, lớp, email..."
                emptyMessage="Không tìm thấy sinh viên nào phù hợp."
                onSearchChange={(query) => {
                  fetchStudents(query);
                }}
              />
            </section>
          </div>
        )}

        {/* TAB: ỦY QUYỀN BAN CHẤP HÀNH CHI ĐOÀN (BÍ THƯ / PHÓ BÍ THƯ CHẤM ĐRL) */}
        {activeTab === 'delegates' && (
          <div className={styles.tabContent}>
            {/* Form Cấp Quyền Card */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
                padding: '1.75rem',
                marginBottom: '1.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.25rem 0.65rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <CheckCircleIcon size={14} /> Phân Quyền Tạm Thời 30 Ngày
                  </div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: '0.4rem 0 0.2rem' }}>
                    Cấp Quyền Tra Cứu ĐRL Cho Bí Thư / Phó Bí Thư Chi Đoàn
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>
                    Cấp quyền trong 1 tháng để Bí thư/Phó Bí thư tra cứu và xuất dữ liệu minh chứng của đoàn viên trong Chi đoàn (Lớp) mình phụ trách.
                  </p>
                </div>
              </div>

              <form onSubmit={grantPermission} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr)) auto', gap: '1rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    MSSV Bí Thư / Phó Bí Thư
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: N22DCCN158 hoặc N25DCVT109"
                    value={grantMssv}
                    onChange={(e) => setGrantMssv(e.target.value.toUpperCase())}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      fontFamily: 'monospace',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                    Chức Vụ Trong Chi Đoàn
                  </label>
                  <select
                    value={grantNotes}
                    onChange={(e) => setGrantNotes(e.target.value)}
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="Bí thư Chi đoàn">Bí thư Chi đoàn</option>
                    <option value="Phó Bí thư Chi đoàn">Phó Bí thư Chi đoàn</option>
                    <option value="Ủy viên BCH Chi đoàn">Ủy viên BCH Chi đoàn</option>
                    <option value="Cán bộ phụ trách chấm ĐRL">Cán bộ phụ trách chấm ĐRL</option>
                  </select>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={granting}
                    style={{
                      height: '44px',
                      padding: '0 1.5rem',
                      background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: granting ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <ShieldCheckIcon size={14} color="#ffffff" />
                    <span>{granting ? 'Đang Cấp Quyền...' : 'Cấp Quyền 30 Ngày'}</span>
                  </button>
                </div>
              </form>

              {/* Live Preview Student Info */}
              {students.find((s) => s.mssv.toUpperCase() === grantMssv.trim().toUpperCase()) && (
                <div
                  style={{
                    marginTop: '0.85rem',
                    padding: '0.6rem 0.9rem',
                    background: '#f0fdf4',
                    border: '1.5px solid #86efac',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    color: '#15803d',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <CheckCircleIcon size={16} color="#15803d" />
                  <span>
                    Đã nhận diện: <strong style={{ color: '#0f172a' }}>{students.find((s) => s.mssv.toUpperCase() === grantMssv.trim().toUpperCase())?.full_name}</strong> — Chi đoàn (Lớp): <strong style={{ color: '#1e40af', background: '#dbeafe', padding: '0.15rem 0.5rem', borderRadius: '6px' }}>{students.find((s) => s.mssv.toUpperCase() === grantMssv.trim().toUpperCase())?.class_id}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Bảng danh sách cán bộ được cấp quyền */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
                padding: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                    <UsersIcon size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                      Danh Sách Cán Bộ Chi Đoàn Đang Được Ủy Quyền
                    </h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                      Tổng cộng {delegates.length} tài khoản có hiệu lực
                    </span>
                  </div>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>MSSV</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em' }}>Họ Và Tên</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Chi Đoàn (Lớp)</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Chức Vụ</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Ngày Cấp</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Hết Hạn</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Thời Hạn Còn Lại</th>
                      <th style={{ padding: '0.85rem 1rem', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delegatesLoading ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '3.5rem 1rem', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                            <div className={styles.tableSpinner}></div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang tải danh sách cán bộ Chi đoàn...</span>
                          </div>
                        </td>
                      </tr>
                    ) : delegates.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748b' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                            <UsersIcon size={32} color="#94a3b8" />
                          </div>
                          Chưa có cán bộ Chi đoàn nào được cấp quyền tra cứu ĐRL.
                        </td>
                      </tr>
                    ) : (
                      delegates.map((del) => (
                        <tr key={del.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 800, fontFamily: 'monospace', color: '#1d4ed8', whiteSpace: 'nowrap' }}>
                            {del.mssv}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{del.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{del.email}</div>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-block', padding: '0.25rem 0.65rem', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: '8px', fontWeight: 800, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                              {del.class_id}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-block', padding: '0.25rem 0.65rem', background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff', borderRadius: '8px', fontWeight: 700, fontSize: '0.78rem' }}>
                              {del.notes || 'Bí thư Chi đoàn'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                            {new Date(del.granted_at).toLocaleDateString('vi-VN')}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                            {new Date(del.expires_at).toLocaleDateString('vi-VN')}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', whiteSpace: 'nowrap' }}>
                            {del.status === 'active' ? (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></span>
                                Còn {del.daysLeft} ngày
                              </span>
                            ) : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626' }}></span>
                                Đã Hết Hạn
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              onClick={() => revokePermission(del.id, del.full_name)}
                              style={{
                                padding: '0.4rem 0.85rem',
                                background: '#fff1f2',
                                border: '1px solid #fecdd3',
                                color: '#e11d48',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <span>Thu Hồi Quyền</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: DANH SÁCH ĐEN (BLACKLIST) */}
        {activeTab === 'blacklist' && (
          <div className={styles.tabContent}>
            {/* Thêm vào blacklist thủ công */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <ShieldCheckIcon size={20} color="#dc2626" />
                    Khóa Đăng Ký Thủ Công (Thêm Vào Blacklist)
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    Dành cho các trường hợp sinh viên vi phạm kỷ luật, gian lận điểm danh đặc biệt cần cấm tham gia sự kiện
                  </p>
                </div>
              </div>

              <form onSubmit={manualBan} className={styles.roomFormGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Mã Số Sinh Viên (MSSV)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: N22DCCN001"
                    value={banMssv}
                    onChange={(e) => setBanMssv(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <div className={styles.formGroup} style={{ flex: 2 }}>
                  <label className={styles.label}>Lý do khóa tài khoản</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Vi phạm kỷ luật, gian lận điểm danh..."
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    className={styles.input}
                  />
                </div>
                <button
                  type="submit"
                  disabled={banning}
                  className={styles.submitBtn}
                  style={{ background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)' }}
                >
                  <ShieldCheckIcon size={16} />
                  <span>{banning ? 'Đang khóa...' : 'Khóa Blacklist'}</span>
                </button>
              </form>
            </section>

            {/* Danh sách sinh viên vi phạm & Blacklist */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>
                    <ShieldCheckIcon size={20} color="#dc2626" />
                    Danh Sách Sinh Viên Vi Phạm & Đang Bị Khóa ({penalties.length})
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    Hệ thống tự động khóa đăng ký khi sinh viên tích lũy đủ 3 lần vắng mặt sau khi đã đăng ký. Super Admin có quyền xóa khỏi Blacklist / mở khóa.
                  </p>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>MSSV & Họ Tên</th>
                      <th>Lớp & Email</th>
                      <th>Số Lần Vắng Mặt</th>
                      <th>Trạng Thái</th>
                      <th>Lý Do / Ghi Chú</th>
                      <th>Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {penaltiesLoading ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyState} style={{ padding: '3.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', color: '#64748b' }}>
                            <div className={styles.tableSpinner}></div>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang tải danh sách vi phạm & Blacklist...</span>
                          </div>
                        </td>
                      </tr>
                    ) : penalties.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyState}>
                          Hiện tại không có sinh viên nào trong danh sách đen hoặc bị cảnh cáo.
                        </td>
                      </tr>
                    ) : (
                      penalties.map((pen) => (
                        <tr key={pen.mssv}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a' }}>{pen.mssv}</span>
                              <span style={{ fontSize: '0.85rem', color: '#475569' }}>{pen.full_name}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.85rem' }}>
                              <span style={{ fontWeight: 600 }}>{pen.class_id}</span>
                              <span style={{ color: '#64748b' }}>{pen.email}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <span
                                style={{
                                  padding: '0.25rem 0.65rem',
                                  background: pen.missed_count >= 3 ? '#fee2e2' : pen.missed_count === 2 ? '#fef3c7' : '#eff6ff',
                                  color: pen.missed_count >= 3 ? '#b91c1c' : pen.missed_count === 2 ? '#b45309' : '#1e40af',
                                  borderRadius: '12px',
                                  fontWeight: 800,
                                  fontSize: '0.85rem',
                                }}
                              >
                                {pen.missed_count} / 3 lần
                              </span>
                            </div>
                          </td>
                          <td>
                            {pen.is_blacklisted ? (
                              <span
                                style={{
                                  padding: '0.3rem 0.75rem',
                                  background: '#fee2e2',
                                  color: '#b91c1c',
                                  borderRadius: '16px',
                                  fontSize: '0.8rem',
                                  fontWeight: 800,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                }}
                              >
                                Đã Blacklist
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: '0.3rem 0.75rem',
                                  background: '#fef3c7',
                                  color: '#b45309',
                                  borderRadius: '16px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                }}
                              >
                                Cảnh Báo ({pen.missed_count}/3)
                              </span>
                            )}
                          </td>
                          <td style={{ fontSize: '0.85rem', color: '#475569', maxWidth: '240px' }}>
                            {pen.notes || 'Vắng mặt sự kiện'}
                          </td>
                          <td>
                            <button
                              type="button"
                              onClick={() => unbanStudent(pen.mssv)}
                              style={{
                                padding: '0.4rem 0.85rem',
                                background: '#16a34a',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                              }}
                            >
                              Mở Khóa / Xóa Blacklist
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 6: BẢO TRÌ & CÀI ĐẶT */}
        {activeTab === 'settings' && (
          <div className={styles.tabContent}>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <ShieldCheckIcon size={20} color="#dc2626" />
                  Bảo trì chốt điểm rèn luyện & Toàn hệ thống
                </h2>
              </div>
              <MaintenanceToggle />
            </section>
          </div>
        )}
        {/* MODAL: TRA CỨU CHI TIẾT HOẠT ĐỘNG SINH VIÊN */}
        {selectedStudentMssv && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
            onClick={() => setSelectedStudentMssv(null)}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                maxWidth: '780px',
                width: '100%',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd' }}>
                    Hồ Sơ Minh Chứng Hoạt Động Đoàn
                  </div>
                  <h3 style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 800 }}>
                    {studentHistoryData?.user?.full_name || selectedStudentMssv}
                  </h3>
                  <div style={{ fontSize: '0.85rem', color: '#e0e7ff', marginTop: '0.2rem' }}>
                    MSSV: <strong>{selectedStudentMssv}</strong> • Lớp: <strong>{studentHistoryData?.user?.class_id || 'Chưa rõ'}</strong> • Email: <strong>{studentHistoryData?.user?.email || 'N/A'}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStudentMssv(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    color: '#ffffff',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CloseIcon size={18} color="#ffffff" />
                </button>
              </div>

              {/* Modal Content */}
              <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
                {historyLoading ? (
                  <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ width: '28px', height: '28px', border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 1rem' }}></div>
                    Đang tải dữ liệu hoạt động của sinh viên {selectedStudentMssv}...
                  </div>
                ) : studentHistoryData ? (
                  <>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                      <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: '12px', padding: '0.85rem 1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                          Sự Kiện Đã Điểm Danh
                        </div>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#15803d', marginTop: '0.2rem' }}>
                          {studentHistoryData.total_attended} sự kiện
                        </div>
                      </div>

                      <div style={{ background: studentHistoryData.penalty?.is_blacklisted ? '#fef2f2' : '#f8fafc', border: `1.5px solid ${studentHistoryData.penalty?.is_blacklisted ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '12px', padding: '0.85rem 1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: studentHistoryData.penalty?.is_blacklisted ? '#b91c1c' : '#64748b', textTransform: 'uppercase' }}>
                          Trạng Thái Kỷ Luật
                        </div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: studentHistoryData.penalty?.is_blacklisted ? '#dc2626' : '#16a34a', marginTop: '0.35rem' }}>
                          {studentHistoryData.penalty?.is_blacklisted ? 'Đang Bị Khóa Đăng Ký' : `Bình Thường (Vắng ${studentHistoryData.penalty?.missed_count || 0}/3)`}
                        </div>
                      </div>
                    </div>

                    {/* History Table */}
                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>
                      Danh Sách Sự Kiện Đã Tham Gia ({studentHistoryData.history?.length || 0})
                    </h4>

                    {studentHistoryData.history && studentHistoryData.history.length > 0 ? (
                      <div className={styles.tableWrapper}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                              <th style={{ padding: '0.75rem 1rem' }}>Tên Sự Kiện</th>
                              <th style={{ padding: '0.75rem 1rem' }}>Đơn Vị Tổ Chức</th>
                              <th style={{ padding: '0.75rem 1rem' }}>Thời Gian Check-in</th>
                              <th style={{ padding: '0.75rem 1rem' }}>Vai Trò</th>
                            </tr>
                          </thead>
                          <tbody>
                            {studentHistoryData.history.map((h: any) => (
                              <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0f172a' }}>
                                  {h.event_name}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#475569' }}>
                                  {h.organizer}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                                  {new Date(h.checkin_time).toLocaleString('vi-VN')}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span
                                    style={{
                                      padding: '0.25rem 0.6rem',
                                      borderRadius: '12px',
                                      fontSize: '0.75rem',
                                      fontWeight: 700,
                                      background: h.participate_role === 'volunteer' ? '#fef3c7' : h.participate_role === 'organizer' ? '#f3e8ff' : '#dcfce7',
                                      color: h.participate_role === 'volunteer' ? '#b45309' : h.participate_role === 'organizer' ? '#7e22ce' : '#15803d',
                                    }}
                                  >
                                    {h.participate_role === 'volunteer' ? 'Tình Nguyện Viên' : h.participate_role === 'organizer' ? 'Ban Tổ Chức' : 'Người Tham Gia'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div style={{ padding: '2.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', color: '#64748b' }}>
                        Sinh viên chưa có dữ liệu điểm danh sự kiện nào trong hệ thống.
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {/* Modal Footer */}
              <div style={{ padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setSelectedStudentMssv(null)}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    color: '#334155',
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: PHÂN QUYỀN BAN TỔ CHỨC SỰ KIỆN TỪ 24 ĐƠN VỊ */}
        {assignModalEvent && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
            }}
            onClick={() => setAssignModalEvent(null)}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: '20px',
                maxWidth: '540px',
                width: '100%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  padding: '1.25rem 1.5rem',
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#93c5fd' }}>
                    Phân Quyền Ban Tổ Chức Sự Kiện
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, marginTop: '0.2rem' }}>
                    {assignModalEvent.event_name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignModalEvent(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.15)',
                    border: 'none',
                    color: '#ffffff',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    fontWeight: 'bold',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Form Body */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const finalEmail = selectedUnitCode === 'CUSTOM'
                    ? customEmail.trim().toLowerCase()
                    : (OFFICIAL_UNITS.find(u => u.code === selectedUnitCode)?.email || customEmail.trim().toLowerCase());
                  
                  if (!finalEmail) {
                    alert('Vui lòng nhập hoặc chọn email đơn vị');
                    return;
                  }

                  setSubmittingRole(true);
                  try {
                    const res = await fetch(`/api/events/${assignModalEvent.event_id}/roles`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: finalEmail, role_type: selectedRoleType }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      alert('Gán quyền thành công!');
                      setAssignModalEvent(null);
                      fetchEvents();
                    } else {
                      alert(data.error || 'Không thể gán quyền');
                    }
                  } catch (err) {
                    alert('Lỗi kết nối máy chủ');
                  } finally {
                    setSubmittingRole(false);
                  }
                }}
                style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                {/* Unit Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    1. Chọn Đơn Vị Trực Thuộc Được Phân Quyền
                  </label>
                  <select
                    value={selectedUnitCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setSelectedUnitCode(code);
                      if (code !== 'CUSTOM') {
                        const u = OFFICIAL_UNITS.find(unit => unit.code === code);
                        if (u) setCustomEmail(u.email);
                      } else {
                        setCustomEmail('');
                      }
                    }}
                    style={{
                      width: '100%',
                      height: '46px',
                      padding: '0 0.85rem',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#ffffff',
                      outline: 'none',
                    }}
                  >
                    <optgroup label="Đoàn Thanh Niên Học Viện">
                      {OFFICIAL_UNITS.filter(u => u.type.includes('Đoàn')).map(u => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="8 Liên Chi Đoàn Khoa">
                      {OFFICIAL_UNITS.filter(u => u.type.includes('LCĐ')).map(u => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="16 CLB / Đội / Nhóm">
                      {OFFICIAL_UNITS.filter(u => !u.type.includes('LCĐ') && !u.type.includes('Đoàn')).map(u => (
                        <option key={u.code} value={u.code}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </optgroup>
                    <option value="CUSTOM">-- ✍️ Nhập email cá nhân / Khác --</option>
                  </select>
                </div>

                {/* Email Display / Custom Input */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, color: '#334155', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    2. Email Tài Khoản Tiếp Nhận Quyền
                  </label>
                  <input
                    type="email"
                    required
                    value={selectedUnitCode === 'CUSTOM' ? customEmail : (OFFICIAL_UNITS.find(u => u.code === selectedUnitCode)?.email || customEmail)}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    readOnly={selectedUnitCode !== 'CUSTOM'}
                    placeholder="VD: btc.sukien@student.ptithcm.edu.vn"
                    style={{
                      width: '100%',
                      height: '44px',
                      padding: '0 0.85rem',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      color: '#0f172a',
                      background: selectedUnitCode === 'CUSTOM' ? '#ffffff' : '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                  {selectedUnitCode !== 'CUSTOM' && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.775rem', color: '#16a34a', fontWeight: 600 }}>
                      ✓ Email chính thức của: <strong>{OFFICIAL_UNITS.find(u => u.code === selectedUnitCode)?.name}</strong>
                    </p>
                  )}
                </div>

                {/* Role Type Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 800, color: '#334155', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    3. Vai Trò Được Cấp
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        padding: '0.85rem',
                        borderRadius: '12px',
                        border: selectedRoleType === 'event_admin' ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                        background: selectedRoleType === 'event_admin' ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="radio"
                          name="roleType"
                          value="event_admin"
                          checked={selectedRoleType === 'event_admin'}
                          onChange={() => setSelectedRoleType('event_admin')}
                        />
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e40af' }}>
                          👑 Admin Sự Kiện
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '1.5rem' }}>
                        Toàn quyền xem danh sách, chiếu mã QR & xuất Excel
                      </span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                        padding: '0.85rem',
                        borderRadius: '12px',
                        border: selectedRoleType === 'checker' ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                        background: selectedRoleType === 'checker' ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                          type="radio"
                          name="roleType"
                          value="checker"
                          checked={selectedRoleType === 'checker'}
                          onChange={() => setSelectedRoleType('checker')}
                        />
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#1e40af' }}>
                          📱 CTV Quét Mã
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', marginLeft: '1.5rem' }}>
                        Chỉ mở máy quét camera điểm danh sinh viên
                      </span>
                    </label>
                  </div>
                </div>

                {/* Modal Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                  <button
                    type="button"
                    onClick={() => setAssignModalEvent(null)}
                    style={{
                      padding: '0.6rem 1.25rem',
                      borderRadius: '10px',
                      border: '1.5px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#475569',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                    }}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={submittingRole}
                    style={{
                      padding: '0.6rem 1.5rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.875rem',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                    }}
                  >
                    {submittingRole ? 'Đang gán...' : '✓ Xác Nhận Gán Quyền'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
          </div>
      </main>
    </div>
  );
}

export default function SuperAdminPage() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Đang tải bảng quản trị...</div>}>
      <SuperAdminContent />
    </Suspense>
  );
}
