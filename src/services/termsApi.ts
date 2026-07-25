import { API_BASE_URL } from '../config/api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';

export type TermsSection = { title: string; body: string };

export type TermsAndConditionsPayload = {
  companySlug: string;
  companyName: string | null;
  lastUpdated: string | null;
  content: string;
  sections: TermsSection[];
};

export class TermsFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TermsFetchError';
  }
}

function normalizeSections(raw: unknown): TermsSection[] {
  if (!Array.isArray(raw)) return [];
  const out: TermsSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const body = typeof row.body === 'string' ? row.body.trim() : '';
    if (!title && !body) continue;
    out.push({ title: title || 'Terms', body });
  }
  return out;
}

/**
 * Load that organization's Terms & Conditions for create-account.
 * `GET /api/v1/terms` with `X-Company-Slug` — tenant DB for the selected company only.
 */
export async function fetchTermsAndConditions(
  companySlug: string,
): Promise<TermsAndConditionsPayload> {
  const slug = companySlug.trim();
  if (!slug) {
    throw new TermsFetchError('Select a company on step 1 before viewing terms.');
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/terms`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'X-Company-Slug': slug,
        },
      },
      { timeoutMs: 15_000, retries: 1, retryDelayMs: 800 },
    );
  } catch {
    throw new TermsFetchError(
      'Could not reach the server to load this organisation’s terms. Check your connection and try again.',
    );
  }

  const text = await res.text();
  if (!res.ok) {
    const parsed = tryParseApiJson(text);
    const msg =
      parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
        ? ((parsed as { message: string }).message || '').trim()
        : '';
    throw new TermsFetchError(
      msg ||
        `Could not load terms for this organisation (error ${res.status}).`,
    );
  }

  const parsed = tryParseApiJson(text);
  if (parsed === null || typeof parsed !== 'object') {
    throw new TermsFetchError('The server returned an unexpected terms response.');
  }

  const root = parsed as Record<string, unknown>;
  const companyRaw = root.company;
  let companyName: string | null = null;
  let responseSlug = slug;
  if (companyRaw && typeof companyRaw === 'object') {
    const c = companyRaw as Record<string, unknown>;
    if (typeof c.name === 'string' && c.name.trim() !== '') {
      companyName = c.name.trim();
    }
    if (typeof c.slug === 'string' && c.slug.trim() !== '') {
      responseSlug = c.slug.trim();
    }
  }

  // Guard against a mismatched tenant response.
  if (responseSlug !== slug) {
    throw new TermsFetchError('Terms response did not match the selected company.');
  }

  const lastUpdatedRaw = root.last_updated ?? root.lastUpdated;
  const lastUpdated =
    typeof lastUpdatedRaw === 'string' && lastUpdatedRaw.trim() !== '' && lastUpdatedRaw !== '—'
      ? lastUpdatedRaw.trim()
      : null;
  const content = typeof root.content === 'string' ? root.content.trim() : '';
  let sections = normalizeSections(root.sections);

  if (sections.length === 0 && content) {
    sections = [{ title: 'Terms and Conditions', body: content }];
  }

  if (sections.length === 0 && !content) {
    throw new TermsFetchError(
      `${companyName ?? 'This organisation'} has not published terms and conditions yet.`,
    );
  }

  return {
    companySlug: responseSlug,
    companyName,
    lastUpdated,
    content,
    sections,
  };
}
