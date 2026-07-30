import { API_BASE_URL } from '../config/api';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { tryParseApiJson } from '../utils/parseApiJson';

/**
 * Password reset via emailed OTP.
 *
 * 1. POST /api/v1/forgot-password              { email }
 * 2. POST /api/v1/forgot-password/verify-otp   { email, otp }
 * 3. POST /api/v1/forgot-password/reset        { reset_token, password, password_confirmation }
 *
 * All require `X-Company-Slug`.
 */

export type ForgotPasswordOk = { ok: true; message: string };
export type ForgotPasswordErr = { ok: false; message: string };
export type VerifyResetOtpOk = { ok: true; resetToken: string; message: string };
export type ResetPasswordOk = { ok: true; message: string };

function formatApiError(parsed: unknown, raw: string, status: number, fallback: string): string {
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
  if (status === 422) return fallback;
  if (status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (status === 503) {
    return 'We could not send the verification email right now. Please try again in a few minutes.';
  }
  return `${fallback} (${status}).`;
}

async function postJson(
  path: string,
  companySlug: string,
  body: Record<string, string>,
): Promise<{ ok: true; parsed: unknown } | { ok: false; message: string }> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}${path}`;

  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Company-Slug': companySlug,
        },
        body: JSON.stringify(body),
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
        ? 'Request timed out. Check your internet connection and try again.'
        : __DEV__
          ? 'Could not reach the server. Check your connection, API URL in src/config/api.ts, and that Laravel is running.'
          : 'Could not reach the server. Check your internet connection and try again.',
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (!res.ok) {
    return {
      ok: false,
      message: formatApiError(parsed, raw, res.status, 'Request failed. Please try again.'),
    };
  }

  return { ok: true, parsed };
}

function messageFrom(parsed: unknown, fallback: string): string {
  if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as { message?: unknown }).message === 'string'
  ) {
    const m = ((parsed as { message: string }).message).trim();
    if (m !== '') return m;
  }
  return fallback;
}

/** Matches Laravel `Password::defaults()` used at registration (min 8). */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.trim() === '') return 'Enter a new password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (confirmation.trim() === '') return 'Confirm your new password.';
  if (password !== confirmation) return 'Passwords do not match.';
  return null;
}

export async function requestPasswordResetOtp(params: {
  companySlug: string;
  email: string;
}): Promise<ForgotPasswordOk | ForgotPasswordErr> {
  const result = await postJson('/api/v1/forgot-password', params.companySlug, {
    email: params.email.trim(),
  });
  if (!result.ok) return result;
  return {
    ok: true,
    message: messageFrom(
      result.parsed,
      'If an account exists for that email, we have sent a verification code.',
    ),
  };
}

export async function verifyPasswordResetOtp(params: {
  companySlug: string;
  email: string;
  otp: string;
}): Promise<VerifyResetOtpOk | ForgotPasswordErr> {
  const result = await postJson('/api/v1/forgot-password/verify-otp', params.companySlug, {
    email: params.email.trim(),
    otp: params.otp.trim(),
  });
  if (!result.ok) return result;

  const token =
    result.parsed &&
    typeof result.parsed === 'object' &&
    typeof (result.parsed as { reset_token?: unknown }).reset_token === 'string'
      ? ((result.parsed as { reset_token: string }).reset_token).trim()
      : '';

  if (token === '') {
    return { ok: false, message: 'Verification succeeded but no reset token was returned.' };
  }

  return {
    ok: true,
    resetToken: token,
    message: messageFrom(result.parsed, 'Code verified. You can set a new password now.'),
  };
}

export async function resetPasswordWithToken(params: {
  companySlug: string;
  resetToken: string;
  password: string;
  passwordConfirmation: string;
}): Promise<ResetPasswordOk | ForgotPasswordErr> {
  const result = await postJson('/api/v1/forgot-password/reset', params.companySlug, {
    reset_token: params.resetToken,
    password: params.password,
    password_confirmation: params.passwordConfirmation,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    message: messageFrom(
      result.parsed,
      'Your password has been updated. You can sign in with your new password.',
    ),
  };
}
