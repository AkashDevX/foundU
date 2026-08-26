export const DEFAULT_GEOFENCE_RADIUS_M = 300;

/**
 * @deprecated Exit no longer waits for confirm readings — kept for import safety.
 */
export const GEOFENCE_EXIT_CONFIRM_READINGS = 1;

/**
 * @deprecated Exit no longer uses a grace duration — kept for import safety.
 */
export const GEOFENCE_EXIT_MIN_DURATION_MS = 0;

/** Cap on how much GPS accuracy can expand the effective geofence. */
export const GEOFENCE_ACCURACY_BUFFER_CAP_M = 100;

/** Ignore exit samples when reported GPS accuracy is worse than this. */
export const GEOFENCE_MAX_USABLE_ACCURACY_M = 80;

/** How often to refresh assignment + re-check geofence while clocked in. */
export const GEOFENCE_POLL_INTERVAL_MS = 10_000;

export type LatLng = { lat: number; lng: number };

export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function accuracyBufferM(accuracyMeters?: number | null): number {
  return Math.min(Math.max(accuracyMeters ?? 0, 0), GEOFENCE_ACCURACY_BUFFER_CAP_M);
}

/** Effective radius used for clock-in / "in zone" display / auto clock-out. */
export function effectiveEnterRadiusM(
  radiusM: number,
  accuracyMeters?: number | null,
): number {
  return radiusM + accuracyBufferM(accuracyMeters);
}

/** Same as enter radius — leave the zone and auto clock-out fires immediately. */
export function effectiveExitRadiusM(
  radiusM: number,
  accuracyMeters?: number | null,
): number {
  return effectiveEnterRadiusM(radiusM, accuracyMeters);
}

export function isInsideGeofence(
  user: LatLng,
  site: LatLng,
  radiusM: number,
  accuracyMeters?: number | null,
): boolean {
  const distanceM = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
  return distanceM <= effectiveEnterRadiusM(radiusM, accuracyMeters);
}

/**
 * True when beyond the geofence radius (same rule as the Out of range badge).
 * Poor GPS accuracy no longer blocks a clear exit (e.g. reassigned site far away).
 */
export function isOutsideGeofence(
  user: LatLng,
  site: LatLng,
  radiusM: number,
  accuracyMeters?: number | null,
): boolean {
  return !isInsideGeofence(user, site, radiusM, accuracyMeters);
}

export function formatZoneBadgeLabel(
  distanceToSiteM: number,
  geofenceRadiusM: number,
  accuracyMeters?: number | null,
): string {
  const enterRadius = effectiveEnterRadiusM(geofenceRadiusM, accuracyMeters);

  if (distanceToSiteM <= enterRadius) {
    const remainingM = Math.max(0, Math.round(geofenceRadiusM - distanceToSiteM));
    return `Within range · ${remainingM} m remaining`;
  }

  const beyondM = Math.max(0, Math.round(distanceToSiteM - geofenceRadiusM));
  return `Out of range · ${beyondM} m beyond`;
}
