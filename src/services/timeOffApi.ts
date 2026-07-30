import { API_BASE_URL } from '../config/api';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type TimeOffStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | string;

export type TimeOffRequestItem = {
  id: number;
  requested_date: string | null;
  date_label: string;
  status: TimeOffStatus;
  reason: string | null;
  decision_note: string | null;
  reviewed_at: string | null;
};

export type FetchTimeOffRequestsResult =
  | { ok: true; requests: TimeOffRequestItem[] }
  | { ok: false; message: string };

export type SubmitTimeOffResult =
  | { ok: true; message: string; request: TimeOffRequestItem }
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
    const o = parsed as { message?: unknown; code?: unknown };
    if (typeof o.message === 'string' && o.message.trim() !== '') {
      return { message: o.message.trim(), code: typeof o.code === 'string' ? o.code : undefined };
    }
  }
  const t = raw.trim();
  if (t !== '') return { message: t.slice(0, 600) };
  return { message: `Request failed (${status}).` };
}

function mapRequest(raw: unknown): TimeOffRequestItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'number') return null;
  return {
    id: o.id,
    requested_date: typeof o.requested_date === 'string' ? o.requested_date : null,
    date_label: typeof o.date_label === 'string' ? o.date_label : '',
    status: typeof o.status === 'string' ? (o.status as TimeOffStatus) : 'pending',
    reason: typeof o.reason === 'string' ? o.reason : null,
    decision_note: typeof o.decision_note === 'string' ? o.decision_note : null,
    reviewed_at: typeof o.reviewed_at === 'string' ? o.reviewed_at : null,
  };
}

/** Loads the signed-in employee's time-off requests from `GET /api/v1/time-off/requests`. */
export async function fetchTimeOffRequests(): Promise<FetchTimeOffRequestsResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return { ok: false, message: auth.message };

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/time-off/requests`;

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
    return {
      ok: false,
      message: `Could not reach the server. Check ${API_BASE_URL} and your connection.`,
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);
  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw, res.status).message };
  }

  const list = (parsed as { requests?: unknown })?.requests;
  const requests = Array.isArray(list)
    ? list.map(mapRequest).filter((r): r is TimeOffRequestItem => r !== null)
    : [];

  return { ok: true, requests };
}

/** Submits a new time-off request via `POST /api/v1/time-off/requests`. `date` is ISO `YYYY-MM-DD`. */
export async function submitTimeOffRequest(input: {
  date: string;
  reason?: string | null;
}): Promise<SubmitTimeOffResult> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return { ok: false, message: auth.message };

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/time-off/requests`;

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
      body: JSON.stringify({
        requested_date: input.date,
        reason: input.reason?.trim() ? input.reason.trim() : undefined,
      }),
    });
  } catch {
    return {
      ok: false,
      message: `Could not reach the server. Check ${API_BASE_URL} and your connection.`,
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (!res.ok) {
    const err = formatApiError(parsed, raw, res.status);
    return { ok: false, message: err.message, code: err.code };
  }

  const request = mapRequest((parsed as { request?: unknown })?.request);
  const message =
    (parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
      ? ((parsed as { message: string }).message)
      : 'Time-off request submitted.');

  if (!request) {
    return { ok: false, message: 'Request response was invalid.' };
  }

  return { ok: true, message, request };
}
