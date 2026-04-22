import { API_BASE_URL } from '../config/api';

/**
 * Employee sign-in against the company tenant DB.
 *
 * Backend contract (Laravel-style): resolve tenant from master registry via `X-Company-Slug`,
 * then validate credentials in that company's database.
 *
 * `POST /api/v1/login`
 * Headers: `Accept: application/json`, `Content-Type: application/json`, `X-Company-Slug: {slug}`
 * Body: `{ "email": "...", "password": "..." }`
 *
 * Success (200): JSON may include `token`, `access_token`, or `data.token` (Sanctum personal access token).
 */

function extractToken(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const direct =
    (typeof o.token === 'string' && o.token.trim() !== '' ? o.token : null) ??
    (typeof o.access_token === 'string' && o.access_token.trim() !== '' ? o.access_token : null) ??
    (typeof o.plainTextToken === 'string' && o.plainTextToken.trim() !== '' ? o.plainTextToken : null);
  if (direct) return direct;
  if (o.data && typeof o.data === 'object') {
    const d = o.data as Record<string, unknown>;
    if (typeof d.token === 'string' && d.token.trim() !== '') return d.token;
  }
  return null;
}

function formatLoginApiError(parsed: unknown, raw: string, status: number): string {
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
  if (status === 401 || status === 403) {
    return 'These credentials do not match our records. Check your email, password, and organization.';
  }
  if (status === 422) return 'Invalid sign-in data.';
  return `Sign in failed (${status}).`;
}

export type LoginEmployeeOk = { ok: true; token: string | null };
export type LoginEmployeeErr = { ok: false; message: string };

/**
 * Calls master-routed login: company slug selects tenant; credentials are checked on that tenant DB.
 */
export async function loginEmployee(params: {
  companySlug: string;
  email: string;
  password: string;
}): Promise<LoginEmployeeOk | LoginEmployeeErr> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/login`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Company-Slug': params.companySlug,
      },
      body: JSON.stringify({
        email: params.email.trim(),
        password: params.password,
      }),
    });
  } catch {
    return {
      ok: false,
      message:
        'Could not reach the server. Check your connection, API URL in src/config/api.ts, and that Laravel is running.',
    };
  }

  const raw = await res.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* plain body */
  }

  if (res.ok) {
    return { ok: true, token: extractToken(parsed) };
  }

  return {
    ok: false,
    message: formatLoginApiError(parsed, raw, res.status),
  };
}
