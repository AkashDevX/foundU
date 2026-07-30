import { Platform } from 'react-native';

/**
 * Heuristic for Android emulator — used to pick `10.0.2.2` instead of a LAN IP.
 * Physical devices on the same Wi‑Fi need the PC's LAN address in `DEV_API_HOST_OVERRIDE`.
 */
export function isAndroidEmulator(): boolean {
  if (Platform.OS !== 'android') return false;
  const c = Platform.constants as {
    Brand?: string;
    Model?: string;
    Manufacturer?: string;
    Fingerprint?: string;
  };
  const brand = (c.Brand ?? '').toLowerCase();
  const model = (c.Model ?? '').toLowerCase();
  const manufacturer = (c.Manufacturer ?? '').toLowerCase();
  const fingerprint = (c.Fingerprint ?? '').toLowerCase();
  return (
    fingerprint.includes('generic') ||
    fingerprint.includes('sdk_gphone') ||
    fingerprint.includes('emulator') ||
    model.includes('sdk_gphone') ||
    model.includes('emulator') ||
    model.includes('android sdk built for') ||
    (brand === 'google' && manufacturer === 'google' && model.includes('sdk'))
  );
}
