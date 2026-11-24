import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentWeeklyTimetable from '@/components/StudentWeeklyTimetable';

describe('StudentWeeklyTimetable', () => {
  const todayVN = '2026-11-25'; // Wednesday, week 2026-11-23 -> 2026-11-29

  const sampleRegistrations = [
    {
      id: 'r1',
      event_id: 'ev-today',
      event_name: 'Tập huấn Kỹ năng Cán bộ Đoàn',
      event_date: '2026-11-25',
      start_time: '08:00',
      end_time: '11:00',
      role_type: 'participant',
      status: 'active',
      attended: false,
      sessions: [],
    },
    {
      id: 'r2',
      event_id: 'ev-evening',
      event_name: 'Gala Sinh viên PTIT',
      event_date: '2026-11-27',
      start_time: '18:30',
      end_time: '21:00',
      role_type: 'organizer',
      status: 'active',
      attended: false,
      sessions: [],
    },
    {
      id: 'r3',
      event_id: 'ev-next-week',
      event_name: 'Hội nghị Tổng kết Học kỳ',
      event_date: '2026-12-03',
      start_time: '14:00',
      end_time: '17:00',
      role_type: 'volunteer',
      review_status: 'accepted',
      status: 'active',
      attended: false,
      sessions: [],
    },
  ];

  const sampleDutyShifts = [
    {
      id: 'd1',
      duty_date: '2026-11-24',
      shift: 'afternoon' as const,
      status: null,
    },
  ];

  const sampleBorrowRequests = [
    {
      id: 'b1',
      purpose: 'Mượn loa sự kiện',
      borrow_date: '2026-11-26',
      due_date: '2026-11-28',
      status: 'approved',
      items: [{ item_name: 'Loa kéo di động', quantity: 1 }],
    },
    {
      id: 'b-late',
      purpose: 'Mượn micro tuần trước',
      borrow_date: '2026-11-18',
      due_date: '2026-11-20',
      status: 'borrowed',
      items: [{ item_name: 'Micro cầm tay', quantity: 2 }],
    },
  ];

  it('renders 7-day columns, 3 periods, overdue warning, and merged items', () => {
    render(
      <StudentWeeklyTimetable
        registrations={sampleRegistrations}
        checkedInEventIds={new Set()}
        dutyShifts={sampleDutyShifts}
        borrowRequests={sampleBorrowRequests}
        todayVN={todayVN}
      />
    );

    const grid = screen.getByTestId('weekly-timetable-grid');
    for (const dayShort of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      expect(within(grid).getByText(dayShort)).toBeInTheDocument();
    }
    for (const period of ['Sáng', 'Chiều', 'Tối']) {
      expect(within(grid).getByText(period)).toBeInTheDocument();
    }

    expect(within(grid).getByText('Tập huấn Kỹ năng Cán bộ Đoàn')).toBeInTheDocument();
    expect(within(grid).getByText('Gala Sinh viên PTIT')).toBeInTheDocument();
    expect(within(grid).getByText('Trực Văn phòng Đoàn (Ca Chiều)')).toBeInTheDocument();
    expect(within(grid).getByText('Mượn: Loa kéo di động (×1)')).toBeInTheDocument();
    expect(within(grid).getByText('Trả: Loa kéo di động (×1)')).toBeInTheDocument();

    // Overdue alert banner for past due borrow item
    expect(screen.getByRole('alert')).toHaveTextContent('quá hạn');
  });

  it('filters by category, opens item detail with action & QR scan, and navigates weeks', async () => {
    const user = userEvent.setup();
    const onOpenScanner = jest.fn();

    render(
      <StudentWeeklyTimetable
        registrations={sampleRegistrations}
        checkedInEventIds={new Set()}
        dutyShifts={sampleDutyShifts}
        borrowRequests={sampleBorrowRequests}
        todayVN={todayVN}
        onOpenScanner={onOpenScanner}
      />
    );

    const grid = screen.getByTestId('weekly-timetable-grid');
    const filterGroup = screen.getByRole('group', { name: 'Lọc loại lịch' });

    // Filter to duty shifts only
    await user.click(within(filterGroup).getByRole('button', { name: /Trực VPĐ/i }));
    expect(within(grid).getByText('Trực Văn phòng Đoàn (Ca Chiều)')).toBeInTheDocument();
    expect(within(grid).queryByText('Tập huấn Kỹ năng Cán bộ Đoàn')).not.toBeInTheDocument();

    // Filter to borrow pickup/return only
    await user.click(within(filterGroup).getByRole('button', { name: /Mượn \/ Trả đồ/i }));
    expect(within(grid).getByText('Mượn: Loa kéo di động (×1)')).toBeInTheDocument();
    expect(within(grid).queryByText('Trực Văn phòng Đoàn (Ca Chiều)')).not.toBeInTheDocument();

    // Reset to all and click today's event pill to inspect details + scanner button
    await user.click(within(filterGroup).getByRole('button', { name: /Tất cả/i }));
    await user.click(within(grid).getByText('Tập huấn Kỹ năng Cán bộ Đoàn'));

    const detail = screen.getByTestId('timetable-item-detail');
    expect(within(detail).getByText('Hôm nay')).toBeInTheDocument();
    expect(within(detail).getByRole('link', { name: /Xem sự kiện/i })).toHaveAttribute(
      'href',
      '/?view=student&tab=registered'
    );

    await user.click(within(detail).getByRole('button', { name: /Quét QR điểm danh/i }));
    expect(onOpenScanner).toHaveBeenCalledTimes(1);

    // Week navigation forward & back
    await user.click(screen.getByRole('button', { name: /Tuần sau/i }));
    expect(within(grid).getByText('Hội nghị Tổng kết Học kỳ')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Tuần trước/i }));
    expect(within(grid).getByText('Tập huấn Kỹ năng Cán bộ Đoàn')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Tuần sau/i }));
    await user.click(screen.getByRole('button', { name: 'Tuần này' }));
    expect(within(grid).getByText('Tập huấn Kỹ năng Cán bộ Đoàn')).toBeInTheDocument();
  });

  it('offers one-click jump to next scheduled week when current week is empty', async () => {
    const user = userEvent.setup();
    render(
      <StudentWeeklyTimetable
        registrations={[sampleRegistrations[2]]} // Only in next week (2026-12-03)
        checkedInEventIds={new Set()}
        todayVN={todayVN}
      />
    );

    expect(screen.getByText(/Tuần này trống lịch/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Xem tuần đó/i }));

    const grid = screen.getByTestId('weekly-timetable-grid');
    expect(within(grid).getByText('Hội nghị Tổng kết Học kỳ')).toBeInTheDocument();
  });
});
