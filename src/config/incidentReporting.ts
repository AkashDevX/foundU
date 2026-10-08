/** Same choices as the workplace incident JotForm. Sites come from work locations. */

export const INCIDENT_TYPES = [
  { value: 'near_miss', label: 'Near miss' },
  { value: 'workplace_injury', label: 'Workplace injury' },
  { value: 'illness', label: 'Illness / feeling physically unwell' },
  { value: 'property_damage', label: 'Property or equipment damage' },
  { value: 'workplace_behaviour', label: 'Workplace behaviour / conflict' },
  { value: 'harassment', label: 'Harassment or bullying concern' },
  { value: 'safety_hazard', label: 'Safety hazard' },
  { value: 'other', label: 'Other' },
] as const;

export const PERSON_TYPES = [
  'Employee',
  'Contractor',
  'Client',
  'Customer',
  'Supplier/Delivery Driver',
  'Tenant',
  'Property Owner',
  'Other',
] as const;

export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Casual',
  'Volunteer',
  'Contractor',
  'N/A',
] as const;

export const GENDER_OPTIONS = ['Male', 'Female', 'other'] as const;

export const INJURED_OPTIONS = ['Yes', 'No', 'No obvious injury'] as const;
export const FIRST_AID_OPTIONS = ['Yes', 'No', 'Not required'] as const;
export const MEDICAL_OPTIONS = ['Yes', 'No', 'Not known at the time of report'] as const;
export const YES_NO = ['Yes', 'No'] as const;
export const YES_NO_UNSURE = ['Yes', 'No', 'Unsure'] as const;
export const YES_NO_NA = ['Yes', 'No', 'Not applicable'] as const;
export const CONTINUED_OPTIONS = ['Yes', 'No', 'Left the site', 'Not applicable'] as const;
export const PROCEDURE_OPTIONS = ['Yes', 'No', 'Unsure', 'Not applicable'] as const;
export const CCTV_OPTIONS = ['Yes', 'No', 'Unknown'] as const;
export const SHIFT_OPTIONS = [
  'Before start of shift',
  'First half of shift',
  'Second half of shift',
  'Overtime',
  'Journey to/from work',
  'Other',
] as const;
export const WEATHER_OPTIONS = [
  'Dry',
  'Wet',
  'Rain',
  'Sunny',
  'Overcast',
  'Windy',
  'Storm',
  'Not Applicable (Indoor Incident)',
  'Other',
] as const;
export const PROPERTY_LOST_OPTIONS = ['Yes', 'No', 'Not Applicable'] as const;
export const PROPERTY_OWNER_OPTIONS = ['Employee', 'Customer/Visitor', 'Client', 'Company', 'other'] as const;
export const OUTCOME_OPTIONS = [
  'No injury',
  'Near miss',
  'Person felt physically unwell',
  'First aid required',
  'Medical treatment required',
  'Lost time from work',
  'Return-to-work arrangements required',
  'Property/equipment damage',
  'Workplace behaviour concern',
  'Other',
] as const;

export const INCIDENT_PAGE_TITLES = [
  'Incident details',
  'Under 18',
  'Type of incident',
  'What happened?',
  'Effect of the incident',
  'Workplace behaviour',
  'Immediate safety',
  'Training / procedure',
  'Shift information',
  'Attachments / evidence',
  'Medical information',
  'Weather',
  'Property loss or damage',
  'Employee declaration',
] as const;
