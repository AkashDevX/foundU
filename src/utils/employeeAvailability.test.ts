import {
  createEmptyWeekSchedule,
  isOvernightPeriod,
  periodsOverlap,
  summarizeWeekSchedule,
  weekScheduleIssues,
  weekScheduleToJson,
} from './employeeAvailability';

describe('employee availability schedule', () => {
  it('accepts different hours, multiple periods, not available, and overnight', () => {
    const week = createEmptyWeekSchedule();
    week.Mon.periods = [{ id: 'a', start: '09:00', end: '13:00' }];
    week.Tue.periods = [
      { id: 'b', start: '08:00', end: '12:00' },
      { id: 'c', start: '18:00', end: '22:00' },
    ];
    week.Wed.status = 'unavailable';
    week.Thu.periods = [{ id: 'd', start: '22:00', end: '06:00' }];
    for (const day of ['Fri', 'Sat', 'Sun'] as const) {
      week[day].status = 'unavailable';
    }

    expect(weekScheduleIssues(week)).toEqual([]);
    expect(isOvernightPeriod('22:00', '06:00')).toBe(true);
    expect(summarizeWeekSchedule(week)).toContain('Mon: 09:00–13:00');
    expect(summarizeWeekSchedule(week)).toContain('Tue: 08:00–12:00, 18:00–22:00');
    expect(summarizeWeekSchedule(week)).toContain('Wed: Not available');
    expect(summarizeWeekSchedule(week)).toContain('Thu: 22:00–06:00 (overnight)');

    const json = weekScheduleToJson(week);
    expect(json.Wed).toEqual({ status: 'unavailable', periods: [] });
    expect(json.Thu.periods).toEqual([{ start: '22:00', end: '06:00' }]);
  });

  it('rejects overlapping periods and a week with no available days', () => {
    const overlap = createEmptyWeekSchedule();
    overlap.Mon.periods = [
      { id: 'a', start: '09:00', end: '14:00' },
      { id: 'b', start: '13:00', end: '17:00' },
    ];
    for (const day of ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const) {
      overlap[day].status = 'unavailable';
    }
    expect(periodsOverlap(overlap.Mon.periods)).toBe(true);
    expect(weekScheduleIssues(overlap)).toContain('Monday: availability periods overlap');

    const none = createEmptyWeekSchedule();
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const) {
      none[day].status = 'unavailable';
    }
    expect(weekScheduleIssues(none)).toContain('at least one day you can work');
  });

  it('treats back-to-back periods as separate availability', () => {
    expect(
      periodsOverlap([
        { start: '09:00', end: '13:00' },
        { start: '13:00', end: '17:00' },
      ]),
    ).toBe(false);
  });
});
