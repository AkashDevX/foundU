import { Linking } from 'react-native';

/** External workplace incident / hazard report form (JotForm). */
export const INCIDENT_REPORT_JOTFORM_URL =
  'https://form.jotform.com/261398863275067';

/**
 * Opens the incident report form in the system browser.
 * Uses openURL directly (same as maps) — canOpenURL often returns false for https on Android.
 */
export function openIncidentReportForm(): Promise<void> {
  return Linking.openURL(INCIDENT_REPORT_JOTFORM_URL);
}
