import {
  buildStudentScheduleItems,
  classifyPeriod,
  findNextUpcomingItem,
  getWeekDaysVN,
  normalizeDateYMD,
  shiftDateVN,
} from '@/lib/utils/student-schedule';

describe('student-schedule utility', () => {
  it('normalizes and shifts VN dates accurately across week boundaries', () => {
    expect(normalizeDateYMD('2026-11-25')).toBe('2026-11-25');
    expect(normalizeDateYMD('2026-11-24T17:30:00Z')).toBe('2026-11-25');
    expect(normalizeDateYMD('invalid-date')).toBeNull();

    expect(shiftDateVN('2026-11-25', -7)).toBe('2026-11-18');
    expect(shiftDateVN('2026-11-25', 7)).toBe('2026-12-02');
  });

  it('builds 7-day Mon-Sun week columns for mid-week and Sunday anchors', () => {
    const wedWeek = getWeekDaysVN('2026-11-25');
    expect(wedWeek).toHaveLength(7);
    expect(wedWeek[0]).toEqual({
      date: '2026-11-23',
      dayShort: 'T2',
      dayFull: 'Thứ 2',
      dayLabel: '23/11',
      isWeekend: false,
    });
    expect(wedWeek[6]).toEqual({
      date: '2026-11-29',
      dayShort: 'CN',
      dayFull: 'Chủ nhật',
      dayLabel: '29/11',
      isWeekend: true,
    });

    const sunWeek = getWeekDaysVN('2026-11-29');
    expect(sunWeek.map((d) => d.date)).toEqual(wedWeek.map((d) => d.date));
  });

  it('classifies start times into morning, afternoon, and evening periods', () => {
    expect(classifyPeriod('07:30')).toEqual({ period: 'morning', sortMinutes: 450 });
    expect(classifyPeriod('13:00')).toEqual({ period: 'afternoon', sortMinutes: 780 });
    expect(classifyPeriod('18:30')).toEqual({ period: 'evening', sortMinutes: 1110 });
    expect(classifyPeriod(null)).toEqual({ period: 'morning', sortMinutes: 480 });
  });

  it('merges single/multi-session events, office duty shifts, and borrow pickup/return items', () => {
    const todayVN = '2026-11-25';
    const items = buildStudentScheduleItems({
      todayVN,
      checkedInEventIds: new Set<string>(),
      shiftHours: {
        morning: { start: '07:45', end: '11:30' },
        afternoon: { start: '13:15', end: '17:00' },
      },
      registrations: [
        {
          id: 'reg-1',
          event_id: 'ev-1',
          event_name: 'Đêm nhạc Chào Tân Sinh Viên',
          event_date: '2026-11-25',
          start_time: '18:00',
          end_time: '21:30',
          role_type: 'organizer',
          status: 'active',
          attended: false,
          sessions: [],
        },
        {
          id: 'reg-2',
          event_id: 'ev-2',
          event_name: 'Ngày hội Hiến máu',
          event_date: '2026-11-24',
          role_type: 'volunteer',
          review_status: 'accepted',
          status: 'active',
          attended: false,
          session_names: ['Ca Sáng'],
          sessions: [
            {
              id: 's1',
              name: 'Ca Sáng',
              session_date: '2026-11-24',
              start_time: '07:30',
              end_time: '11:00',
              room_name: 'Hội trường 2A08',
            },
            {
              id: 's2',
              name: 'Ca Chiều',
              session_date: '2026-11-26',
              start_time: '13:30',
              end_time: '16:30',
              room_name: 'Sân trường',
            },
          ],
        },
        {
          id: 'reg-3',
          event_id: 'ev-3',
          event_name: 'Sự kiện CTV chờ duyệt',
          event_date: '2026-11-27',
          start_time: '08:00',
          role_type: 'volunteer',
          review_status: 'pending',
          status: 'active',
          attended: false,
          sessions: [],
        },
        {
          id: 'reg-rejected',
          event_id: 'ev-rej',
          event_name: 'Đơn bị từ chối',
          event_date: '2026-11-25',
          role_type: 'volunteer',
          review_status: 'rejected',
          status: 'active',
        },
      ],
      dutyShifts: [
        {
          id: 'duty-1',
          duty_date: '2026-11-25',
          shift: 'morning',
          status: 'checked_in',
          check_in_at: '2026-11-25T00:40:00Z',
        },
        {
          id: 'duty-2',
          duty_date: '2026-11-23',
          shift: 'afternoon',
          status: 'completed',
          check_in_at: '2026-11-23T06:00:00Z',
          check_out_at: '2026-11-23T10:00:00Z',
        },
      ],
      borrowRequests: [
        {
          id: 'b-pending',
          purpose: '[Cơ sở: Q9] Mượn mic tập văn nghệ',
          borrow_date: '2026-11-27',
          due_date: '2026-11-29',
          status: 'pending',
          items: [{ item_name: 'Micro không dây', quantity: 2 }],
        },
        {
          id: 'b-approved',
          purpose: 'Truyền thông',
          borrow_date: '2026-11-25',
          due_date: '2026-11-28',
          status: 'approved',
          items: [{ item_name: 'Loa kéo', quantity: 1 }],
        },
        {
          id: 'b-overdue',
          purpose: 'Mượn bàn tiếp tân',
          borrow_date: '2026-11-18',
          due_date: '2026-11-22',
          status: 'borrowed',
          items: [{ item_name: 'Bàn gấp', quantity: 2 }],
        },
        {
          id: 'b-returned',
          purpose: 'Đã trả rồi',
          borrow_date: '2026-11-20',
          due_date: '2026-11-21',
          status: 'returned',
        },
      ],
    });

    // Rejected event and returned borrow request should be excluded
    expect(items.some((i) => i.title.includes('Đơn bị từ chối'))).toBe(false);
    expect(items.some((i) => i.title.includes('Đã trả rồi'))).toBe(false);

    // Duty shift completed + custom shift hours
    const duty2 = items.find((i) => i.id === 'duty-duty-2');
    expect(duty2?.status).toBe('completed');
    expect(duty2?.timeLabel).toBe('13:15 – 17:00');
    expect(duty2?.href).toBe('/office/duty');

    const duty1 = items.find((i) => i.id === 'duty-duty-1');
    expect(duty1?.status).toBe('today');
    expect(duty1?.timeLabel).toBe('07:45 – 11:30');

    // Multi-session event: s1 completed via session_names, s2 upcoming
    const s1 = items.find((i) => i.id === 'event-ev-2-s1');
    const s2 = items.find((i) => i.id === 'event-ev-2-s2');
    expect(s1?.status).toBe('completed');
    expect(s1?.subtitle).toContain('Hội trường 2A08');
    expect(s2?.status).toBe('upcoming');
    expect(s2?.period).toBe('afternoon');

    // Evening organizer event today
    const ev1 = items.find((i) => i.meta?.eventId === 'ev-1');
    expect(ev1?.period).toBe('evening');
    expect(ev1?.badgeLabel).toBe('BTC');
    expect(ev1?.status).toBe('today');

    // Pending CTV
    const ev3 = items.find((i) => i.meta?.eventId === 'ev-3');
    expect(ev3?.badgeLabel).toBe('CTV');
    expect(ev3?.status).toBe('pending_review');

    // Pending borrow only emits pickup, NOT return
    expect(items.find((i) => i.id === 'borrow-pickup-b-pending')?.status).toBe('pending_review');
    expect(items.find((i) => i.id === 'borrow-return-b-pending')).toBeUndefined();

    // Approved borrow emits both pickup & return
    expect(items.find((i) => i.id === 'borrow-pickup-b-approved')?.status).toBe('today');
    expect(items.find((i) => i.id === 'borrow-return-b-approved')?.status).toBe('upcoming');

    // Overdue borrowed item
    const overdue = items.find((i) => i.id === 'borrow-return-b-overdue');
    expect(overdue?.status).toBe('overdue');
    expect(overdue?.badgeLabel).toBe('Quá hạn trả');
    expect(overdue?.href).toBe('/office/borrow');

    // Sorted chronologically
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const cur = items[i];
      expect(
        prev.date < cur.date ||
          (prev.date === cur.date && prev.sortMinutes <= cur.sortMinutes)
      ).toBe(true);
    }
  });

  it('finds the earliest non-completed upcoming item strictly after a week end date', () => {
    const items = buildStudentScheduleItems({
      todayVN: '2026-11-25',
      registrations: [
        {
          id: 'r-done',
          event_id: 'e-done',
          event_name: 'Sự kiện đã xong tuần sau',
          event_date: '2026-12-01',
          start_time: '08:00',
          attended: true,
        },
        {
          id: 'r-next',
          event_id: 'e-next',
          event_name: 'Hội nghị Đoàn khoa',
          event_date: '2026-12-04',
          start_time: '14:00',
          attended: false,
        },
      ],
    });

    const next = findNextUpcomingItem(items, '2026-11-29');
    expect(next?.title).toBe('Hội nghị Đoàn khoa');
    expect(next?.date).toBe('2026-12-04');
  });
});
