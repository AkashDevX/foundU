import type { UserProfileSnapshot } from '../types/userProfile';
import type { RegistrationUploads } from '../types/registrationUploads';
import { registrationHasUploads } from '../types/registrationUploads';
import { API_BASE_URL } from '../config/api';

export type RegistrationSubmitPayload = UserProfileSnapshot & {
  password: string;
  password_confirmation: string;
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

  return fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'X-Company-Slug': companySlug,
    },
    body: formData,
  });
}
