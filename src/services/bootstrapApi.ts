import { API_BASE_URL } from '../config/api';
import type { BootstrapCompany, BootstrapPayload, PicklistOption } from '../types/bootstrap';
import { setAppLocale, setAppTimezone } from '../utils/formatDateTime';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';
import { saveBootstrapCache } from './bootstrapCacheStorage';

function networkBootstrapError(cause?: unknown): Error {
  const timedOut =
    cause instanceof Error &&
    (cause.name === 'AbortError' || cause.message.toLowerCase().includes('abort'));

  if (__DEV__) {
    return new Error(
      timedOut
        ? `Bootstrap timed out reaching ${API_BASE_URL}.\n\n` +
            '• Check Laravel is running: php artisan serve --host=0.0.0.0 --port=8000\n' +
            '• Android emulator: app uses 10.0.2.2 (not your LAN IP)\n' +
            '• Physical phone: set DEV_API_HOST_OVERRIDE in src/config/api.ts to your PC IP\n' +
            '• Same Wi‑Fi, allow port 8000 in Windows Firewall'
        : `Could not reach ${API_BASE_URL}.\n\n` +
            '• Laravel: php artisan serve --host=0.0.0.0 --port=8000\n' +
            '• Android emulator: app uses 10.0.2.2 (not your LAN IP)\n' +
            '• Physical phone: set DEV_API_HOST_OVERRIDE in src/config/api.ts to your PC IP\n' +
            '• Same Wi‑Fi, allow port 8000 in Windows Firewall',
    );
  }

  return new Error(
    timedOut
      ? 'Could not load organizations — the server took too long to respond. Check your connection and tap Retry.'
      : 'Could not load organizations. Check your internet connection and tap Retry.',
  );
}

function normalizeCompany(raw: unknown): BootstrapCompany | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const slug = typeof row.slug === 'string' ? row.slug.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!slug || !name) return null;
  const id = typeof row.id === 'number' ? row.id : Number(row.id);
  const appKeyRaw = row.appKey ?? row.app_key;
  const appKey =
    typeof appKeyRaw === 'string' && appKeyRaw.trim() !== '' ? appKeyRaw.trim() : null;
  return {
    id: Number.isFinite(id) ? id : 0,
    appKey,
    slug,
    name,
  };
}

function normalizePicklists(raw: unknown): Record<string, PicklistOption[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PicklistOption[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const options: PicklistOption[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const optionValue = typeof row.value === 'string' ? row.value : String(row.value ?? '');
      const label = typeof row.label === 'string' ? row.label : optionValue;
      if (optionValue.trim() === '') continue;
      options.push({ value: optionValue, label });
    }
    out[key] = options;
  }
  return out;
}

function normalizeBootstrapPayload(raw: unknown): BootstrapPayload {
  const root = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const inner =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const companiesRaw = inner.companies ?? root.companies;
  const companies = Array.isArray(companiesRaw)
    ? companiesRaw.map(normalizeCompany).filter((c): c is BootstrapCompany => c !== null)
    : [];

  if (companies.length === 0) {
    throw new Error(
      __DEV__
        ? `Bootstrap response missing companies[] from ${API_BASE_URL}`
        : 'The server responded but returned no organizations. Tap Retry or contact support.',
    );
  }

  const generatedAt =
    typeof inner.generated_at === 'string'
      ? inner.generated_at
      : typeof root.generated_at === 'string'
        ? root.generated_at
        : new Date().toISOString();

  const timezone =
    typeof inner.timezone === 'string'
      ? inner.timezone
      : typeof root.timezone === 'string'
        ? root.timezone
        : undefined;

  const locale =
    typeof inner.locale === 'string'
      ? inner.locale
      : typeof root.locale === 'string'
        ? root.locale
        : undefined;

  const picklists = normalizePicklists(inner.picklists ?? root.picklists);

  return {
    generated_at: generatedAt,
    timezone,
    locale,
    companies,
    picklists,
  };
}

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/bootstrap`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
        },
      },
      { timeoutMs: 25_000, retries: 2, retryDelayMs: 1_500 },
    );
  } catch (error) {
    throw networkBootstrapError(error);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text.trim() ||
        (__DEV__
          ? `Bootstrap failed (${res.status}) at ${API_BASE_URL}`
          : `Could not load organizations (server error ${res.status}). Tap Retry.`),
    );
  }

  const parsed = tryParseApiJson(text);
  if (parsed === null) {
    throw new Error(
      __DEV__
        ? `Server returned invalid JSON from ${url}`
        : 'The server returned an unexpected response. Tap Retry.',
    );
  }

  const payload = normalizeBootstrapPayload(parsed);
  setAppTimezone(payload.timezone);
  setAppLocale(payload.locale);
  await saveBootstrapCache(payload);
  return payload;
}
