import { API_BASE_URL } from '../config/api';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type IncidentPhoto = {
  uri: string;
  name: string;
  type: string;
};

export type IncidentAnswers = Record<string, unknown>;

export type FetchIncidentOptionsResult =
  | { ok: true; sites: string[] }
  | { ok: false; message: string };

export type SubmitIncidentResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

async function resolveCompanySlug(): Promise<string | null> {
  const slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

async function tenantAuth(): Promise<
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

function formatApiError(parsed: unknown, raw: string, status: number): string {
  if (parsed && typeof parsed === 'object') {
    const body = parsed as { message?: unknown; errors?: Record<string, unknown> };
    if (body.errors && typeof body.errors === 'object') {
      for (const value of Object.values(body.errors)) {
        if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim() !== '') {
          return value[0].trim();
        }
      }
    }
    if (typeof body.message === 'string' && body.message.trim() !== '') {
      return body.message.trim();
    }
  }
  const text = raw.trim();
  if (text !== '') return text.slice(0, 600);
  return `Request failed (${status}).`;
}

/** Work sites the employee can pick on the incident form. */
export async function fetchIncidentOptions(): Promise<FetchIncidentOptionsResult> {
  const auth = await tenantAuth();
  if (!auth.ok) return auth;

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/incidents/options`;
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
    return { ok: false, message: 'Could not load work sites.' };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);
  if (!res.ok) {
    return { ok: false, message: formatApiError(parsed, raw, res.status) };
  }

  const sitesRaw = (parsed as { sites?: unknown })?.sites;
  const sites = Array.isArray(sitesRaw)
    ? sitesRaw.filter((site): site is string => typeof site === 'string' && site.trim() !== '')
    : [];

  return { ok: true, sites };
}

function appendPhotos(form: FormData, key: string, photos: IncidentPhoto[]) {
  photos.forEach((photo) => {
    form.append(`${key}[]`, {
      uri: photo.uri,
      name: photo.name || 'incident.jpg',
      type: photo.type || 'image/jpeg',
    } as unknown as Blob);
  });
}

function responseMessage(parsed: unknown, fallback: string): string {
  if (parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string') {
    const message = (parsed as { message: string }).message.trim();
    if (message !== '') return message;
  }
  return fallback;
}

/** Submits the in-app incident report and reports upload percent from 0 to 100. */
export async function submitIncidentReport(
  answers: IncidentAnswers,
  photos: IncidentPhoto[] = [],
  propertyPhotos: IncidentPhoto[] = [],
  onProgress?: (percent: number) => void,
): Promise<SubmitIncidentResult> {
  const auth = await tenantAuth();
  if (!auth.ok) return auth;

  const form = new FormData();
  form.append('answers', JSON.stringify(answers));
  appendPhotos(form, 'photos', photos);
  appendPhotos(form, 'property_photos', propertyPhotos);

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/incidents`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);
    xhr.setRequestHeader('X-Company-Slug', auth.slug);
    xhr.timeout = 120000;

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      const uploaded = Math.round(8 + (event.loaded / event.total) * 84);
      onProgress(Math.min(92, Math.max(8, uploaded)));
    };

    xhr.onerror = () => {
      resolve({
        ok: false,
        message: `Could not reach the server. Check ${API_BASE_URL} and your connection.`,
      });
    };
    xhr.ontimeout = () => {
      resolve({ ok: false, message: 'The upload took too long. Check your connection and try again.' });
    };
    xhr.onload = () => {
      const raw = xhr.responseText ?? '';
      const parsed = tryParseApiJson(raw);
      if (xhr.status < 200 || xhr.status >= 300) {
        resolve({ ok: false, message: formatApiError(parsed, raw, xhr.status) });
        return;
      }
      onProgress?.(100);
      resolve({ ok: true, message: responseMessage(parsed, 'Incident report submitted.') });
    };

    xhr.send(form);
  });
}
