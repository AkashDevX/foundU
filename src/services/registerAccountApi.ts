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

function appendMultipartFile(
  formData: FormData,
  field: string,
  uri: string,
  fallbackName: string,
  mimeOverride?: string | null,
): void {
  const guessMime = (u: string): string => {
    const lower = u.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lower.endsWith('.doc')) return 'application/msword';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  };
  const tail = uri.split('/').pop() || fallbackName;
  const name = fallbackName.includes('.') ? fallbackName : tail.includes('.') ? tail : `${tail}.jpg`;
  formData.append(field, {
    uri,
    type: mimeOverride || guessMime(name),
    name,
  } as unknown as Blob);
}

function appendRegistrationUploads(formData: FormData, uploads: RegistrationUploads): void {
  if (uploads.profilePhotoUri) {
    appendMultipartFile(formData, 'profile_photo', uploads.profilePhotoUri, 'profile.jpg');
  }
  Object.entries(uploads.idDocumentByKey).forEach(([key, file]) => {
    appendMultipartFile(
      formData,
      `id_document_upload[${key}]`,
      file.uri,
      file.name || `id_${key}.jpg`,
      file.mime,
    );
  });
  Object.entries(uploads.idDocumentBackByKey).forEach(([key, file]) => {
    appendMultipartFile(
      formData,
      `id_document_back_upload[${key}]`,
      file.uri,
      file.name || `id_${key}_back.jpg`,
      file.mime,
    );
  });
  if (uploads.policeCheck?.uri) {
    appendMultipartFile(
      formData,
      'police_check',
      uploads.policeCheck.uri,
      uploads.policeCheck.name || 'police_check.jpg',
      uploads.policeCheck.mime,
    );
  }
  if (uploads.fitToWork?.uri) {
    appendMultipartFile(
      formData,
      'fit_to_work',
      uploads.fitToWork.uri,
      uploads.fitToWork.name || 'fit_to_work.jpg',
      uploads.fitToWork.mime,
    );
  }
  Object.entries(uploads.licenceById).forEach(([id, file]) => {
    appendMultipartFile(
      formData,
      `licence_upload[${id}]`,
      file.uri,
      file.name || `licence_${id}.jpg`,
      file.mime,
    );
  });
  Object.entries(uploads.insuranceById).forEach(([id, file]) => {
    appendMultipartFile(
      formData,
      `insurance_upload[${id}]`,
      file.uri,
      file.name || `insurance_${id}.jpg`,
      file.mime,
    );
  });
  if (uploads.vehicleInsurance?.uri) {
    appendMultipartFile(
      formData,
      'vehicle_insurance',
      uploads.vehicleInsurance.uri,
      uploads.vehicleInsurance.name || 'vehicle_insurance.jpg',
      uploads.vehicleInsurance.mime,
    );
  }
  if (uploads.visaDocument?.uri) {
    appendMultipartFile(
      formData,
      'visa_document',
      uploads.visaDocument.uri,
      uploads.visaDocument.name || 'visa.pdf',
      uploads.visaDocument.mime,
    );
  }
  if (uploads.resume?.uri) {
    appendMultipartFile(
      formData,
      'resume',
      uploads.resume.uri,
      uploads.resume.name || 'resume.pdf',
      uploads.resume.mime,
    );
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

function postRegistrationWithProgress(
  url: string,
  headers: Record<string, string>,
  body: string | FormData,
  onProgress?: (percent: number) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    xhr.timeout = 180000;

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable || event.total <= 0) return;
      const sent = Math.round((event.loaded / event.total) * 100);
      onProgress(Math.min(99, Math.max(0, sent)));
    };

    xhr.onerror = () => {
      reject(new Error('Network request failed'));
    };
    xhr.ontimeout = () => {
      reject(new Error('The request took too long. Check your connection and try again.'));
    };
    xhr.onload = () => {
      resolve(
        new Response(xhr.responseText ?? '', {
          status: xhr.status,
          statusText: xhr.statusText,
        }),
      );
    };

    xhr.send(body);
  });
}

/**
 * POST one profile to multiple tenant organisations (platform-scoped).
 * Each selected company receives a pending employee for its own admin to review.
 * `onProgress` is the share of the request body actually sent (0–99). 100 is reserved for a successful server response.
 */
export async function submitFoundURegistrationApplications(
  payload: RegistrationSubmitPayload,
  companies: RegistrationApplicationCompany[],
  uploads: RegistrationUploads,
  onProgress?: (percent: number) => void,
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
    return postRegistrationWithProgress(
      url,
      {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Platform-Slug': CRULYNK_PLATFORM_SLUG,
      },
      JSON.stringify(jsonBody),
      onProgress,
    );
  }

  const formData = new FormData();
  formData.append('payload', JSON.stringify(jsonBody));
  appendRegistrationUploads(formData, uploads);

  return postRegistrationWithProgress(
    url,
    {
      Accept: 'application/json',
      'X-Platform-Slug': CRULYNK_PLATFORM_SLUG,
    },
    formData,
    onProgress,
  );
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
