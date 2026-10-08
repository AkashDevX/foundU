import type { UserProfileSnapshot } from './userProfile';
import type { IdDocumentFile } from '../utils/idDocument';
import type { ResumeDocumentUpload } from '../utils/resumeDocument';

export type { ResumeDocumentUpload } from '../utils/resumeDocument';
export type { IdDocumentFile } from '../utils/idDocument';

/** Local file chosen for a temporary visa. Sent as the `visa_document` multipart part. */
export type VisaDocumentUpload = {
  uri: string;
  name: string;
  mime: string;
};

/** Local URIs collected during Create Account; sent as multipart parts with registration. */
export type RegistrationUploads = {
  profilePhotoUri?: string | null;
  idDocumentByKey: Record<string, IdDocumentFile>;
  /** Back of a driver's licence, keyed by the same document id as `idDocumentByKey`. */
  idDocumentBackByKey: Record<string, IdDocumentFile>;
  policeCheck?: IdDocumentFile | null;
  fitToWork?: IdDocumentFile | null;
  licenceById: Record<string, IdDocumentFile>;
  insuranceById: Record<string, IdDocumentFile>;
  vehicleInsurance?: IdDocumentFile | null;
  visaDocument?: VisaDocumentUpload | null;
  resume?: ResumeDocumentUpload | null;
};

export type RegistrationWizardNext = (
  patch?: Partial<UserProfileSnapshot>,
  uploadsPatch?: Partial<RegistrationUploads>,
) => void;

export function emptyRegistrationUploads(): RegistrationUploads {
  return {
    idDocumentByKey: {},
    idDocumentBackByKey: {},
    licenceById: {},
    insuranceById: {},
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
    policeCheck: patch.policeCheck !== undefined ? patch.policeCheck : prev.policeCheck,
    fitToWork: patch.fitToWork !== undefined ? patch.fitToWork : prev.fitToWork,
    vehicleInsurance:
      patch.vehicleInsurance !== undefined ? patch.vehicleInsurance : prev.vehicleInsurance,
    visaDocument: patch.visaDocument !== undefined ? patch.visaDocument : prev.visaDocument,
    resume: patch.resume !== undefined ? patch.resume : prev.resume,
    idDocumentByKey:
      patch.idDocumentByKey !== undefined ? patch.idDocumentByKey : prev.idDocumentByKey,
    idDocumentBackByKey:
      patch.idDocumentBackByKey !== undefined ? patch.idDocumentBackByKey : prev.idDocumentBackByKey,
    licenceById: patch.licenceById !== undefined ? patch.licenceById : prev.licenceById,
    insuranceById: patch.insuranceById !== undefined ? patch.insuranceById : prev.insuranceById,
  };
}

export function registrationHasUploads(u: RegistrationUploads): boolean {
  if (u.profilePhotoUri) return true;
  if (u.policeCheck?.uri) return true;
  if (u.fitToWork?.uri) return true;
  if (u.vehicleInsurance?.uri) return true;
  if (u.visaDocument?.uri) return true;
  if (u.resume?.uri) return true;
  if (Object.keys(u.idDocumentByKey).length > 0) return true;
  if (Object.keys(u.idDocumentBackByKey).length > 0) return true;
  if (Object.keys(u.licenceById).length > 0) return true;
  if (Object.keys(u.insuranceById).length > 0) return true;
  return false;
}
