import { API_BASE_URL } from '../config/api';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type ScheduleEntryType = 'shift' | 'time_off' | 'suggestion';

export type ScheduleDayEntry = {
  id: number | null;
  type: ScheduleEntryType | string;
  is_suggestion: boolean;
  time_range: string;
  duration_label: string;
  title: string;
  subtitle: string;
  meta: string;
  notes: string | null;
  start_time: string | null;
  end_time: string | null;
};

export type ScheduleDay = {
  day_key: string;
  date: string;
  weekday_label: string;
  day_number: string;
  is_today: boolean;
  is_day_off: boolean;
  entries: ScheduleDayEntry[];
};

export type WeeklySchedulePayload = {
  week_start: string;
  week_end: string;
  week_label: string;
  scheduled_hours_label: string;
  scheduled_seconds: number;
  days: ScheduleDay[];
};

export type FetchWeeklyScheduleResult =
  | { ok: true; schedule: WeeklySchedulePayload }
  | { ok: false; message: string };

async function resolveCompanySlug(): Promise<string | null> {
  let slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

function formatApiError(parsed: unknown, raw: string, status: number): string {
  if (parsed && typeof parsed === 'object') {
    const msg = (parsed as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim() !== '') return msg.trim();
  }
  const t = raw.trim();
  if (t !== '') return t.slice(0, 600);
  return `Could not load schedule (${status}).`;
}

function extractSchedule(parsed: unknown): WeeklySchedulePayload | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  const schedule = root.schedule ?? root.data;
  if (!schedule || typeof schedule !== 'object') return null;
  const s = schedule as Record<string, unknown>;
  if (!Array.isArray(s.days)) return null;

  const days: ScheduleDay[] = s.days
    .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
    .map((d) => ({
      day_key: String(d.day_key ?? ''),
      date: String(d.date ?? ''),
      weekday_label: String(d.weekday_label ?? ''),
      day_number: String(d.day_number ?? ''),
      is_today: Boolean(d.is_today),
      is_day_off: Boolean(d.is_day_off),
      entries: Array.isArray(d.entries)
        ? d.entries
            .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
            .map((e) => ({
              id: typeof e.id === 'number' ? e.id : null,
              type: String(e.type ?? 'shift'),
              is_suggestion: Boolean(e.is_suggestion),
              time_range: String(e.time_range ?? ''),
              duration_label: String(e.duration_label ?? ''),
              title: String(e.title ?? ''),
              subtitle: String(e.subtitle ?? ''),
              meta: String(e.meta ?? ''),
              notes: typeof e.notes === 'string' ? e.notes : null,
              start_time: typeof e.start_time === 'string' ? e.start_time : null,
              end_time: typeof e.end_time === 'string' ? e.end_time : null,
            }))
        : [],
    }));

  return {
    week_start: String(s.week_start ?? ''),
    week_end: String(s.week_end ?? ''),
    week_label: String(s.week_label ?? ''),
    scheduled_hours_label: String(s.scheduled_hours_label ?? ''),
    scheduled_seconds: typeof s.scheduled_seconds === 'number' ? s.scheduled_seconds : 0,
    days,
  };
}

/** ISO date (YYYY-MM-DD) for Monday of the week containing `date`, in local calendar. */
export function mondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function shiftWeekStart(isoMonday: string, deltaWeeks: number): string {
  const d = new Date(`${isoMonday}T12:00:00`);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Loads the signed-in employee's published weekly schedule from `GET /api/v1/shifts/schedule`.
 * Pass `weekStart` as ISO Monday (YYYY-MM-DD); defaults to the current week.
 */
export async function fetchWeeklySchedule(weekStart?: string): Promise<FetchWeeklyScheduleResult> {
  const token = await getAuthToken();
  if (!token || token.trim() === '') {
    return { ok: false, message: 'Not signed in.' };
  }

  const slug = await resolveCompanySlug();
  if (!slug) {
    return {
      ok: false,
      message: 'Organization context missing. Sign out and sign in again with your company selected.',
    };
  }

  const week = weekStart?.trim() || mondayOfWeek();
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/shifts/schedule?week=${encodeURIComponent(week)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Company-Slug': slug,
      },
    });
  } catch {
    return {
      ok: false,
      message: `Could not reach the server. Check ${API_BASE_URL} and your connection.`,
    };
  }

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* plain body */
  }

  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw, res.status) };
  }

  const schedule = extractSchedule(parsed);
  if (!schedule) {
    return { ok: false, message: 'Schedule response was empty or invalid.' };
  }

  return { ok: true, schedule };
}
