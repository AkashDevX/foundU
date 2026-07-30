import type { UserProfileSnapshot } from '../types/userProfile';

export const WEEK_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDayKey = (typeof WEEK_DAY_KEYS)[number];

export const WEEK_DAY_SHORT: Record<WeekDayKey, string> = {
  mon: 'Mo',
  tue: 'Tu',
  wed: 'We',
  thu: 'Th',
  fri: 'Fr',
  sat: 'Sa',
  sun: 'Su',
};

export const WEEK_DAY_LABEL: Record<WeekDayKey, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
};

export type WeeklyAvailabilityGrid = Record<WeekDayKey, { morning: boolean; evening: boolean }>;

const MOBILE_DAY_TO_KEY: Record<string, WeekDayKey> = {
  mon: 'mon',
  monday: 'mon',
  tue: 'tue',
  tuesday: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  thu: 'thu',
  thursday: 'thu',
  fri: 'fri',
  friday: 'fri',
  sat: 'sat',
  saturday: 'sat',
  sun: 'sun',
  sunday: 'sun',
};

function emptyGrid(): WeeklyAvailabilityGrid {
  return {
    mon: { morning: false, evening: false },
    tue: { morning: false, evening: false },
    wed: { morning: false, evening: false },
    thu: { morning: false, evening: false },
    fri: { morning: false, evening: false },
    sat: { morning: false, evening: false },
    sun: { morning: false, evening: false },
  };
}

function normalizeDayKey(input: string): WeekDayKey | null {
  const n = input.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (n.length >= 3) {
    const three = n.slice(0, 3) as WeekDayKey;
    if (WEEK_DAY_KEYS.includes(three)) return three;
  }
  return MOBILE_DAY_TO_KEY[n] ?? null;
}

function normalizePeriod(value: unknown): 'morning' | 'evening' | null {
  if (typeof value !== 'string') return null;
  const p = value.trim().toLowerCase();
  if (p === 'morning' || p === 'am') return 'morning';
  if (p === 'evening' || p === 'pm' || p === 'afternoon') return 'evening';
  return null;
}

/** Decode backend `weekly_availability_json` into the same morning/evening grid as registration. */
export function parseWeeklyAvailabilityGrid(
  raw: UserProfileSnapshot['weeklyAvailabilityJson'],
): WeeklyAvailabilityGrid {
  const grid = emptyGrid();
  if (!raw || typeof raw !== 'object') return grid;

  for (const [key, value] of Object.entries(raw)) {
    const day = normalizeDayKey(key);
    if (!day) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        const period = normalizePeriod(item);
        if (period) grid[day][period] = true;
      }
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const o = value as Record<string, unknown>;
      if (o.morning === true || o.am === true) grid[day].morning = true;
      if (o.evening === true || o.pm === true) grid[day].evening = true;
    }
  }

  return grid;
}

export function weeklyAvailabilityHasSelection(grid: WeeklyAvailabilityGrid): boolean {
  return WEEK_DAY_KEYS.some((d) => grid[d].morning || grid[d].evening);
}

export function formatAssignedShiftDays(days: string[] | undefined | null): string {
  if (!days || days.length === 0) return 'Every day (default template)';
  const labels = days
    .map((d) => {
      const key = normalizeDayKey(d);
      return key ? WEEK_DAY_LABEL[key] : d;
    })
    .filter(Boolean);
  return labels.length ? labels.join(', ') : 'Every day (default template)';
}

export function formatTimeHm(hm: string | undefined | null): string {
  if (!hm || !/^\d{1,2}:\d{2}$/.test(hm.trim())) return hm?.trim() ?? '';
  const [hStr, mStr] = hm.trim().split(':');
  let h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hm;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

/** Local calendar YYYY-MM-DD (avoid toISOString — UTC can shift the day). */
function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isPastWeek(weekStart: string): boolean {
  const current = mondayOfWeek();
  return weekStart < current;
}

export function mondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalIsoDate(d);
}
