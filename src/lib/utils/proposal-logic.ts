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
  const isBorrowingRoom = !!roomId && roomName !== 'Không mượn' && roomName !== 'Trực tuyến' && roomName !== '';
  const isFaculty = isKhoaUnit(organizationUnit);

  if (isFaculty) {
    // Đơn vị Khoa mượn phòng đẩy thẳng qua Phòng. TC-HC-QT phê duyệt cấp phòng
    return {
      requiresYouthUnion: false,
      requiresCtsv: false,
      requiresFacility: true,
      stagesList: ['facility'],
      initialStage: 'facility',
      isDirectFaculty: true,
    };
  }

  const requiresCtsv = true; // Luôn cần Phòng CTSV duyệt
  const requiresFacility = isBorrowingRoom; // Cần Phòng. TC-HC-QT duyệt nếu có mượn phòng

  const stagesList: ProposalStage[] = ['youth_union', 'ctsv'];
  if (requiresFacility) stagesList.push('facility');

  return {
    requiresYouthUnion: true,
    requiresCtsv,
    requiresFacility,
    stagesList,
    initialStage: 'youth_union',
    isDirectFaculty: false,
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
    if (requiresCtsv) return 'ctsv';
    if (requiresFacility) return 'facility';
    return 'approved';
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
    case 'youth_union':
      return '1. Đoàn TNCS Học Viện (Duyệt kế hoạch)';
    case 'ctsv':
      return '2. Phòng Công Tác Sinh Viên (CTSV)';
    case 'facility':
      return '3. Phòng. TC-HC-QT (Cấp phòng)';
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
