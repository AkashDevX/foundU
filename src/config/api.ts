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

export const API_BASE_URL = `http://${resolveDevApiHost()}:${API_PORT}`;
