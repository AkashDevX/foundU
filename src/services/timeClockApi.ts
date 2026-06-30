import { API_BASE_URL } from '../config/api';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type TimeClockStatus = {
  is_clocked_in: boolean;
  can_clock_in: boolean;
  can_clock_out: boolean;
  geofence_radius_meters: number;
  assignment_ready: boolean;
  assignment_not_ready_reason?: string | null;
  open_session?: {
    clocked_in_at: string | null;
  } | null;
};

export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
};

export type TimeClockPunchResult =
  | { ok: true; message: string; time_clock: TimeClockStatus }
  | { ok: false; message: string; code?: string };

function formatApiError(parsed: unknown, raw: string, status: number): { message: string; code?: string } {
  if (parsed && typeof parsed === 'object') {
    const o = parsed as { message?: string; code?: string };
    if (typeof o.message === 'string' && o.message.trim() !== '') {
      return { message: o.message.trim(), code: o.code };
    }
  }
  const t = raw.trim();
  if (t !== '') return { message: t.slice(0, 600) };
  return { message: `Request failed (${status}).` };
}

async function resolveCompanySlug(): Promise<string | null> {
  let slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

async function tenantAuthHeaders(): Promise<
  | { ok: true; headers: Record<string, string> }
  | { ok: false; message: string }
> {
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

  return {
    ok: true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Company-Slug': slug,
    },
  };
}

function mapTimeClockStatus(raw: unknown): TimeClockStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const openRaw = o.open_session;
  let openSession: TimeClockStatus['open_session'] = null;
  if (openRaw && typeof openRaw === 'object') {
    const open = openRaw as Record<string, unknown>;
    openSession = {
      clocked_in_at: typeof open.clocked_in_at === 'string' ? open.clocked_in_at : null,
    };
  }

  return {
    is_clocked_in: o.is_clocked_in === true,
    can_clock_in: o.can_clock_in === true,
    can_clock_out: o.can_clock_out === true,
    geofence_radius_meters:
      typeof o.geofence_radius_meters === 'number' ? o.geofence_radius_meters : 100,
    assignment_ready: o.assignment_ready === true,
    assignment_not_ready_reason:
      typeof o.assignment_issue === 'string' ? o.assignment_issue : null,
    open_session: openSession,
  };
}

export async function fetchTimeClockStatus(): Promise<
  | { ok: true; time_clock: TimeClockStatus; tenant_slug: string }
  | { ok: false; message: string }
> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  const slug = auth.headers['X-Company-Slug'];
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/time-clock/status`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers: auth.headers });
  } catch {
    return {
      ok: false,
      message: `Could not reach the server at ${API_BASE_URL}. Check Wi‑Fi, your PC IP in src/config/api.ts, and run: php artisan serve --host=0.0.0.0 --port=8000`,
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
    const err = formatApiError(parsed, raw, res.status);
    return { ok: false, message: err.message };
  }

  const timeClock =
    parsed && typeof parsed === 'object'
      ? mapTimeClockStatus((parsed as { time_clock?: unknown }).time_clock)
      : null;

  if (!timeClock) {
    return { ok: false, message: 'Invalid time clock response from server.' };
  }

  return { ok: true, time_clock: timeClock, tenant_slug: slug };
}

async function postTimeClockPunch(
  path: 'clock-in' | 'clock-out' | 'auto-clock-out',
  coords: DeviceCoordinates,
  extraBody?: Record<string, unknown>,
): Promise<TimeClockPunchResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/time-clock/${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_meters: coords.accuracy_meters ?? null,
        ...extraBody,
      }),
    });
  } catch {
    return {
      ok: false,
      message: `Could not reach the server at ${API_BASE_URL}. On a real phone use your PC LAN IP (not localhost) in src/config/api.ts.`,
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
    const err = formatApiError(parsed, raw, res.status);
    return { ok: false, message: err.message, code: err.code };
  }

  const body = parsed as { message?: string; time_clock?: unknown };
  const timeClock = mapTimeClockStatus(body.time_clock);
  if (!timeClock) {
    return { ok: false, message: 'Clock punch succeeded but response was invalid.' };
  }

  return {
    ok: true,
    message: typeof body.message === 'string' ? body.message : 'Success.',
    time_clock: timeClock,
  };
}

export async function postClockIn(coords: DeviceCoordinates): Promise<TimeClockPunchResult> {
  return postTimeClockPunch('clock-in', coords);
}

export async function postClockOut(coords: DeviceCoordinates): Promise<TimeClockPunchResult> {
  return postTimeClockPunch('clock-out', coords);
}

export async function postAutoClockOut(coords: DeviceCoordinates): Promise<TimeClockPunchResult> {
  return postTimeClockPunch('auto-clock-out', coords, { trigger: 'left_geofence' });
}
