import { API_BASE_URL } from '../config/api';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

export type RenewalUploadFile = {
  uri: string;
  name: string;
  type: string;
};

export type RenewDocumentResult =
  | { ok: true; message: string; stillDue: boolean }
  | { ok: false; message: string };

async function resolveCompanySlug(): Promise<string | null> {
  const slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
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

/** Uploads a renewed profile document and its new expiry (`YYYY-MM-DD`). */
export async function renewProfileDocument(
  documentKey: string,
  expiryIso: string,
  file: RenewalUploadFile,
): Promise<RenewDocumentResult> {
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

  const form = new FormData();
  form.append('document_key', documentKey);
  form.append('expiry', expiryIso);
  form.append('file', {
    uri: file.uri,
    name: file.name || 'document',
    type: file.type || 'application/octet-stream',
  } as unknown as Blob);

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/me/documents/renew`;

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('X-Company-Slug', slug);
    xhr.timeout = 120000;

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
      const message =
        parsed &&
        typeof parsed === 'object' &&
        typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : 'Document saved.';
      const stillDue = Boolean(
        parsed &&
          typeof parsed === 'object' &&
          (parsed as { still_due?: unknown }).still_due === true,
      );
      resolve({ ok: true, message, stillDue });
    };

    xhr.send(form);
  });
}
