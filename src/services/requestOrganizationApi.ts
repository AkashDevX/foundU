import { API_BASE_URL } from '../config/api';
import { CRULYNK_PLATFORM_SLUG } from '../config/platform';
import type { OrganizationRequestPayload } from '../types/organizationRequest';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';

/**
 * Submit a new organisation access request to the master registry.
 *
 * `POST /api/v1/request-organization`
 * Headers: `Accept`, `Content-Type`, `X-Platform-Slug: crulynk`
 * No `X-Company-Slug` — the request is platform-scoped and must appear only in the
 * CruLynk platform admin UI, not in any employer tenant dashboard.
 */
export type SubmitOrganizationRequestOk = { ok: true };
export type SubmitOrganizationRequestErr = { ok: false; message: string };

function formatApiError(parsed: unknown, raw: string, status: number): string {
  if (parsed && typeof parsed === 'object') {
    const errObj = (parsed as { errors?: Record<string, string[] | string> }).errors;
    if (errObj && typeof errObj === 'object') {
      const lines: string[] = [];
      for (const msgs of Object.values(errObj)) {
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (typeof m === 'string' && m.trim() !== '') lines.push(m);
          }
        } else if (typeof msgs === 'string' && msgs.trim() !== '') {
          lines.push(msgs);
        }
      }
      if (lines.length > 0) return lines.join('\n');
    }
    const msg = (parsed as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim() !== '') return msg.trim();
  }
  const t = raw.trim();
  if (t !== '') return t.slice(0, 800);
  if (status === 422) return 'Please check your details and try again.';
  return `Could not submit your request (${status}). Please try again later.`;
}

export async function submitOrganizationRequest(
  payload: OrganizationRequestPayload,
): Promise<SubmitOrganizationRequestOk | SubmitOrganizationRequestErr> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/request-organization`;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Platform-Slug': CRULYNK_PLATFORM_SLUG,
        },
        body: JSON.stringify(payload),
      },
      { timeoutMs: 25_000, retries: 1, retryDelayMs: 1_000 },
    );
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('abort'));
    return {
      ok: false,
      message: timedOut
        ? 'The request timed out. Check your internet connection and try again.'
        : __DEV__
          ? 'Could not reach the server. Check your connection and that Laravel is running.'
          : 'Could not reach the server. Check your internet connection and try again.',
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (res.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    message: formatApiError(parsed, raw, res.status),
  };
}
