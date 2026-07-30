import { isBlank } from '../screens/CreateAccountScreen/validation';
import type { OrganizationRequestForm, OrganizationRequestPayload } from '../types/organizationRequest';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export type OrganizationRequestValidation =
  | { ok: true; payload: OrganizationRequestPayload }
  | { ok: false; missing: string[] };

/**
 * Every field on the request-access form is mandatory. "Other" pickers require the free-text detail.
 */
export function validateOrganizationRequestForm(
  form: OrganizationRequestForm,
): OrganizationRequestValidation {
  const missing: string[] = [];

  if (isBlank(form.companyName)) missing.push('Company name');
  if (isBlank(form.industry)) missing.push('Industry');
  if (form.industry === 'Other' && isBlank(form.industryOther)) {
    missing.push('Industry description');
  }
  if (isBlank(form.employeeBand)) missing.push('Number of employees');
  if (form.employeeBand === 'Other' && isBlank(form.employeeBandOther)) {
    missing.push('Employee count');
  }
  if (isBlank(form.postcode)) missing.push('Company postcode');
  if (isBlank(form.fullName)) missing.push('Full name');
  if (isBlank(form.companyEmail)) {
    missing.push('Company email address');
  } else if (!isValidEmail(form.companyEmail)) {
    missing.push('Valid company email address');
  }
  if (isBlank(form.telephone)) missing.push('Telephone number');

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  const payload: OrganizationRequestPayload = {
    company_name: form.companyName.trim(),
    industry: form.industry.trim(),
    employee_band: form.employeeBand.trim(),
    postcode: form.postcode.trim(),
    contact_full_name: form.fullName.trim(),
    contact_email: form.companyEmail.trim(),
    contact_telephone: form.telephone.trim(),
  };

  if (form.industry === 'Other') {
    payload.industry_other = form.industryOther.trim();
  }
  if (form.employeeBand === 'Other') {
    payload.employee_band_other = form.employeeBandOther.trim();
  }

  return { ok: true, payload };
}

export function isOrganizationRequestFormComplete(form: OrganizationRequestForm): boolean {
  return validateOrganizationRequestForm(form).ok;
}
