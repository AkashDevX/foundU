import { API_BASE_URL } from '../config/api';
import { tryParseApiJson } from '../utils/parseApiJson';
import type { UserProfileSnapshot } from '../types/userProfile';
import { getAuthToken, getLastCompanySlug } from './authSessionStorage';
import { loadAccountProfile, saveAccountProfile } from './accountProfileStorage';
import { notifyAssignmentChange } from './assignmentEvents';

/**
 * Authenticated employee profile from the tenant DB.
 *
 * Expected contract (implement on Laravel):
 * `GET /api/v1/me`
 * Headers: `Accept: application/json`, `Authorization: Bearer {token}`, `X-Company-Slug: {slug}`
 *
 * Response: JSON object for the employee, or wrapped as `{ "data": { ... } }`, `{ "user": { ... } }`,
 * or `{ "employee": { ... } }`. Fields may be snake_case (Laravel) and are mapped into `UserProfileSnapshot`.
 */

function asTrimmedString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? undefined : t;
  }
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return undefined;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const s = asTrimmedString(row[k]);
    if (s !== undefined) return s;
  }
  return undefined;
}

/** Build a loadable image URL: pass through `http(s)` / on-device schemes, or join a path to `API_BASE_URL`. */
export function resolvePublicProfilePhotoUrl(maybe: string | undefined | null): string | undefined {
  if (!maybe) return undefined;
  const t = String(maybe).trim();
  if (t === '') return undefined;
  if (/^https?:\/\//i.test(t)) return t;
  if (
    t.startsWith('file:') ||
    t.startsWith('content:') ||
    t.startsWith('ph:') ||
    t.startsWith('assets-library:') ||
    t.startsWith('blob:')
  ) {
    return t;
  }
  const base = API_BASE_URL.replace(/\/$/, '');
  if (t.startsWith('/')) return `${base}${t}`;
  return `${base}/${t.replace(/^\/+/, '')}`;
}

/**
 * `profile_photo` / `avatar` may be a string, or Laravel media / Spatie as `{ "url": "…" }`, or an array of media.
 */
function asProfileMediaUrlString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' || t === 'null' || t === 'undefined' ? undefined : t;
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = asProfileMediaUrlString(item);
      if (s) return s;
    }
    return undefined;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return pickString(
      o,
      'url',
      'full_url',
      'original_url',
      'public_url',
      'preview_url',
      'file_url',
      'href',
      'path',
      'file_name',
    );
  }
  return undefined;
}

/** Collects a photo URL or path from flat fields and common nested resource shapes. */
function extractProfilePhotoString(row: Record<string, unknown>): string | undefined {
  const fromFlat = pickString(
    row,
    'profile_photo_url',
    'profilePhotoUrl',
    'profile_picture_url',
    'profile_picture',
    'avatar_url',
    'avatar',
    'photo_url',
    'headshot_url',
    'headshot',
    'image_url',
  );
  if (fromFlat) return fromFlat;

  if (row.photo !== undefined && (typeof row.photo === 'string' || typeof row.photo === 'object')) {
    const p = asProfileMediaUrlString(row.photo);
    if (p) return p;
  }
  if (row.image !== undefined) {
    const p = asProfileMediaUrlString(row.image);
    if (p) return p;
  }

  const fromNested =
    asProfileMediaUrlString(row['profile_photo']) ||
    asProfileMediaUrlString(row['profilePhoto']) ||
    asProfileMediaUrlString(row['profile_picture']) ||
    asProfileMediaUrlString(row['user_avatar']) ||
    asProfileMediaUrlString(row['headshot']) ||
    asProfileMediaUrlString(row['media']) ||
    asProfileMediaUrlString(row['avatar']);
  if (fromNested) return fromNested;

  const att = row['attributes'];
  if (att && typeof att === 'object' && !Array.isArray(att)) {
    const a = att as Record<string, unknown>;
    const fromAttrs =
      pickString(
        a,
        'profile_photo_url',
        'profile_photo',
        'avatar_url',
        'image_url',
        'headshot',
      ) || asProfileMediaUrlString(a['profile_photo']) || asProfileMediaUrlString(a['avatar']);
    if (fromAttrs) return fromAttrs;
  }

  return undefined;
}

/**
 * Last resort: any string in the /me tree that looks like a profile or storage image URL
 * (covers backend field names the app has not mapped).
 */
