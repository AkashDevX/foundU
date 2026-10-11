import { getAppLocale } from './formatDateTime';

export const TRADING_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type TradingDayKey = (typeof TRADING_DAY_KEYS)[number];

export type TradingDayHours = {
  open: string;
  close: string;
  label: string;
};

export type TradingHoursByDay = Partial<Record<TradingDayKey, TradingDayHours | null>>;

const WEEKDAY_KEYS: TradingDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function parseTradingHours(raw: unknown): TradingHoursByDay | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const days: TradingHoursByDay = {};
  let anyOpen = false;

  WEEKDAY_KEYS.forEach((key) => {
    const row = source[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      days[key] = null;
      return;
    }
    const record = row as Record<string, unknown>;
    const open = typeof record.open === 'string' ? record.open.trim() : '';
    const close = typeof record.close === 'string' ? record.close.trim() : '';
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    if (open === '' || close === '') {
      days[key] = null;
      return;
    }
    days[key] = {
      open,
      close,
      label: label !== '' ? label : `${open} – ${close}`,
    };
    anyOpen = true;
  });

  return anyOpen ? days : null;
}

export function weekdayKeyForIsoDate(ymd: string): TradingDayKey | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return TRADING_DAY_KEYS[utc.getUTCDay()] ?? null;
}

export function formatTradingDateLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat(getAppLocale(), {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/** Hours for one calendar day. Null when the location has no trading hours at all. */
export function tradingHoursOnDate(
  hours: TradingHoursByDay | null | undefined,
  ymd: string,
): { dateLabel: string; hoursLabel: string } | null {
  if (!hours) return null;
  const key = weekdayKeyForIsoDate(ymd);
  if (!key) return null;
  const day = hours[key];
  const label = day?.label?.trim();
  return {
    dateLabel: formatTradingDateLabel(ymd),
    hoursLabel: label && label !== '' ? label : 'Closed',
  };
}
