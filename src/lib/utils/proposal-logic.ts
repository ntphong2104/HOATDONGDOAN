import type { ProposalStage } from '@/lib/types';

export interface StageRequirement {
  requiresCtsv: boolean;
  requiresFacility: boolean;
  stagesList: ProposalStage[];
}

/**
 * Calculates approval stages required for an event proposal:
 * Because the proposal is submitted through Đoàn, it only needs approval from:
 * 1. Phòng Công Tác Sinh Viên (CTSV) - Thẩm định nội dung & quy mô sinh viên
 * 2. Phòng Tổ Chức Hành Chính / Quản Trị CSVC - Thẩm định & cấp phòng (nếu có mượn phòng)
 */
export function calculateProposalStages(
  participantCount: number,
  roomId?: string | null,
  roomName?: string
): StageRequirement {
  const isBorrowingRoom = !!roomId && roomName !== 'Không mượn' && roomName !== 'Trực tuyến' && roomName !== '';
  const requiresCtsv = true; // Luôn cần Phòng CTSV duyệt
  const requiresFacility = isBorrowingRoom; // Cần Phòng Tổ chức/CSVC duyệt nếu có mượn phòng

  const stagesList: ProposalStage[] = ['ctsv'];
  if (requiresFacility) stagesList.push('facility');

  return {
    requiresCtsv,
    requiresFacility,
    stagesList,
  };
}

/**
 * Determines the next approval stage when a current stage is approved:
 * CTSV -> Facility (nếu mượn phòng) -> Approved (Hoàn tất & tạo sự kiện)
 */
export function getNextStage(
  currentStage: ProposalStage,
  requiresCtsv: boolean,
  requiresFacility: boolean
): ProposalStage {
  if (currentStage === 'youth_union') {
    return 'ctsv';
  }

  if (currentStage === 'ctsv') {
    if (requiresFacility) return 'facility';
    return 'approved';
  }

  if (currentStage === 'facility') {
    return 'approved';
  }

  if (currentStage === 'super_admin') {
    return 'approved';
  }

  return 'approved';
}

/**
 * Friendly label for each approval stage
 */
export function getStageLabel(stage: ProposalStage): string {
  switch (stage) {
    case 'ctsv':
      return '1. Phòng Công Tác Sinh Viên (CTSV)';
    case 'facility':
      return '2. Phòng Tổ Chức Hành Chính (Cấp phòng)';
    case 'youth_union':
      return 'Đoàn TNCS Học Viện';
    case 'super_admin':
      return 'Super Admin Đoàn Trường';
    case 'approved':
      return 'Đã duyệt toàn bộ & Đã tạo sự kiện';
    case 'rejected':
      return 'Bị từ chối';
    default:
      return stage;
  }
}
