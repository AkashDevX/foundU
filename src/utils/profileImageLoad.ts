import { API_BASE_URL } from '../config/api';
import { getAuthToken, getLastCompanySlug } from '../services/authSessionStorage';
import { loadAccountProfile } from '../services/accountProfileStorage';

/**
 * Re-host `/storage/...` URLs to our configured API base so 127.0.0.1 in JSON
 * matches the device (e.g. 10.0.2.2 / LAN IP) when loading images.
 */
export function normalizeProfileImageUrlToApiHost(uri: string): string {
  const t = uri.trim();
  try {
    const u = new URL(t);
    if (!t.startsWith('http')) return t;
    if (!u.pathname.startsWith('/storage/')) return t;
    const api = new URL(API_BASE_URL);
    // Rebase host: Laravel may return 127.0.0.1 but the app calls 10.0.2.2 or a LAN IP.
    return new URL(u.pathname + u.search + u.hash, `${api.origin}/`).toString();
  } catch {
    return t;
  }
}

function sameApiOriginAs(urlStr: string, api: URL): boolean {
  try {
    return new URL(urlStr).origin === api.origin;
  } catch {
    return false;
  }
}

export type ProfileImageSource = { uri: string; headers?: Record<string, string> };

/**
 * For network profile images, attach `Authorization` + `X-Company-Slug` when
 * the file is served from our API (Laravel `storage` / same origin so protected routes work).
 */
export async function getProfileImageLoadSource(imageUri: string): Promise<ProfileImageSource> {
  const raw = imageUri.trim();
  if (raw === '') {
    return { uri: raw };
  }
  if (raw.startsWith('file:') || raw.startsWith('content:') || raw.startsWith('ph:') || raw.startsWith('assets-library:')) {
    return { uri: raw };
  }
  if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
    return { uri: raw };
  }

  const uri = normalizeProfileImageUrlToApiHost(raw);
  const api = new URL(API_BASE_URL);
  const needsAuth = sameApiOriginAs(uri, api);

  if (!needsAuth) {
    return { uri: uri };
  }

  const token = (await getAuthToken())?.trim() ?? null;
  let slug = (await getLastCompanySlug())?.trim() ?? null;
  if (!slug) {
    const local = await loadAccountProfile();
    slug = (local.companySlug ?? local.registrationCompanySlug ?? '').trim() || null;
  }

  const headers: Record<string, string> = { Accept: 'image/*' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (slug) {
    headers['X-Company-Slug'] = slug;
  }
  if (!token) {
    return { uri: uri };
  }
  return { uri, headers };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('btoa is not available');
}

/**
 * Fetches a protected image and returns a `data:` URL (RN `Image` can display it when headers fail).
 */
export async function fetchProfileImageAsDataUri(
  imageUri: string,
  headers: Record<string, string>,
): Promise<string> {
  const res = await fetch(imageUri, { headers });
  if (!res.ok) {
    throw new Error(String(res.status));
  }
  const ct = res.headers.get('content-type')?.split(';')?.[0]?.trim() || 'image/jpeg';
  const ab = await res.arrayBuffer();
  const b64 = arrayBufferToBase64(ab);
  return `data:${ct};base64,${b64}`;
}

/**
 * Returns a `data:` URI (same origin + token) or a public `https` URL. Avoids `Image` + `source.headers`,
 * which is broken or ignored on many Android React Native versions.
 */
export async function resolveNetworkProfilePhotoToDisplayableUri(photoUrl: string): Promise<string> {
  const t = photoUrl.trim();
  if (t === '') {
    return '';
  }
  if (t.startsWith('file:') || t.startsWith('content:') || t.startsWith('data:') || t.startsWith('ph:') || t.startsWith('assets-library:')) {
    return t;
  }
  if (!t.startsWith('http://') && !t.startsWith('https://')) {
    return t;
  }
  const s = await getProfileImageLoadSource(t);
  if (s.headers?.Authorization) {
    return fetchProfileImageAsDataUri(s.uri, s.headers);
  }
  return s.uri;
}
