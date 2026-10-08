import {
  addIsoDays,
  formatInstantInAppTimezone,
  getAppTimezoneClock,
  mondayOfWeekIso,
  setAppTimezone,
  todayIsoInAppTimezone,
} from '../src/utils/formatDateTime';

describe('Brisbane app timezone', () => {
  beforeEach(() => {
    setAppTimezone('Australia/Brisbane');
  });

  it('keeps 8 Oct 2026 on AEST while Sydney would be an hour ahead', () => {
    const instant = new Date('2026-10-08T01:30:00.000Z');
    const clock = getAppTimezoneClock(instant);

    expect(clock.ymd).toBe('2026-10-08');
    expect(clock.hour).toBe(11);
    expect(clock.minute).toBe(30);
    expect(todayIsoInAppTimezone(instant)).toBe('2026-10-08');
    expect(formatInstantInAppTimezone(instant.toISOString(), { hour: 'numeric', minute: '2-digit', hour12: true })).toMatch(/11:30/);
  });

  it('uses the Brisbane calendar day when UTC is still the previous date', () => {
    // 15:00 UTC on 7 Oct is 1:00 AM on 8 Oct in Brisbane.
    const instant = new Date('2026-10-07T15:00:00.000Z');
    expect(todayIsoInAppTimezone(instant)).toBe('2026-10-08');
    expect(getAppTimezoneClock(instant).hour).toBe(1);
    expect(mondayOfWeekIso(instant)).toBe('2026-10-05');
    expect(addIsoDays('2026-10-05', 7)).toBe('2026-10-12');
  });
});
