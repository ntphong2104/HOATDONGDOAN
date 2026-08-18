'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import {
  PlusIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  SettingsIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  SpinnerIcon,
  YouthUnionIcon,
  BuildingIcon,
} from '@/components/icons';
import { getStageLabel } from '@/lib/utils/proposal-logic';
import { isEventPastDeadline } from '@/lib/utils/event-logic';
import type { EventProposal, ProposalStage, SessionUser } from '@/lib/types';
import styles from './page.module.css';

export default function ProposalsListPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [proposals, setProposals] = useState<EventProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending_my_stage' | 'all'>('pending_my_stage');

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.success && data.data) {
        setUser(data.data);
      } else {
        window.location.replace('/login');
      }
    } catch (e) {
      window.location.replace('/login');
    }
  };

  const fetchProposals = async () => {
    try {
      const res = await fetch('/api/proposals');
      const data = await res.json();
      if (data.success && data.data) {
        setProposals(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch proposals', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchProposals();

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        fetchUser();
        fetchProposals();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const email = user?.email?.toLowerCase() || '';
  let tier = user?.tier || 'user';
  if (tier === 'user') {
    if (email.includes('doanthanhnien')) tier = 'youth_union';
    else if (email.includes('ctsv')) tier = 'ctsv';
    else if (email.includes('quantri') || email.includes('csvc')) tier = 'facility';
  }

  const isApprover = tier === 'youth_union' || tier === 'ctsv' || tier === 'facility' || tier === 'super_admin';
  const isPureApprover = tier === 'ctsv' || tier === 'facility';

  const myTargetStage: ProposalStage | null =
    tier === 'youth_union'
      ? 'youth_union'
      : tier === 'ctsv'
      ? 'ctsv'
      : tier === 'facility'
      ? 'facility'
      : tier === 'super_admin'
      ? 'super_admin'
      : null;

  const departmentTitle =
    tier === 'youth_union'
      ? 'Đoàn Thanh Niên Học Viện'
      : tier === 'ctsv'
      ? 'Phòng Công Tác Sinh Viên (CTSV)'
      : tier === 'facility'
      ? 'Phòng. TC-HC-QT'
      : tier === 'super_admin'
      ? 'Ban Quản Trị Super Admin'
      : 'Đơn Vị Trình Kế Hoạch';

  const departmentTask =
    tier === 'youth_union'
      ? 'Phê duyệt Bước 1: Nội dung & Định hướng hoạt động thanh niên'
      : tier === 'ctsv'
      ? 'Phê duyệt Bước 2: Phương án quản lý & quy mô sinh viên (> 50 SV)'
      : tier === 'facility'
      ? 'Phê duyệt Bước 3: Thẩm định & Cấp phòng / Hội trường / Sân bãi'
      : tier === 'super_admin'
      ? 'Phê duyệt Bước 4: Chung cuộc & Tự động tạo sự kiện điểm danh'
      : 'Theo dõi tiến độ duyệt các kế hoạch đã gửi';

  const handleApprove = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Xác nhận phê duyệt giai đoạn này của kế hoạch?')) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/proposals/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã duyệt thành công!');
        fetchProposals();
      } else {
        alert(data.error || 'Lỗi duyệt');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const reason = prompt('Nhập lý do từ chối kế hoạch này:', 'Chưa đạt yêu cầu nội dung/địa điểm');
    if (!reason) return;

    setActionLoading(id);
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
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteProposal = async (id: string, title: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Xác nhận XÓA VĨNH VIỄN kế hoạch "${title}"? Thao tác này không thể hoàn tác.`)) {
      return;
    }

    setActionLoading(id);
    try {
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã xóa kế hoạch thành công');
        fetchProposals();
      } else {
        alert(data.error || 'Lỗi xóa kế hoạch');
      }
    } catch (err) {
      alert('Lỗi kết nối');
    } finally {
      setActionLoading(null);
    }
  };

  const getStageBadgeClass = (stage: ProposalStage, status: string) => {
    if (status === 'approved') return styles.stageApproved;
    if (status === 'rejected') return styles.stageRejected;
    switch (stage) {
      case 'youth_union':
        return styles.stageYouthUnion;
      case 'ctsv':
        return styles.stageCtsv;
      case 'facility':
        return styles.stageFacility;
      case 'super_admin':
        return styles.stageSuperAdmin;
      default:
        return styles.stageYouthUnion;
    }
  };

  const filteredProposals = proposals.filter((p) => {
    if (!isApprover || activeTab === 'all') return true;
    if (activeTab === 'pending_my_stage') {
      if (tier === 'super_admin') return p.status === 'pending';
      return p.status === 'pending' && p.current_stage === myTargetStage;
    }
    return true;
  });

  const sortedProposals = [...filteredProposals].sort((a, b) => {
    const aWaiting = a.status === 'pending' && (tier === 'super_admin' || a.current_stage === myTargetStage);
    const bWaiting = b.status === 'pending' && (tier === 'super_admin' || b.current_stage === myTargetStage);

    if (aWaiting && !bWaiting) return -1;
    if (!aWaiting && bWaiting) return 1;

    // Next, pending before approved/rejected
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (a.status !== 'pending' && b.status === 'pending') return 1;

    // Active before closed
    const aPast = a.status === 'approved' && isEventPastDeadline({ event_date: a.start_date, end_time: a.end_time });
    const bPast = b.status === 'approved' && isEventPastDeadline({ event_date: b.start_date, end_time: b.end_time });

    if (!aPast && bPast) return -1;
    if (aPast && !bPast) return 1;

    // Otherwise sort by updated_at or created_at descending
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  });

  const pendingMyStageCount = proposals.filter((p) => {
    if (tier === 'super_admin') return p.status === 'pending';
    return p.status === 'pending' && p.current_stage === myTargetStage;
  }).length;

  return (
    <div className={styles.container}>
      <Header
        showBack={!isPureApprover || tier === 'super_admin'}
        backHref={tier === 'super_admin' ? '/super-admin?tab=proposals' : '/admin'}
        title={`BÀN PHÊ DUYỆT — ${departmentTitle.toUpperCase()}`}
      />

      <main className={styles.main}>
        {/* Department Approver Hero Card */}
        {isApprover && (
          <div className={styles.heroCard}>
            <div className={styles.heroLeft}>
              <div className={styles.heroIconBox}>
                {tier === 'youth_union' ? (
                  <YouthUnionIcon size={28} color="#2563eb" />
                ) : tier === 'super_admin' ? (
                  <ShieldCheckIcon size={28} color="#2563eb" />
                ) : (
                  <SettingsIcon size={28} color="#2563eb" />
                )}
              </div>
              <div>
                <span className={styles.heroTag}>Bàn làm việc phê duyệt số</span>
                <h2 className={styles.heroTitle}>{departmentTitle}</h2>
                <p className={styles.heroDesc}>{departmentTask}</p>
              </div>
            </div>

            <div className={styles.tabGroup}>
              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'pending_my_stage' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('pending_my_stage')}
              >
                <span>Chờ Xử Lý</span>
                <span
                  className={`${styles.tabBadge} ${
                    activeTab === 'pending_my_stage' ? styles.tabBadgeActive : ''
                  }`}
                >
                  {pendingMyStageCount}
                </span>
              </button>

              <button
                type="button"
                className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('all')}
              >
                <span>Tất Cả Hồ Sơ</span>
                <span
                  className={`${styles.tabBadge} ${
                    activeTab === 'all' ? styles.tabBadgeActive : ''
                  }`}
                >
                  {proposals.length}
                </span>
              </button>
            </div>
          </div>
        )}

        <div className={styles.headerRow}>
          <div>
            <h2 className={styles.sectionTitle}>Hồ Sơ Đề Xuất Hoạt Động</h2>
            <p className={styles.sectionSubtitle}>
              {isApprover
                ? `Danh sách kế hoạch trình qua ${departmentTitle}`
                : 'Theo dõi tiến trình xét duyệt của các kế hoạch'}
            </p>
          </div>

          {!isPureApprover && (
            <Link href="/admin/proposals/new" className={styles.newBtn}>
              <PlusIcon size={16} />
              <span>Trình Kế Hoạch Mới</span>
            </Link>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <SpinnerIcon size={36} color="var(--primary-600)" />
            <p style={{ marginTop: '0.75rem', color: '#64748b', fontWeight: 600 }}>
              Đang tải danh sách kế hoạch...
            </p>
          </div>
        ) : sortedProposals.length === 0 ? (
          <div className={styles.emptyState}>
            <CheckCircleIcon size={48} color="#10b981" />
            <h3 style={{ margin: '1rem 0 0.5rem 0', color: '#0f172a', fontWeight: 800, fontSize: '1.2rem' }}>
              {isApprover && activeTab === 'pending_my_stage'
                ? 'Không có hồ sơ nào đang chờ phòng bạn duyệt'
                : 'Chưa có kế hoạch sự kiện nào'}
            </h3>
            <p style={{ color: '#64748b', fontSize: '0.9rem', maxWidth: '460px', margin: '0 auto 1.5rem auto' }}>
              {isApprover
                ? 'Các đề xuất mới từ chi đoàn sẽ tự động xuất hiện tại đây khi được chuyển đến phòng ban của bạn.'
                : 'Bấm vào nút bên dưới để tạo đề xuất sự kiện mới lên Đoàn Học Viện.'}
            </p>
            {!isPureApprover && (
              <Link href="/admin/proposals/new" className={styles.newBtn}>
                <PlusIcon size={16} />
                <span>Tạo Kế Hoạch Đầu Tiên</span>
              </Link>
            )}
          </div>
        ) : (
          <div className={styles.proposalsList}>
            {sortedProposals.map((item) => {
              const isWaitingForMe =
                item.status === 'pending' &&
                (tier === 'super_admin' || item.current_stage === myTargetStage);

              const hasAlreadyPassedMyStage =
                item.status === 'pending' &&
                !isWaitingForMe &&
                isApprover &&
                ((tier === 'youth_union' && item.current_stage !== 'youth_union') ||
                  (tier === 'ctsv' && (item.current_stage === 'facility' || item.current_stage === 'super_admin')) ||
                  (tier === 'facility' && item.current_stage === 'super_admin'));

              return (
                <Link
                  key={item.id}
                  href={`/admin/proposals/${item.id}`}
                  className={styles.proposalCard}
                  style={
                    isWaitingForMe
                      ? { borderLeft: '5px solid #2563eb' }
                      : item.status === 'approved'
                      ? { borderLeft: '5px solid #10b981' }
                      : hasAlreadyPassedMyStage
                      ? { borderLeft: '5px solid #059669' }
                      : {}
                  }
                >
                  <div className={styles.cardTop}>
                    <div className={styles.titleArea}>
                      <div className={styles.orgText} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <BuildingIcon size={14} color="#2563eb" />
                        <span style={{ fontWeight: 700, color: '#1e40af' }}>{item.organization_unit || 'Liên Chi Đoàn'}</span>
                        <span style={{ color: '#cbd5e1' }}>•</span>
                        <span>Người nộp: <strong>{item.created_by}</strong></span>
                        {item.ratingSummary?.has_low_rating_warning && (
                          <span
                            style={{
                              padding: '0.15rem 0.5rem',
                              background: '#fef3c7',
                              color: '#b45309',
                              border: '1px solid #fcd34d',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 800,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                          >
                            Cần Chú Ý ({item.ratingSummary.average_stars} sao)
                          </span>
                        )}
                      </div>
                      <h3 className={styles.proposalTitle}>{item.title}</h3>
                    </div>

                    <span className={`${styles.stageBadge} ${getStageBadgeClass(item.current_stage, item.status)}`}>
                      {item.status === 'approved'
                        ? (isEventPastDeadline({ event_date: item.start_date, end_time: item.end_time })
                            ? 'Đã Duyệt • Đã Đóng'
                            : 'Đã Duyệt • Đang Mở')
                        : item.status === 'rejected'
                        ? 'Đã Từ Chối'
                        : `Đang ở: ${getStageLabel(item.current_stage)}`}
                    </span>
                  </div>

                  <div className={styles.metaChipsRow}>
                    <span className={styles.metaChip}>
                      <ClockIcon size={14} color="#64748b" />
                      <span>
                        {new Date(item.start_date).toLocaleDateString('vi-VN')} ({item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)})
                      </span>
                    </span>

                    <span className={styles.metaChip}>
                      <UsersIcon size={14} color="#64748b" />
                      <span>
                        {item.total_count} người ({item.participant_count} SV • {item.volunteer_count} CTV)
                      </span>
                    </span>

                    <span className={styles.metaChip}>
                      <BuildingIcon size={14} color="#64748b" />
                      <span>{item.room_name || 'Hội trường / Phòng họp'}</span>
                    </span>

                    {item.plan_url && (
                      <a
                        href={item.plan_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={styles.metaChip}
                        style={{
                          background: '#eff6ff',
                          color: '#2563eb',
                          border: '1px solid #bfdbfe',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        <span>📄 File Kế Hoạch ↗</span>
                      </a>
                    )}
                  </div>

                  <div className={styles.cardFooter}>
                    <div>
                      {isWaitingForMe && (
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2563eb' }}>
                          Hồ sơ đang chờ phòng ban của bạn thẩm định
                        </span>
                      )}
                      {hasAlreadyPassedMyStage && (
                        <span className={styles.completedPill}>
                          Đã duyệt cấp này • Chuyển tiếp
                        </span>
                      )}
                      {!isWaitingForMe && !hasAlreadyPassedMyStage && (
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          Gửi ngày {new Date(item.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      )}
                    </div>

                    <div className={styles.actionBtnsRow}>
                      {/* Action buttons for pending approvers */}
                      {isWaitingForMe && (
                        <div
                          style={{ display: 'inline-flex', gap: '0.5rem' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className={styles.approveBtn}
                            onClick={(e) => handleApprove(item.id, e)}
                            disabled={actionLoading === item.id}
                          >
                            {actionLoading === item.id ? '...' : 'Phê Duyệt Cấp Này'}
                          </button>
                          <button
                            type="button"
                            className={styles.rejectBtn}
                            onClick={(e) => handleReject(item.id, e)}
                            disabled={actionLoading === item.id}
                          >
                            Từ Chối
                          </button>
                        </div>
                      )}

                      {/* Cancel/Revoke button for department that already approved */}
                      {hasAlreadyPassedMyStage && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            className={styles.rejectBtn}
                            onClick={(e) => handleReject(item.id, e)}
                            disabled={actionLoading === item.id}
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          >
                            Thu Hồi / Từ Chối
                          </button>
                        </div>
                      )}

                      {(tier === 'super_admin' || tier === 'youth_union') && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProposal(item.id, item.title, e)}
                            disabled={actionLoading === item.id}
                            style={{
                              padding: '0.45rem 0.75rem',
                              borderRadius: '8px',
                              border: '1.5px solid #fecaca',
                              background: '#fff1f2',
                              color: '#e11d48',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      )}

                      <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#2563eb', marginLeft: '0.5rem' }}>
                        Xem Chi Tiết ➔
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
