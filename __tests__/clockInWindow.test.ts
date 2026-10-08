import { mapTimeClockStatus } from '../src/utils/timeClockStatus';

describe('clock-in grace window', () => {
  it('maps the allowed window around shift start', () => {
    const status = mapTimeClockStatus({
      is_clocked_in: false,
      is_on_break: false,
      can_clock_in: false,
      can_clock_out: false,
      can_break_in: false,
      can_break_out: false,
      geofence_radius_meters: 300,
      assignment_ready: true,
      shift_issue: 'clock_in_exception_pending',
      clock_in_window: {
        grace_minutes: 20,
        policy: 'exception',
        earliest_label: '8:40 AM',
        latest_label: '9:20 AM',
        start_label: '9:00 AM',
        within_window: false,
        deviation: 'late',
        exception_status: 'pending',
        block_message: 'An administrator must clear the exception before you can clock in.',
      },
    });

    expect(status?.clock_in_window).toMatchObject({
      grace_minutes: 20,
      policy: 'exception',
      earliest_label: '8:40 AM',
      latest_label: '9:20 AM',
      within_window: false,
      deviation: 'late',
      exception_status: 'pending',
    });
    expect(status?.shift_issue).toBe('clock_in_exception_pending');
  });
});
