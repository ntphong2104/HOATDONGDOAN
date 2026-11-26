import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DEFAULT_ACADEMIC_SEMESTERS,
  getActiveSemester,
  isEventInSemester,
} from '@/lib/utils/semesters';
import { LCD_DEFINITIONS, resolveStudentLcd } from '@/lib/utils/lcd';
import { getMasterStudentDirectory } from '@/lib/utils/student-profile';
import {
  buildSchoolYouthUnionEmailSet,
  classifyEventForRanking,
} from '@/lib/utils/ranking-scope';
import RankingBoard from '@/components/RankingBoard';
import type { RankingResponseData } from '@/lib/types';

describe('Academic Semesters & Ranking Unit Tests', () => {
  it('has at least 5 default academic semesters defined', () => {
    expect(DEFAULT_ACADEMIC_SEMESTERS.length).toBeGreaterThanOrEqual(5);
    const active = DEFAULT_ACADEMIC_SEMESTERS.find((s) => s.is_active);
    expect(active).toBeDefined();
    expect(active?.id).toBe('HK1-2026-2027');
  });

  it('correctly resolves active semester', () => {
    const active = getActiveSemester(DEFAULT_ACADEMIC_SEMESTERS);
    expect(active.is_active).toBe(true);
    expect(active.id).toBe('HK1-2026-2027');
  });

  it('correctly checks if an event date falls within semester', () => {
    const sem = DEFAULT_ACADEMIC_SEMESTERS[0]; // 2026-09-01 -> 2027-01-31
    expect(isEventInSemester('2026-10-15', sem)).toBe(true);
    expect(isEventInSemester('2026-09-01', sem)).toBe(true);
    expect(isEventInSemester('2027-01-31', sem)).toBe(true);
    expect(isEventInSemester('2026-08-30', sem)).toBe(false);
    expect(isEventInSemester('2027-02-05', sem)).toBe(false);
  });

  it('loads all 8 official LCĐs with non-zero student counts', () => {
    const masterDir = getMasterStudentDirectory();
    expect(masterDir.size).toBe(4491);

    const counts = new Map<string, number>();
    for (const [rawMssv, info] of masterDir.entries()) {
      const classId = info.class_id;
      const lcd = resolveStudentLcd(classId, rawMssv);
      if (lcd) {
        counts.set(lcd.code, (counts.get(lcd.code) || 0) + 1);
      }
    }

    expect(LCD_DEFINITIONS.length).toBe(8);
    for (const lcd of LCD_DEFINITIONS) {
      const count = counts.get(lcd.code) || 0;
      expect(count).toBeGreaterThan(0);
    }
    expect(counts.get('LCD_CNTT')).toBe(1170);
  });

  describe('3-Scope Event Classification (Tổng / Đoàn Trường & Phát động / Cơ sở)', () => {
    const officerEmails = buildSchoolYouthUnionEmailSet([
      {
        id: '1',
        email: 'canbovpd@student.ptithcm.edu.vn',
        role_tier: 'office_admin',
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);

    it('classifies support/campaign events as school scope with support campaignKind', () => {
      const res = classifyEventForRanking({
        metaUnit: 'Văn phòng Đoàn Học Viện',
        creatorEmail: 'canbovpd@student.ptithcm.edu.vn',
        isSupportEvent: true,
        schoolOfficerEmails: officerEmails,
      });
      expect(res.rankingScope).toBe('school');
      expect(res.campaignKind).toBe('support');
    });

    it('classifies official Đoàn Trường / BCH Đoàn events as school scope', () => {
      const byProposal = classifyEventForRanking({
        proposalUnit: 'Đoàn TNCS Học Viện Cơ Sở TP.HCM',
        creatorEmail: 'bchdoan@ptithcm.edu.vn',
        schoolOfficerEmails: officerEmails,
      });
      expect(byProposal.rankingScope).toBe('school');
      expect(byProposal.campaignKind).toBe('official');

      const directByRoot = classifyEventForRanking({
        creatorEmail: 'n22dccn158@student.ptithcm.edu.vn',
        schoolOfficerEmails: officerEmails,
      });
      expect(directByRoot.rankingScope).toBe('school');
      expect(directByRoot.campaignKind).toBe('official');
    });

    it('keeps LCĐ, CLB, and Faculty events in the other (grassroots) scope even if submitted by Super Admin', () => {
      const clb = classifyEventForRanking({
        proposalUnit: 'CLB An toàn Thông tin',
        creatorEmail: 'n22dccn158@student.ptithcm.edu.vn',
        schoolOfficerEmails: officerEmails,
      });
      expect(clb.rankingScope).toBe('other');
      expect(clb.unitType).toBe('clb');
      expect(clb.lcdCode).toBeNull();

      const lcd = classifyEventForRanking({
        proposalUnit: 'LCĐ An toàn Thông tin',
        creatorEmail: 'lcdattt@student.ptithcm.edu.vn',
        schoolOfficerEmails: officerEmails,
      });
      expect(lcd.rankingScope).toBe('other');
      expect(lcd.unitType).toBe('lcd');
      expect(lcd.lcdCode).toBe('LCD_ATTT');

      const faculty = classifyEventForRanking({
        proposalUnit: 'Khoa Công Nghệ Thông Tin 2',
        creatorEmail: 'khoacntt@ptithcm.edu.vn',
        schoolOfficerEmails: officerEmails,
      });
      expect(faculty.rankingScope).toBe('other');
      expect(faculty.unitType).toBe('faculty');
    });
  });

  describe('RankingBoard 3-Scope UI Switching', () => {
    const sampleLcd = (code: string, name: string, shortName: string, count: number) => ({
      rank: 1,
      lcd_code: code,
      lcd_name: name,
      lcd_short_name: shortName,
      lcd_color: 'var(--lcd-cntt-fg)',
      total_students: 1000,
      active_students_count: count,
      total_participations: count,
      participation_rate: Number(((count / 1000) * 100).toFixed(1)),
      events_organized_count: 2,
    });

    it('switches instantaneously between Tổng hợp, Đoàn Trường & Phát động, and Hoạt động Cơ sở', async () => {
      const mockPayload: RankingResponseData = {
        semester: DEFAULT_ACADEMIC_SEMESTERS[0],
        all_semesters: [DEFAULT_ACADEMIC_SEMESTERS[0]],
        can_select_semester: false,
        lcd_rankings: [sampleLcd('LCD_CNTT', 'LCĐ Khoa Công nghệ Thông tin', 'LCĐ CNTT', 150)],
        unit_rankings: [
          {
            rank: 1,
            unit_name: 'CLB ITMC',
            unit_type: 'clb',
            lcd_code: null,
            lcd_color: '#7c3aed',
            events_count: 3,
            total_participants: 90,
            unique_participants: 80,
            avg_participants_per_event: 30,
          },
        ],
        top_students: [],
        total_events_in_semester: 10,
        total_participations_in_semester: 150,
        total_students_participated: 120,
        school_events: [
          {
            rank: 1,
            event_id: 'evt-school-1',
            event_name: 'Ra quân Chủ Nhật Xanh Toàn Trường',
            event_date: '2026-11-20',
            unit_name: 'Văn phòng Đoàn Học Viện',
            campaign_kind: 'support',
            total_participants: 60,
          },
        ],
        scopes: {
          all: {
            scope: 'all',
            total_events: 10,
            total_participations: 150,
            total_students_participated: 120,
            lcd_rankings: [sampleLcd('LCD_CNTT', 'LCĐ Khoa Công nghệ Thông tin', 'LCĐ CNTT', 150)],
            top_students: [],
          },
          school: {
            scope: 'school',
            total_events: 4,
            support_events_count: 3,
            official_school_events_count: 1,
            total_participations: 60,
            total_students_participated: 55,
            lcd_rankings: [sampleLcd('LCD_CNTT', 'LCĐ Khoa Công nghệ Thông tin', 'LCĐ CNTT', 60)],
            top_students: [],
          },
          other: {
            scope: 'other',
            total_events: 6,
            total_participations: 90,
            total_students_participated: 80,
            lcd_rankings: [sampleLcd('LCD_CNTT', 'LCĐ Khoa Công nghệ Thông tin', 'LCĐ CNTT', 90)],
            top_students: [],
          },
        },
      };

      const origFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: mockPayload }),
      } as any);

      try {
        const user = userEvent.setup();
        render(React.createElement(RankingBoard, { highlightLcdCode: 'LCD_CNTT' }));

        await waitFor(() => {
          expect(screen.getByText('Tổng hợp Toàn trường')).toBeInTheDocument();
        });

        expect(screen.getByText('Đoàn Trường: 60 · Cơ sở: 90')).toBeInTheDocument();
        expect(screen.getByText('Tỷ trọng / Tổng SV')).toBeInTheDocument();
        expect(screen.getByText(/0[.,]15 lượt\/SV/)).toBeInTheDocument();

        // Switch to Đoàn Trường & Phát động
        await user.click(screen.getByRole('button', { name: /Đoàn Trường & Phát động/i }));
        expect(screen.getByText('HĐ Đoàn Trường & Phát động')).toBeInTheDocument();

        // View school campaign events sub-tab
        await user.click(screen.getByRole('button', { name: /Danh sách HĐ Đoàn Trường & Phát động/i }));
        expect(screen.getByText('Ra quân Chủ Nhật Xanh Toàn Trường')).toBeInTheDocument();
        expect(screen.getByText('Đợt phát động / Hỗ trợ')).toBeInTheDocument();

        // Switch to Hoạt động Cơ sở (Còn lại)
        await user.click(screen.getByRole('button', { name: /Hoạt động Cơ sở \(Còn lại\)/i }));
        expect(screen.getByText('Sự kiện Cơ sở trong kỳ')).toBeInTheDocument();
        expect(screen.getByText('CLB ITMC')).toBeInTheDocument();
      } finally {
        global.fetch = origFetch;
      }
    });
  });
});
