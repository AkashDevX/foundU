import type { DayAvailabilityJson, UserProfileSnapshot } from '../types/userProfile';

export const SCHEDULE_DAYS = [
  { key: 'Mon', label: 'Monday' },
  { key: 'Tue', label: 'Tuesday' },
  { key: 'Wed', label: 'Wednesday' },
  { key: 'Thu', label: 'Thursday' },
  { key: 'Fri', label: 'Friday' },
  { key: 'Sat', label: 'Saturday' },
  { key: 'Sun', label: 'Sunday' },
] as const;

export type ScheduleDayKey = (typeof SCHEDULE_DAYS)[number]['key'];

export type SchedulePeriod = {
  id: string;
  start: string;
  end: string;
};

export type DaySchedule = {
  status: 'available' | 'unavailable';
  periods: SchedulePeriod[];
};

export type WeekSchedule = Record<ScheduleDayKey, DaySchedule>;

const TIME_24 = /^([01]\d|2[0-3]):[0-5]\d$/;

let periodSeq = 0;

export function newPeriodId(): string {
  periodSeq += 1;
  return `period-${periodSeq}`;
}

export function createEmptyWeekSchedule(): WeekSchedule {
  return Object.fromEntries(
    SCHEDULE_DAYS.map((day) => [
      day.key,
      {
        status: 'available' as const,
        periods: [{ id: newPeriodId(), start: '', end: '' }],
      },
    ]),
  ) as WeekSchedule;
}

export function isValidTime24(value: string): boolean {
  return TIME_24.test(value.trim());
}

/** End time earlier than the start time continues into the next day. */
export function isOvernightPeriod(start: string, end: string): boolean {
  return isValidTime24(start) && isValidTime24(end) && end < start;
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((part) => Number(part));
  return h * 60 + m;
}

function intervals(start: string, end: string): [number, number][] {
  const startMin = minutes(start);
  const endMin = minutes(end);
  if (endMin > startMin) return [[startMin, endMin]];
  return [[startMin, 24 * 60], [0, endMin]];
}

export function periodsOverlap(periods: { start: string; end: string }[]): boolean {
  const seen: [number, number][] = [];
  for (const period of periods) {
    if (!isValidTime24(period.start) || !isValidTime24(period.end) || period.start === period.end) {
      continue;
    }
    for (const next of intervals(period.start, period.end)) {
      for (const existing of seen) {
        if (next[0] < existing[1] && existing[0] < next[1]) return true;
      }
      seen.push(next);
    }
  }
  return false;
}

export function weekScheduleIssues(week: WeekSchedule): string[] {
  const issues: string[] = [];
  let availableDays = 0;

  for (const day of SCHEDULE_DAYS) {
    const entry = week[day.key];
    if (!entry || entry.status === 'unavailable') continue;

    const filled = entry.periods.filter((period) => period.start.trim() !== '' || period.end.trim() !== '');
    if (filled.length === 0) {
      issues.push(`${day.label}: enter the hours you can work, or mark the day as not available`);
      continue;
    }

    let dayOk = true;
    for (const period of filled) {
      if (!isValidTime24(period.start) || !isValidTime24(period.end)) {
        issues.push(`${day.label}: use 24-hour times such as 09:00 and 17:30`);
        dayOk = false;
        break;
      }
      if (period.start === period.end) {
        issues.push(`${day.label}: end time must be different from the start time`);
        dayOk = false;
        break;
      }
    }
    if (!dayOk) continue;

    if (periodsOverlap(filled)) {
      issues.push(`${day.label}: availability periods overlap`);
      continue;
    }

    availableDays += 1;
  }

  if (availableDays === 0 && issues.length === 0) {
    issues.push('at least one day you can work');
  }

  return issues;
}

export function weekScheduleIsComplete(week: WeekSchedule): boolean {
  return weekScheduleIssues(week).length === 0;
}

function formatPeriod(start: string, end: string): string {
  const range = `${start}–${end}`;
  return isOvernightPeriod(start, end) ? `${range} (overnight)` : range;
}

export function summarizeWeekSchedule(week: WeekSchedule): string {
  const parts: string[] = [];
  for (const day of SCHEDULE_DAYS) {
    const entry = week[day.key];
    if (!entry || entry.status === 'unavailable') {
      parts.push(`${day.key}: Not available`);
      continue;
    }
    const ranges = entry.periods
      .filter((period) => isValidTime24(period.start) && isValidTime24(period.end) && period.start !== period.end)
      .map((period) => formatPeriod(period.start, period.end));
    parts.push(ranges.length ? `${day.key}: ${ranges.join(', ')}` : `${day.key}: Available`);
  }
  return parts.join(' · ');
}

export function weekScheduleToJson(week: WeekSchedule): Record<string, DayAvailabilityJson> {
  const out: Record<string, DayAvailabilityJson> = {};
  for (const day of SCHEDULE_DAYS) {
    const entry = week[day.key];
    if (!entry || entry.status === 'unavailable') {
      out[day.key] = { status: 'unavailable', periods: [] };
      continue;
    }
    out[day.key] = {
      status: 'available',
      periods: entry.periods
        .filter((period) => isValidTime24(period.start) && isValidTime24(period.end) && period.start !== period.end)
        .map((period) => ({ start: period.start, end: period.end })),
    };
  }
  return out;
}

function isDayAvailability(value: unknown): value is DayAvailabilityJson {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.status === 'available' || row.status === 'unavailable' || Array.isArray(row.periods);
}

/** Keep day-by-day hours and legacy morning/evening lists from the profile API. */
export function parseStoredWeeklyAvailability(raw: unknown): UserProfileSnapshot['weeklyAvailabilityJson'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: NonNullable<UserProfileSnapshot['weeklyAvailabilityJson']> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const slots = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item !== '');
      if (slots.length) out[key] = slots;
      continue;
    }
    if (!isDayAvailability(value)) continue;
    const periods = (Array.isArray(value.periods) ? value.periods : [])
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const start = typeof item.start === 'string' ? item.start.trim() : '';
        const end = typeof item.end === 'string' ? item.end.trim() : '';
        if (!isValidTime24(start) || !isValidTime24(end) || start === end) return null;
        return { start, end };
      })
      .filter((item): item is { start: string; end: string } => item !== null);
    if (value.status === 'unavailable') {
      out[key] = { status: 'unavailable', periods: [] };
    } else if (value.status === 'available' || periods.length > 0) {
      out[key] = { status: 'available', periods };
    }
  }

  return Object.keys(out).length ? out : undefined;
}
