/**
 * Device-local clock helpers for shift reminders.
 *
 * Shift start/end from the API are wall-clock HH:MM values (shown as e.g. "6:00 PM").
 * Countdown must use the phone's local timezone so "starts at 6:00 PM" matches the
 * clock the employee is looking at — not Australia/Sydney when the device is elsewhere.
 */

/** Today's calendar date (YYYY-MM-DD) and clock minutes on the device. */
export function getDeviceTimezoneClock(): { ymd: string; totalMinutes: number } {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return {
    ymd: `${y}-${mo}-${d}`,
    totalMinutes: now.getHours() * 60 + now.getMinutes(),
  };
}

/** @deprecated Use getDeviceTimezoneClock — kept as alias for existing imports. */
export function getAppTimezoneClock(): { ymd: string; totalMinutes: number } {
  return getDeviceTimezoneClock();
}

/** Parse "HH:MM" / "H:MM" / "HH:MM:SS" into minutes from midnight. */
export function parseHmToMinutes(hm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hm.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

/** Whole minutes until today's shift start on the device clock (negative if already started). */
export function minutesUntilTodayShiftStart(startHm: string): number | null {
  const startMinutes = parseHmToMinutes(startHm);
  if (startMinutes == null) return null;
  const { totalMinutes } = getDeviceTimezoneClock();
  return startMinutes - totalMinutes;
}

/**
 * Approximate UTC epoch ms for today's local HH:MM on this device.
 * Used for AlarmManager scheduling of same-day reminders.
 */
export function approxShiftStartUtcMs(startHm: string): number | null {
  const minutesUntil = minutesUntilTodayShiftStart(startHm);
  if (minutesUntil == null) return null;
  const now = Date.now();
  const secondMs = now % 60_000;
  return now - secondMs + minutesUntil * 60_000;
}
