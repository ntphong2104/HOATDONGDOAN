'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import StatCard from '@/components/StatCard';
import ExcelExportButton from '@/components/ExcelExportButton';
import DataTable from '@/components/DataTable';
import DynamicEventQRModal from '@/components/DynamicEventQRModal';
import EventBulkImportModal from '@/components/EventBulkImportModal';
import {
  UsersIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  SettingsIcon,
  CloseIcon,
  QrCodeIcon,
  UserIcon,
  StarIcon,
  TrashIcon,
  UploadCloudIcon,
} from '@/components/icons';
import type { Event, EventRole, CheckinExportRow, EventRegistration, EventDepartment } from '@/lib/types';
import { isEventPastDeadline, isEventScheduleExpired, getEventLifecycleState, getEarliestCheckinTime, isEventTooEarlyForCheckin } from '@/lib/utils/event-logic';
import { isRegistrationWindowOpen } from '@/lib/utils/blacklist-logic';
import styles from './page.module.css';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const supabase = createClient();
  const [event, setEvent] = useState<Event | null>(null);
  const [checkins, setCheckins] = useState<CheckinExportRow[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [roles, setRoles] = useState<EventRole[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [togglingReg, setTogglingReg] = useState(false);
  const [activeTab, setActiveTab] = useState<'checkins' | 'registrations' | 'recruitment' | 'ratings' | 'noshow'>('checkins');
  const [departments, setDepartments] = useState<EventDepartment[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptQuota, setNewDeptQuota] = useState(5);
  const [newDeptGender, setNewDeptGender] = useState<'all' | 'male' | 'female'>('all');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  const [savingDepts, setSavingDepts] = useState(false);
  const [showAddDeptForm, setShowAddDeptForm] = useState(false);
  const [reviewingMssv, setReviewingMssv] = useState<string | null>(null);
  const [selectedMssvs, setSelectedMssvs] = useState<string[]>([]);
  const [togglingRecruitment, setTogglingRecruitment] = useState(false);
  const [bulkReviewing, setBulkReviewing] = useState(false);
  const [ratings, setRatings] = useState<any[]>([]);
  const [manualMSSV, setManualMSSV] = useState('');
  const [manualCheckinStatus, setManualCheckinStatus] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedRecruitment, setCopiedRecruitment] = useState(false);
  const [showDynamicQR, setShowDynamicQR] = useState(false);
  const [projectorRole, setProjectorRole] = useState<'participant' | 'volunteer' | 'organizer'>('participant');

  useEffect(() => {
    fetchData(true);

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        fetchData(false);
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [resolvedParams.id]);

  const fetchData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const meRes = await fetch('/api/me');
      const meData = await meRes.json();
      if (meData.success && meData.data) {
        setCurrentUser(meData.data);
      } else {
        window.location.replace('/login');
        return;
      }

      const [eventRes, checkinsRes, rolesRes, regRes, ratingRes] = await Promise.all([
        fetch(`/api/events/${resolvedParams.id}`),
        fetch(`/api/events/${resolvedParams.id}/checkins`),
        fetch(`/api/events/${resolvedParams.id}/roles`),
        fetch(`/api/events/${resolvedParams.id}/register`),
        fetch(`/api/events/${resolvedParams.id}/ratings`),
      ]);

      const [eventData, checkinsData, rolesData, regData, ratingData] = await Promise.all([
        eventRes.json().catch(() => ({ success: false })),
        checkinsRes.json().catch(() => ({ success: false })),
        rolesRes.json().catch(() => ({ success: false })),
        regRes.json().catch(() => ({ success: false })),
        ratingRes.json().catch(() => ({ success: false })),
      ]);

      if (eventData.success && eventData.data) {
        setEvent(eventData.data);
        setDepartments(eventData.data.departments || []);
      } else {
        const { data: directEvent } = await supabase
          .from('events')
          .select('*')
          .eq('event_id', resolvedParams.id)
          .single();
        if (directEvent) {
          setEvent(directEvent);
          setDepartments(directEvent.departments || []);
        }
      }

      if (checkinsData.success) {
        setCheckins(checkinsData.data || []);
      }
      if (rolesData.success) {
        setRoles(rolesData.data || []);
      }
      if (regData.success && regData.data?.allRegistrations) {
        setRegistrations(regData.data.allRegistrations || []);
      }
      if (ratingData.success) {
        setRatings(ratingData.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const handleAddDepartment = async () => {
    if (!newDeptName.trim()) {
      alert('Vui lòng nhập tên Ban!');
      return;
    }

    const newDept: EventDepartment = {
      id: `dept_${Date.now()}`,
      name: newDeptName.trim(),
      quota: Number(newDeptQuota) || 5,
      gender_req: newDeptGender,
      description: newDeptDesc.trim(),
    };

    const updatedDepts = [...departments, newDept];
    setDepartments(updatedDepts);
    setNewDeptName('');
    setNewDeptDesc('');
    setShowAddDeptForm(false);

    setSavingDepts(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: updatedDepts }),
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'Lỗi lưu cấu hình Ban');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingDepts(false);
    }
  };

  const handleDeleteDepartment = async (deptId: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa Ban này?')) return;
    const updatedDepts = departments.filter((d) => d.id !== deptId);
    setDepartments(updatedDepts);

    setSavingDepts(true);
    try {
      await fetch(`/api/events/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ departments: updatedDepts }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingDepts(false);
    }
  };

  const handleReviewApplicant = async (mssv: string, review_status: 'accepted' | 'rejected') => {
    setReviewingMssv(mssv);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/registrations/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssv, review_status }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi duyệt hồ sơ');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setReviewingMssv(null);
    }
  };

  const handleBulkReview = async (review_status: 'accepted' | 'rejected') => {
    if (selectedMssvs.length === 0) {
      alert('Vui lòng chọn ít nhất 1 ứng viên để phê duyệt!');
      return;
    }
    const actionName = review_status === 'accepted' ? 'Duyệt trúng tuyển' : 'Từ chối';
    if (!confirm(`Bạn có chắc chắn muốn ${actionName} cho ${selectedMssvs.length} ứng viên đã chọn?`)) return;

    setBulkReviewing(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/registrations/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mssvs: selectedMssvs, review_status }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setSelectedMssvs([]);
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi phê duyệt hàng loạt');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setBulkReviewing(false);
    }
  };

  const handleToggleRecruitment = async () => {
    setTogglingRecruitment(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/toggle-recruitment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi thao tác');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setTogglingRecruitment(false);
    }
  };

  const handleExportCTVExcel = async () => {
    const ctvList = registrations.filter((r) => r.role_type === 'volunteer' || r.department_id);
    if (ctvList.length === 0) {
      alert('Chưa có dữ liệu ứng viên để xuất file!');
      return;
    }

    try {
      const XLSX = await import('xlsx');
      const data = ctvList.map((r, index) => ({
        'STT': index + 1,
        'Mã Số Sinh Viên': r.mssv,
        'Họ Và Tên': r.full_name || '',
        'Lớp Niên Chế': r.class_id || '',
        'Ban Ứng Tuyển': r.department_name || 'Cộng tác viên',
        'Giới Tính': r.gender || 'Nam',
        'Số Điện Thoại / Zalo': r.phone || '',
        'Kỹ Năng / Ghi Chú': r.note || '',
        'Trạng Thái Duyệt': r.review_status === 'accepted' ? 'Trúng Tuyển' : r.review_status === 'rejected' ? 'Từ Chối' : 'Chờ Duyệt',
        'Thời Gian Nộp Đơn': r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const columnWidths = [
        { wch: 6 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 22 },
        { wch: 12 },
        { wch: 18 },
        { wch: 30 },
        { wch: 16 },
        { wch: 22 },
      ];
      worksheet['!cols'] = columnWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Ung_Tuyen_CTV');
      XLSX.writeFile(
        workbook,
        `Danh_Sach_Ung_Tuyen_CTV_${event?.event_name ? event.event_name.replace(/[^a-zA-Z0-9]/g, '_') : 'Su_Kien'}.xlsx`
      );
    } catch (e) {
      console.error(e);
      alert('Lỗi xuất file Excel');
    }
  };

  const handleSubmitEventRating = async () => {
    setSubmittingRating(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stars: ratingStars,
          feedback: ratingFeedback,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã gửi đánh giá thành công!');
        setRatingFeedback('');
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi gửi đánh giá');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleToggleRegistration = async () => {
    if (!event) return;
    const currentWindow = isRegistrationWindowOpen(
      event.event_date,
      event.start_time,
      event.status,
      event.is_registration_open
    );
    const isCurrentlyOpen = currentWindow.isOpen;
    const isExpired = isEventScheduleExpired(event);

    if (!isCurrentlyOpen && isExpired && !isPrivileged) {
      alert(
        'Chương trình đã kết thúc quá 1 giờ và tự động đóng. Cán bộ đơn vị trực thuộc không được phép mở lại cổng đăng ký. Vui lòng liên hệ Super Admin hoặc Đoàn Thanh Niên Học Viện.'
      );
      return;
    }

    const msg = isCurrentlyOpen
      ? 'Bạn có chắc muốn ĐÓNG cổng đăng ký của sự kiện này sớm? (Sinh viên sẽ không thể đăng ký thêm)'
      : 'Bạn có chắc muốn MỞ LẠI cổng đăng ký cho sự kiện này? (Cho phép sinh viên đăng ký bổ sung)';
    if (!confirm(msg)) return;

    setTogglingReg(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/toggle-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ open: !isCurrentlyOpen }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        if (data.data) {
          setEvent(data.data);
        } else {
          setEvent((prev) => (prev ? { ...prev, is_registration_open: !isCurrentlyOpen } : null));
        }
        fetchData(false);
      } else {
        alert(data.error || 'Lỗi thay đổi trạng thái');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setTogglingReg(false);
    }
  };

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return;
    const regUrl = `${window.location.origin}/events/${resolvedParams.id}/register`;
    navigator.clipboard.writeText(regUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyRecruitmentLink = () => {
    if (typeof window === 'undefined') return;
    const recUrl = `${window.location.origin}/events/${resolvedParams.id}/recruitment`;
    navigator.clipboard.writeText(recUrl).then(() => {
      setCopiedRecruitment(true);
      setTimeout(() => setCopiedRecruitment(false), 2000);
    });
  };

  const handleManualCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMSSV.trim()) return;
    setManualCheckinStatus('Đang xử lý...');
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mssv: manualMSSV.trim(),
          event_id: event?.event_id || resolvedParams.id,
          participate_role: 'participant',
          checked_by: `Điểm danh thủ công (${currentUser?.email || 'Super Admin'})`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setManualCheckinStatus(`Thành công: Đã điểm danh cho ${manualMSSV}`);
        setManualMSSV('');
        fetchData();
      } else {
        setManualCheckinStatus(`Lỗi: ${data.message || data.error}`);
      }
    } catch (err: any) {
      setManualCheckinStatus(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleReconcileAttendance = async () => {
    if (!confirm('Xác nhận chốt danh sách điểm danh và tự động xử lý vắng mặt (No-Show)?\n\nSinh viên đã đăng ký nhưng không quét mã sẽ bị tính +1 lần vắng mặt. Nếu đủ 3 lần vắng sẽ tự động bị khóa Blacklist.')) return;
    setReconciling(true);
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/reconcile-attendance`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchData();
      } else {
        alert(data.error || 'Lỗi xử lý điểm danh');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setReconciling(false);
    }
  };

  const addChecker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail) return;
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, role_type: 'checker' }),
      });
      const data = await res.json();
      if (data.success) {
        setNewEmail('');
        fetchData();
      } else {
        alert(data.message || data.error || 'Lỗi thêm checker');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const removeRole = async (roleId: number) => {
    if (!confirm('Bạn có chắc muốn xóa quyền của tài khoản này?')) return;
    try {
      const res = await fetch(`/api/events/${resolvedParams.id}/roles/${roleId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteEvent = async () => {
    if (!event) return;
    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN sự kiện "${event.event_name}"?\n\nToàn bộ dữ liệu điểm danh, đánh giá và phân quyền của sự kiện này sẽ bị xóa hoàn toàn khỏi cơ sở dữ liệu.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/events/${resolvedParams.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`Đã xóa thành công sự kiện "${event.event_name}"!`);
        window.location.href = backTarget;
      } else {
        alert(data.message || data.error || 'Không thể xóa sự kiện');
      }
    } catch (err: any) {
      alert(`Đã xảy ra lỗi: ${err.message || 'Lỗi kết nối'}`);
    }
  };

  const isSuperAdmin = currentUser?.tier === 'super_admin' || Boolean((currentUser as any)?.isSuperAdmin);
  const backTarget = isSuperAdmin ? '/super-admin' : '/admin';

  const isYouthUnion =
    currentUser?.tier === 'youth_union' ||
    Boolean(currentUser?.email?.toLowerCase().includes('doanthanhnien')) ||
    Boolean(currentUser?.email?.toLowerCase().includes('bchdoan'));
  const isPrivileged = isSuperAdmin || isYouthUnion;
  const canBulkImport = isSuperAdmin || isYouthUnion;
  const isEventCreator = Boolean(
    event?.created_by &&
    currentUser?.email &&
    event.created_by.toLowerCase() === currentUser.email.toLowerCase()
  );
  const hasEventRole = currentUser?.managed_events?.some(
    (e: any) => e.event_id === resolvedParams.id
  ) || roles?.some(
    (r: any) => r.email?.toLowerCase() === currentUser?.email?.toLowerCase()
  );

  // Authorization: super admin, youth union, event creator, assigned role or officer can view
  const hasEventAccess = isSuperAdmin || isYouthUnion || isPrivileged || isEventCreator || hasEventRole || Boolean(currentUser?.isEventAdmin) || (currentUser?.tier && currentUser?.tier !== 'user');

  const handleToggleEventStatus = async () => {
    if (!event) return;
    const newStatus = event.status === 'active' ? 'closed' : 'active';
    const isPast = isEventPastDeadline(event);

    if (newStatus === 'active' && isPast && !isPrivileged) {
      alert('Chương trình đã kết thúc quá 1 giờ và tự động đóng. Cán bộ đơn vị trực thuộc không được phép tự mở lại. Vui lòng liên hệ Super Admin hoặc Đoàn Thanh Niên Học Viện để được hỗ trợ.');
      return;
    }

    const actionText = newStatus === 'active' ? 'MỞ LẠI' : 'ĐÓNG';
    if (!confirm(`Xác nhận ${actionText} sự kiện "${event.event_name}"?`)) return;

    try {
      const res = await fetch(`/api/events/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setEvent(data.data);
        alert(`Đã ${actionText.toLowerCase()} sự kiện thành công!`);
      } else {
        alert(data.error || data.message || 'Lỗi cập nhật trạng thái sự kiện');
      }
    } catch (err: any) {
      alert(`Lỗi: ${err.message || 'Lỗi kết nối'}`);
    }
  };

  if (loading || !event) {
    return (
      <div className={styles.container}>
        <Header userName="Admin Sự Kiện" showBack backHref={backTarget} />
        <main className={styles.main}>
          <div className={styles.loading}>Đang tải thông tin sự kiện...</div>
        </main>
      </div>
    );
  }

  if (!hasEventAccess) {
    return (
      <div className={styles.container}>
        <Header userName={currentUser?.full_name || 'Admin'} showBack backHref={backTarget} title="KHÔNG CÓ QUYỀN" />
        <main className={styles.main}>
          <div style={{
            textAlign: 'center',
            padding: '3rem 1.5rem',
            background: '#fff1f2',
            borderRadius: '16px',
            border: '1.5px solid #fecaca',
            color: '#b91c1c',
          }}>
            <p style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>⛔ Bạn không có quyền xem sự kiện này</p>
            <p style={{ fontSize: '0.875rem', margin: 0, color: '#64748b' }}>Chỉ Super Admin, Đoàn Học Viện hoặc đơn vị tạo sự kiện mới có quyền truy cập.</p>
          </div>
        </main>
      </div>
    );
  }

  const stats = {
    participant: checkins.filter(c => c.participate_role === 'Người tham gia').length,
    volunteer: checkins.filter(c => c.participate_role === 'Cộng tác viên').length,
    organizer: checkins.filter(c => c.participate_role === 'Ban tổ chức').length,
  };

  const regUrl = typeof window !== 'undefined' ? `${window.location.origin}/events/${event.event_id}/register` : `/events/${event.event_id}/register`;

  const userTier = currentUser?.tier || 'user';
  const userEmail = currentUser?.email || '';
  const isApproverRole =
    userTier === 'youth_union' ||
    userTier === 'ctsv' ||
    userTier === 'facility' ||
    userTier === 'super_admin' ||
    userEmail.includes('doanthanhnien') ||
    userEmail.includes('ctsv') ||
    userEmail.includes('quantri') ||
    userEmail.includes('csvc') ||
    userEmail.includes('superadmin');

  return (
    <div className={styles.container}>
      <Header userName={currentUser?.full_name || 'Admin Sự Kiện'} showBack backHref={backTarget} title="CHI TIẾT SỰ KIỆN" />
      <main className={styles.main}>
        <div className={styles.breadcrumb}>
          <Link href={backTarget} className={styles.backLink}>
            <ArrowLeftIcon size={16} />
            <span>{isSuperAdmin ? 'Quay lại Bàn Quản Trị Toàn Trường' : 'Quay lại Danh Sách Sự Kiện'}</span>
          </Link>
        </div>

        <div className={styles.headerArea}>
          <h1 className={styles.title}>{event.event_name}</h1>
          <p className={styles.subtitle}>
            <ClockIcon size={16} />
            {event.event_date ? new Date(event.event_date).toLocaleDateString('vi-VN') : 'Hôm nay'}
            {event.start_time && ` (${event.start_time.slice(0, 5)} - ${event.end_time ? event.end_time.slice(0, 5) : '22:00'})`}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            {(() => {
              const lifecycleState = getEventLifecycleState(event);
              const earliestTime = getEarliestCheckinTime(event, 15);

              if (lifecycleState === 'upcoming') {
                return (
                  <span
                    style={{
                      color: '#b45309',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: '#fef3c7',
                      border: '1.5px solid #fde68a',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '10px',
                    }}
                  >
                    <span>⏳ Sắp diễn ra (Mở điểm danh lúc {earliestTime || 'trước 15p'})</span>
                  </span>
                );
              }

              if (lifecycleState === 'active') {
                return (
                  <span
                    style={{
                      color: '#15803d',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: '#dcfce7',
                      border: '1.5px solid #86efac',
                      padding: '0.35rem 0.85rem',
                      borderRadius: '10px',
                    }}
                  >
                    <span>● Đang mở điểm danh</span>
                  </span>
                );
              }

              return (
                <span
                  style={{
                    color: '#dc2626',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: '#fee2e2',
                    border: '1.5px solid #fca5a5',
                    padding: '0.35rem 0.85rem',
                    borderRadius: '10px',
                  }}
                >
                  <span>● Đã đóng sự kiện</span>
                </span>
              );
            })()}
            {event.status === 'active' ? (
              <button
                type="button"
                onClick={handleToggleEventStatus}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '8px',
                  border: '1.5px solid #fca5a5',
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                🔒 Đóng Sự Kiện
              </button>
            ) : isPrivileged ? (
              <button
                type="button"
                onClick={handleToggleEventStatus}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '8px',
                  border: '1.5px solid #86efac',
                  background: '#f0fdf4',
                  color: '#15803d',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                🔓 Mở Lại Sự Kiện
              </button>
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '8px',
                  border: '1.5px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#64748b',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
                title="Sự kiện tự động đóng sau 1 giờ. Chỉ Super Admin và Đoàn Thanh Niên mới có quyền mở lại."
              >
                🔒 Đã tự động đóng (Liên hệ Đoàn TN để mở lại)
              </span>
            )}
          </div>

          {event.status === 'active' && (() => {
            const regWindow = isRegistrationWindowOpen(
              event.event_date,
              event.start_time,
              event.status,
              event.is_registration_open
            );
            const isExpired = isEventScheduleExpired(event);

            return (
              <div
                style={{
                  marginTop: '1.25rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                  gap: '1.25rem',
                }}
              >
                {/* 1. CỔNG LINK ĐĂNG KÝ KHÁN GIẢ */}
                <div
                  style={{
                    background: '#ffffff',
                    border: `1.5px solid ${regWindow.isOpen ? '#bfdbfe' : '#e2e8f0'}`,
                    borderRadius: '16px',
                    padding: '1.5rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1.25rem',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: regWindow.isOpen ? 'linear-gradient(90deg, #2563eb, #3b82f6)' : '#94a3b8' }} />

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1e3a8a', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                        Cổng Đăng Ký Khán Giả
                      </span>
                      <span
                        style={{
                          padding: '0.2rem 0.65rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: regWindow.isOpen ? '#dcfce7' : '#fee2e2',
                          color: regWindow.isOpen ? '#15803d' : '#b91c1c',
                          border: `1px solid ${regWindow.isOpen ? '#86efac' : '#fca5a5'}`,
                        }}
                      >
                        {regWindow.isOpen ? '● Đang mở đăng ký' : '● Đã đóng cổng'}
                      </span>
                    </div>

                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
                      {registrations.filter((r) => r.role_type !== 'volunteer' && !r.department_id).length}{' '}
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>sinh viên đăng ký</span>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b', lineHeight: 1.5, minHeight: '38px' }}>
                      Dành cho sinh viên toàn trường đăng ký tham gia sự kiện nhận điểm rèn luyện.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {/* Primary Full-width Copy Button */}
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      style={{
                        width: '100%',
                        height: '42px',
                        background: copied ? '#16a34a' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{copied ? '✓ Đã sao chép link Khán giả' : 'Sao Chép Link Khán Giả'}</span>
                    </button>

                    {/* Secondary Actions Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <a
                        href={`/events/${event.event_id}/register`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          height: '36px',
                          background: '#ffffff',
                          color: '#2563eb',
                          border: '1.5px solid #bfdbfe',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <span>Mở Trang</span>
                        <span>↗</span>
                      </a>

                      {regWindow.isOpen ? (
                        <button
                          type="button"
                          onClick={handleToggleRegistration}
                          disabled={togglingReg}
                          style={{
                            height: '36px',
                            background: '#fffbeb',
                            color: '#b45309',
                            border: '1.5px solid #fde68a',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {togglingReg ? 'Đang xử lý...' : 'Tắt Cổng'}
                        </button>
                      ) : (!isExpired || isPrivileged) ? (
                        <button
                          type="button"
                          onClick={handleToggleRegistration}
                          disabled={togglingReg}
                          style={{
                            height: '36px',
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1.5px solid #bbf7d0',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          {togglingReg ? 'Đang xử lý...' : 'Mở Lại Cổng'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* 2. CỔNG LINK TUYỂN DỤNG BAN CHUYÊN TRÁCH & CTV */}
                <div
                  style={{
                    background: '#ffffff',
                    border: `1.5px solid ${event.is_recruitment_open !== false ? '#99f6e4' : '#e2e8f0'}`,
                    borderRadius: '16px',
                    padding: '1.5rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '1.25rem',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: event.is_recruitment_open !== false ? 'linear-gradient(90deg, #0d9488, #14b8a6)' : '#94a3b8' }} />

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0f766e', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                        Cổng Tuyển Ban Chuyên Trách & CTV
                      </span>
                      <span
                        style={{
                          padding: '0.2rem 0.65rem',
                          borderRadius: '12px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: event.is_recruitment_open !== false ? '#dcfce7' : '#fee2e2',
                          color: event.is_recruitment_open !== false ? '#15803d' : '#b91c1c',
                          border: `1px solid ${event.is_recruitment_open !== false ? '#86efac' : '#fca5a5'}`,
                        }}
                      >
                        {event.is_recruitment_open !== false ? '● Đang mở tuyển' : '● Đã đóng cổng'}
                      </span>
                    </div>

                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
                      {departments.length} Ban{' '}
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                        ({registrations.filter((r) => r.role_type === 'volunteer' || r.department_id).length} đơn ứng tuyển)
                      </span>
                    </div>

                    <p style={{ margin: 0, fontSize: '0.825rem', color: '#64748b', lineHeight: 1.5, minHeight: '38px' }}>
                      Dành cho sinh viên nộp đơn ứng tuyển vào các Ban theo chỉ tiêu và giới tính.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {/* Primary Full-width Copy Button */}
                    <button
                      type="button"
                      onClick={handleCopyRecruitmentLink}
                      style={{
                        width: '100%',
                        height: '42px',
                        background: copiedRecruitment ? '#16a34a' : 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{copiedRecruitment ? '✓ Đã sao chép link Tuyển CTV' : 'Sao Chép Link Tuyển CTV'}</span>
                    </button>

                    {/* Secondary Actions Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
                      <a
                        href={`/events/${event.event_id}/recruitment`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          height: '36px',
                          background: '#ffffff',
                          color: '#0f766e',
                          border: '1.5px solid #99f6e4',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.775rem',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.2rem',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span>Mở Trang</span>
                        <span>↗</span>
                      </a>

                      <button
                        type="button"
                        onClick={handleToggleRecruitment}
                        disabled={togglingRecruitment}
                        style={{
                          height: '36px',
                          background: event.is_recruitment_open !== false ? '#fffbeb' : '#f0fdf4',
                          color: event.is_recruitment_open !== false ? '#b45309' : '#15803d',
                          border: `1.5px solid ${event.is_recruitment_open !== false ? '#fde68a' : '#bbf7d0'}`,
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.775rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {togglingRecruitment
                          ? '...'
                          : event.is_recruitment_open !== false
                          ? 'Đóng Cổng'
                          : 'Mở Cổng'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('recruitment');
                          setTimeout(() => {
                            const el = document.getElementById('event-tabs-container');
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }, 50);
                        }}
                        style={{
                          height: '36px',
                          background: '#f0fdfa',
                          color: '#0f766e',
                          border: '1.5px solid #99f6e4',
                          borderRadius: '8px',
                          fontWeight: 700,
                          fontSize: '0.775rem',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Duyệt Ban ➔
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          <div style={{ marginTop: '1.25rem', padding: '1.25rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem 0' }}>
                  Màn hình Chiếu Mã QR Động (Máy chiếu / Hội trường)
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Chọn vai trò trước khi chiếu để phát mã QR tương ứng lên màn hình lớn:
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    setProjectorRole('participant');
                    setShowDynamicQR(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(22, 163, 74, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} />
                  Chiếu QR: Người tham gia
                </button>

                <button
                  onClick={() => {
                    setProjectorRole('volunteer');
                    setShowDynamicQR(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} />
                  Chiếu QR: Cộng tác viên (CTV)
                </button>

                <button
                  onClick={() => {
                    setProjectorRole('organizer');
                    setShowDynamicQR(true);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} />
                  Chiếu QR: Ban tổ chức (BTC)
                </button>
              </div>
            </div>
          </div>
        </div>

        {event.status === 'active' && (
          <DynamicEventQRModal
            eventId={event.event_id}
            eventName={event.event_name}
            targetRole={projectorRole}
            isOpen={showDynamicQR}
            onClose={() => setShowDynamicQR(false)}
          />
        )}

        {/* Stat Cards (Always visible for grading and fraud verification) */}
        <div className={styles.statsGrid}>
          <StatCard
            title="Người tham gia"
            value={stats.participant}
            color="success"
            icon={<CheckCircleIcon size={20} />}
            subtitle="Sinh viên đã quét mã"
          />
          <StatCard
            title="Cộng tác viên"
            value={stats.volunteer}
            color="warning"
            icon={<UsersIcon size={20} />}
            subtitle="Hỗ trợ tổ chức"
          />
          <StatCard
            title="Ban tổ chức"
            value={stats.organizer}
            color="primary"
            icon={<ShieldCheckIcon size={20} />}
            subtitle="Điều phối chương trình"
          />
        </div>

        {/* Quản lý CTV Quét Mã (Checker) */}
        {(isPrivileged || isEventCreator) && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <UsersIcon size={20} color="#2563eb" />
              Quản lý Cộng tác viên quét mã (Checker)
            </h2>
          </div>
          <form onSubmit={addChecker} className={styles.addForm}>
            <input 
              type="email" 
              placeholder="Nhập email sinh viên (@student.ptithcm.edu.vn)..." 
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={styles.input}
              required
            />
            <button type="submit" className={styles.button}>Thêm CTV Quét Mã</button>
          </form>

          <ul className={styles.roleList}>
            {roles.filter(r => r.role_type === 'checker').length === 0 ? (
              <li className={styles.emptyList}>Chưa có checker nào được gán cho sự kiện này.</li>
            ) : (
              roles.filter(r => r.role_type === 'checker').map(role => (
                <li key={role.id} className={styles.roleItem}>
                  <span className={styles.roleEmail}>{role.email}</span>
                  <button onClick={() => removeRole(role.id)} className={styles.deleteButton} title="Xóa quyền">
                    Xóa quyền
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>
        )}

        {/* Bổ sung điểm danh thủ công (Đoàn Học Viện & Super Admin) */}
        {isPrivileged && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Bổ sung điểm danh thủ công (Đoàn Học Viện / Super Admin)</h2>
            </div>
            <form onSubmit={handleManualCheckin} className={styles.addForm} style={{ marginBottom: '1rem' }}>
              <input 
                type="text" 
                placeholder="Nhập MSSV cần điểm danh..." 
                value={manualMSSV}
                onChange={(e) => setManualMSSV(e.target.value)}
                className={styles.input}
                required
              />
              <button type="submit" className={styles.button}>Điểm danh</button>
            </form>
            {manualCheckinStatus && (
              <div style={{ color: manualCheckinStatus.startsWith('Lỗi') ? '#dc2626' : '#16a34a', fontSize: '0.9rem', fontWeight: 600 }}>
                {manualCheckinStatus}
              </div>
            )}
          </section>
        )}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.tabContainer} id="event-tabs-container">
              <button
                type="button"
                onClick={() => setActiveTab('checkins')}
                className={`${styles.tabButton} ${activeTab === 'checkins' ? styles.tabButtonActive : styles.tabButtonInactive}`}
              >
                ✓ Đã Điểm Danh ({checkins.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('registrations')}
                className={`${styles.tabButton} ${activeTab === 'registrations' ? styles.tabButtonActive : styles.tabButtonInactive}`}
              >
                Danh Sách Đăng Ký ({registrations.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('recruitment')}
                className={`${styles.tabButton} ${activeTab === 'recruitment' ? styles.tabButtonActive : styles.tabButtonInactive}`}
                style={activeTab === 'recruitment' ? { background: '#0d9488', borderColor: '#0d9488', color: '#ffffff' } : {}}
              >
                Tuyển Dụng & CTV ({departments.length} Ban • {registrations.filter(r => r.role_type === 'volunteer' || r.department_id).length} đơn)
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('noshow')}
                className={`${styles.tabButton} ${activeTab === 'noshow' ? styles.tabButtonActive : styles.tabButtonInactive}`}
              >
                Chưa Điểm Danh ({registrations.filter(r => !r.attended).length})
              </button>

              {(isApproverRole || ratings.length > 0) && (
                <button
                  type="button"
                  onClick={() => setActiveTab('ratings')}
                  className={`${styles.tabButton} ${activeTab === 'ratings' ? styles.tabButtonActive : styles.tabButtonInactive}`}
                >
                  {isApproverRole
                    ? `Đánh Giá Sự Kiện (${ratings.length})`
                    : `Nhận Xét Từ Phòng Ban (${ratings.length})`}
                </button>
              )}
            </div>

            {activeTab === 'checkins' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                {canBulkImport && (
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1.5px solid #bfdbfe',
                      borderRadius: '8px',
                      padding: '0.5rem 0.9rem',
                      fontSize: '0.825rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <UploadCloudIcon size={16} />
                    <span>Nạp danh sách MSSV</span>
                  </button>
                )}
                <div className={styles.excelExportWrapper}>
                  <ExcelExportButton
                    fetchUrl={`/api/events/${resolvedParams.id}/checkins`}
                    filename={`DiemDanh_${event.event_name.replace(/\s+/g, '_')}`}
                    label="Xuất File Excel"
                  />
                </div>
              </div>
            )}
          </div>

          {activeTab === 'checkins' ? (
            <DataTable 
              columns={[
                {
                  key: 'stt',
                  label: 'STT',
                  render: (_val: any, _row: any, index?: number) => (
                    <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>
                      {(index ?? 0) + 1}
                    </span>
                  ),
                },
                {
                  key: 'mssv',
                  label: 'MSSV',
                  render: (val: string) => (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: '#1e40af',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {val}
                    </span>
                  ),
                },
                {
                  key: 'full_name',
                  label: 'Họ và tên',
                  render: (val: string) => (
                    <span style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {val || '—'}
                    </span>
                  ),
                },
                {
                  key: 'class_id',
                  label: 'Lớp',
                  render: (val: string) => (
                    <span style={{ color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {val || '—'}
                    </span>
                  ),
                },
                {
                  key: 'participate_role',
                  label: 'Vai trò',
                  render: (val: string) => {
                    const isVol = val === 'Cộng tác viên' || val === 'volunteer';
                    const isOrg = val === 'Ban tổ chức' || val === 'organizer';
                    const bg = isOrg ? '#fffbeb' : isVol ? '#f5f3ff' : '#ecfdf5';
                    const color = isOrg ? '#b45309' : isVol ? '#6d28d9' : '#047857';
                    const border = isOrg ? '#fde68a' : isVol ? '#ddd6fe' : '#a7f3d0';
                    const label = isOrg ? 'Ban tổ chức' : isVol ? 'Cộng tác viên' : 'Người tham gia';
                    return (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    );
                  },
                },
                {
                  key: 'checked_by',
                  label: 'Hình thức / Người quét',
                  render: (val: string) => {
                    const raw = String(val || '').trim();
                    const isManual = raw.includes('thủ công') || raw.includes('manual');
                    const isOnlineReg = raw.includes('Đăng Ký Trực Tuyến') || raw.includes('Cổng Đăng Ký');
                    const isSelf = raw.includes('Tự quét') || raw.includes('QR Động') || raw.includes('self');
                    const isEmail = raw.includes('@');

                    if (isManual) {
                      const manualBy = raw.includes('(') ? raw.replace('Điểm danh thủ công', '').replace(/[()]/g, '').trim() : '';
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#faf5ff',
                            border: '1px solid #e9d5ff',
                            color: '#7e22ce',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                          title={raw}
                        >
                          <ShieldCheckIcon size={14} color="#7e22ce" />
                          <span>{manualBy ? `Thủ công: ${manualBy.split('@')[0]}` : 'Điểm danh thủ công'}</span>
                        </span>
                      );
                    }

                    if (isOnlineReg) {
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#f0f9ff',
                            border: '1px solid #bae6fd',
                            color: '#0369a1',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                          title={raw}
                        >
                          <UsersIcon size={14} color="#0369a1" />
                          <span>Đăng ký trực tuyến</span>
                        </span>
                      );
                    }

                    if (isEmail) {
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            color: '#15803d',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                          title={raw}
                        >
                          <UserIcon size={14} color="#15803d" />
                          <span>{raw}</span>
                        </span>
                      );
                    }

                    if (isSelf) {
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#1d4ed8',
                            padding: '3px 9px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <QrCodeIcon size={14} color="#2563eb" />
                          <span>Sinh viên tự quét QR</span>
                        </span>
                      );
                    }

                    return (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          color: '#475569',
                          padding: '3px 9px',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {raw || '—'}
                      </span>
                    );
                  },
                },
                {
                  key: 'checkin_time',
                  label: 'Thời gian quét',
                  render: (val: string) => {
                    if (!val) return '—';
                    try {
                      const d = new Date(val);
                      return (
                        <span
                          style={{
                            color: '#1e293b',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}{' '}
                          <span style={{ color: '#94a3b8', fontWeight: 400 }}>•</span>{' '}
                          {d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      );
                    } catch {
                      return val;
                    }
                  },
                },
              ]}
              data={checkins}
              searchable
              searchPlaceholder="Tìm kiếm theo MSSV, Họ tên, Lớp..."
              emptyMessage="Chưa có lượt điểm danh nào cho sự kiện này."
            />
          ) : activeTab === 'registrations' ? (
            <DataTable 
              columns={[
                {
                  key: 'mssv',
                  label: 'MSSV',
                  render: (val: string) => (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: '#1e40af',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {val}
                    </span>
                  ),
                },
                {
                  key: 'full_name',
                  label: 'Họ và tên',
                  render: (val: string) => (
                    <span style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {val || '—'}
                    </span>
                  ),
                },
                {
                  key: 'class_id',
                  label: 'Lớp',
                  render: (val: string) => (
                    <span style={{ color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {val || '—'}
                    </span>
                  ),
                },
                {
                  key: 'role_type',
                  label: 'Vai trò đăng ký',
                  render: (val: string) => {
                    const isVol = val === 'Cộng tác viên' || val === 'volunteer';
                    const isOrg = val === 'Ban tổ chức' || val === 'organizer';
                    const bg = isOrg ? '#fffbeb' : isVol ? '#f5f3ff' : '#ecfdf5';
                    const color = isOrg ? '#b45309' : isVol ? '#6d28d9' : '#047857';
                    const border = isOrg ? '#fde68a' : isVol ? '#ddd6fe' : '#a7f3d0';
                    const label = isOrg ? 'Ban tổ chức' : isVol ? 'Cộng tác viên' : 'Người tham gia';
                    return (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    );
                  },
                },
                {
                  key: 'attended',
                  label: 'Trạng thái tham gia',
                  render: (val: boolean) =>
                    val ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          background: '#ecfdf5',
                          color: '#16a34a',
                          border: '1px solid #a7f3d0',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✓ Đã có mặt
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          background: '#fef2f2',
                          color: '#dc2626',
                          border: '1px solid #fecaca',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ✕ Chưa điểm danh
                      </span>
                    ),
                },
                {
                  key: 'created_at',
                  label: 'Ngày đăng ký',
                  render: (val: string) => {
                    if (!val) return '—';
                    const d = new Date(val);
                    return (
                      <span style={{ color: '#475569', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                        {d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}{' '}
                        <span style={{ color: '#cbd5e1' }}>•</span>{' '}
                        {d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                    );
                  },
                },
              ]}
              data={registrations}
              searchable
              searchPlaceholder="Tìm kiếm trong danh sách đăng ký..."
              emptyMessage="Chưa có sinh viên nào đăng ký sự kiện này."
            />
          ) : activeTab === 'recruitment' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* 1. CẤU HÌNH CÁC BAN CHUYÊN TRÁCH */}
              <div
                style={{
                  background: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '16px',
                  padding: '1.5rem',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                        Cấu hình Ban Chuyên Trách & Tuyển Dụng CTV
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '12px',
                          background: event.is_recruitment_open !== false ? '#dcfce7' : '#fee2e2',
                          color: event.is_recruitment_open !== false ? '#15803d' : '#b91c1c',
                          border: `1px solid ${event.is_recruitment_open !== false ? '#86efac' : '#fca5a5'}`,
                        }}
                      >
                        {event.is_recruitment_open !== false ? '● Cổng CTV đang mở' : '● Cổng CTV đã đóng'}
                      </span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                      Thiết lập các Ban, chỉ tiêu số lượng và tiêu chuẩn Nam/Nữ để ứng viên nộp đơn.
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={handleToggleRecruitment}
                      disabled={togglingRecruitment}
                      style={{
                        height: '38px',
                        padding: '0 1rem',
                        background: event.is_recruitment_open !== false ? '#fffbeb' : '#f0fdf4',
                        color: event.is_recruitment_open !== false ? '#b45309' : '#15803d',
                        border: `1.5px solid ${event.is_recruitment_open !== false ? '#fde68a' : '#bbf7d0'}`,
                        borderRadius: '10px',
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      {togglingRecruitment
                        ? 'Đang xử lý...'
                        : event.is_recruitment_open !== false
                        ? 'Đóng Cổng Tuyển CTV'
                        : 'Mở Lại Cổng Tuyển CTV'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowAddDeptForm(!showAddDeptForm)}
                      style={{
                        height: '38px',
                        padding: '0 1.25rem',
                        background: showAddDeptForm ? '#f1f5f9' : 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                        color: showAddDeptForm ? '#475569' : '#ffffff',
                        border: showAddDeptForm ? '1.5px solid #cbd5e1' : 'none',
                        borderRadius: '10px',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: showAddDeptForm ? 'none' : '0 2px 6px rgba(13, 148, 136, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <span>{showAddDeptForm ? 'Đóng Form' : '+ Thêm Ban Mới'}</span>
                    </button>
                  </div>
                </div>

                {/* Form thêm Ban mới */}
                {showAddDeptForm && (
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #cbd5e1',
                      borderRadius: '14px',
                      padding: '1.25rem',
                      marginBottom: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                        Tạo Ban Chuyên Trách Mới
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddDeptForm(false)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 }}
                      >
                        ✕
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                          Tên Ban / Vị trí <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="text"
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          placeholder="VD: Ban Hậu Cần, Ban Truyền Thông..."
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.75rem',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            boxSizing: 'border-box',
                            fontSize: '0.85rem',
                            background: '#ffffff',
                            fontWeight: 600,
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                          Chỉ tiêu (Số người) <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={newDeptQuota}
                          onChange={(e) => setNewDeptQuota(Number(e.target.value) || 1)}
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.75rem',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            boxSizing: 'border-box',
                            fontSize: '0.85rem',
                            background: '#ffffff',
                            fontWeight: 600,
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                          Yêu cầu Giới tính
                        </label>
                        <select
                          value={newDeptGender}
                          onChange={(e) => setNewDeptGender(e.target.value as any)}
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.75rem',
                            border: '1.5px solid #cbd5e1',
                            borderRadius: '8px',
                            background: '#ffffff',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                          }}
                        >
                          <option value="all">Tất cả (Nam & Nữ)</option>
                          <option value="male">Chỉ tuyển Nam</option>
                          <option value="female">Chỉ tuyển Nữ</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
                        Mô tả nhiệm vụ & Tiêu chí tuyển chọn
                      </label>
                      <input
                        type="text"
                        value={newDeptDesc}
                        onChange={(e) => setNewDeptDesc(e.target.value)}
                        placeholder="VD: Phụ trách setup âm thanh, đạo cụ hoặc chụp ảnh sự kiện..."
                        style={{
                          width: '100%',
                          padding: '0.6rem 0.75rem',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '8px',
                          boxSizing: 'border-box',
                          fontSize: '0.85rem',
                          background: '#ffffff',
                          fontWeight: 500,
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => setShowAddDeptForm(false)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#ffffff',
                          border: '1.5px solid #cbd5e1',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: 700,
                          color: '#475569',
                          cursor: 'pointer',
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={handleAddDepartment}
                        disabled={savingDepts}
                        style={{
                          padding: '0.5rem 1.25rem',
                          background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(13, 148, 136, 0.25)',
                        }}
                      >
                        {savingDepts ? 'Đang lưu...' : 'Lưu Ban Mới'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Danh sách các Ban hiện có */}
                {departments.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem', margin: '1rem 0' }}>
                    Chưa có Ban chuyên trách nào được cấu hình cho sự kiện này.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {departments.map((dept) => {
                      const count = registrations.filter((r) => r.department_id === dept.id).length;
                      const acceptedCount = registrations.filter((r) => r.department_id === dept.id && r.review_status === 'accepted').length;
                      return (
                        <div
                          key={dept.id}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '0.85rem',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                          }}
                        >
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                              <span style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.9rem' }}>
                                {dept.name}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '10px',
                                  background: dept.gender_req === 'male' ? '#dbeafe' : dept.gender_req === 'female' ? '#fce7f3' : '#dcfce7',
                                  color: dept.gender_req === 'male' ? '#1e40af' : dept.gender_req === 'female' ? '#be185d' : '#166534',
                                }}
                              >
                                {dept.gender_req === 'male' ? 'Nam' : dept.gender_req === 'female' ? 'Nữ' : 'Nam & Nữ'}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.775rem', color: '#64748b', marginBottom: '0.25rem' }}>
                              Chỉ tiêu: <strong>{acceptedCount}/{dept.quota} bạn</strong> ({count} đơn nộp)
                            </div>
                            {dept.description && (
                              <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.3 }}>
                                {dept.description}
                              </p>
                            )}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.35rem', borderTop: '1px dashed #f1f5f9' }}>
                            <button
                              type="button"
                              onClick={() => handleDeleteDepartment(dept.id)}
                              style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                            >
                              Xóa Ban
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 2. DANH SÁCH ỨNG VIÊN TUYỂN DỤNG & BULK ACTION BAR */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    Danh Sách Đơn Ứng Tuyển Ban Chuyên Trách ({registrations.filter((r) => r.role_type === 'volunteer' || r.department_id).length})
                  </h3>

                  <button
                    type="button"
                    onClick={handleExportCTVExcel}
                    style={{
                      padding: '0.45rem 0.9rem',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>Xuất File Excel (DS CTV)</span>
                  </button>
                </div>

                {/* Bulk Action Bar when items are selected */}
                {selectedMssvs.length > 0 && (
                  <div
                    style={{
                      background: '#1e293b',
                      color: '#ffffff',
                      padding: '0.75rem 1.25rem',
                      borderRadius: '12px',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    <span style={{ fontSize: '0.875rem', fontWeight: 700 }}>
                      Đã chọn: <strong style={{ color: '#60a5fa' }}>{selectedMssvs.length}</strong> ứng viên
                    </span>

                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleBulkReview('accepted')}
                        disabled={bulkReviewing}
                        style={{
                          padding: '0.4rem 0.85rem',
                          background: '#16a34a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {bulkReviewing ? 'Đang duyệt...' : `Duyệt Trúng Tuyển (${selectedMssvs.length})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBulkReview('rejected')}
                        disabled={bulkReviewing}
                        style={{
                          padding: '0.4rem 0.85rem',
                          background: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {bulkReviewing ? 'Đang xử lý...' : `Từ Chối (${selectedMssvs.length})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedMssvs([])}
                        style={{
                          padding: '0.4rem 0.65rem',
                          background: '#475569',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>
                )}

                <DataTable
                  columns={[
                    {
                      key: 'select',
                      label: (
                        <input
                          type="checkbox"
                          checked={
                            registrations.filter((r) => r.role_type === 'volunteer' || r.department_id).length > 0 &&
                            selectedMssvs.length === registrations.filter((r) => r.role_type === 'volunteer' || r.department_id).length
                          }
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMssvs(
                                registrations
                                  .filter((r) => r.role_type === 'volunteer' || r.department_id)
                                  .map((r) => r.mssv)
                              );
                            } else {
                              setSelectedMssvs([]);
                            }
                          }}
                        />
                      ),
                      render: (_val: any, row: any) => (
                        <input
                          type="checkbox"
                          checked={selectedMssvs.includes(row.mssv)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedMssvs((prev) => [...prev, row.mssv]);
                            } else {
                              setSelectedMssvs((prev) => prev.filter((m) => m !== row.mssv));
                            }
                          }}
                        />
                      ),
                    },
                    {
                      key: 'stt',
                      label: 'STT',
                      render: (_val: any, _row: any, index?: number) => (
                        <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>
                          {(index ?? 0) + 1}
                        </span>
                      ),
                    },
                    {
                      key: 'mssv',
                      label: 'MSSV',
                      render: (val: string) => (
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: '6px', fontSize: '0.85rem' }}>
                          {val}
                        </span>
                      ),
                    },
                    {
                      key: 'full_name',
                      label: 'Họ và tên',
                      render: (val: string) => <span style={{ fontWeight: 600, color: '#0f172a' }}>{val || '—'}</span>,
                    },
                    {
                      key: 'class_id',
                      label: 'Lớp',
                      render: (val: string) => <span style={{ color: '#475569', fontWeight: 500 }}>{val || '—'}</span>,
                    },
                    {
                      key: 'department_name',
                      label: 'Ban Ứng Tuyển',
                      render: (val: string) => (
                        <span style={{ fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: '6px', fontSize: '0.8rem' }}>
                          {val || 'Ban CTV'}
                        </span>
                      ),
                    },
                    {
                      key: 'gender',
                      label: 'Giới tính',
                      render: (val: string) => (
                        <span style={{ fontWeight: 600, color: val === 'Nam' ? '#1d4ed8' : '#be185d' }}>
                          {val || 'Nam'}
                        </span>
                      ),
                    },
                    {
                      key: 'phone',
                      label: 'SĐT / Zalo',
                      render: (val: string) => (
                        <span style={{ fontFamily: 'monospace', color: '#0f172a', fontWeight: 600 }}>
                          {val || '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'note',
                      label: 'Ghi chú / Kỹ năng',
                      render: (val: string) => (
                        <span style={{ fontSize: '0.8rem', color: '#475569', maxWidth: '200px', display: 'inline-block' }}>
                          {val || 'Không có ghi chú'}
                        </span>
                      ),
                    },
                    {
                      key: 'review_status',
                      label: 'Trạng Thái',
                      render: (val: string) => {
                        const status = val || 'pending';
                        const bg = status === 'accepted' ? '#dcfce7' : status === 'rejected' ? '#fee2e2' : '#fef3c7';
                        const color = status === 'accepted' ? '#15803d' : status === 'rejected' ? '#b91c1c' : '#b45309';
                        const label = status === 'accepted' ? 'Trúng Tuyển' : status === 'rejected' ? 'Từ Chối' : 'Chờ Duyệt';
                        return (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, background: bg, color }}>
                            {label}
                          </span>
                        );
                      },
                    },
                    {
                      key: 'actions',
                      label: 'Phê Duyệt',
                      render: (_val: any, row: any) => (
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            onClick={() => handleReviewApplicant(row.mssv, 'accepted')}
                            disabled={reviewingMssv === row.mssv || row.review_status === 'accepted'}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: row.review_status === 'accepted' ? '#e2e8f0' : '#16a34a',
                              color: row.review_status === 'accepted' ? '#94a3b8' : '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: row.review_status === 'accepted' ? 'default' : 'pointer',
                            }}
                          >
                            Duyệt
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReviewApplicant(row.mssv, 'rejected')}
                            disabled={reviewingMssv === row.mssv || row.review_status === 'rejected'}
                            style={{
                              padding: '0.25rem 0.5rem',
                              background: row.review_status === 'rejected' ? '#e2e8f0' : '#ef4444',
                              color: row.review_status === 'rejected' ? '#94a3b8' : '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: row.review_status === 'rejected' ? 'default' : 'pointer',
                            }}
                          >
                            Từ chối
                          </button>
                        </div>
                      ),
                    },
                  ]}
                  data={registrations.filter((r) => r.role_type === 'volunteer' || r.department_id)}
                  searchable
                  searchPlaceholder="Tìm kiếm ứng viên, MSSV, SĐT..."
                  emptyMessage="Chưa có ứng viên nào nộp đơn ứng tuyển."
                />
              </div>
            </div>
          ) : activeTab === 'noshow' ? (
            <DataTable 
              columns={[
                {
                  key: 'stt',
                  label: 'STT',
                  render: (_val: any, _row: any, index?: number) => (
                    <span style={{ color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>
                      {(index ?? 0) + 1}
                    </span>
                  ),
                },
                {
                  key: 'mssv',
                  label: 'MSSV',
                  render: (val: string) => (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        color: '#1e40af',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {val}
                    </span>
                  ),
                },
                {
                  key: 'full_name',
                  label: 'Họ và tên',
                  render: (val: string) => (
                    <span style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                      {val || '—'}
                    </span>
                  ),
                },
                {
                  key: 'class_id',
                  label: 'Lớp',
                  render: (val: string) => (
                    <span style={{ color: '#475569', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {val || '—'}
                    </span>
                  ),
                },
                {
                  key: 'role_type',
                  label: 'Vai trò đăng ký',
                  render: (val: string) => {
                    const isVol = val === 'Cộng tác viên' || val === 'volunteer';
                    const isOrg = val === 'Ban tổ chức' || val === 'organizer';
                    const bg = isOrg ? '#fffbeb' : isVol ? '#f5f3ff' : '#ecfdf5';
                    const color = isOrg ? '#b45309' : isVol ? '#6d28d9' : '#047857';
                    const border = isOrg ? '#fde68a' : isVol ? '#ddd6fe' : '#a7f3d0';
                    const label = isOrg ? 'Ban tổ chức' : isVol ? 'Cộng tác viên' : 'Người tham gia';
                    return (
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 10px',
                          borderRadius: '20px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    );
                  },
                },
              ]}
              data={registrations.filter(r => !r.attended)}
              searchable
              searchPlaceholder="Tìm kiếm MSSV, Họ tên..."
              emptyMessage="Không có sinh viên nào vắng mặt."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {isApproverRole && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1.5px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '1.25rem',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <StarIcon size={18} color="#f59e0b" fill="#f59e0b" />
                    <span>Gửi Đánh Giá Chất Lượng Tổ Chức (Dành cho 4 cấp Ban ngành)</span>
                  </h4>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Nếu đơn vị bị đánh giá 1, 2 hoặc 3 sao, hệ thống sẽ tự động gắn cờ cảnh báo chú ý trong các lần trình kế hoạch tiếp theo.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>Chọn số sao:</span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRatingStars(s)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.15rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <StarIcon
                            size={22}
                            color="#f59e0b"
                            fill={s <= ratingStars ? '#f59e0b' : 'none'}
                          />
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: ratingStars <= 3 ? '#d97706' : '#16a34a', marginLeft: '0.5rem' }}>
                      {ratingStars} Sao {ratingStars <= 3 ? '(Kích hoạt cảnh báo lưu ý)' : '(Đạt chuẩn)'}
                    </span>
                  </div>

                  <textarea
                    rows={3}
                    placeholder="Nhập nhận xét chi tiết (về kỷ luật, vệ sinh hội trường, chuẩn bị, đúng giờ,...)"
                    value={ratingFeedback}
                    onChange={(e) => setRatingFeedback(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      border: '1.5px solid #cbd5e1',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleSubmitEventRating}
                      disabled={submittingRating}
                      style={{
                        padding: '0.55rem 1.25rem',
                        background: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                      }}
                    >
                      {submittingRating ? 'Đang gửi...' : 'Gửi Đánh Giá Sau Sự Kiện'}
                    </button>
                  </div>
                </div>
              )}

              {ratings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {ratings.map((r: any) => (
                    <div
                      key={r.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '10px',
                        padding: '1rem',
                        border: '1px solid #e2e8f0',
                        borderLeft: r.stars <= 3 ? '4px solid #f59e0b' : '4px solid #10b981',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div>
                          <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>
                            {r.rater_tier === 'youth_union'
                              ? 'Đoàn Học Viện'
                              : r.rater_tier === 'ctsv'
                              ? 'Phòng CTSV'
                              : r.rater_tier === 'facility'
                              ? 'Phòng. TC-HC-QT'
                              : 'Super Admin'}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>({r.rater_email})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#d97706', fontWeight: 800 }}>
                          <StarIcon size={14} color="#f59e0b" fill="#f59e0b" />
                          <span>{r.stars} / 5 sao</span>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
                        {r.feedback || 'Không có nhận xét chi tiết.'}
                      </p>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.3rem', display: 'block' }}>
                        Ngày đánh giá: {new Date(r.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
                  Chưa có đánh giá nào cho sự kiện này.
                </p>
              )}
            </div>
          )}
        </section>
      </main>

      {event && (
        <EventBulkImportModal
          eventId={resolvedParams.id}
          eventName={event.event_name}
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onSuccess={() => {
            fetchData();
          }}
        />
      )}
    </div>
  );
}
