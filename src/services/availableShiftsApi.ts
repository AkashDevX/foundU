import { API_BASE_URL } from '../config/api';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type AvailableShiftState = 'open' | 'assigned' | string;

export type AvailableShiftRequestStatus = 'pending' | 'approved' | 'rejected' | string;

export type MyAvailableShiftRequest = {
  id: number;
  status: AvailableShiftRequestStatus;
  note: string | null;
  decision_note: string | null;
};

export type AvailableShiftItem = {
  id: number;
  scheduled_date: string;
  date_label: string;
  time_range: string;
  title: string;
  meta: string;
  original_employee_name: string;
  status_label: string | null;
  state: AvailableShiftState;
  assigned_to_you: boolean;
  assigned_employee_name: string;
  assignment_note: string | null;
  can_request: boolean;
  my_request: MyAvailableShiftRequest | null;
};

export type FetchAvailableShiftsResult =
  | { ok: true; shifts: AvailableShiftItem[] }
  | { ok: false; message: string };

export type RequestAvailableShiftResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code?: string };

async function resolveCompanySlug(): Promise<string | null> {
  const slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

async function tenantAuthHeaders(): Promise<
  { ok: true; token: string; slug: string } | { ok: false; message: string }
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
  return { ok: true, token, slug };
}

function formatApiError(parsed: unknown, raw: string, status: number): { message: string; code?: string } {
  if (parsed && typeof parsed === 'object') {
    const o = parsed as { message?: unknown; code?: unknown; errors?: unknown };
    if (typeof o.message === 'string' && o.message.trim() !== '') {
      return { message: o.message.trim(), code: typeof o.code === 'string' ? o.code : undefined };
    }
    if (o.errors && typeof o.errors === 'object') {
      const first = Object.values(o.errors as Record<string, unknown>).flat()[0];
      if (typeof first === 'string' && first.trim() !== '') {
        return { message: first.trim() };
      }
    }
  }
  const t = raw.trim();
  if (t !== '') return { message: t.slice(0, 600) };
  return { message: `Request failed (${status}).` };
}

function mapRequest(raw: unknown): MyAvailableShiftRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  return {
    id: o.id,
    status: typeof o.status === 'string' ? o.status : 'pending',
    note: typeof o.note === 'string' ? o.note : null,
    decision_note: typeof o.decision_note === 'string' ? o.decision_note : null,
  };
}

function mapShift(raw: unknown): AvailableShiftItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  return {
    id: o.id,
    scheduled_date: typeof o.scheduled_date === 'string' ? o.scheduled_date : '',
    date_label: typeof o.date_label === 'string' ? o.date_label : '',
    time_range: typeof o.time_range === 'string' ? o.time_range : '',
    title: typeof o.title === 'string' ? o.title : 'Shift',
    meta: typeof o.meta === 'string' ? o.meta : '',
    original_employee_name: typeof o.original_employee_name === 'string' ? o.original_employee_name : '',
    status_label: typeof o.status_label === 'string' ? o.status_label : null,
    state: typeof o.state === 'string' ? o.state : 'open',
    assigned_to_you: o.assigned_to_you === true,
    assigned_employee_name: typeof o.assigned_employee_name === 'string' ? o.assigned_employee_name : '',
    assignment_note: typeof o.assignment_note === 'string' ? o.assignment_note : null,
    can_request: o.can_request === true,
    my_request: mapRequest(o.my_request),
  };
}

/** Loads open and already-assigned available shifts from `GET /api/v1/shifts/available`. */
export async function fetchAvailableShifts(): Promise<FetchAvailableShiftsResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return { ok: false, message: auth.message };

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/shifts/available`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'X-Company-Slug': auth.slug,
      },
    });
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);
  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw, res.status).message };
  }

  const root = parsed && typeof parsed === 'object' ? (parsed as { shifts?: unknown }).shifts : null;
  const shifts = Array.isArray(root) ? root.map(mapShift).filter((item): item is AvailableShiftItem => item !== null) : [];
  return { ok: true, shifts };
}

/** Asks an admin to assign an available shift. `POST /api/v1/shifts/available/{id}/request`. */
export async function requestAvailableShift(shiftId: number, note: string): Promise<RequestAvailableShiftResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return { ok: false, message: auth.message };

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/shifts/available/${shiftId}/request`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auth.token}`,
        'X-Company-Slug': auth.slug,
      },
      body: JSON.stringify({ note }),
    });
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection.' };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);
  if (!res.ok) {
    const error = formatApiError(parsed, raw, res.status);
    return { ok: false, message: error.message, code: error.code };
  }

  const message =
    parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
      ? (parsed as { message: string }).message
      : 'Request sent. Your manager will review it.';

  return { ok: true, message };
}
