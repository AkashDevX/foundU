/**
 * Snapshot of registration / account fields shown on My Profile.
 * Populated from Create Account steps and persisted locally until an API exists.
 */
export type UserProfileSnapshot = {
  /** Master registry slug from GET /api/v1/bootstrap (same as X-Company-Slug). */
  companySlug?: string | null;
  registrationCompanySlug?: string | null;
  registrationCompanyAppKey?: string | null;
  companyName?: string | null;
  email?: string;
  phone?: string;
  fullLegalName?: string;
  dateOfBirth?: string;
  sex?: string;
  maritalStatus?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  visaStatus?: string;
  unrestrictedWorkRights?: string;
  visaExpiry?: string;
  hoursPerWeek?: string;
  weeklyAvailabilitySummary?: string;
  idDocumentsSummary?: string;
  policeCheckExpiry?: string;
  policeCheckUploaded?: string;
  fitToWorkExpiry?: string;
  fitToWorkUploaded?: string;
  licencesSummary?: string;
  insurancesSummary?: string;
  bankAccountName?: string;
  bankName?: string;
  bankBranchCode?: string;
  bankAccountNumber?: string;
  modeOfTransport?: string;
  vehicleRegistration?: string;
  vehicleExpiry?: string;
  vehicleInsuranceUploaded?: string;
  /** Only used when submitting registration to the API — never persist to AsyncStorage. */
  password?: string;
  password_confirmation?: string;
  /** Step 2 — structured week grid (morning/evening per weekday). */
  weeklyAvailabilityJson?: Record<string, string[]>;
  /** Step 2 — ID rows; server may add `storage_path` after multipart upload. */
  idDocumentsJson?: { documentKey: string; idType: string; imageUploaded: boolean; storage_path?: string }[];
  /** Step 3 — licence blocks; server may add `storage_path`. */
  licencesJson?: { id: string; type: string; expiry: string; imageUploaded: boolean; storage_path?: string }[];
  /** Step 3 — insurance blocks; server may add `storage_path`. */
  insurancesJson?: { id: string; type: string; expiry: string; imageUploaded: boolean; storage_path?: string }[];
};