function findHeuristicProfilePhotoInPayload(root: unknown, depth = 0, keyHint = ''): string | undefined {
  if (root == null || depth > 12) return undefined;
  const k = keyHint.toLowerCase();
  const nameHints =
    k.includes('photo') ||
    k.includes('avatar') ||
    k.includes('headshot') ||
    (k.includes('image') && !k.includes('message')) ||
    (k.includes('media') && !k.includes('immediate')) ||
    k.includes('picture') ||
    k === 'file' ||
    k === 'url' ||
    k === 'path' ||
    k.includes('portrait') ||
    k.includes('profile');

  if (typeof root === 'string') {
    const t = root.trim();
    if (t.length < 8) return undefined;
    if (nameHints || /\/storage\//.test(t)) {
      if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/')) {
        if (/^https?:\/\/.+\.(jpe?g|png|gif|webp|bmp|heic)(\?|#|$)/i.test(t)) {
          return t;
        }
        if (/\/storage\/.+\./i.test(t)) {
          return t;
        }
      }
    }
    if ((nameHints || /storage/.test(t)) && (t.startsWith('http') || t.startsWith('/'))) {
      if (/\.(jpe?g|png|gif|webp)(\?|#|$)/i.test(t) || t.includes('/storage/')) {
        return t;
      }
    }
    return undefined;
  }
  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i += 1) {
      const s = findHeuristicProfilePhotoInPayload(root[i], depth + 1, keyHint);
      if (s) return s;
    }
    return undefined;
  }
  if (typeof root === 'object') {
    for (const [k2, v] of Object.entries(root as Record<string, unknown>)) {
      if (k2 === 'password' || k2 === 'password_confirmation') continue;
      const s = findHeuristicProfilePhotoInPayload(v, depth + 1, k2);
      if (s) return s;
    }
  }
  return undefined;
}

function asYesNoUploaded(v: unknown): string | undefined {
  if (v === true || v === 1 || v === '1') return 'Yes';
  if (v === false || v === 0 || v === '0') return 'No';
  return asTrimmedString(v);
}

function parseShiftDays(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const days = v
    .map((item) => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
    .filter((item) => item !== '');
  return days.length ? days : undefined;
}

function parseShiftBreaks(v: unknown): UserProfileSnapshot['assignedShiftBreaks'] {
  if (!Array.isArray(v)) return undefined;
  const items: NonNullable<UserProfileSnapshot['assignedShiftBreaks']> = [];
  for (const row of v) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const o = row as Record<string, unknown>;
    const minutesRaw = o.minutes;
    const minutes = typeof minutesRaw === 'number' ? minutesRaw : Number(minutesRaw);
    if (!Number.isFinite(minutes) || minutes < 1) continue;
    const paidRaw = o.paid;
    const paid =
      paidRaw === true ||
      paidRaw === 1 ||
      paidRaw === '1' ||
      paidRaw === 'paid' ||
      paidRaw === 'true';
    const labelRaw = typeof o.label === 'string' ? o.label.trim() : '';
    items.push({
      label: labelRaw || (paid ? 'Paid break' : 'Unpaid break'),
      minutes: Math.round(minutes),
      paid,
    });
  }
  return items.length ? items : undefined;
}

/**
 * Parse auto-generated `breaks_summary` lines like:
 * `15m paid Morning tea, 30m unpaid Lunch`
 */
function parseShiftBreaksFromSummary(summary: string | undefined): UserProfileSnapshot['assignedShiftBreaks'] {
  if (!summary || summary.trim() === '') return undefined;
  const items: NonNullable<UserProfileSnapshot['assignedShiftBreaks']> = [];
  const re = /(\d+)\s*m\s+(paid|unpaid)\s+([^,]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(summary)) !== null) {
    const minutes = Number(match[1]);
    if (!Number.isFinite(minutes) || minutes < 1) continue;
    const paid = match[2].toLowerCase() === 'paid';
    const label = match[3].trim() || (paid ? 'Paid break' : 'Unpaid break');
    items.push({ label, minutes: Math.round(minutes), paid });
  }
  return items.length ? items : undefined;
}

function firstAssignedShiftFromRow(row: Record<string, unknown>): Record<string, unknown> | null {
  const list = row.assigned_shifts ?? row.assignedShifts;
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) return null;
  return first as Record<string, unknown>;
}

function parseWeeklyAvailabilityJson(
  v: unknown,
): UserProfileSnapshot['weeklyAvailabilityJson'] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      const slots = value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item !== '');
      if (slots.length) out[key] = slots;
    }
  }
  return Object.keys(out).length ? out : undefined;
}

