import { isEventPastDeadline, getEffectiveEventStatus, getEventLifecycleState, isEventLockedPast3Days, getNextUpcomingSession } from '@/lib/utils/event-logic';
import { isEventRoleExpired } from '@/lib/constants/event-roles-cleanup';

describe('event-logic unit tests', () => {
  test('returns true if event is already marked as closed', () => {
    expect(isEventPastDeadline({ status: 'closed' })).toBe(true);
    expect(getEffectiveEventStatus({ status: 'closed' })).toBe('closed');
  });

  test('returns false if event has no event_date and is active', () => {
    expect(isEventPastDeadline({ status: 'active', event_date: null })).toBe(false);
    expect(getEffectiveEventStatus({ status: 'active', event_date: null })).toBe('active');
  });

  test('detects event is past deadline after 1 hour from end_time', () => {
    const event = {
      event_date: '2026-08-14',
      start_time: '08:00:00',
      end_time: '11:30:00',
      status: 'active',
    };

    // Exactly at 11:30 -> Not past deadline (still in 1-hour grace period)
    const at1130 = new Date(2026, 7, 14, 11, 30, 0, 0).getTime();
    expect(isEventPastDeadline(event, at1130)).toBe(false);
    expect(getEffectiveEventStatus(event, at1130)).toBe('active');

    // At 12:29 (59 mins after 11:30) -> Still within 1-hour grace period
    const at1229 = new Date(2026, 7, 14, 12, 29, 0, 0).getTime();
    expect(isEventPastDeadline(event, at1229)).toBe(false);
    expect(getEffectiveEventStatus(event, at1229)).toBe('active');

    // At 12:31 (61 mins after 11:30) -> Past deadline, automatically closed!
    const at1231 = new Date(2026, 7, 14, 12, 31, 0, 0).getTime();
    expect(isEventPastDeadline(event, at1231)).toBe(true);
    expect(getEffectiveEventStatus(event, at1231)).toBe('closed');
  });

  test('defaults to 22:00 if end_time is not provided', () => {
    const event = {
      event_date: '2026-08-14',
      status: 'active',
    };

    // At 22:30 -> Not past deadline (within 1h after 22:00)
    const at2230 = new Date(2026, 7, 14, 22, 30, 0, 0).getTime();
    expect(isEventPastDeadline(event, at2230)).toBe(false);

    // At 23:05 (past 23:00) -> Auto-closed!
    const at2305 = new Date(2026, 7, 14, 23, 5, 0, 0).getTime();
    expect(isEventPastDeadline(event, at2305)).toBe(true);
    expect(getEffectiveEventStatus(event, at2305)).toBe('closed');
  });

  test('multi-session event stays active on day 2 when session 1 ended yesterday', () => {
    const event = {
      event_date: '2026-11-19',
      start_time: '05:00:00',
      end_time: '21:30:00',
      status: 'active',
      sessions: [
        { id: 's1', session_date: '2026-11-19', start_time: '05:00', end_time: '21:30' },
        { id: 's2', session_date: '2026-11-20', start_time: '05:00', end_time: '21:30' },
      ],
    };

    // Day 2 morning (20/11/2026 05:32) -> MUST stay active, NOT closed!
    const day2Morning = new Date(2026, 10, 20, 5, 32, 0, 0).getTime();
    expect(isEventPastDeadline(event, day2Morning)).toBe(false);
    expect(getEffectiveEventStatus(event, day2Morning)).toBe('active');
    expect(getEventLifecycleState(event, day2Morning)).toBe('active');

    // Day 2 after session 2 + 1h grace (20/11/2026 22:31) -> Closed
    const day2AfterGrace = new Date(2026, 10, 20, 22, 31, 0, 0).getTime();
    expect(isEventPastDeadline(event, day2AfterGrace)).toBe(true);
    expect(getEffectiveEventStatus(event, day2AfterGrace)).toBe('closed');
    expect(getEventLifecycleState(event, day2AfterGrace)).toBe('closed');
  });

  describe('isEventLockedPast3Days', () => {
    test('never locks when event status is active', () => {
      const event = {
        event_date: '2026-09-01',
        end_time: '22:00',
        status: 'active',
      };
      // Current time is 1 month later
      const currentTime = new Date(2026, 9, 8, 12, 0, 0).getTime();
      expect(isEventLockedPast3Days(event, currentTime)).toBe(false);
    });

    test('multi-session event calculates lock based on latest session end date', () => {
      const event = {
        event_date: '2026-09-27',
        end_time: '22:00',
        status: 'closed',
        sessions: [
          { id: 's1', session_date: '2026-09-27', start_time: '07:00', end_time: '11:00' },
          { id: 's2', session_date: '2026-10-07', start_time: '05:00', end_time: '23:00' },
        ],
      };

      // Exactly 17 hours after session 2 ended (2026-10-08 16:00) -> NOT locked past 3 days (72h)
      const now17HoursLater = new Date(2026, 9, 8, 16, 0, 0).getTime();
      expect(isEventLockedPast3Days(event, now17HoursLater)).toBe(false);

      // 4 days after session 2 ended (2026-10-12) -> LOCKED past 3 days
      const now4DaysLater = new Date(2026, 9, 12, 10, 0, 0).getTime();
      expect(isEventLockedPast3Days(event, now4DaysLater)).toBe(true);
    });

    test('handles non-ISO dates like DD-MM-YYYY in sessions correctly', () => {
      const event = {
        event_date: '2026-09-27',
        end_time: '22:00',
        status: 'completed',
        sessions: [
          { id: 's1', session_date: '27-09-2026', start_time: '07:00', end_time: '11:00' },
          { id: 's2', session_date: '07-10-2026', start_time: '05:00', end_time: '23:00' },
        ],
      };

      // On 2026-10-08, session on 07-10 is only 1 day old, NOT locked
      const now = new Date(2026, 9, 8, 16, 0, 0).getTime();
      expect(isEventLockedPast3Days(event, now)).toBe(false);
    });
  });

  describe('isEventRoleExpired (auto-revoke per-event admin/checker after 3 days)', () => {
    test('expires event role when event ended > 3 days ago even if status is still active', () => {
      const event = {
        event_date: '2026-11-10',
        end_time: '21:00',
        status: 'active', // BTC did not manually close
      };
      // 5 days later (2026-11-15 12:00)
      const now5DaysLater = new Date(2026, 10, 15, 12, 0, 0).getTime();
      expect(isEventRoleExpired(event, null, now5DaysLater)).toBe(true);
    });

    test('retains event role when event is within 3 days grace period', () => {
      const event = {
        event_date: '2026-11-18',
        end_time: '21:00',
        status: 'active',
      };
      // 1 day later (2026-11-19 12:00) -> Still within 3-day wrap-up window
      const now1DayLater = new Date(2026, 10, 19, 12, 0, 0).getTime();
      expect(isEventRoleExpired(event, null, now1DayLater)).toBe(false);

      // Exactly 2 days later -> Still retained
      const now2DaysLater = new Date(2026, 10, 20, 12, 0, 0).getTime();
      expect(isEventRoleExpired(event, null, now2DaysLater)).toBe(false);
    });

    test('expires multi-session event when last session ended > 3 days ago', () => {
      const event = {
        event_date: '2026-11-01',
        end_time: '18:00',
        status: 'active',
      };
      const sessions = [
        { id: 's1', session_date: '2026-11-01', end_time: '18:00' },
        { id: 's2', session_date: '2026-11-10', end_time: '20:00' },
      ];

      // On 2026-11-12 (2 days after session 2) -> NOT expired
      const onNov12 = new Date(2026, 10, 12, 10, 0, 0).getTime();
      expect(isEventRoleExpired(event, sessions, onNov12)).toBe(false);

      // On 2026-11-14 (4 days after session 2) -> EXPIRED
      const onNov14 = new Date(2026, 10, 14, 10, 0, 0).getTime();
      expect(isEventRoleExpired(event, sessions, onNov14)).toBe(true);
    });
  });

  describe('getNextUpcomingSession (multi-session discover display)', () => {
    test('returns next upcoming session and remaining count when earlier sessions passed', () => {
      const sessions = [
        { id: 's1', name: 'Buổi 1', session_date: '2026-11-01', start_time: '08:00', end_time: '16:30' },
        { id: 's2', name: 'Buổi 2', session_date: '2026-11-22', start_time: '08:00', end_time: '10:30' },
        { id: 's3', name: 'Buổi 3', session_date: '2026-11-29', start_time: '08:00', end_time: '10:30' },
      ];
      const onNov21 = new Date(2026, 10, 21, 2, 0, 0).getTime();
      const res = getNextUpcomingSession(sessions, '22:00', onNov21);

      expect(res.nextSession?.id).toBe('s2');
      expect(res.nextSession?.session_date).toBe('2026-11-22');
      expect(res.remainingCount).toBe(2);
      expect(res.earliestDate).toBe('2026-11-01');
      expect(res.latestDate).toBe('2026-11-29');
    });

    test('returns null nextSession and 0 remaining when all sessions ended past grace period', () => {
      const sessions = [
        { id: 's1', session_date: '2026-11-19', start_time: '05:00', end_time: '21:30' },
        { id: 's2', session_date: '2026-11-20', start_time: '05:00', end_time: '21:30' },
      ];
      const onNov21 = new Date(2026, 10, 21, 2, 0, 0).getTime();
      const res = getNextUpcomingSession(sessions, '22:00', onNov21);

      expect(res.nextSession).toBeNull();
      expect(res.remainingCount).toBe(0);
    });
  });
});

