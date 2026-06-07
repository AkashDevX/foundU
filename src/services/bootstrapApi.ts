import { API_BASE_URL } from '../config/api';
import type { BootstrapPayload } from '../types/bootstrap';
import { setAppLocale, setAppTimezone } from '../utils/formatDateTime';

export async function fetchBootstrap(): Promise<BootstrapPayload> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/bootstrap`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `Bootstrap failed (${res.status})`);
  }
  const payload = JSON.parse(text) as BootstrapPayload;
  setAppTimezone(payload.timezone);
  setAppLocale(payload.locale);
  return payload;
}