function extractRow(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  let nested: unknown = o.data ?? o.user ?? o.employee ?? o.profile;
  if (Array.isArray(nested) && nested.length) {
    nested = nested[0];
  }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const t = nested as Record<string, unknown>;
    const attrs = t['attributes'];
    if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
      // JSON:API: fields live in `attributes`; merge so pickString(row, "email", …) & photo picks work
      return { ...t, ...(attrs as Record<string, unknown>) };
    }
    return t;
  }
  return o;
}

function formatMeError(parsed: unknown, raw: string, status: number): string {
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
  if (t !== '') return t.slice(0, 600);
  if (status === 401 || status === 403) {
    return 'Your session may have expired. Sign out and sign in again.';
  }
  return `Could not load profile (${status}).`;
}

export function mapMePayloadToUserProfile(
  row: Record<string, unknown>,
  fullPayloadForHeuristic?: unknown,
): UserProfileSnapshot {
  const sexRaw = pickString(row, 'sex', 'gender');
  const sex =
    sexRaw && ['male', 'female'].includes(sexRaw.toLowerCase()) ? sexRaw.toLowerCase() : sexRaw;
  const assignment =
    row.work_assignment && typeof row.work_assignment === 'object' && !Array.isArray(row.work_assignment)
      ? (row.work_assignment as Record<string, unknown>)
      : null;
  const assignmentDepartment =
    assignment?.department && typeof assignment.department === 'object' && !Array.isArray(assignment.department)
      ? (assignment.department as Record<string, unknown>)
      : null;
  const assignmentShift =
    assignment?.shift && typeof assignment.shift === 'object' && !Array.isArray(assignment.shift)
      ? (assignment.shift as Record<string, unknown>)
      : null;
  const nestedLocationCandidate =
    assignment?.work_location ??
    assignment?.location ??
    assignment?.site ??
    row.assigned_work_location ??
    row.work_location;
  const assignmentLocation =
    nestedLocationCandidate &&
    typeof nestedLocationCandidate === 'object' &&
    !Array.isArray(nestedLocationCandidate)
      ? (nestedLocationCandidate as Record<string, unknown>)
      : null;
  const assignedShiftsFirst = firstAssignedShiftFromRow(row);
  const shiftBreaksSource = assignmentShift ?? assignedShiftsFirst;
  const breaksSummary =
    pickString(row, 'assigned_shift_breaks_summary', 'shift_breaks_summary') ??
    pickString(shiftBreaksSource ?? {}, 'breaks_summary');
  const assignedShiftBreaks =
    parseShiftBreaks(row.assigned_shift_breaks) ??
    parseShiftBreaks(shiftBreaksSource?.breaks) ??
    parseShiftBreaksFromSummary(breaksSummary);

  return {
    companySlug: pickString(row, 'company_slug', 'companySlug') ?? undefined,
    registrationCompanySlug: pickString(row, 'registration_company_slug', 'registrationCompanySlug') ?? undefined,
    companyName: pickString(row, 'company_name', 'companyName', 'organization_name') ?? undefined,
    assignedDepartment: pickString(
      row,
      'assigned_department',
      'department',
      'department_name',
      'assignedDepartment',
    ) ?? pickString(assignmentDepartment ?? {}, 'name', 'department'),
    assignedShiftName:
      pickString(row, 'assigned_shift_name', 'shift_name', 'assignedShiftName') ??
      pickString(assignmentShift ?? {}, 'name'),
    assignedShiftStatus: pickString(row, 'assigned_shift_status', 'shift_status', 'assignedShiftStatus'),
    assignedShiftDate:
      pickString(row, 'assigned_shift_date', 'shift_date', 'assignedShiftDate') ??
      pickString(assignment ?? {}, 'effective_from'),
    assignedShiftStartTime: pickString(
      row,
      'assigned_shift_start_time',
      'shift_start_time',
      'shift_start',
      'assignedShiftStartTime',
    ) ?? pickString(assignmentShift ?? {}, 'start_time'),
    assignedShiftEndTime: pickString(
      row,
      'assigned_shift_end_time',
      'shift_end_time',
      'shift_end',
      'assignedShiftEndTime',
    ) ?? pickString(assignmentShift ?? {}, 'end_time'),
    assignedWorkLocationName: pickString(
      row,
      'assigned_work_location_name',
      'work_location_name',
      'work_location',
      'assignedWorkLocationName',
    ) ?? pickString(assignmentLocation ?? {}, 'name'),
    assignedWorkLocationAddress: pickString(
      row,
      'assigned_work_location_address',
      'work_location_address',
      'work_address',
      'assignedWorkLocationAddress',
    ) ?? pickString(assignmentLocation ?? {}, 'address'),
    assignedWorkLocationLat: pickString(
      row,
      'assigned_work_location_lat',
      'work_location_lat',
      'work_location_latitude',
      'latitude',
      'assignedWorkLocationLat',
    ) ?? pickString(assignmentLocation ?? {}, 'latitude', 'lat', 'work_location_lat'),
    assignedWorkLocationLng: pickString(
      row,
      'assigned_work_location_lng',
      'work_location_lng',
      'work_location_longitude',
      'longitude',
      'assignedWorkLocationLng',
    ) ?? pickString(assignmentLocation ?? {}, 'longitude', 'lng', 'lon', 'work_location_lng'),
    assignedDepartmentCode:
      pickString(row, 'assigned_department_code', 'department_code') ??
      pickString(assignmentDepartment ?? {}, 'code'),
    assignedShiftBreaksSummary: breaksSummary,
    assignedShiftBreaks,
    assignedShiftNotes:
      pickString(row, 'assigned_shift_notes', 'shift_notes') ?? pickString(assignmentShift ?? {}, 'notes'),
    assignedWorkLocationNotes:
      pickString(row, 'assigned_work_location_notes', 'work_location_notes') ??
      pickString(assignmentLocation ?? {}, 'notes'),
    assignmentNotes:
      pickString(row, 'assignment_notes', 'assigned_assignment_notes') ?? pickString(assignment ?? {}, 'notes'),
    employmentStatus: pickString(row, 'employment_status', 'employmentStatus'),
    jobTitle: pickString(row, 'job_title', 'jobTitle'),
    profilePhotoUrl: resolvePublicProfilePhotoUrl(
      extractProfilePhotoString(row) ??
        findHeuristicProfilePhotoInPayload(fullPayloadForHeuristic ?? row),
    ),
    email: pickString(row, 'email', 'email_address'),
    phone: pickString(row, 'phone', 'phone_number', 'mobile'),
    fullLegalName: pickString(row, 'full_legal_name', 'fullLegalName', 'name', 'legal_name'),
    dateOfBirth: pickString(row, 'date_of_birth', 'dateOfBirth', 'dob', 'birth_date'),
    sex,
    maritalStatus: pickString(row, 'marital_status', 'maritalStatus'),
    address: pickString(row, 'address', 'street_address', 'residential_address'),
    emergencyContactName: pickString(row, 'emergency_contact_name', 'emergencyContactName'),
    emergencyContactPhone: pickString(row, 'emergency_contact_phone', 'emergencyContactPhone'),
    emergencyContactRelationship: pickString(
      row,
      'emergency_contact_relationship',
      'emergencyContactRelationship',
    ),
    visaStatus: pickString(row, 'visa_status', 'visaStatus'),
    unrestrictedWorkRights: pickString(row, 'unrestricted_work_rights', 'unrestrictedWorkRights'),
    visaExpiry: pickString(row, 'visa_expiry', 'visaExpiry'),
    hoursPerWeek: pickString(row, 'hours_per_week', 'hoursPerWeek'),
    weeklyAvailabilitySummary: pickString(
      row,
      'weekly_availability_summary',
      'weeklyAvailabilitySummary',
    ),
    weeklyAvailabilityJson: parseWeeklyAvailabilityJson(
      row.weekly_availability_json ?? row.weeklyAvailabilityJson,
    ),
    assignedShiftDays: parseShiftDays(row.assigned_shift_days ?? assignmentShift?.shift_days),
    idDocumentsSummary: pickString(row, 'id_documents_summary', 'idDocumentsSummary'),
    policeCheckExpiry: pickString(row, 'police_check_expiry', 'policeCheckExpiry'),
    policeCheckUploaded: asYesNoUploaded(row.police_check_uploaded ?? row.policeCheckUploaded),
    fitToWorkExpiry: pickString(row, 'fit_to_work_expiry', 'fitToWorkExpiry'),
    fitToWorkUploaded: asYesNoUploaded(row.fit_to_work_uploaded ?? row.fitToWorkUploaded),
    licencesSummary: pickString(row, 'licences_summary', 'licencesSummary'),
    insurancesSummary: pickString(row, 'insurances_summary', 'insurancesSummary'),
    bankAccountName: pickString(row, 'bank_account_name', 'bankAccountName'),
    bankName: pickString(row, 'bank_name', 'bankName'),
    bankBranchCode: pickString(row, 'bank_branch_code', 'bankBranchCode', 'bsb'),
    bankAccountNumber: pickString(row, 'bank_account_number', 'bankAccountNumber'),
    modeOfTransport: pickString(row, 'mode_of_transport', 'modeOfTransport'),
    vehicleRegistration: pickString(row, 'vehicle_registration', 'vehicleRegistration'),
    vehicleExpiry: pickString(row, 'vehicle_expiry', 'vehicleExpiry'),
    vehicleInsuranceUploaded: asYesNoUploaded(
      row.vehicle_insurance_uploaded ?? row.vehicleInsuranceUploaded,
    ),
  };
}

