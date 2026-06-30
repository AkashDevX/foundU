/**
 * Snapshot of registration / account fields shown on My Profile.
 * Filled from the Create Account wizard, `GET /api/v1/me`, and local cache.
 */
export type UserProfileSnapshot = {
  /** Master registry slug from GET /api/v1/bootstrap (same as X-Company-Slug). */
  companySlug?: string | null;
  registrationCompanySlug?: string | null;
  registrationCompanyAppKey?: string | null;
  companyName?: string | null;
  /** Assignment details from tenant/company DB (active employee roster). */
  assignedDepartment?: string;
  assignedShiftName?: string;
  assignedShiftStatus?: string;
  assignedShiftDate?: string;
  assignedShiftStartTime?: string;
  assignedShiftEndTime?: string;
  assignedWorkLocationName?: string;
  assignedWorkLocationAddress?: string;
  assignedWorkLocationLat?: string;
  assignedWorkLocationLng?: string;
  /** Department code from roster (tenant `departments.code`). */
  assignedDepartmentCode?: string;
  /** Shift template breaks line from tenant `shifts.breaks_summary`. */
  assignedShiftBreaksSummary?: string;
  /** Shift template notes from tenant `shifts.notes`. */
  assignedShiftNotes?: string;
  /** Site / location notes from tenant `work_locations.notes`. */
  assignedWorkLocationNotes?: string;
  /** Administrator notes on the employee assignment (`employees.assignment_notes`). */
  assignmentNotes?: string;
  /** Tenant employee row — useful for status badges. */
  employmentStatus?: string;
  jobTitle?: string;
  /**
   * Profile headshot: absolute `http(s)` URL from the API, or a path the app resolves against `API_BASE_URL`.
   * Omitted/empty when the user has not uploaded a photo.
   */
  profilePhotoUrl?: string | null;
  /**
   * On-device `file://` or `content://` URI of the last chosen profile image (e.g. after register), until the
   * server provides `profilePhotoUrl` — used so the header shows your photo when the API omits a URL.
   */
  profilePhotoLocalUri?: string | null;
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
  /** Days the assigned shift template runs on (`mon`–`sun`), from backend. */
  assignedShiftDays?: string[];
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
  /** Step 3 — licence blocks; server may add `storage_path`. Expiry stored as ISO `YYYY-MM-DD`. */
  licencesJson?: { id: string; type: string; expiry: string; expiry_date?: string; imageUploaded: boolean; storage_path?: string }[];
  /** Step 3 — insurance blocks; server may add `storage_path`. Expiry stored as ISO `YYYY-MM-DD`. */
  insurancesJson?: { id: string; type: string; expiry: string; expiry_date?: string; imageUploaded: boolean; storage_path?: string }[];
};
