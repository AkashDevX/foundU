import type { UserProfileSnapshot } from './userProfile';

/** Local URIs collected during Create Account; sent as multipart parts with registration. */
export type RegistrationUploads = {
  profilePhotoUri?: string | null;
  idDocumentByKey: Record<string, string>;
  policeCheckUri?: string | null;
  fitToWorkUri?: string | null;
  licenceUriById: Record<string, string>;
  insuranceUriById: Record<string, string>;
  vehicleInsuranceUri?: string | null;
};

export type RegistrationWizardNext = (
  patch?: Partial<UserProfileSnapshot>,
  uploadsPatch?: Partial<RegistrationUploads>,
) => void;

export function emptyRegistrationUploads(): RegistrationUploads {
  return {
    idDocumentByKey: {},
    licenceUriById: {},
    insuranceUriById: {},
  };
}

export function mergeRegistrationUploads(
  prev: RegistrationUploads,
  patch?: Partial<RegistrationUploads>,
): RegistrationUploads {
  if (!patch) {
    return prev;
  }
  return {
    profilePhotoUri: patch.profilePhotoUri !== undefined ? patch.profilePhotoUri : prev.profilePhotoUri,
    policeCheckUri: patch.policeCheckUri !== undefined ? patch.policeCheckUri : prev.policeCheckUri,
    fitToWorkUri: patch.fitToWorkUri !== undefined ? patch.fitToWorkUri : prev.fitToWorkUri,
    vehicleInsuranceUri:
      patch.vehicleInsuranceUri !== undefined ? patch.vehicleInsuranceUri : prev.vehicleInsuranceUri,
    idDocumentByKey: { ...prev.idDocumentByKey, ...patch.idDocumentByKey },
    licenceUriById: { ...prev.licenceUriById, ...patch.licenceUriById },
    insuranceUriById: { ...prev.insuranceUriById, ...patch.insuranceUriById },
  };
}

export function registrationHasUploads(u: RegistrationUploads): boolean {
  if (u.profilePhotoUri) return true;
  if (u.policeCheckUri) return true;
  if (u.fitToWorkUri) return true;
  if (u.vehicleInsuranceUri) return true;
  if (Object.keys(u.idDocumentByKey).length > 0) return true;
  if (Object.keys(u.licenceUriById).length > 0) return true;
  if (Object.keys(u.insuranceUriById).length > 0) return true;
  return false;
}