export type FetchAccountProfileResult =
  | { ok: true; profile: UserProfileSnapshot; source: 'api' }
  | { ok: false; message: string };

/**
 * Loads the signed-in employee profile from `GET /api/v1/me`.
 */
export async function fetchAuthenticatedAccountProfile(): Promise<FetchAccountProfileResult> {
  const token = await getAuthToken();
  if (!token || token.trim() === '') {
    return { ok: false, message: 'Not signed in.' };
  }

  let slug = await getLastCompanySlug();
  if (!slug) {
    const local = await loadAccountProfile();
    slug = local.companySlug ?? local.registrationCompanySlug ?? null;
  }
  if (!slug) {
    return {
      ok: false,
      message: 'Organization context missing. Sign out and sign in again with your company selected.',
    };
  }

  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/me`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Company-Slug': slug,
      },
    });
  } catch {
    return {
      ok: false,
      message: `Could not reach the server. Check ${API_BASE_URL} and your connection.`,
    };
  }

  const raw = await res.text();
  const parsed = tryParseApiJson(raw);

  if (!res.ok) {
    return { ok: false, message: formatMeError(parsed, raw, res.status) };
  }

  const row = extractRow(parsed);
  if (!row) {
    return { ok: false, message: 'Profile response was empty or invalid.' };
  }

  const profile = mapMePayloadToUserProfile(row, parsed);
  const withTenant: UserProfileSnapshot = {
    ...profile,
    companySlug: profile.companySlug ?? slug,
    registrationCompanySlug: profile.registrationCompanySlug ?? slug,
  };

  return { ok: true, profile: withTenant, source: 'api' };
}

/**
 * Fetches `/api/v1/me` and merges into local AsyncStorage (no passwords). Used after a successful pull.
 */
export async function refreshAndCacheAccountProfileFromApi(): Promise<FetchAccountProfileResult> {
  const result = await fetchAuthenticatedAccountProfile();
  if (!result.ok) {
    return result;
  }
  try {
    const existing = await loadAccountProfile();
    const apiPhoto = result.profile.profilePhotoUrl;
    const hasServerPhoto = typeof apiPhoto === 'string' && apiPhoto.trim() !== '';
    // Don't let undefined API fields wipe previously known assignment coords/name.
    const merged: UserProfileSnapshot = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(result.profile).filter(([, value]) => value !== undefined),
      ),
      companySlug: result.profile.companySlug ?? existing.companySlug,
      registrationCompanySlug:
        result.profile.registrationCompanySlug ?? existing.registrationCompanySlug,
      profilePhotoUrl: hasServerPhoto ? apiPhoto.trim() : existing.profilePhotoUrl,
      profilePhotoLocalUri: hasServerPhoto ? null : existing.profilePhotoLocalUri,
      // If the server sent a new location name/coords, keep them; otherwise preserve cache.
      assignedWorkLocationName:
        result.profile.assignedWorkLocationName ?? existing.assignedWorkLocationName,
      assignedWorkLocationAddress:
        result.profile.assignedWorkLocationAddress ?? existing.assignedWorkLocationAddress,
      assignedWorkLocationLat:
        result.profile.assignedWorkLocationLat ?? existing.assignedWorkLocationLat,
      assignedWorkLocationLng:
        result.profile.assignedWorkLocationLng ?? existing.assignedWorkLocationLng,
    };
    const { password: _p, password_confirmation: _c, ...safe } = merged;
    await saveAccountProfile(safe);
    notifyAssignmentChange({ profile: safe, source: 'refresh' });
    return { ...result, profile: safe };
  } catch {
    /* cache is best-effort */
  }
  return result;
}
