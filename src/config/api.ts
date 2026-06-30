import { Platform } from 'react-native';
import { isAndroidEmulator } from '../utils/isAndroidEmulator';

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

/**
 * Public API when the app is built for release (TestFlight, Play Store, production APK/IPA).
 * Release builds always use this URL (`__DEV__` is false in production APKs).
 * For client testing, distribute a **release** APK — debug builds point at localhost unless
 * `USE_LIVE_API_IN_DEBUG` is true.
 */
export const PRODUCTION_API_BASE_URL = 'https://brittoassetholdings.org';

/**
 * When `true`, Metro/debug builds also call the live server (`PRODUCTION_API_BASE_URL`).
 * Set to `false` to use local Laravel (`DEV_API_BASE_URL`) while developing.
 */
export const USE_LIVE_API_IN_DEBUG = false;

/**
 * PC LAN IP for a **physical** phone on the same Wi‑Fi (e.g. `192.168.1.42`).
 * Ignored on Android emulator — emulator always uses `10.0.2.2`.
 * Ignored when `DEV_API_USE_ADB_REVERSE` is true (USB debugging tunnel).
 */
export const DEV_API_HOST_OVERRIDE: string | null = '192.168.8.166';

/**
 * USB debugging tunnel — no Wi‑Fi or firewall setup needed.
 * 1. Connect the phone by USB with USB debugging on.
 * 2. Run: `adb reverse tcp:8000 tcp:8000`
 * 3. Set this to `true` — app uses `127.0.0.1:8000` on Android (tunneled to your PC).
 */
export const DEV_API_USE_ADB_REVERSE = true;

function resolveDevApiHost(): string {
  if (Platform.OS === 'android') {
    if (isAndroidEmulator()) {
      return '10.0.2.2';
    }
    if (DEV_API_USE_ADB_REVERSE) {
      return '127.0.0.1';
    }
    if (DEV_API_HOST_OVERRIDE && DEV_API_HOST_OVERRIDE.trim() !== '') {
      return DEV_API_HOST_OVERRIDE.trim();
    }
    return '10.0.2.2';
  }
  if (DEV_API_HOST_OVERRIDE && DEV_API_HOST_OVERRIDE.trim() !== '') {
    return DEV_API_HOST_OVERRIDE.trim();
  }
  return '127.0.0.1';
}

/** Resolved dev host (for diagnostics on the login screen). */
export const DEV_API_HOST = resolveDevApiHost();

const DEV_API_BASE_URL = `http://${resolveDevApiHost()}:${API_PORT}`;

/** Release always uses production; debug uses production when `USE_LIVE_API_IN_DEBUG` is true. */
export const API_BASE_URL =
  __DEV__ && !USE_LIVE_API_IN_DEBUG ? DEV_API_BASE_URL : PRODUCTION_API_BASE_URL;
