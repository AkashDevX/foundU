import { mapTimeClockStatus } from '../src/utils/timeClockStatus';
import { breakWindowDetail, isInsideBreakWindow, resolveBreakPhase } from '../src/utils/breakWindow';

const window = {
  required: true as const,
  opens_at: '2026-06-16T00:00:00.000Z',
  closes_at: '2026-06-16T02:00:00.000Z',
  opens_label: '10:00 AM',
  closes_label: '12:00 PM',
  message: 'Please take your break between 10:00 AM and 12:00 PM.',
  phase: 'upcoming' as const,
  within_window: false,
  break_taken: false,
  reminder_lead_minutes: 15,
  block_message: 'You can only take your break between 10:00 AM and 12:00 PM.',
};

describe('break window', () => {
  it('maps the employee break window from clock status', () => {
    const status = mapTimeClockStatus({
      is_clocked_in: true,
      is_on_break: false,
      can_clock_in: false,
      can_clock_out: true,
      can_break_in: false,
      can_break_out: false,
      geofence_radius_meters: 300,
      assignment_ready: true,
      break_window: window,
    });

    expect(status?.break_window?.message).toBe(
      'Please take your break between 10:00 AM and 12:00 PM.',
    );
    expect(status?.can_break_in).toBe(false);
  });

  it('moves from upcoming to approaching, open, then closed', () => {
    const opens = Date.parse(window.opens_at);
    const closes = Date.parse(window.closes_at);

    expect(resolveBreakPhase(window, opens - 16 * 60_000, false)).toBe('upcoming');
    expect(resolveBreakPhase(window, opens - 10 * 60_000, false)).toBe('approaching');
    expect(resolveBreakPhase(window, opens, false)).toBe('open');
    expect(resolveBreakPhase(window, closes, false)).toBe('open');
    expect(resolveBreakPhase(window, closes + 60_000, false)).toBe('closed');
    expect(breakWindowDetail('open')).toBe('You can take your break now.');
  });

  it('allows a break only from the opening time through the closing time', () => {
    const opens = Date.parse(window.opens_at);
    const closes = Date.parse(window.closes_at);

    expect(isInsideBreakWindow(window, opens - 60_000)).toBe(false);
    expect(isInsideBreakWindow(window, opens)).toBe(true);
    expect(isInsideBreakWindow(window, closes)).toBe(true);
    expect(isInsideBreakWindow(window, closes + 60_000)).toBe(false);
  });

  it('keeps an in-progress break ahead of the clock', () => {
    expect(resolveBreakPhase(window, Date.parse(window.opens_at), true)).toBe('on_break');
    expect(
      resolveBreakPhase({ ...window, break_taken: true }, Date.parse(window.opens_at), false),
    ).toBe('taken');
  });
});
