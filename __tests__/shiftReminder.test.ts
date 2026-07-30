import {
  activeThresholdForMinutesUntil,
  notificationIdForThreshold,
  pickShiftReminderCopy,
  shouldShowShiftReminderPopups,
  SHIFT_REMINDER_THRESHOLDS_MIN,
} from '../src/services/shiftReminderCopy';
import {
  approxShiftStartUtcMs,
  getDeviceTimezoneClock,
  minutesUntilTodayShiftStart,
  parseHmToMinutes,
} from '../src/utils/shiftReminderTime';

describe('shiftReminderCopy', () => {
  it('parses and exposes 60/30/15 thresholds most-urgent-first', () => {
    expect(SHIFT_REMINDER_THRESHOLDS_MIN).toEqual([15, 30, 60]);
  });

  it('builds fancy taglines with start time and coming-within wording', () => {
    const copy = pickShiftReminderCopy(30, '2026-07-29:30:09:00', '9:00 AM');
    expect(copy.title.length).toBeGreaterThan(3);
    expect(copy.message).toContain('Starts at 9:00 AM');
    expect(copy.message).toContain('Coming within 30 minutes');
    expect(copy.notificationBody).toContain('Starts at 9:00 AM');
  });

  it('keeps copy stable for the same seed', () => {
    const a = pickShiftReminderCopy(15, 'seed-a', '5:00 PM');
    const b = pickShiftReminderCopy(15, 'seed-a', '5:00 PM');
    expect(a).toEqual(b);
  });

  it('maps each threshold to the shared active notification id', () => {
    const ymd = '2026-07-29';
    const ids = SHIFT_REMINDER_THRESHOLDS_MIN.map((t) => notificationIdForThreshold(t, ymd));
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(2200);
  });

  it('strips hyphen characters from fancy taglines', () => {
    const copy = pickShiftReminderCopy(15, 'seed-hyphen', '6:00 PM');
    expect(copy.title).not.toMatch(/[-–—]/);
    expect(copy.message).not.toMatch(/[-–—]/);
    expect(copy.notificationBody).not.toMatch(/[-–—]/);
  });

  it('uses exclusive bands so under 15 minutes does not show a 15 minute reminder', () => {
    expect(activeThresholdForMinutesUntil(70)).toBeNull();
    expect(activeThresholdForMinutesUntil(60)).toBe(60);
    expect(activeThresholdForMinutesUntil(45)).toBe(60);
    expect(activeThresholdForMinutesUntil(31)).toBe(60);
    expect(activeThresholdForMinutesUntil(30)).toBe(30);
    expect(activeThresholdForMinutesUntil(20)).toBe(30);
    expect(activeThresholdForMinutesUntil(16)).toBe(30);
    expect(activeThresholdForMinutesUntil(15)).toBe(15);
    expect(activeThresholdForMinutesUntil(14)).toBeNull();
    expect(activeThresholdForMinutesUntil(5)).toBeNull();
    expect(activeThresholdForMinutesUntil(0)).toBeNull();
  });

  it('blocks all reminder popups once under 15 minutes remain', () => {
    expect(shouldShowShiftReminderPopups(60)).toBe(true);
    expect(shouldShowShiftReminderPopups(15)).toBe(true);
    expect(shouldShowShiftReminderPopups(14)).toBe(false);
    expect(shouldShowShiftReminderPopups(1)).toBe(false);
    expect(shouldShowShiftReminderPopups(0)).toBe(false);
  });
});

describe('shiftReminderTime', () => {
  it('parses HH:MM values and rejects invalid times', () => {
    expect(parseHmToMinutes('09:00')).toBe(9 * 60);
    expect(parseHmToMinutes('9:30')).toBe(9 * 60 + 30);
    expect(parseHmToMinutes('17:45')).toBe(17 * 60 + 45);
    expect(parseHmToMinutes('18:00:00')).toBe(18 * 60);
    expect(parseHmToMinutes('25:00')).toBeNull();
    expect(parseHmToMinutes('12:60')).toBeNull();
    expect(parseHmToMinutes('nope')).toBeNull();
  });

  it('uses the device clock so local 6pm matches phone time', () => {
    const { totalMinutes } = getDeviceTimezoneClock();
    expect(minutesUntilTodayShiftStart('18:00')).toBe(18 * 60 - totalMinutes);
  });

  it('returns minutes until a future start time today', () => {
    const { totalMinutes } = getDeviceTimezoneClock();
    const future = Math.min(totalMinutes + 42, 23 * 60 + 59);
    const hh = String(Math.floor(future / 60)).padStart(2, '0');
    const mm = String(future % 60).padStart(2, '0');
    const until = minutesUntilTodayShiftStart(`${hh}:${mm}`);
    expect(until).toBe(future - totalMinutes);
  });

  it('returns negative minutes when the shift already started', () => {
    const { totalMinutes } = getDeviceTimezoneClock();
    if (totalMinutes < 1) {
      expect(minutesUntilTodayShiftStart('00:00')).toBeLessThanOrEqual(0);
      return;
    }
    const past = totalMinutes - 1;
    const hh = String(Math.floor(past / 60)).padStart(2, '0');
    const mm = String(past % 60).padStart(2, '0');
    expect(minutesUntilTodayShiftStart(`${hh}:${mm}`)).toBe(-1);
  });

  it('approximates a future UTC trigger after now', () => {
    const { totalMinutes } = getDeviceTimezoneClock();
    if (totalMinutes >= 23 * 60 + 50) {
      expect(approxShiftStartUtcMs('00:00')).not.toBeNull();
      return;
    }
    const future = totalMinutes + 10;
    const hh = String(Math.floor(future / 60)).padStart(2, '0');
    const mm = String(future % 60).padStart(2, '0');
    const ms = approxShiftStartUtcMs(`${hh}:${mm}`);
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThan(Date.now() - 60_000);
    expect(ms!).toBeLessThan(Date.now() + 15 * 60_000);
  });
});
