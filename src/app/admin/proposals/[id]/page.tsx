'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  UserIcon,
  BuildingIcon,
  MapPinIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  AlertTriangleIcon,
  MessageSquareIcon,
  StarIcon,
  SpinnerIcon,
  QrCodeIcon,
  FileTextIcon,
} from '@/components/icons';
import { getStageLabel, isKhoaUnit } from '@/lib/utils/proposal-logic';
import { getRatingDepartmentLabel } from '@/lib/utils/rating-logic';
import type { EventProposal, ProposalLog, ProposalStage, SessionUser, UnitRating } from '@/lib/types';

interface ProposalDetail extends EventProposal {
  logs: ProposalLog[];
  eventRatings?: UnitRating[];
}

export default function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [proposal, setProposal] = useState<ProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // Direct notes & reject state
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  // Per-session decision state
  const [sessionDecisions, setSessionDecisions] = useState<{
    [sessionId: string]: { status: 'approved' | 'rejected'; rejection_reason?: string };
  }>({});

  // Post-event rating states
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/me');
      const data = await res.json();
      if (data.success && data.data) {
        setCurrentUser(data.data);
      } else {
        router.replace('/login');
      }
    } catch (e) {
      router.replace('/login');
    }
  };

  const fetchProposal = async () => {
    try {
      const res = await fetch(`/api/proposals/${resolvedParams.id}`);
      const data = await res.json();
      if (data.success && data.data) {
        setProposal(data.data);
      } else {
        router.replace('/admin/proposals');
      }
    } catch (err) {
      console.error('Failed to load proposal', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
    fetchProposal();

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        fetchUser();
        fetchProposal();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [resolvedParams.id]);

  const handleConfirmApprove = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/proposals/${resolvedParams.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: approvalNotes,
          session_decisions: sessionDecisions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã duyệt thành công!');
        setApprovalNotes('');
        setSessionDecisions({});
        fetchProposal();
      } else {
        alert(data.error || 'Lỗi duyệt');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmReject = async (reasonInput?: string) => {
    const finalReason = reasonInput || rejectionReason;
    if (!finalReason.trim()) {
      alert('Vui lòng nhập lý do từ chối kế hoạch');
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/proposals/${resolvedParams.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: finalReason }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã từ chối kế hoạch');
        setRejectionReason('');
        fetchProposal();
      } else {
        alert(data.error || 'Lỗi từ chối');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!proposal) return;
    const targetEventId = proposal.created_event_id || proposal.id;
    setSubmittingRating(true);
    try {
      const res = await fetch(`/api/events/${targetEventId}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stars: ratingStars,
          feedback: ratingFeedback,
          organization_unit: proposal.organization_unit,
          proposal_id: proposal.id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã gửi đánh giá thành công!');
        setRatingFeedback('');
        fetchProposal();
      } else {
        alert(data.error || 'Lỗi gửi đánh giá');
      }
    } catch (e) {
      alert('Lỗi kết nối');
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
        <Header showBack backHref="/admin/proposals" title="CHI TIẾT KẾ HOẠCH" />
        <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '2rem 1.25rem' }}>
          {/* Skeleton shimmer animation */}
          <style>{`
            @keyframes skeletonShimmer {
              0% { background-position: -400px 0; }
              100% { background-position: 400px 0; }
            }
            .sk-pulse {
              background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 37%, #e2e8f0 63%);
              background-size: 800px 100%;
              animation: skeletonShimmer 1.8s ease-in-out infinite;
              border-radius: 10px;
            }
          `}</style>
          {/* Title skeleton */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '1.75rem 2rem', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
            <div className="sk-pulse" style={{ height: 14, width: '35%', marginBottom: 12 }} />
            <div className="sk-pulse" style={{ height: 22, width: '70%', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="sk-pulse" style={{ height: 28, width: 100, borderRadius: 14 }} />
              <div className="sk-pulse" style={{ height: 28, width: 130, borderRadius: 14 }} />
            </div>
          </div>
          {/* Info skeleton */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '1.75rem 2rem', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
            <div className="sk-pulse" style={{ height: 16, width: '40%', marginBottom: 18 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {[1,2,3,4].map(i => (
                <div key={i}>
                  <div className="sk-pulse" style={{ height: 12, width: '50%', marginBottom: 8 }} />
                  <div className="sk-pulse" style={{ height: 16, width: '80%' }} />
                </div>
              ))}
            </div>
          </div>
          {/* Steps skeleton */}
          <div style={{ background: '#fff', borderRadius: 20, padding: '1.75rem 2rem', border: '1px solid #e2e8f0' }}>
            <div className="sk-pulse" style={{ height: 16, width: '30%', marginBottom: 20 }} />
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              {[1,2,3].map(i => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <div className="sk-pulse" style={{ width: 44, height: 44, borderRadius: '50%' }} />
                  <div className="sk-pulse" style={{ height: 12, width: '70%' }} />
                </div>
              ))}
            </div>
          </div>
          {/* Loading text */}
          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#94a3b8', fontWeight: 600, fontSize: '0.85rem', letterSpacing: '0.02em' }}>
            Đang tải thông tin kế hoạch...
          </p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
        <Header showBack backHref="/admin/proposals" title="CHI TIẾT KẾ HOẠCH" />
        <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <h2 style={{ color: '#0f172a' }}>Không tìm thấy kế hoạch</h2>
          <Link href="/admin/proposals" style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'underline' }}>
            Quay lại danh sách
          </Link>
        </div>
      </div>
    );
  }

  // Determine user permissions for this stage
  const tier = currentUser?.tier || 'user';
  const email = currentUser?.email || '';
  const isSuperAdmin = tier === 'super_admin' || Boolean((currentUser as any)?.isSuperAdmin);
  const backTarget = isSuperAdmin ? '/super-admin?tab=proposals' : '/admin/proposals';

  const isApproverRole =
    isSuperAdmin ||
    tier === 'youth_union' ||
    tier === 'ctsv' ||
    tier === 'facility' ||
    email.includes('ctsv') ||
    email.includes('quantri') ||
    email.includes('tchc') ||
    email.includes('tchcqt') ||
    email.includes('csvc');

  const currentStage = proposal.current_stage;
  let canActOnThisStage = false;

  if (proposal.status === 'pending') {
    if (isSuperAdmin) {
      canActOnThisStage = true;
    } else if (currentStage === 'youth_union' && (tier === 'youth_union')) {
      canActOnThisStage = true;
    } else if (currentStage === 'ctsv' && (tier === 'ctsv' || email.includes('ctsv'))) {
      canActOnThisStage = true;
    } else if (currentStage === 'facility' && (tier === 'facility' || email.includes('quantri') || email.includes('tchc') || email.includes('tchcqt') || email.includes('csvc'))) {
      canActOnThisStage = true;
    }
  }

  const isDirectFaculty = isKhoaUnit(proposal.organization_unit);

  const getStepStatus = (step: ProposalStage) => {
    if (proposal.status === 'rejected') return 'waiting';
    if (proposal.status === 'approved') return 'done';

    if (isDirectFaculty) {
      if (step === 'youth_union' || step === 'ctsv') return 'skipped';
      if (step === 'facility') {
        if (proposal.current_stage === 'facility') return 'current';
        return 'waiting';
      }
    }

    const stageOrder: ProposalStage[] = ['youth_union', 'ctsv', 'facility'];
    const currentIdx = stageOrder.indexOf(proposal.current_stage);
    const stepIdx = stageOrder.indexOf(step);

    if (step === 'facility' && !proposal.requires_facility_approval) return 'skipped';

    if (currentIdx > stepIdx) return 'done';
    if (currentIdx === stepIdx) return 'current';
    return 'waiting';
  };

  const hasLowRatingWarning = proposal.ratingSummary?.has_low_rating_warning;
  const recentLowRatings = proposal.ratingSummary?.recent_low_ratings || [];

  const getStageDepartmentName = (stageName?: string, actorEmail?: string) => {
    if (stageName === 'youth_union') return 'Đoàn Thanh Niên Học Viện';
    if (stageName === 'ctsv' || actorEmail?.includes('ctsv')) return 'Phòng Công Tác Sinh Viên (CTSV)';
    if (stageName === 'facility' || actorEmail?.includes('quantri') || actorEmail?.includes('csvc') || actorEmail?.includes('tchc')) return 'Phòng. TC-HC-QT';
    if (stageName === 'super_admin' || actorEmail?.includes('admin')) return 'Ban Quản Trị Duyệt Chung Cuộc';
    return getStageLabel((stageName as ProposalStage) || 'youth_union');
  };

  // Filter logs with actual custom notes from approvers (exclude initial submission and default system text)
  const approvalNotesList = (proposal.logs || []).filter(
    (l) =>
      l.action === 'approved' &&
      l.notes &&
      l.notes.trim().length > 0 &&
      !l.notes.includes('Đã nộp kế hoạch') &&
      !l.notes.startsWith('Đã phê duyệt giai đoạn')
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
      <Header showBack backHref={backTarget} title="HỒ SƠ KẾ HOẠCH" />

      <main style={{ flex: 1, maxWidth: '960px', width: '100%', margin: '0 auto', padding: '2rem 1.25rem 4rem', boxSizing: 'border-box' }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: '1.25rem' }}>
          <Link
            href={backTarget}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#2563eb',
              textDecoration: 'none',
            }}
          >
            <ArrowLeftIcon size={16} />
            <span>{isSuperAdmin ? 'Quay lại Bàn Quản Trị Toàn Trường' : 'Quay lại danh sách kế hoạch'}</span>
          </Link>
        </div>

        {/* ═══════════════ MAIN PROFILE CARD ═══════════════ */}
        <div
          style={{
            background: '#ffffff',
            border: '1.5px solid #cbd5e1',
            borderRadius: '24px',
            padding: '2rem',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.75rem',
          }}
        >
          {/* HEADER SECTION */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '1.5px solid #f1f5f9',
              paddingBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '700px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.85rem', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: '0.85rem', fontWeight: 800, width: 'fit-content' }}>
                <BuildingIcon size={14} color="#1e40af" />
                <span>{proposal.organization_unit || 'Liên Chi Đoàn'}</span>
              </div>

              <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                {proposal.title}
              </h1>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', color: '#64748b', fontSize: '0.875rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <UserIcon size={15} color="#64748b" />
                  <span>Người nộp: <strong style={{ color: '#0f172a' }}>{proposal.created_by}</strong></span>
                </div>
                <span>•</span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CalendarIcon size={15} color="#64748b" />
                  <span>Ngày nộp: <strong style={{ color: '#0f172a' }}>{new Date(proposal.created_at).toLocaleDateString('vi-VN')}</strong></span>
                </div>
              </div>
            </div>

            {/* Status Pill */}
            <div>
              {proposal.status === 'approved' ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.15rem', borderRadius: '20px', background: '#dcfce7', border: '1.5px solid #86efac', color: '#15803d', fontWeight: 800, fontSize: '0.9rem' }}>
                  <CheckCircleIcon size={16} color="#15803d" />
                  <span>Đã Duyệt Chung Cuộc</span>
                </div>
              ) : proposal.status === 'rejected' ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.15rem', borderRadius: '20px', background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#991b1b', fontWeight: 800, fontSize: '0.9rem' }}>
                  <CloseIcon size={16} color="#991b1b" />
                  <span>Đã Từ Chối</span>
                </div>
              ) : (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.15rem', borderRadius: '20px', background: '#fef3c7', border: '1.5px solid #fde68a', color: '#92400e', fontWeight: 800, fontSize: '0.9rem' }}>
                  <ClockIcon size={16} color="#92400e" />
                  <span>Đang Chờ Duyệt</span>
                </div>
              )}
            </div>
          </div>

          {/* CẢNH BÁO ĐÁNH GIÁ 1-3 SAO LỊCH SỬ (NẾU CÓ) */}
          {hasLowRatingWarning && (
            <div
              style={{
                padding: '1.25rem 1.5rem',
                background: '#fffbeb',
                border: '2px solid #f59e0b',
                borderRadius: '16px',
                boxShadow: '0 4px 14px rgba(245, 158, 11, 0.12)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b45309', fontWeight: 800, fontSize: '1.05rem' }}>
                <AlertTriangleIcon size={20} color="#b45309" />
                <span>CẢNH BÁO: ĐƠN VỊ CÓ LỊCH SỬ ĐÁNH GIÁ THẤP ({proposal.ratingSummary?.average_stars} sao)</span>
              </div>
              <p style={{ margin: '0.4rem 0 0.75rem', fontSize: '0.9rem', color: '#92400e', lineHeight: 1.5 }}>
                Đơn vị <strong>{proposal.organization_unit}</strong> từng nhận đánh giá <strong>1, 2 hoặc 3 sao</strong> từ các phòng ban ở các chương trình trước. Các cấp phê duyệt vui lòng kiểm tra kỹ kế hoạch và bổ sung ghi chú dặn dò trước khi duyệt.
              </p>

              {recentLowRatings.length > 0 && (
                <div style={{ background: '#ffffff', borderRadius: '12px', padding: '0.85rem 1.15rem', border: '1px solid #fde68a' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#78350f', textTransform: 'uppercase' }}>
                    Chi tiết các đánh giá thấp trước đây:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {recentLowRatings.map((r, idx) => (
                      <div key={idx} style={{ fontSize: '0.875rem', color: '#334155', display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#d97706', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <StarIcon size={13} color="#d97706" fill="#d97706" />
                          <span>{r.stars} / 5 sao</span>
                        </span>
                        <strong style={{ color: '#0f172a' }}>[{getRatingDepartmentLabel(r.rater_tier)}]:</strong>
                        <span>"{r.feedback || 'Không có nhận xét chi tiết'}"</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 'auto' }}>
                          {new Date(r.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 📢 LƯU Ý & CĂN DẶN TỪ CÁC CẤP PHÊ DUYỆT (HIỂN THỊ TO Ở TRÊN CÙNG ĐỂ ĐƠN VỊ THẤY NGAY) */}
          {approvalNotesList.length > 0 && (
            <div
              style={{
                padding: '1.25rem 1.5rem',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '2px solid #86efac',
                borderRadius: '16px',
                boxShadow: '0 4px 14px rgba(34, 197, 94, 0.12)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#15803d', fontWeight: 800, fontSize: '1.05rem', marginBottom: '0.85rem' }}>
                <MessageSquareIcon size={18} color="#15803d" />
                <span>Ý KIẾN & CĂN DẶN TỪ CÁC CẤP PHÊ DUYỆT DÀNH CHO ĐƠN VỊ:</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {approvalNotesList.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      padding: '1rem 1.25rem',
                      border: '1.5px solid #bbf7d0',
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.25rem' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.925rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <BuildingIcon size={14} color="#166534" />
                        <span>{getStageDepartmentName(log.stage, log.actor_email)}</span>
                        <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748b' }}>({log.actor_email})</span>
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    <div style={{ fontSize: '1rem', color: '#0f172a', lineHeight: 1.5, fontWeight: 600, background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '8px', borderLeft: '4px solid #10b981' }}>
                      "{log.notes}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SỰ KIỆN ĐÃ ĐƯỢC TẠO SAU KHI DUYỆT XONG */}
          {proposal.status === 'approved' && proposal.created_event_id && (
            <div
              style={{
                padding: '1.25rem 1.5rem',
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                border: '1.5px solid #a7f3d0',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <span style={{ fontSize: '0.85rem', color: '#047857', fontWeight: 700 }}>
                  Kế hoạch đã hoàn tất duyệt & Kích hoạt sự kiện chính thức:
                </span>
                <div style={{ fontWeight: 800, fontSize: '1.15rem', color: '#065f46', marginTop: '0.2rem' }}>
                  {proposal.title}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Link
                  href={`/admin/events/${proposal.created_event_id}`}
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#059669',
                    color: '#ffffff',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)',
                  }}
                >
                  <QrCodeIcon size={16} color="#ffffff" />
                  Mở Bàn Điều Khiển Sự Kiện ➔
                </Link>

                <Link
                  href={`/events/${proposal.created_event_id}/register`}
                  target="_blank"
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#ffffff',
                    color: '#059669',
                    border: '1.5px solid #a7f3d0',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                  }}
                >
                  Link Đăng Ký (Khán giả)
                </Link>

                <Link
                  href={`/events/${proposal.created_event_id}/recruitment`}
                  target="_blank"
                  style={{
                    padding: '0.65rem 1.25rem',
                    background: '#eff6ff',
                    color: '#2563eb',
                    border: '1.5px solid #bfdbfe',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    textDecoration: 'none',
                  }}
                >
                  Link Tuyển CTV
                </Link>
              </div>
            </div>
          )}

          {/* ACTION BANNER (CHO CẤP CÓ THẨM QUYỀN DUYỆT Ở BƯỚC HIỆN TẠI) */}
          {canActOnThisStage && proposal.status === 'pending' && (
            <div
              style={{
                padding: '1.25rem 1.5rem',
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '1.5px solid #bfdbfe',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <span style={{ fontSize: '0.85rem', color: '#1e40af', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ShieldCheckIcon size={16} color="#1e40af" />
                    <span>Thao tác phê duyệt thẩm quyền của bạn:</span>
                  </span>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e3a8a', marginTop: '0.2rem' }}>
                    {getStageLabel(proposal.current_stage)}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleConfirmApprove}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.35rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    {actionLoading ? 'Đang duyệt...' : 'Phê Duyệt Cấp Này'}
                  </button>

                  {proposal.current_stage === 'super_admin' && (
                    <Link
                      href={`/super-admin?from_proposal=${proposal.id}&name=${encodeURIComponent(
                        proposal.title
                      )}&date=${proposal.start_date}&start=${proposal.start_time}&end=${proposal.end_time}`}
                      style={{
                        padding: '0.65rem 1.25rem',
                        background: '#eff6ff',
                        color: '#2563eb',
                        border: '1.5px solid #bfdbfe',
                        borderRadius: '10px',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      Điền Sẵn Sang Trang Tạo Sự Kiện ➔
                    </Link>
                  )}

                  <button
                    onClick={() => {
                      const reason = prompt('Nhập lý do từ chối kế hoạch:', 'Chưa đạt yêu cầu tổ chức');
                      if (reason) {
                        handleConfirmReject(reason);
                      }
                    }}
                    disabled={actionLoading}
                    style={{
                      padding: '0.65rem 1.25rem',
                      background: '#ffffff',
                      color: '#dc2626',
                      border: '1.5px solid #fecaca',
                      borderRadius: '10px',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                    }}
                  >
                    Từ Chối
                  </button>
                </div>
              </div>

              {/* Ô Ghi Chú Trực Tiếp */}
              <div>
                <input
                  type="text"
                  placeholder="Ghi chú / Căn dặn đơn vị tổ chức (Tùy chọn: có thể để trống hoặc điền rồi bấm Duyệt ngay)..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: '1.5px solid #bfdbfe',
                    fontSize: '0.9rem',
                    background: '#ffffff',
                    color: '#1e293b',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          )}

          {/* ═══════════════ TIẾN TRÌNH THẨM ĐỊNH KẾ HOẠCH ═══════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ShieldCheckIcon size={20} color="#2563eb" />
              <span>Tiến Trình Phê Duyệt Kế Hoạch:</span>
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Bước 1: Đoàn TN */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderRadius: '14px',
                  border: getStepStatus('youth_union') === 'done' ? '1.5px solid #86efac' : getStepStatus('youth_union') === 'skipped' ? '1.5px solid #e2e8f0' : '1.5px solid #bbf7d0',
                  background: getStepStatus('youth_union') === 'done' ? '#f0fdf4' : getStepStatus('youth_union') === 'skipped' ? '#f8fafc' : '#ffffff',
                  opacity: getStepStatus('youth_union') === 'skipped' ? 0.65 : 1,
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: getStepStatus('youth_union') === 'done' ? '#16a34a' : getStepStatus('youth_union') === 'skipped' ? '#94a3b8' : '#16a34a',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getStepStatus('youth_union') === 'done' ? '✓' : getStepStatus('youth_union') === 'skipped' ? '—' : '1'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      1. Đoàn TNCS Học Viện Xét Duyệt
                      {getStepStatus('youth_union') === 'skipped' && ' — Tự động miễn duyệt (Đơn vị Khoa)'}
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {getStepStatus('youth_union') === 'done'
                        ? '✓ Đã xét duyệt nội dung & chấp thuận kế hoạch'
                        : getStepStatus('youth_union') === 'skipped'
                        ? 'Đơn vị Khoa mượn phòng được đẩy thẳng tới Phòng. TC-HC-QT'
                        : 'Đang chờ Đoàn TNCS Học Viện xét duyệt kế hoạch...'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.3rem 0.75rem',
                    borderRadius: '20px',
                    background: getStepStatus('youth_union') === 'done' ? '#dcfce7' : getStepStatus('youth_union') === 'skipped' ? '#f1f5f9' : '#dcfce7',
                    color: getStepStatus('youth_union') === 'done' ? '#166534' : getStepStatus('youth_union') === 'skipped' ? '#64748b' : '#15803d',
                    textTransform: 'uppercase',
                  }}
                >
                  {getStepStatus('youth_union') === 'done' ? 'Đã duyệt' : getStepStatus('youth_union') === 'skipped' ? 'Miễn duyệt' : 'Bắt buộc'}
                </span>
              </div>

              {/* Bước 2: Phòng CTSV */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderRadius: '14px',
                  border: getStepStatus('ctsv') === 'done' ? '1.5px solid #86efac' : getStepStatus('ctsv') === 'skipped' ? '1.5px solid #e2e8f0' : '1.5px solid #bfdbfe',
                  background: getStepStatus('ctsv') === 'done' ? '#f0fdf4' : getStepStatus('ctsv') === 'skipped' ? '#f8fafc' : '#ffffff',
                  opacity: getStepStatus('ctsv') === 'skipped' ? 0.65 : 1,
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: getStepStatus('ctsv') === 'done' ? '#16a34a' : getStepStatus('ctsv') === 'current' ? '#2563eb' : '#94a3b8',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getStepStatus('ctsv') === 'done' ? '✓' : getStepStatus('ctsv') === 'skipped' ? '—' : '2'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      2. Phòng Công Tác Sinh Viên (CTSV) Thẩm Định
                      {getStepStatus('ctsv') === 'skipped' && ' — Tự động miễn duyệt (Đơn vị Khoa)'}
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {getStepStatus('ctsv') === 'done'
                        ? '✓ Đã phê duyệt phương án và nội dung sinh viên tham gia'
                        : getStepStatus('ctsv') === 'current'
                        ? 'Đang chờ Phòng CTSV thẩm định phê duyệt...'
                        : getStepStatus('ctsv') === 'skipped'
                        ? 'Đơn vị Khoa mượn phòng được đẩy thẳng tới Phòng. TC-HC-QT'
                        : 'Chờ hoàn thành bước 1'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.3rem 0.75rem',
                    borderRadius: '20px',
                    background: getStepStatus('ctsv') === 'done' ? '#dcfce7' : getStepStatus('ctsv') === 'current' ? '#dbeafe' : '#f1f5f9',
                    color: getStepStatus('ctsv') === 'done' ? '#166534' : getStepStatus('ctsv') === 'current' ? '#1e40af' : '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {getStepStatus('ctsv') === 'done' ? 'Đã duyệt' : getStepStatus('ctsv') === 'skipped' ? 'Miễn duyệt' : getStepStatus('ctsv') === 'current' ? 'Chờ duyệt' : 'Chờ đến lượt'}
                </span>
              </div>

              {/* Bước 3: Phòng. TC-HC-QT Cấp Phòng */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderRadius: '14px',
                  border: getStepStatus('facility') === 'done' ? '1.5px solid #86efac' : '1.5px solid #e2e8f0',
                  background: getStepStatus('facility') === 'done' ? '#f0fdf4' : getStepStatus('facility') === 'skipped' ? '#f8fafc' : '#ffffff',
                  opacity: getStepStatus('facility') === 'skipped' ? 0.65 : 1,
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.03)',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '10px',
                      background: getStepStatus('facility') === 'done' ? '#16a34a' : getStepStatus('facility') === 'current' ? '#ea580c' : '#94a3b8',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getStepStatus('facility') === 'done' ? '✓' : getStepStatus('facility') === 'skipped' ? '—' : '3'}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                      3. Phòng. TC-HC-QT Cấp Phòng
                      {!proposal.requires_facility_approval && ' — Tự động miễn duyệt (Không mượn phòng)'}
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {getStepStatus('facility') === 'done'
                        ? `✓ Đã duyệt cấp phòng "${proposal.room_name}" & Kích hoạt sự kiện`
                        : getStepStatus('facility') === 'current'
                        ? `Đang chờ Phòng. TC-HC-QT duyệt cấp địa điểm: ${proposal.room_name}...`
                        : getStepStatus('facility') === 'skipped'
                        ? 'Chương trình không mượn phòng trực tiếp, hoàn tất sau khi CTSV duyệt'
                        : 'Chờ đến lượt'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    padding: '0.3rem 0.75rem',
                    borderRadius: '20px',
                    background: getStepStatus('facility') === 'done' ? '#dcfce7' : getStepStatus('facility') === 'current' ? '#ffedd5' : '#f1f5f9',
                    color: getStepStatus('facility') === 'done' ? '#166534' : getStepStatus('facility') === 'current' ? '#c2410c' : '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  {getStepStatus('facility') === 'done' ? 'Đã duyệt' : getStepStatus('facility') === 'skipped' ? 'Miễn duyệt' : getStepStatus('facility') === 'current' ? 'Chờ duyệt' : 'Chờ đến lượt'}
                </span>
              </div>
            </div>
          </div>

          {/* ═══════════════ KẾ HOẠCH SƠ BỘ & TÀI LIỆU ĐÍNH KÈM (GOOGLE DRIVE / PDF) ═══════════════ */}
          <div
            style={{
              padding: '1.5rem',
              background: '#f8fafc',
              border: '1.5px solid #e2e8f0',
              borderRadius: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FileTextIcon size={20} color="#2563eb" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                  Kế Hoạch Sơ Bộ & Tài Liệu Đính Kèm
                </h3>
              </div>

              {proposal.plan_url && (
                <a
                  href={proposal.plan_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    padding: '0.55rem 1.15rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '0.875rem',
                    textDecoration: 'none',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <FileTextIcon size={16} color="#ffffff" />
                  <span>Xem File Kế Hoạch Chi Tiết (Google Drive) ↗</span>
                </a>
              )}
            </div>

            {proposal.description ? (
              <div
                style={{
                  background: '#ffffff',
                  padding: '1rem 1.25rem',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  fontSize: '0.925rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                }}
              >
                {proposal.description}
              </div>
            ) : (
              <div style={{ color: '#94a3b8', fontSize: '0.875rem', fontStyle: 'italic' }}>
                Đơn vị không đính kèm mô tả sơ bộ bằng văn bản.
              </div>
            )}
          </div>

          {/* ═══════════════ THÔNG TIN CHI TIẾT SỰ KIỆN (4 CARDS GRID) ═══════════════ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ClockIcon size={14} color="#64748b" />
                <span>Giờ Bắt Đầu</span>
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {proposal.start_time.slice(0, 5)} ngày {new Date(proposal.start_date).toLocaleDateString('vi-VN')}
              </span>
            </div>

            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ClockIcon size={14} color="#64748b" />
                <span>Giờ Kết Thúc</span>
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {proposal.end_time.slice(0, 5)} ngày {new Date(proposal.end_date).toLocaleDateString('vi-VN')}
              </span>
            </div>

            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPinIcon size={14} color="#64748b" />
                <span>Địa Điểm Tổ Chức</span>
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {proposal.room_name}
              </span>
            </div>

            <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '16px', padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <UsersIcon size={14} color="#64748b" />
                <span>Tổng Quy Mô Dự Kiến</span>
              </span>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                {proposal.total_count} người
              </span>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                ({proposal.participant_count} SV, {proposal.volunteer_count} CTV, {proposal.organizer_count} BTC)
              </span>
            </div>
          </div>

          {/* ═══════════════ MỤC ĐÁNH GIÁ CHẤT LƯỢNG SAU CHƯƠNG TRÌNH (CHO 4 CẤP ADMIN) ═══════════════ */}
          {(proposal.status === 'approved' || isApproverRole) && (
            <div
              style={{
                marginTop: '1rem',
                padding: '1.5rem',
                background: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <StarIcon size={18} color="#f59e0b" />
                    <span>Đánh Giá Chất Lượng Tổ Chức Sau Chương Trình</span>
                  </h3>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                    Dành cho 4 cấp Ban ngành đánh giá (1-3 sao sẽ kích hoạt cảnh báo lưu ý cho lần trình kế hoạch sau)
                  </p>
                </div>

                {proposal.eventRatings && proposal.eventRatings.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#ffffff', padding: '0.4rem 0.8rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <StarIcon size={16} color="#f59e0b" fill="#f59e0b" />
                    <span style={{ fontSize: '1rem', color: '#0f172a', fontWeight: 800 }}>
                      {(proposal.eventRatings.reduce((a, c) => a + c.stars, 0) / proposal.eventRatings.length).toFixed(1)} / 5
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>({proposal.eventRatings.length} lượt đánh giá)</span>
                  </div>
                )}
              </div>

              {/* Form gửi đánh giá cho Approver */}
              {isApproverRole && (
                <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#334155', marginBottom: '0.5rem' }}>
                    Gửi nhận xét từ: <span style={{ color: '#2563eb' }}>{getRatingDepartmentLabel(tier)}</span>
                  </div>

                  {/* Interactive Star Picker */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Mức độ hài lòng:</span>
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
                      {ratingStars} Sao {ratingStars <= 3 ? '(Gắn cờ lưu ý)' : '(Đạt tiêu chuẩn)'}
                    </span>
                  </div>

                  <textarea
                    rows={2}
                    placeholder="Ghi nhận xét đánh giá (VD: Công tác chuẩn bị tốt / Trễ giờ 30p, chưa dọn phòng...)"
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
                      outline: 'none',
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={handleSubmitRating}
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
                      {submittingRating ? 'Đang gửi...' : 'Gửi Nhận Xét Đánh Giá'}
                    </button>
                  </div>
                </div>
              )}

              {/* Danh sách các đánh giá nhận được */}
              {proposal.eventRatings && proposal.eventRatings.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {proposal.eventRatings.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        background: '#ffffff',
                        borderRadius: '10px',
                        padding: '0.85rem 1rem',
                        border: '1px solid #e2e8f0',
                        borderLeft: r.stars <= 3 ? '4px solid #f59e0b' : '4px solid #10b981',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                        <div>
                          <strong style={{ color: '#0f172a', fontSize: '0.875rem' }}>
                            {getRatingDepartmentLabel(r.rater_tier)}
                          </strong>
                          <span style={{ fontSize: '0.775rem', color: '#64748b', marginLeft: '0.4rem' }}>({r.rater_email})</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#d97706', fontWeight: 800, fontSize: '0.875rem' }}>
                          <StarIcon size={14} color="#f59e0b" fill="#f59e0b" />
                          <span>{r.stars} / 5 sao</span>
                        </div>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
                        {r.feedback || 'Không có nhận xét chi tiết.'}
                      </p>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem', display: 'block' }}>
                        {new Date(r.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
                  Chưa có đánh giá nào từ các phòng ban cho chương trình này.
                </p>
              )}
            </div>
          )}

          {/* ═══════════════ AUDIT LOGS (DÀNH RIÊNG CHO SUPER ADMIN) ═══════════════ */}
          {isSuperAdmin && (
            <div style={{ paddingTop: '1.5rem', borderTop: '1.5px solid #f1f5f9' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <ShieldCheckIcon size={16} color="#dc2626" />
                  <span>Nhật Ký Kiểm Toán Cán Bộ (Chỉ Super Admin):</span>
                </h3>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                  Bảo Mật Nội Bộ
                </span>
              </div>

              {proposal.logs && proposal.logs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {proposal.logs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        background: '#f8fafc',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                        <span>
                          <strong style={{ color: '#0f172a' }}>{log.actor_name || log.actor_email}</strong> ({log.actor_email})
                        </span>
                        <span>{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#334155' }}>{log.notes}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: '#64748b', fontSize: '0.85rem' }}>Chưa có nhật ký nào.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
