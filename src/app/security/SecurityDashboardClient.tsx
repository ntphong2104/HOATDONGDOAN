'use client';

import React, { useState, useMemo } from 'react';
import { getVietnamDateString } from '@/lib/utils/vn-date';
import { isSafeExternalUrl } from '@/lib/security/redirect';
import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  SearchIcon,
  PlusIcon,
  KeyIcon,
  RefreshIcon,
  BuildingIcon,
  UserIcon,
  FileTextIcon,
  ExternalLinkIcon,
  RotateCcwIcon,
  InboxIcon,
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
  const [customDate, setCustomDate] = useState<string>(() => getVietnamDateString(0));
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Helper date strings (YYYY-MM-DD in Vietnam UTC+7)
  const todayStr = getVietnamDateString(0);
  const tomorrowStr = getVietnamDateString(1);

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
        `Xác nhận bàn giao chìa khóa phòng "${proposal.room_name}" cho đại diện chương trình "${proposal.title}"?`
      );
      if (!confirmed) return;
    } else if (action === 'return') {
      const confirmed = window.confirm(
        `Xác nhận đã nhận lại chìa khóa phòng "${proposal.room_name}" từ chương trình "${proposal.title}"?`
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

  // Filtered and Smartly Sorted list
  const filteredProposals = useMemo(() => {
    const list = proposals.filter((p) => {
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

    // Smart Sort: Lịch gần nhất / sắp tới hiện lên trên, lịch đã qua để xuống dưới
    return list.sort((a, b) => {
      const dateA = a.start_date || (a.start_datetime ? a.start_datetime.split('T')[0] : '');
      const dateB = b.start_date || (b.start_datetime ? b.start_datetime.split('T')[0] : '');

      const isPastA = dateA < todayStr;
      const isPastB = dateB < todayStr;

      // 1. Lịch hôm nay & sắp tới lên trước (-1), Lịch đã qua xuống dưới (1)
      if (!isPastA && isPastB) return -1;
      if (isPastA && !isPastB) return 1;

      // 2. Nếu cùng là lịch sắp tới: Cái nào gần thời điểm hiện tại nhất thì lên đầu (tăng dần theo thời gian)
      if (!isPastA && !isPastB) {
        const timeA = a.start_datetime
          ? new Date(a.start_datetime).getTime()
          : new Date(`${dateA}T${a.start_time || '00:00'}`).getTime();
        const timeB = b.start_datetime
          ? new Date(b.start_datetime).getTime()
          : new Date(`${dateB}T${b.start_time || '00:00'}`).getTime();
        return timeA - timeB;
      }

      // 3. Nếu cùng là lịch đã qua: Cái nào mới diễn ra gần đây nhất thì ở trên của nhóm đã qua (giảm dần)
      const timeA = a.start_datetime
        ? new Date(a.start_datetime).getTime()
        : new Date(`${dateA}T${a.start_time || '00:00'}`).getTime();
      const timeB = b.start_datetime
        ? new Date(b.start_datetime).getTime()
        : new Date(`${dateB}T${b.start_time || '00:00'}`).getTime();
      return timeB - timeA;
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
            <ShieldCheckIcon size={24} color="var(--text-brand)" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '8px' }} />
            SỔ TRỰC BÀN GIAO CHÌA KHÓA PHÒNG
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
          <RefreshIcon size={16} style={{ marginRight: '6px' }} />
          Làm mới dữ liệu
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Phòng mượn trong ngày</span>
          <span className={styles.statValue} style={{ color: 'var(--text-primary)' }}>
            {stats.total}
          </span>
        </div>
        <div className={styles.statCard} style={{ borderColor: 'var(--tint-amber-border)' }}>
          <span className={styles.statLabel} style={{ color: 'var(--status-amber-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ClockIcon size={14} color="var(--status-amber-text)" /> Chưa bàn giao chìa
          </span>
          <span className={styles.statValue} style={{ color: 'var(--status-amber-text)' }}>
            {stats.pending}
          </span>
        </div>
        <div className={styles.statCard} style={{ borderColor: 'var(--tint-green-border)' }}>
          <span className={styles.statLabel} style={{ color: 'var(--status-green-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <KeyIcon size={14} color="var(--status-green-text)" /> Đang mượn chìa
          </span>
          <span className={styles.statValue} style={{ color: 'var(--status-green-text)' }}>
            {stats.handedOver}
          </span>
        </div>
        <div className={styles.statCard} style={{ borderColor: 'var(--border-strong)' }}>
          <span className={styles.statLabel} style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircleIcon size={14} color="var(--text-secondary)" /> Đã trả chìa khóa
          </span>
          <span className={styles.statValue} style={{ color: 'var(--text-body)' }}>
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
            Tất cả lịch
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
          <BuildingIcon size={44} color="var(--text-subtle)" style={{ marginBottom: '12px' }} />
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
                    <BuildingIcon size={16} color="var(--text-brand)" />
                    <span>{item.room_name}</span>
                  </div>

                  <div>
                    {keyStatus === 'pending' && (
                      <span className={`${styles.keyStatusBadge} ${styles.statusPending}`}>
                        <ClockIcon size={14} color="var(--status-amber-text)" /> Chưa bàn giao chìa khóa
                      </span>
                    )}
                    {keyStatus === 'handed_over' && (
                      <span className={`${styles.keyStatusBadge} ${styles.statusHandedOver}`}>
                        <KeyIcon size={14} color="var(--status-green-text)" /> Đang mượn (Giao lúc {formatTimeHHmm(item.key_handed_at)})
                      </span>
                    )}
                    {keyStatus === 'returned' && (
                      <span className={`${styles.keyStatusBadge} ${styles.statusReturned}`}>
                        <CheckCircleIcon size={14} color="var(--status-green-text)" /> Đã nhận lại chìa (Lúc {formatTimeHHmm(item.key_returned_at)})
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
                        <ClockIcon size={15} color="var(--text-muted)" />
                        <span>
                          Thời gian:{' '}
                          <strong className={styles.timeHighlight}>
                            {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                          </strong>
                        </span>
                      </div>
                      <div className={styles.metaItem}>
                        <CalendarIcon size={15} color="var(--text-muted)" />
                        <span>
                          Ngày mượn:{' '}
                          <strong className={styles.metaHighlight}>
                            {formatDateVi(item.start_date || item.start_datetime?.split('T')[0])}
                          </strong>
                          {(item.start_date || item.start_datetime?.split('T')[0]) === todayStr && (
                            <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--status-green-text)', fontWeight: 800, background: 'var(--tint-green-strong)', padding: '1px 6px', borderRadius: '4px' }}>
                              Hôm nay
                            </span>
                          )}
                          {(item.start_date || item.start_datetime?.split('T')[0]) && (item.start_date || item.start_datetime?.split('T')[0])! < todayStr && (
                            <span style={{ marginLeft: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, background: 'var(--bg-muted)', padding: '1px 6px', borderRadius: '4px' }}>
                              Đã diễn ra
                            </span>
                          )}
                        </span>
                      </div>
                      <div className={styles.metaItem}>
                        <UsersIcon size={15} color="var(--text-muted)" />
                        <span>
                          Quy mô dự kiến:{' '}
                          <strong>{item.total_count || item.participant_count} người</strong>
                        </span>
                      </div>
                      <div className={styles.metaItem}>
                        <BuildingIcon size={15} color="var(--text-muted)" />
                        <span>
                          Đơn vị tổ chức: <strong>{item.organization_unit || 'Đoàn - Hội PTIT'}</strong>
                        </span>
                      </div>
                    </div>

                    {/* ── Chi tiết lịch trình từng ca ── */}
                    {item.sessions && item.sessions.length > 0 && (
                      <div style={{ marginTop: '0.65rem' }}>
                        <div style={{
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          color: 'var(--text-secondary)',
                          marginBottom: '0.35rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}>
                          📋 Lịch trình chi tiết ({item.sessions.length} ca):
                        </div>
                        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1.5px solid var(--border-color)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-muted)' }}>
                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 800, color: 'var(--text-body)', fontSize: '0.72rem', borderBottom: '1.5px solid var(--border-color)', whiteSpace: 'nowrap' }}>Ca</th>
                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 800, color: 'var(--text-body)', fontSize: '0.72rem', borderBottom: '1.5px solid var(--border-color)', whiteSpace: 'nowrap' }}>📅 Ngày</th>
                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 800, color: 'var(--text-body)', fontSize: '0.72rem', borderBottom: '1.5px solid var(--border-color)', whiteSpace: 'nowrap' }}>⏰ Giờ</th>
                                <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left', fontWeight: 800, color: 'var(--text-body)', fontSize: '0.72rem', borderBottom: '1.5px solid var(--border-color)', whiteSpace: 'nowrap' }}>🔑 Phòng</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.sessions.map((sess: any, sIdx: number) => (
                                <tr key={sess.id || sIdx} style={{ background: sIdx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                                  <td style={{ padding: '0.4rem 0.6rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: '20px', height: '20px', borderRadius: '50%',
                                      background: '#1d4ed8', color: '#fff',
                                      fontSize: '0.65rem', fontWeight: 800, marginRight: '0.35rem',
                                    }}>{sIdx + 1}</span>
                                    {sess.name || `Buổi ${sIdx + 1}`}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    {sess.session_date ? new Date(sess.session_date).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—'}
                                  </td>
                                  <td style={{ padding: '0.4rem 0.6rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                                    {sess.start_time?.slice(0, 5) || '??'} – {sess.end_time?.slice(0, 5) || '??'}
                                  </td>
                                  <td style={{
                                    padding: '0.4rem 0.6rem',
                                    fontWeight: 700,
                                    color: sess.room_name && sess.room_name !== 'Không mượn' ? 'var(--text-primary)' : 'var(--text-subtle)',
                                  }}>
                                    {sess.room_name && sess.room_name !== 'Không mượn' ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                                        {sess.room_name}
                                      </span>
                                    ) : (
                                      item.room_name || 'Không mượn'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Borrower Representative Info & Verification */}
                  <div className={styles.borrowerCard}>
                    <span className={styles.borrowerTitle} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <UserIcon size={14} color="var(--text-secondary)" /> Người đại diện mượn phòng
                    </span>
                    <span className={styles.borrowerName}>{item.created_by}</span>
                    <span className={styles.borrowerMeta}>
                      Tình trạng phê duyệt: <strong style={{ color: 'var(--status-green-text)' }}>✓ Đã duyệt 100% (Đủ điều kiện nhận chìa)</strong>
                    </span>
                    {item.description && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'var(--bg-surface)', padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <FileTextIcon size={13} color="var(--text-muted)" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
                        <em>{item.description.length > 90 ? item.description.slice(0, 90) + '...' : item.description}</em>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Actions */}
                <div className={styles.roomCardFooter}>
                  <div>
                    {isSafeExternalUrl(item.plan_url) ? (
                      <a
                        href={item.plan_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.planLink}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <FileTextIcon size={14} color="var(--text-brand)" />
                        <span>Xem File Kế Hoạch Đính Kèm</span>
                        <ExternalLinkIcon size={13} color="var(--text-brand)" />
                      </a>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
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
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <KeyIcon size={16} color="#ffffff" />
                        <span>Đã bàn giao chìa khóa</span>
                      </button>
                    )}

                    {keyStatus === 'handed_over' && (
                      <>
                        <button
                          className={styles.btnReturn}
                          disabled={isProcessing}
                          onClick={() => handleKeyAction(item.id, 'return')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <CheckCircleIcon size={16} color="#ffffff" />
                          <span>Đã nhận lại chìa khóa</span>
                        </button>
                        <button
                          className={styles.btnReset}
                          disabled={isProcessing}
                          onClick={() => handleKeyAction(item.id, 'reset')}
                          title="Hoàn tác về trạng thái Chưa bàn giao"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <RotateCcwIcon size={13} />
                          <span>Hoàn tác</span>
                        </button>
                      </>
                    )}

                    {keyStatus === 'returned' && (
                      <button
                        className={styles.btnReset}
                        disabled={isProcessing}
                        onClick={() => handleKeyAction(item.id, 'handover')}
                        title="Bấm để chuyển lại trạng thái Đang mượn nếu cần"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <RotateCcwIcon size={13} />
                        <span>Đổi trạng thái</span>
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
