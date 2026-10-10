import type { UserProfileSnapshot } from '../types/userProfile';

/** Matches the server window: due from 30 days before expiry, including after it has passed. */
export const DOCUMENT_RENEWAL_WINDOW_DAYS = 30;

export type DocumentRenewalItem = {
  key: string;
  label: string;
  /** ISO `YYYY-MM-DD`. */
  expiry: string;
  daysUntil: number;
  status: 'expiring' | 'expired';
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function daysUntilIso(iso: string, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const expiry = new Date(year, month - 1, day);
  if (expiry.getFullYear() !== year || expiry.getMonth() !== month - 1 || expiry.getDate() !== day) {
    return null;
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry.getTime() - start.getTime()) / 86_400_000);
}

export function formatExpiryDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return iso;
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function dayWord(days: number): string {
  return Math.abs(days) === 1 ? 'day' : 'days';
}

/** Countdown line: 30 days, then 29, 28, and so on, then each day after it has expired. */
export function reminderSentence(item: DocumentRenewalItem): string {
  if (item.daysUntil < 0 || item.status === 'expired') {
    const ago = Math.abs(item.daysUntil);
    return `Your ${item.label} expired ${ago} ${dayWord(ago)} ago. Please renew it.`;
  }
  if (item.daysUntil === 0) {
    return `Your ${item.label} expires today. Please renew it.`;
  }
  return `Your ${item.label} expires in ${item.daysUntil} ${dayWord(item.daysUntil)}. Please renew it.`;
}

function reminderTitle(item: DocumentRenewalItem): string {
  if (item.daysUntil < 0 || item.status === 'expired') {
    const ago = Math.abs(item.daysUntil);
    return `Your ${item.label} expired ${ago} ${dayWord(ago)} ago`;
  }
  if (item.daysUntil === 0) {
    return `Your ${item.label} expires today`;
  }
  return `Your ${item.label} expires in ${item.daysUntil} ${dayWord(item.daysUntil)}`;
}

export function reminderCopy(items: DocumentRenewalItem[]): { title: string; body: string } {
  if (items.length === 0) {
    return { title: '', body: '' };
  }

  const body = `${items.map(reminderSentence).join(' ')} Open My profile to upload the renewed document and set the new expiry. This reminder repeats every day until you submit it.`;
  if (items.length === 1) {
    const item = items[0];
    return {
      title: reminderTitle(item),
      body,
    };
  }

  return {
    title: 'Documents need renewing',
    body,
  };
}

/** Drops anything whose expiry is now more than 30 days away, so a saved renewal is not reminded again. */
export function documentsStillNeedingRenewal(
  items: DocumentRenewalItem[],
  today: Date = new Date(),
): DocumentRenewalItem[] {
  const due: DocumentRenewalItem[] = [];
  for (const item of items) {
    const daysUntil = daysUntilIso(item.expiry, today);
    if (daysUntil === null || daysUntil > DOCUMENT_RENEWAL_WINDOW_DAYS) continue;
    due.push({
      ...item,
      daysUntil,
      status: daysUntil < 0 ? 'expired' : 'expiring',
    });
  }
  return due;
}

export function reminderFingerprint(items: DocumentRenewalItem[]): string {
  return items
    .map((item) => `${item.key}@${item.expiry}`)
    .sort()
    .join('|');
}

function isoFromRaw(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const display = /^(\d{2}) \/ (\d{2}) \/ (\d{4})$/.exec(trimmed);
  if (!display) return null;
  return `${display[3]}-${display[1]}-${display[2]}`;
}

function pushIfDue(
  items: DocumentRenewalItem[],
  key: string,
  label: string,
  rawExpiry: unknown,
  today: Date,
): void {
  const iso = isoFromRaw(rawExpiry);
  if (!iso) return;
  const daysUntil = daysUntilIso(iso, today);
  if (daysUntil === null || daysUntil > DOCUMENT_RENEWAL_WINDOW_DAYS) return;
  items.push({
    key,
    label: label.trim() || 'Document',
    expiry: iso,
    daysUntil,
    status: daysUntil < 0 ? 'expired' : 'expiring',
  });
}

