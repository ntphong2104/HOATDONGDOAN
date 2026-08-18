import type { ProposalStage } from '@/lib/types';

export interface StageRequirement {
  requiresYouthUnion: boolean;
  requiresCtsv: boolean;
  requiresFacility: boolean;
  stagesList: ProposalStage[];
  initialStage: ProposalStage;
  isDirectFaculty: boolean;
}

/**
 * Checks whether an organization unit is an academic faculty (Khoa)
 */
export function isKhoaUnit(unitName?: string): boolean {
  if (!unitName) return false;
  const trimmed = unitName.trim();
  if (
    trimmed.startsWith('LCĐ') ||
    trimmed.startsWith('Liên Chi Đoàn') ||
    trimmed.startsWith('CLB') ||
    trimmed.startsWith('Đội') ||
    trimmed.startsWith('Đoàn')
  ) {
    return false;
  }
  return trimmed.startsWith('Khoa ') || trimmed.startsWith('Khoa');
}

/**
 * Calculates approval stages required for an event proposal:
 * - Đơn vị Khoa: Đẩy thẳng qua Bước 3 (Phòng. TC-HC-QT - Cấp phòng).
 * - Đơn vị Đoàn / LCĐ / CLB:
 *   1. Đoàn Thanh Niên (Đoàn Học Viện) - Duyệt kế hoạch ban đầu
 *   2. Phòng Công Tác Sinh Viên (CTSV) - Thẩm định nội dung & quy mô sinh viên
 *   3. Phòng. TC-HC-QT - Thẩm định & cấp phòng (nếu có mượn phòng)
 */
export function calculateProposalStages(
  participantCount: number,
  roomId?: string | null,
  roomName?: string,
  organizationUnit?: string
): StageRequirement {
  return {
    requiresYouthUnion: false,
    requiresCtsv: false,
    requiresFacility: false,
    stagesList: ['super_admin'],
    initialStage: 'super_admin',
    isDirectFaculty: false,
  };
}

/**
 * Determines the next approval stage when a current stage is approved:
 * Direct 1-step approval -> Approved (Hoàn tất & tạo sự kiện)
 */
export function getNextStage(
  currentStage: ProposalStage,
  requiresCtsv: boolean,
  requiresFacility: boolean
): ProposalStage {
  return 'approved';
}

/**
 * Friendly label for each approval stage
 */
export function getStageLabel(stage: ProposalStage): string {
  switch (stage) {
    case 'super_admin':
      return 'Chờ Super Admin phê duyệt';
    case 'youth_union':
    case 'ctsv':
    case 'facility':
      return 'Chờ phê duyệt';
    case 'approved':
      return 'Đã phê duyệt & Đã tạo sự kiện';
    case 'rejected':
      return 'Bị từ chối';
    default:
      return stage;
  }
}
