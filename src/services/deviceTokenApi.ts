import { API_BASE_URL } from '../config/api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile } from './accountProfileStorage';

type ApiFail = { ok: false; message: string };
type ApiOk = { ok: true };

async function resolveCompanySlug(): Promise<string | null> {
  let slug = await getLastCompanySlug();
  if (slug) return slug;
  const local = await loadAccountProfile();
  return local.companySlug ?? local.registrationCompanySlug ?? null;
}

async function tenantAuthHeaders(): Promise<
  { ok: true; headers: Record<string, string> } | ApiFail
> {
  const token = await getAuthToken();
  if (!token || token.trim() === '') {
    return { ok: false, message: 'Not signed in.' };
  }
  const slug = await resolveCompanySlug();
  if (!slug) {
    return { ok: false, message: 'Organization context missing.' };
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

export async function registerDeviceToken(
  token: string,
  platform: 'android' | 'ios',
): Promise<ApiOk | ApiFail> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/device-token`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ token, platform }),
    });
    if (!res.ok) {
      const raw = await res.text();
      const parsed = tryParseApiJson(raw);
      const message =
        parsed && typeof parsed === 'object' && typeof (parsed as any).message === 'string'
          ? (parsed as any).message
          : 'Could not register device for chat notifications.';
      return { ok: false, message };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not register device for chat notifications.' };
  }
}

export async function unregisterDeviceToken(token?: string): Promise<ApiOk | ApiFail> {
  const auth = await tenantAuthHeaders();
  if (!auth.ok) return auth;
  try {
    const res = await fetchWithTimeout(`${API_BASE_URL}/api/v1/device-token`, {
      method: 'DELETE',
      headers: auth.headers,
      body: JSON.stringify(token ? { token } : {}),
    });
    if (!res.ok) {
      return { ok: false, message: 'Could not unregister device token.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Could not unregister device token.' };
  }
}
