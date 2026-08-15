import { isEventPastDeadline, getEffectiveEventStatus } from '@/lib/utils/event-logic';

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
});
