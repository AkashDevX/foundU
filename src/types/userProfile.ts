/**
 * Snapshot of registration / account fields shown on My Profile.
 * Populated from Create Account steps and persisted locally until an API exists.
 */
export type UserProfileSnapshot = {
  companyId?: string | null;
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
};
