/**
 * Google Play User Data / background location — prominent disclosure helpers.
 */

export type LocationDisclosureContent = {
  title: string;
  message: string;
  acceptText: string;
  denyText: string;
};

export const LOCATION_DISCLOSURE: LocationDisclosureContent = {
  title: 'Location access',
  message:
    'CruLynk collects location data to enable clock-in verification, worksite geofence monitoring, and automatic clock-out even when the app is closed or not in use. Choosing Allow all the time is important — without it, geofence monitoring and auto clock-out can stop when the app is closed or your phone is locked.',
  acceptText: 'Accept',
  denyText: 'Deny',
};

type DisclosurePresenter = (content: LocationDisclosureContent) => Promise<boolean>;

let presenter: DisclosurePresenter | null = null;
let inFlight: Promise<boolean> | null = null;

export const LOCATION_DISCLOSURE_TITLE = LOCATION_DISCLOSURE.title;
export const LOCATION_DISCLOSURE_MESSAGE = LOCATION_DISCLOSURE.message;
export const LOCATION_DISCLOSURE_ACCEPT = LOCATION_DISCLOSURE.acceptText;
export const LOCATION_DISCLOSURE_DENY = LOCATION_DISCLOSURE.denyText;

export function registerLocationDisclosurePresenter(next: DisclosurePresenter | null): void {
  presenter = next;
}

/**
 * Shows the prominent in-app disclosure and resolves true only if the user taps Accept.
 */
export async function promptLocationDisclosure(
  content: LocationDisclosureContent = LOCATION_DISCLOSURE,
): Promise<boolean> {
  if (inFlight) {
    return inFlight;
  }

  if (!presenter) {
    console.warn(
      '[locationDisclosure] No presenter registered; denying location until the disclosure UI is mounted.',
    );
    return false;
  }

  inFlight = presenter(content);

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
