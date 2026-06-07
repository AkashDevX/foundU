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
