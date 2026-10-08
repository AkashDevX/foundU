/** One availability window on a weekday, stored as 24-hour `HH:mm`. An earlier end time means overnight. */
export type AvailabilityPeriodJson = {
  start: string;
  end: string;
};

/** Hours an employee can work on one weekday during account creation. */
export type DayAvailabilityJson = {
  status: 'available' | 'unavailable';
  periods: AvailabilityPeriodJson[];
};

/** One organisation chosen during Create Account (from GET /api/v1/bootstrap). */
export type RegistrationCompany = {
  slug: string;
  appKey?: string | null;
  name: string;
};

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
  /** All organisations the employee applied to during Create Account. */
  registrationCompanies?: RegistrationCompany[];
  /** Assignment details from tenant/company DB (active employee roster). */
  assignedDepartment?: string;
  assignedShiftName?: string;
  assignedShiftStatus?: string;
  assignedShiftDate?: string;
  assignedShiftStartTime?: string;
  assignedShiftEndTime?: string;
  /** Tenant `work_locations.id` for the assigned site (null when cleared). */
  assignedWorkLocationId?: string | null;
  assignedWorkLocationName?: string | null;
  assignedWorkLocationAddress?: string | null;
  assignedWorkLocationLat?: string | null;
  assignedWorkLocationLng?: string | null;
  /** Department code from roster (tenant `departments.code`). */
  assignedDepartmentCode?: string;
  /** Shift template breaks line from tenant `shifts.breaks_summary`. */
  assignedShiftBreaksSummary?: string;
  /** Structured shift breaks (`label`, `minutes`, `paid`) from tenant `shifts.breaks`. */
  assignedShiftBreaks?: { label: string; minutes: number; paid: boolean }[];
  /** Shift template notes from tenant `shifts.notes`. */
  assignedShiftNotes?: string;
  /** Site / location notes from tenant `work_locations.notes`. */
  assignedWorkLocationNotes?: string | null;
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
  /** Yes when a temporary-visa file was uploaded. The storage path stays on the server. */
  visaDocumentUploaded?: string;
  /** Yes when a resume or CV file was uploaded. The storage path stays on the server. */
  resumeUploaded?: string;
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
  /** Step 2 — day-by-day hours, or a legacy morning/evening list per weekday. */
  weeklyAvailabilityJson?: Record<string, DayAvailabilityJson | string[]>;
  /** Step 2 — ID rows; server may add `storage_path` and `back_storage_path` after multipart upload. */
  idDocumentsJson?: {
    documentKey: string;
    idType: string;
    imageUploaded: boolean;
    backImageUploaded?: boolean;
    storage_path?: string;
    back_storage_path?: string;
  }[];
  /** Step 3 — licence blocks; server may add `storage_path`. Expiry stored as ISO `YYYY-MM-DD`. */
  licencesJson?: {
    id: string;
    type: string;
    documentType?: string;
    /** Free-text name when `type` is Other. */
    documentTypeOther?: string;
    expiry: string;
    expiry_date?: string;
    imageUploaded: boolean;
    storage_path?: string;
  }[];
  /** Step 3 — insurance blocks; server may add `storage_path`. Expiry stored as ISO `YYYY-MM-DD`. */
  insurancesJson?: {
    id: string;
    type: string;
    documentType?: string;
    /** Free-text name when `type` is Other. */
    documentTypeOther?: string;
    expiry: string;
    expiry_date?: string;
    imageUploaded: boolean;
    storage_path?: string;
  }[];
};
