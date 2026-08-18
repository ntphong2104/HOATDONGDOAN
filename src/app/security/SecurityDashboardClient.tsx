'use client';

import React, { useState, useMemo } from 'react';
import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  SearchIcon,
  PlusIcon,
} from '@/components/icons';
import type { EventProposal, SessionUser } from '@/lib/types';
import styles from './page.module.css';

interface SecurityDashboardClientProps {
  initialProposals: EventProposal[];
  currentUser: SessionUser;
}

export default function SecurityDashboardClient({
  initialProposals,
  currentUser,
}: SecurityDashboardClientProps) {
  const [proposals, setProposals] = useState<EventProposal[]>(initialProposals);
  const [dateFilter, setDateFilter] = useState<'today' | 'tomorrow' | 'all' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Helper date strings (YYYY-MM-DD)
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

  const fetchProposals = async () => {
    try {
      const res = await fetch('/api/proposals?status=approved');
      const data = await res.json();
      if (data.success && data.data) {
        // Filter out proposals without room loan
        const withRooms = data.data.filter((p: EventProposal) => p.room_name && p.room_name !== 'Không mượn');
        setProposals(withRooms);
      }
    } catch (err) {
      console.error('Error fetching proposals:', err);
    }
  };

  const handleKeyAction = async (proposalId: string, action: 'handover' | 'return' | 'reset') => {
    const proposal = proposals.find((p) => p.id === proposalId);
    if (!proposal) return;

    if (action === 'handover') {
      const confirmed = window.confirm(
        `🔑 BÀN GIAO CHÌA KHÓA:\n\nXác nhận bàn giao chìa khóa phòng "${proposal.room_name}" cho đại diện chương trình "${proposal.title}"?`
      );
      if (!confirmed) return;
    } else if (action === 'return') {
      const confirmed = window.confirm(
        `📥 NHẬN LẠI CHÌA KHÓA:\n\nXác nhận đã nhận lại chìa khóa phòng "${proposal.room_name}" từ chương trình "${proposal.title}"?`
      );
      if (!confirmed) return;
    }

    setProcessingId(proposalId);
    try {
      const res = await fetch('/api/security/handover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_id: proposalId, action }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Optimistic state update
        setProposals((prev) =>
          prev.map((p) => {
            if (p.id === proposalId) {
              if (action === 'handover') {
                return {
                  ...p,
                  key_status: 'handed_over',
                  key_handed_at: new Date().toISOString(),
                  key_handed_by: currentUser.email,
                };
              } else if (action === 'return') {
                return {
                  ...p,
                  key_status: 'returned',
                  key_returned_at: new Date().toISOString(),
                  key_returned_by: currentUser.email,
                };
              } else if (action === 'reset') {
                return {
                  ...p,
                  key_status: 'pending',
                  key_handed_at: null,
                  key_handed_by: null,
                  key_returned_at: null,
                  key_returned_by: null,
                };
              }
            }
            return p;
          })
        );
      } else {
        alert(`Không thể cập nhật: ${data.message || data.error || 'Lỗi kết nối'}`);
      }
    } catch (err: any) {
      alert(`Đã xảy ra lỗi: ${err.message || 'Lỗi mạng'}`);
    } finally {
      setProcessingId(null);
    }
  };

  // Filtered list
  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      // 1. Date Filter
      const pStartDate = p.start_date || (p.start_datetime ? p.start_datetime.split('T')[0] : '');
      if (dateFilter === 'today' && pStartDate !== todayStr) {
        return false;
      }
      if (dateFilter === 'tomorrow' && pStartDate !== tomorrowStr) {
        return false;
      }
      if (dateFilter === 'custom' && pStartDate !== customDate) {
        return false;
      }

      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const roomMatch = p.room_name?.toLowerCase().includes(q);
        const titleMatch = p.title?.toLowerCase().includes(q);
        const unitMatch = p.organization_unit?.toLowerCase().includes(q);
        const creatorMatch = p.created_by?.toLowerCase().includes(q);
        if (!roomMatch && !titleMatch && !unitMatch && !creatorMatch) {
          return false;
        }
      }

      return true;
    });
  }, [proposals, dateFilter, customDate, searchQuery, todayStr, tomorrowStr]);

  // Statistics calculation for the currently active date tab
  const stats = useMemo(() => {
    const total = filteredProposals.length;
    const pending = filteredProposals.filter((p) => !p.key_status || p.key_status === 'pending').length;
    const handedOver = filteredProposals.filter((p) => p.key_status === 'handed_over').length;
    const returned = filteredProposals.filter((p) => p.key_status === 'returned').length;

    return { total, pending, handedOver, returned };
  }, [filteredProposals]);

  const formatDateVi = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}/${m}/${y}`;
    } catch {
      return dateStr;
    }
  };

  const formatTimeHHmm = (isoStr?: string | null) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  return (
    <div>
      {/* Banner */}
      <div className={styles.banner}>
        <div className={styles.bannerLeft}>
          <h1 className={styles.bannerTitle}>
            <span>🛡️</span> SỔ TRỰC BÀN GIAO CHÌA KHÓA PHÒNG
          </h1>
          <p className={styles.bannerSubtitle}>
            Căn cứ danh sách các đơn mượn phòng / hội trường đã được <strong>phê duyệt đầy đủ</strong> (Đoàn Trường, CTSV, Phòng. TC-HC-QT) để bàn giao chìa khóa cho sinh viên.
          </p>
        </div>
        <button
          onClick={fetchProposals}
          className={styles.refreshButton}
          title="Tải lại dữ liệu mới nhất"
        >
          🔄 Làm mới dữ liệu
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Phòng mượn trong ngày</span>
          <span className={styles.statValue} style={{ color: '#0f172a' }}>
            {stats.total}
          </span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#fde68a' }}>
          <span className={styles.statLabel} style={{ color: '#b45309' }}>
            ⏳ Chưa bàn giao chìa
          </span>
          <span className={styles.statValue} style={{ color: '#d97706' }}>
            {stats.pending}
          </span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#a7f3d0' }}>
          <span className={styles.statLabel} style={{ color: '#047857' }}>
            🟢 Đang mượn chìa
          </span>
          <span className={styles.statValue} style={{ color: '#059669' }}>
            {stats.handedOver}
          </span>
        </div>
        <div className={styles.statCard} style={{ borderColor: '#cbd5e1' }}>
          <span className={styles.statLabel} style={{ color: '#475569' }}>
            ✓ Đã trả chìa khóa
          </span>
          <span className={styles.statValue} style={{ color: '#334155' }}>
            {stats.returned}
          </span>
        </div>
      </div>

      {/* Controls: Date Filter Tabs + Search Box */}
      <div className={styles.controlsRow}>
        <div className={styles.dateTabs}>
          <button
            className={`${styles.dateTab} ${dateFilter === 'today' ? styles.dateTabActive : ''}`}
            onClick={() => setDateFilter('today')}
          >
            Hôm nay ({formatDateVi(todayStr)})
          </button>
          <button
            className={`${styles.dateTab} ${dateFilter === 'tomorrow' ? styles.dateTabActive : ''}`}
            onClick={() => setDateFilter('tomorrow')}
          >
            Ngày mai ({formatDateVi(tomorrowStr)})
          </button>
          <button
            className={`${styles.dateTab} ${dateFilter === 'all' ? styles.dateTabActive : ''}`}
            onClick={() => setDateFilter('all')}
          >
            Tất cả lịch sắp tới
          </button>
          <button
            className={`${styles.dateTab} ${dateFilter === 'custom' ? styles.dateTabActive : ''}`}
            onClick={() => setDateFilter('custom')}
          >
            Chọn ngày khác
          </button>
        </div>

        {dateFilter === 'custom' && (
          <input
            type="date"
            className={styles.customDatePicker}
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
          />
        )}

        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>
            <SearchIcon size={16} />
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Tìm theo tên phòng, sự kiện, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List of Approved Room Loans */}
      {filteredProposals.length === 0 ? (
        <div className={styles.emptyState}>
          <div style={{ fontSize: '2.5rem' }}>🏢</div>
          <h3 className={styles.emptyStateTitle}>Không có lịch mượn phòng nào</h3>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            {dateFilter === 'today'
              ? 'Hôm nay không có phòng học hay hội trường nào được cấp phép sử dụng.'
              : 'Không tìm thấy đơn mượn phòng phù hợp với bộ lọc đã chọn.'}
          </p>
        </div>
      ) : (
        <div className={styles.roomsList}>
          {filteredProposals.map((item) => {
            const keyStatus = item.key_status || 'pending';
            const isProcessing = processingId === item.id;

            return (
              <div key={item.id} className={styles.roomCard}>
                {/* Header */}
                <div className={styles.roomCardHeader}>
                  <div className={styles.roomBadge}>
                    <span>🏢</span>
                    <span>{item.room_name}</span>
                  </div>

                  <div>
                    {keyStatus === 'pending' && (
                      <span className={`${styles.keyStatusBadge} ${styles.statusPending}`}>
                        <span>🟡</span> Chưa bàn giao chìa khóa
                      </span>
                    )}
                    {keyStatus === 'handed_over' && (
                      <span className={`${styles.keyStatusBadge} ${styles.statusHandedOver}`}>
                        <span>🟢</span> Đang mượn (Giao lúc {formatTimeHHmm(item.key_handed_at)})
                      </span>
                    )}
                    {keyStatus === 'returned' && (
                      <span className={`${styles.keyStatusBadge} ${styles.statusReturned}`}>
                        <span>✓</span> Đã nhận lại chìa (Lúc {formatTimeHHmm(item.key_returned_at)})
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className={styles.roomCardBody}>
                  {/* Left: Event Details & Time */}
                  <div>
                    <h3 className={styles.eventTitle}>{item.title}</h3>
                    <div className={styles.metaList}>
                      <div className={styles.metaItem}>
                        <span className={styles.metaItemIcon}>⏰</span>
                        <span>
                          Thời gian:{' '}
                          <strong className={styles.timeHighlight}>
                            {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                          </strong>
                        </span>
                      </div>
                      <div className={styles.metaItem}>
                        <span className={styles.metaItemIcon}>📅</span>
                        <span>
                          Ngày mượn:{' '}
                          <strong className={styles.metaHighlight}>
                            {formatDateVi(item.start_date || item.start_datetime?.split('T')[0])}
                          </strong>
                        </span>
                      </div>
                      <div className={styles.metaItem}>
                        <span className={styles.metaItemIcon}>👥</span>
                        <span>
                          Quy mô dự kiến:{' '}
                          <strong>{item.total_count || item.participant_count} người</strong>
                        </span>
                      </div>
                      <div className={styles.metaItem}>
                        <span className={styles.metaItemIcon}>🏛️</span>
                        <span>
                          Đơn vị tổ chức: <strong>{item.organization_unit || 'Đoàn - Hội PTIT'}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Borrower Representative Info & Verification */}
                  <div className={styles.borrowerCard}>
                    <span className={styles.borrowerTitle}>👤 Người đại diện mượn phòng</span>
                    <span className={styles.borrowerName}>{item.created_by}</span>
                    <span className={styles.borrowerMeta}>
                      Tình trạng phê duyệt: <strong style={{ color: '#16a34a' }}>✓ Đã duyệt 100% (Đủ điều kiện nhận chìa)</strong>
                    </span>
                    {item.description && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#475569', background: '#ffffff', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        📝 <em>{item.description.length > 90 ? item.description.slice(0, 90) + '...' : item.description}</em>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className={styles.roomCardFooter}>
                  <div>
                    {item.plan_url ? (
                      <a
                        href={item.plan_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.planLink}
                      >
                        📄 Xem File Kế Hoạch Đính Kèm (PDF / Drive) ↗
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        Chưa đính kèm link tài liệu
                      </span>
                    )}
                  </div>

                  <div className={styles.actionButtons}>
                    {keyStatus === 'pending' && (
                      <button
                        className={styles.btnHandover}
                        disabled={isProcessing}
                        onClick={() => handleKeyAction(item.id, 'handover')}
                      >
                        <span>🔑</span>
                        <span>Đã bàn giao chìa khóa</span>
                      </button>
                    )}

                    {keyStatus === 'handed_over' && (
                      <>
                        <button
                          className={styles.btnReturn}
                          disabled={isProcessing}
                          onClick={() => handleKeyAction(item.id, 'return')}
                        >
                          <span>📥</span>
                          <span>Đã nhận lại chìa khóa</span>
                        </button>
                        <button
                          className={styles.btnReset}
                          disabled={isProcessing}
                          onClick={() => handleKeyAction(item.id, 'reset')}
                          title="Hoàn tác về trạng thái Chưa bàn giao"
                        >
                          Hoàn tác
                        </button>
                      </>
                    )}

                    {keyStatus === 'returned' && (
                      <button
                        className={styles.btnReset}
                        disabled={isProcessing}
                        onClick={() => handleKeyAction(item.id, 'handover')}
                        title="Bấm để chuyển lại trạng thái Đang mượn nếu cần"
                      >
                        Đổi trạng thái
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
