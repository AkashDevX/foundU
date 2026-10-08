import { DEFAULT_APP_LOCALE, DEFAULT_APP_TIMEZONE } from '../config/timezone';

let resolvedTimezone = DEFAULT_APP_TIMEZONE;
let resolvedLocale = DEFAULT_APP_LOCALE;

export function setAppTimezone(timezone: string | null | undefined): void {
  if (typeof timezone === 'string' && timezone.trim() !== '') {
    resolvedTimezone = timezone.trim();
  }
}

export function setAppLocale(locale: string | null | undefined): void {
  if (typeof locale === 'string' && locale.trim() !== '') {
    resolvedLocale = locale.trim().replace('_', '-');
  }
}

export function getAppTimezone(): string {
  return resolvedTimezone;
}

export function getAppLocale(): string {
  return resolvedLocale;
}

export type AppTimezoneClock = {
  ymd: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  totalMinutes: number;
  /** 0 = Sunday … 6 = Saturday, in the app timezone. */
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

/** Wall clock for an instant in the app timezone (Australia/Brisbane). */
export function getAppTimezoneClock(instant: Date = new Date()): AppTimezoneClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(instant);

  let hour = Number(partValue(parts, 'hour'));
  if (hour === 24) hour = 0;
  const minute = Number(partValue(parts, 'minute'));
  const year = Number(partValue(parts, 'year'));
  const month = Number(partValue(parts, 'month'));
  const day = Number(partValue(parts, 'day'));
  const weekday = WEEKDAY_INDEX[partValue(parts, 'weekday')] ?? 0;

  return {
    ymd: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    year,
    month,
    day,
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    weekday,
  };
}

export function todayIsoInAppTimezone(instant: Date = new Date()): string {
  return getAppTimezoneClock(instant).ymd;
}

/** Add calendar days to a YYYY-MM-DD date without using the device timezone. */
export function addIsoDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Monday (YYYY-MM-DD) of the week that contains `instant`, in the app timezone. */
export function mondayOfWeekIso(instant: Date = new Date()): string {
  const clock = getAppTimezoneClock(instant);
  const diff = clock.weekday === 0 ? -6 : 1 - clock.weekday;
  return addIsoDays(clock.ymd, diff);
}

/**
 * Device-local Date whose calendar day is the app timezone's today.
 * Noon avoids native date pickers treating midnight as the previous day.
 */
export function appTodayLocalDate(instant: Date = new Date()): Date {
  const clock = getAppTimezoneClock(instant);
  return new Date(clock.year, clock.month - 1, clock.day, 12, 0, 0, 0);
}

/** Calendar day (YYYY-MM-DD) of a date-only string or an instant, in the app timezone. */
export function calendarDayKeyInAppTimezone(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(trimmed.includes('T') ? trimmed : `${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (!trimmed.includes('T')) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }
  return getAppTimezoneClock(date).ymd;
}

export function formatCalendarDateLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat(resolvedLocale, {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export function formatInstantInAppTimezone(
  iso: string | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  },
): string {
  if (!iso || iso.trim() === '') {
    return '—';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(resolvedLocale, {
    ...options,
    timeZone: resolvedTimezone,
  }).format(date);
}

export function formatClockInLabel(iso: string | null | undefined): string {
  const formatted = formatInstantInAppTimezone(iso);
  return formatted === '—' ? 'Clocked in' : `Clocked in since ${formatted}`;
}

export function formatTimeOnly(iso: string | null | undefined): string {
  return formatInstantInAppTimezone(iso, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateOnly(iso: string | null | undefined): string {
  return formatInstantInAppTimezone(iso, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function timezoneAbbreviation(): string {
  return formatInstantInAppTimezone(new Date().toISOString(), {
    timeZoneName: 'short',
  }).split(' ').pop() ?? 'AEST';
}
