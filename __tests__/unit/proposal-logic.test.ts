import {
  calculateProposalStages,
  getNextStage,
  getStageLabel,
} from '@/lib/utils/proposal-logic';

describe('Event Proposal Approval Logic (CTSV & Phòng Tổ Chức)', () => {
  describe('calculateProposalStages', () => {
    test('no room borrowed, <= 50 students: only youth_union, no CTSV', () => {
      const result = calculateProposalStages(40, null, 'Không mượn');
      expect(result.requiresCtsv).toBe(false);
      expect(result.requiresFacility).toBe(false);
      expect(result.stagesList).toEqual(['youth_union']);
    });

    test('> 50 students: CTSV stage required', () => {
      const result = calculateProposalStages(51, null, 'Không mượn');
      expect(result.requiresCtsv).toBe(true);
      expect(result.stagesList).toEqual(['youth_union', 'ctsv']);
    });

    test('session participant_count (default 60) must NOT trigger CTSV when students <= 50', () => {
      const result = calculateProposalStages(40, null, 'Không mượn', undefined, [
        { participant_count: 60 },
      ]);
      expect(result.requiresCtsv).toBe(false);
    });

    test('with room borrowed: triggers Youth Union, CTSV and Facility stages', () => {
      const result = calculateProposalStages(80, 'room-123', 'Hội trường 2B');
      expect(result.requiresCtsv).toBe(true);
      expect(result.requiresFacility).toBe(true);
      expect(result.stagesList).toEqual(['youth_union', 'ctsv', 'facility']);
    });
  });

  describe('getNextStage (Stage Transition State Machine)', () => {
    test('without room borrowing: ctsv -> approved directly', () => {
      const next = getNextStage('ctsv', true, false);
      expect(next).toBe('approved');
    });

    test('with room borrowing: ctsv -> facility -> approved', () => {
      const next1 = getNextStage('ctsv', true, true);
      expect(next1).toBe('facility');

      const next2 = getNextStage('facility', true, true);
      expect(next2).toBe('approved');
    });

    test('legacy youth_union stage transitions to ctsv', () => {
      const next = getNextStage('youth_union', true, true);
      expect(next).toBe('ctsv');
    });
  });

  describe('getStageLabel', () => {
    test('returns descriptive Vietnamese labels for all stages', () => {
      expect(getStageLabel('ctsv')).toContain('Phòng Công Tác Sinh Viên');
      expect(getStageLabel('facility')).toContain('Phòng Tổ Chức');
      expect(getStageLabel('approved')).toContain('Đã duyệt toàn bộ');
      expect(getStageLabel('rejected')).toContain('Bị từ chối');
    });
  });
});