function rowTitle(row: Record<string, unknown>): string {
  const storedKeys = ['documentType', 'document_type', 'idType', 'id_type', 'type', 'name', 'title', 'label'];
  let stored = '';
  for (const key of storedKeys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim() !== '') {
      stored = value.trim();
      break;
    }
  }
  if (/^other$/i.test(stored)) {
    for (const key of ['documentTypeOther', 'document_type_other', 'typeOther', 'type_other']) {
      const value = row[key];
      if (typeof value === 'string' && value.trim() !== '') return value.trim();
    }
  }
  return stored;
}

function rowExpiry(row: Record<string, unknown>): unknown {
  for (const key of ['expiry', 'expiryDate', 'expiry_date', 'documentExpiry', 'document_expiry']) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

/**
 * Local fallback when the profile payload has expiry fields but no `document_renewals` list.
 * The signed-in profile from `/api/v1/me` is preferred.
 */
export function dueRenewalsFromProfile(
  profile: UserProfileSnapshot,
  today: Date = new Date(),
): DocumentRenewalItem[] {
  const items: DocumentRenewalItem[] = [];
  const visaStatus = (profile.visaStatus ?? '').toLowerCase();
  const visaApplies =
    visaStatus.trim() !== '' &&
    !visaStatus.includes('citizen') &&
    !visaStatus.includes('permanent resident');
  if (visaApplies) {
    pushIfDue(items, 'visa', 'Visa', profile.visaExpiry, today);
  }
  pushIfDue(items, 'police_check', 'Police check', profile.policeCheckExpiry, today);
  pushIfDue(items, 'fit_to_work', 'Fit to work', profile.fitToWorkExpiry, today);
  pushIfDue(items, 'vehicle_registration', 'Vehicle registration', profile.vehicleExpiry, today);

  for (const row of profile.licencesJson ?? []) {
    const id = String(row.id ?? '').trim();
    if (!id) continue;
    pushIfDue(items, `licence:${id}`, rowTitle(row) || 'Licence', row.expiry || row.expiry_date, today);
  }
  for (const row of profile.insurancesJson ?? []) {
    const id = String(row.id ?? '').trim();
    if (!id) continue;
    pushIfDue(items, `insurance:${id}`, rowTitle(row) || 'Insurance', row.expiry || row.expiry_date, today);
  }
  for (const [index, row] of (profile.idDocumentsJson ?? []).entries()) {
    const record = row as unknown as Record<string, unknown>;
    const id = String(record.documentKey ?? record.document_key ?? record.id ?? `index:${index}`).trim();
    pushIfDue(items, `id_document:${id}`, rowTitle(record) || 'ID document', rowExpiry(record), today);
  }

  return items;
}

export function renewalsForProfile(
  profile: UserProfileSnapshot | null | undefined,
  today: Date = new Date(),
): DocumentRenewalItem[] {
  if (!profile) return [];
  if (profile.documentRenewals) {
    return documentsStillNeedingRenewal(profile.documentRenewals, today);
  }
  return dueRenewalsFromProfile(profile, today);
}

export function renewalStatusLine(item: DocumentRenewalItem): string {
  const date = formatExpiryDate(item.expiry);
  if (item.status === 'expired') {
    const days = Math.abs(item.daysUntil);
    if (days === 0) return `Expired today (${date})`;
    return days === 1 ? `Expired yesterday (${date})` : `Expired ${days} days ago (${date})`;
  }
  if (item.daysUntil === 0) return `Expires today (${date})`;
  if (item.daysUntil === 1) return `Expires tomorrow (${date})`;
  return `Expires in ${item.daysUntil} days (${date})`;
}
