import { Platform } from 'react-native';

/**
 * Laravel API base URL for local development.
 *
 * Emulator / simulator
 * - Android emulator: `10.0.2.2` is the host machine’s loopback (maps to where `php artisan serve` runs).
 * - iOS simulator: `127.0.0.1` reaches the Mac host.
 *
 * Physical phone (same Wi‑Fi as your PC)
 * - Set `DEV_API_HOST_OVERRIDE` to your PC’s LAN IP from `ipconfig` / `ip addr` (e.g. `192.168.1.42`).
 * - Run Laravel bound to all interfaces: `php artisan serve --host=0.0.0.0 --port=8000`
 *
 * Port must match `artisan serve` (default 8000).
 */
const API_PORT = 8000;

/** Public API when the app is built for release (TestFlight, Play Store, production APK/IPA). */
export const PRODUCTION_API_BASE_URL = 'https://brittoassetholdings.org';

/**
 * When `true`, Metro/debug builds also call the live server (`PRODUCTION_API_BASE_URL`).
 * Set to `false` to use local Laravel (`DEV_API_BASE_URL`) while developing.
 */
export const USE_LIVE_API_IN_DEBUG = false;

/** Set e.g. `192.168.x.x` when testing on a real device; leave `null` for emulator/simulator defaults. */
export const DEV_API_HOST_OVERRIDE: string | null = null;

function resolveDevApiHost(): string {
  if (DEV_API_HOST_OVERRIDE && DEV_API_HOST_OVERRIDE.trim() !== '') {
    return DEV_API_HOST_OVERRIDE.trim();
  }
  if (Platform.OS === 'android') {
    return '10.0.2.2';
  }
  return '127.0.0.1';
}

const DEV_API_BASE_URL = `http://${resolveDevApiHost()}:${API_PORT}`;

/** Release always uses production; debug uses production when `USE_LIVE_API_IN_DEBUG` is true. */
export const API_BASE_URL =
  __DEV__ && !USE_LIVE_API_IN_DEBUG ? DEV_API_BASE_URL : PRODUCTION_API_BASE_URL;
