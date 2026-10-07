import type { UserProfileSnapshot } from '../types/userProfile';
import type { RegistrationUploads } from '../types/registrationUploads';
import { registrationHasUploads } from '../types/registrationUploads';
import { API_BASE_URL } from '../config/api';
import { CRULYNK_PLATFORM_SLUG } from '../config/platform';

export type RegistrationSubmitPayload = UserProfileSnapshot & {
  password: string;
  password_confirmation: string;
};

export type RegistrationApplicationCompany = {
  slug: string;
  appKey?: string | null;
};

export type RegistrationApplicationResult = {
  slug: string;
  name: string;
  status: string;
  message?: string;
  public_id?: string;
};

function appendMultipartFile(formData: FormData, field: string, uri: string, fallbackName: string): void {
  const guessMime = (u: string): string => {
    const lower = u.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  };
  const tail = uri.split('/').pop() || fallbackName;
  const name = tail.includes('.') ? tail : `${tail}.jpg`;
  formData.append(field, {
    uri,
    type: guessMime(uri),
    name,
  } as unknown as Blob);
}

function appendRegistrationUploads(formData: FormData, uploads: RegistrationUploads): void {
  if (uploads.profilePhotoUri) {
    appendMultipartFile(formData, 'profile_photo', uploads.profilePhotoUri, 'profile.jpg');
  }
  Object.entries(uploads.idDocumentByKey).forEach(([key, uri]) => {
    appendMultipartFile(formData, `id_document_upload[${key}]`, uri, `id_${key}.jpg`);
  });
  if (uploads.policeCheckUri) {
    appendMultipartFile(formData, 'police_check', uploads.policeCheckUri, 'police_check.jpg');
  }
  if (uploads.fitToWorkUri) {
    appendMultipartFile(formData, 'fit_to_work', uploads.fitToWorkUri, 'fit_to_work.jpg');
  }
  Object.entries(uploads.licenceUriById).forEach(([id, uri]) => {
    appendMultipartFile(formData, `licence_upload[${id}]`, uri, `licence_${id}.jpg`);
  });
  Object.entries(uploads.insuranceUriById).forEach(([id, uri]) => {
    appendMultipartFile(formData, `insurance_upload[${id}]`, uri, `insurance_${id}.jpg`);
  });
  if (uploads.vehicleInsuranceUri) {
    appendMultipartFile(formData, 'vehicle_insurance', uploads.vehicleInsuranceUri, 'vehicle_insurance.jpg');
  }
}

/**
 * POST full four-step profile to tenant DB via master registry routing.
 * When uploads are present, sends multipart/form-data with a JSON `payload` field plus files.
 */
export async function submitFoundURegistration(
  payload: RegistrationSubmitPayload,
  companySlug: string,
  uploads: RegistrationUploads,
): Promise<Response> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/register`;

  const jsonBody = {
    ...payload,
    password: payload.password,
    password_confirmation: payload.password_confirmation,
  };

  if (!registrationHasUploads(uploads)) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Company-Slug': companySlug,
      },
      body: JSON.stringify(jsonBody),
    });
  }

  const formData = new FormData();
  formData.append('payload', JSON.stringify(jsonBody));
  appendRegistrationUploads(formData, uploads);

  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Company-Slug': companySlug,
    },
    body: formData,
  });
}

/**
 * POST one profile to multiple tenant organisations (platform-scoped).
 * Each selected company receives a pending employee for its own admin to review.
 */
export async function submitFoundURegistrationApplications(
  payload: RegistrationSubmitPayload,
  companies: RegistrationApplicationCompany[],
  uploads: RegistrationUploads,
): Promise<Response> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/api/v1/register-applications`;

  const jsonBody = {
    ...payload,
    password: payload.password,
    password_confirmation: payload.password_confirmation,
    companies: companies.map((c) => ({
      slug: c.slug,
      appKey: c.appKey ?? null,
    })),
  };

  if (!registrationHasUploads(uploads)) {
    return fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Platform-Slug': CRULYNK_PLATFORM_SLUG,
      },
      body: JSON.stringify(jsonBody),
    });
  }

  const formData = new FormData();
  formData.append('payload', JSON.stringify(jsonBody));
  appendRegistrationUploads(formData, uploads);

  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Platform-Slug': CRULYNK_PLATFORM_SLUG,
    },
    body: formData,
  });
}

export function parseRegistrationApplicationResults(parsed: unknown): RegistrationApplicationResult[] {
  if (!parsed || typeof parsed !== 'object' || !('results' in parsed)) {
    return [];
  }
  const raw = (parsed as { results?: unknown }).results;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: RegistrationApplicationResult[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      continue;
    }
    const slug = typeof (row as { slug?: unknown }).slug === 'string' ? (row as { slug: string }).slug : '';
    const name = typeof (row as { name?: unknown }).name === 'string' ? (row as { name: string }).name : slug;
    const status =
      typeof (row as { status?: unknown }).status === 'string' ? (row as { status: string }).status : 'failed';
    const message =
      typeof (row as { message?: unknown }).message === 'string' ? (row as { message: string }).message : undefined;
    const publicId =
      typeof (row as { public_id?: unknown }).public_id === 'string'
        ? (row as { public_id: string }).public_id
        : undefined;
    if (slug === '') {
      continue;
    }
    out.push({ slug, name, status, message, public_id: publicId });
  }
  return out;
}
