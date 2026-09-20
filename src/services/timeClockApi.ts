import { API_BASE_URL } from '../config/api';
import { tryParseApiJson } from '../utils/parseApiJson';
import {
  mapTimeClockStatus,
  type TimeClockStatus,
} from '../utils/timeClockStatus';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type {
  ScheduledShiftTimes,
  TimeClockStatus,
} from '../utils/timeClockStatus';
export { mapTimeClockStatus, resolveGeofenceRadiusM, resolveGeofenceSiteCoords } from '../utils/timeClockStatus';

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
  const parsed = tryParseApiJson(raw);

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
  path: 'clock-in' | 'clock-out' | 'auto-clock-out' | 'break-start' | 'break-end',
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
  const parsed = tryParseApiJson(raw);

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

export async function postClockOut(
  coords: DeviceCoordinates,
  comment?: string | null,
): Promise<TimeClockPunchResult> {
  const trimmed = comment?.trim();
  return postTimeClockPunch('clock-out', coords, trimmed ? { comment: trimmed } : undefined);
}

export async function postAutoClockOut(coords: DeviceCoordinates): Promise<TimeClockPunchResult> {
  return postTimeClockPunch('auto-clock-out', coords, { trigger: 'left_geofence' });
}

export async function postBreakIn(coords: DeviceCoordinates): Promise<TimeClockPunchResult> {
  return postTimeClockPunch('break-start', coords);
}

export async function postBreakOut(coords: DeviceCoordinates): Promise<TimeClockPunchResult> {
  return postTimeClockPunch('break-end', coords);
}

export type IdleAlertPayload = {
  id: number;
  clock_in_entry_id: number;
  started_at: string | null;
  detected_at: string | null;
  idle_minutes: number;
  center_latitude: number | null;
  center_longitude: number | null;
  max_displacement_meters: number | null;
  status: string;
  employee_acknowledged_at: string | null;
  message: string;
};

export type LocationPingResult =
  | {
      ok: true;
      message: string;
      throttled: boolean;
      idle_alert: IdleAlertPayload | null;
    }
  | { ok: false; message: string; code?: string };

function mapIdleAlert(raw: unknown): IdleAlertPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = Number(o.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    clock_in_entry_id: Number(o.clock_in_entry_id) || 0,
    started_at: typeof o.started_at === 'string' ? o.started_at : null,
    detected_at: typeof o.detected_at === 'string' ? o.detected_at : null,
    idle_minutes: Number(o.idle_minutes) || 0,
    center_latitude: o.center_latitude != null ? Number(o.center_latitude) : null,
    center_longitude: o.center_longitude != null ? Number(o.center_longitude) : null,
    max_displacement_meters:
      o.max_displacement_meters != null ? Number(o.max_displacement_meters) : null,
    status: typeof o.status === 'string' ? o.status : 'open',
    employee_acknowledged_at:
      typeof o.employee_acknowledged_at === 'string' ? o.employee_acknowledged_at : null,
    message:
      typeof o.message === 'string' && o.message.trim() !== ''
        ? o.message.trim()
        : 'Little movement detected. Please confirm you are still working.',
  };
}

export async function postLocationPing(coords: DeviceCoordinates): Promise<LocationPingResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/time-clock/location-ping`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy_meters: coords.accuracy_meters ?? null,
      }),
    });
  } catch {
    return {
      ok: false,
      message: `Could not reach the server at ${API_BASE_URL}.`,
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (!res.ok) {
    const err = formatApiError(parsed, raw, res.status);
    return { ok: false, message: err.message, code: err.code };
  }

  const body = (parsed && typeof parsed === 'object' ? parsed : {}) as {
    message?: string;
    throttled?: boolean;
    idle_alert?: unknown;
  };

  return {
    ok: true,
    message: typeof body.message === 'string' ? body.message : 'Location ping recorded.',
    throttled: Boolean(body.throttled),
    idle_alert: mapIdleAlert(body.idle_alert),
  };
}

export async function acknowledgeIdleAlert(
  idleAlertId: number,
): Promise<{ ok: true; idle_alert: IdleAlertPayload | null } | { ok: false; message: string }> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/time-clock/idle-alert/acknowledge`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ idle_alert_id: idleAlertId }),
    });
  } catch {
    return { ok: false, message: `Could not reach the server at ${API_BASE_URL}.` };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (!res.ok) {
    const err = formatApiError(parsed, raw, res.status);
    return { ok: false, message: err.message };
  }

  const body = (parsed && typeof parsed === 'object' ? parsed : {}) as { idle_alert?: unknown };
  return { ok: true, idle_alert: mapIdleAlert(body.idle_alert) };
}
