/** Form state on RequestOrganizationScreen. */
export type OrganizationRequestForm = {
  companyName: string;
  industry: string;
  industryOther: string;
  employeeBand: string;
  employeeBandOther: string;
  postcode: string;
  fullName: string;
  companyEmail: string;
  telephone: string;
};

/** JSON body for POST /api/v1/request-organization (master registry, CruLynk platform only). */
export type OrganizationRequestPayload = {
  company_name: string;
  industry: string;
  industry_other?: string;
  employee_band: string;
  employee_band_other?: string;
  postcode: string;
  contact_full_name: string;
  contact_email: string;
  contact_telephone: string;
};
