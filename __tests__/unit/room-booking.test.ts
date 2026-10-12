import {
  deriveBookingSchedule,
  findRoomConflicts,
  findInternalOverlaps,
  describeConflict,
  describeSchedule,
  type ExistingBooking,
} from '@/lib/utils/room-booking';

const FIELD = 'a31151ee-5f10-4744-9f55-76d56e7dcd42';

const sinhHoatLegacy = {
  id: 'p-bongda',
  title: 'Sinh hoạt CLB Bóng đá',
  organization_unit: 'CLB Bóng Đá',
  status: 'approved',
  start_date: '2026-09-08',
  start_time: '16:50:00',
  end_date: '2026-12-31',
  end_time: '21:00:00',
  room_id: FIELD,
  room_name: 'Sân bóng đá',
};

function existing(p: any, sessions: any[] = []): ExistingBooking {
  return { proposal: p, slots: deriveBookingSchedule(p, sessions).slots };
}

describe('deriveBookingSchedule', () => {
  it('legacy multi-day proposal without sessions books a DAILY window, not 24/7', () => {
    const s = deriveBookingSchedule(sinhHoatLegacy, []);
    expect(s.mode).toBe('daily');
    expect(s.slots.length).toBe(115);
    expect(s.slots[0]).toMatchObject({ date: '2026-09-08', start_time: '16:50', end_time: '21:00' });
    expect(describeSchedule(sinhHoatLegacy, s)).toContain('MỖI NGÀY');
  });

  it('uses real sessions when provided (2+ sessions)', () => {
    const s = deriveBookingSchedule(sinhHoatLegacy, [
      { id: 'a', name: 'Buổi 1', session_date: '2026-10-14', start_time: '17:00', end_time: '19:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      { id: 'b', name: 'Buổi 2', session_date: '2026-10-21', start_time: '17:00', end_time: '19:00', room_id: FIELD, room_name: 'Sân bóng đá' },
    ]);
    expect(s.mode).toBe('sessions');
    expect(s.slots.map((x) => x.date)).toEqual(['2026-10-14', '2026-10-21']);
  });

  it('rejected sessions free the room', () => {
    const s = deriveBookingSchedule(sinhHoatLegacy, [
      { id: 'a', name: 'Buổi 1', session_date: '2026-10-14', start_time: '17:00', end_time: '19:00', room_id: FIELD },
      { id: 'b', name: 'Buổi 2', session_date: '2026-10-21', start_time: '17:00', end_time: '19:00', room_id: FIELD, status: 'rejected' },
    ]);
    expect(s.slots.map((x) => x.key)).toEqual(['a']);
  });

  it('sessions without a room do not book anything', () => {
    const s = deriveBookingSchedule(
      { start_date: '2026-10-14', start_time: '08:00', end_date: '2026-10-14', end_time: '11:00', room_id: null, room_name: 'Không mượn' },
      [{ id: 'x', name: 'Buổi 1', session_date: '2026-10-14', start_time: '08:00', end_time: '11:00', room_id: null, room_name: 'Không mượn' }]
    );
    expect(s.slots).toHaveLength(0);
  });

  it('overnight multi-day stays continuous', () => {
    const s = deriveBookingSchedule(
      { start_date: '2026-10-14', start_time: '20:00', end_date: '2026-10-15', end_time: '06:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      []
    );
    expect(s.mode).toBe('range');
    expect(s.slots).toHaveLength(1);
    expect(s.slots[0].endMs - s.slots[0].startMs).toBe(10 * 60 * 60 * 1000);
  });
});

describe('findRoomConflicts', () => {
  const bookings = [existing(sinhHoatLegacy)];

  it('a morning tournament no longer conflicts with the evening sinh hoat window', () => {
    const req = deriveBookingSchedule(
      { start_date: '2026-10-18', start_time: '07:00', end_date: '2026-10-18', end_time: '12:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      [{ id: 'session_1', name: 'Buổi chính', session_date: '2026-10-18', start_time: '07:00', end_time: '12:00', room_id: FIELD, room_name: 'Sân bóng đá' }]
    );
    expect(findRoomConflicts(req.slots, bookings)).toHaveLength(0);
  });

  it('reports exactly the overlapping session with a readable message', () => {
    const req = deriveBookingSchedule(
      { start_date: '2026-10-18', start_time: '07:00', end_date: '2026-10-19', end_time: '20:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      [
        { id: 's1', name: 'Vòng bảng', session_date: '2026-10-18', start_time: '07:00', end_time: '11:00', room_id: FIELD, room_name: 'Sân bóng đá' },
        { id: 's2', name: 'Chung kết', session_date: '2026-10-19', start_time: '18:00', end_time: '20:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      ]
    );
    const conflicts = findRoomConflicts(req.slots, bookings);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].slot_key).toBe('s2');
    expect(conflicts[0].other_title).toBe('Sinh hoạt CLB Bóng đá');
    const msg = describeConflict(conflicts[0]);
    expect(msg).toContain('Chung kết');
    expect(msg).toContain('16:50–21:00 ngày 19/10');
    expect(msg).toContain('đã duyệt');
  });

  it('different rooms never conflict', () => {
    const req = deriveBookingSchedule(
      { start_date: '2026-10-19', start_time: '18:00', end_date: '2026-10-19', end_time: '20:00', room_id: 'other-room', room_name: 'Phòng 2E03' },
      []
    );
    expect(findRoomConflicts(req.slots, bookings)).toHaveLength(0);
  });

  it('excludes the proposal itself', () => {
    const req = deriveBookingSchedule(sinhHoatLegacy, []);
    expect(findRoomConflicts(req.slots, bookings, 'p-bongda')).toHaveLength(0);
  });

  it('touching boundaries (end == start) are not a conflict', () => {
    const req = deriveBookingSchedule(
      { start_date: '2026-10-19', start_time: '15:00', end_date: '2026-10-19', end_time: '16:50', room_id: FIELD, room_name: 'Sân bóng đá' },
      []
    );
    expect(findRoomConflicts(req.slots, bookings)).toHaveLength(0);
  });
});

describe('findInternalOverlaps', () => {
  const base = { start_date: '2026-10-18', start_time: '07:00', end_date: '2026-10-18', end_time: '17:00', room_id: FIELD, room_name: 'Sân bóng đá' };

  it('allows several rooms at the same time (one ca per sân)', () => {
    const s = deriveBookingSchedule(base, [
      { id: 'a', name: 'Sân 1', session_date: '2026-10-18', start_time: '07:00', end_time: '11:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      { id: 'b', name: 'Sân 2', session_date: '2026-10-18', start_time: '07:00', end_time: '11:00', room_id: 'volley', room_name: 'Sân Bóng chuyền' },
    ]);
    expect(findInternalOverlaps(s.slots)).toHaveLength(0);
  });

  it('flags the same room booked twice at overlapping times', () => {
    const s = deriveBookingSchedule(base, [
      { id: 'a', name: 'Vòng bảng', session_date: '2026-10-18', start_time: '07:00', end_time: '11:00', room_id: FIELD, room_name: 'Sân bóng đá' },
      { id: 'b', name: 'Tứ kết', session_date: '2026-10-18', start_time: '10:00', end_time: '12:00', room_id: FIELD, room_name: 'Sân bóng đá' },
    ]);
    const o = findInternalOverlaps(s.slots);
    expect(o).toHaveLength(1);
    expect([o[0].a_key, o[0].b_key].sort()).toEqual(['a', 'b']);
  });
});
