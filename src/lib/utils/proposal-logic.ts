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
  organizationUnit?: string,
  sessions?: any[]
): StageRequirement {
  const isDirectFaculty = isKhoaUnit(organizationUnit);
  const isBorrowingRoom =
    Boolean(roomId && roomId !== 'none' && roomName !== 'Không mượn') ||
    (Array.isArray(sessions) && sessions.some((s) => s.room_id && s.room_name && s.room_name !== 'Không mượn'));
  const maxParticipants =
    Array.isArray(sessions) && sessions.length > 0
      ? Math.max(participantCount, ...sessions.map((s) => Number(s.participant_count || 0)))
      : participantCount;
  const requiresCtsv = maxParticipants > 50;
  const requiresFacility = isBorrowingRoom;

  if (isDirectFaculty) {
    return {
      requiresYouthUnion: false,
      requiresCtsv: false,
      requiresFacility: true,
      stagesList: ['facility', 'super_admin'],
      initialStage: 'facility',
      isDirectFaculty: true,
    };
  }

  const stagesList: ProposalStage[] = ['youth_union'];
  if (requiresCtsv) {
    stagesList.push('ctsv');
  }
  if (requiresFacility) {
    stagesList.push('facility');
  }
  stagesList.push('super_admin');

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
 */
export function getNextStage(
  currentStage: ProposalStage,
  requiresCtsv: boolean,
  requiresFacility: boolean,
  organizationUnit?: string
): ProposalStage {
  const isDirectFaculty = isKhoaUnit(organizationUnit);

  if (isDirectFaculty) {
    if (currentStage === 'facility') return 'super_admin';
    if (currentStage === 'super_admin') return 'approved';
    return 'approved';
  }

  if (currentStage === 'youth_union') {
    if (requiresCtsv) return 'ctsv';
    if (requiresFacility) return 'facility';
    return 'super_admin';
  }

  if (currentStage === 'ctsv') {
    if (requiresFacility) return 'facility';
    return 'super_admin';
  }

  if (currentStage === 'facility') {
    return 'super_admin';
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
      return 'Đoàn TNCS Học Viện';
    case 'ctsv':
      return 'Phòng Công Tác Sinh Viên';
    case 'facility':
      return 'Phòng. TC-HC-QT (Quản trị & Cấp phòng)';
    case 'super_admin':
      return 'Super Admin';
    case 'approved':
      return 'Đã phê duyệt & Đã tạo sự kiện';
    case 'rejected':
      return 'Bị từ chối';
    default:
      return stage;
  }
}
