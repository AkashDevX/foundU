export const DEFAULT_GEOFENCE_RADIUS_M = 300;

/**
 * Extra meters beyond the clock-in radius before auto clock-out can fire.
 * Prevents GPS drift near the boundary from ending a shift while the employee
 * is still at the same physical spot (e.g. clocked in near the edge of the zone).
 */
export const GEOFENCE_EXIT_EXTRA_M = 50;

/** Consecutive out-of-zone GPS readings required before auto clock-out. */
export const GEOFENCE_EXIT_CONFIRM_READINGS = 4;

/** Must remain continuously outside for at least this long before auto clock-out. */
export const GEOFENCE_EXIT_MIN_DURATION_MS = 90_000;

/** Cap on how much GPS accuracy can expand the effective geofence. */
export const GEOFENCE_ACCURACY_BUFFER_CAP_M = 100;

/** Ignore exit samples when reported GPS accuracy is worse than this. */
export const GEOFENCE_MAX_USABLE_ACCURACY_M = 80;

/** Poll interval while clocked in (ms) as a fallback when watchPosition is quiet. */
export const GEOFENCE_POLL_INTERVAL_MS = 45_000;

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

/** Effective radius used for clock-in / "in zone" display. */
export function effectiveEnterRadiusM(
  radiusM: number,
  accuracyMeters?: number | null,
): number {
  return radiusM + accuracyBufferM(accuracyMeters);
}

/** Effective radius used for auto clock-out (enter radius + exit hysteresis). */
export function effectiveExitRadiusM(
  radiusM: number,
  accuracyMeters?: number | null,
): number {
  return radiusM + GEOFENCE_EXIT_EXTRA_M + accuracyBufferM(accuracyMeters);
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
 * True when the sample is reliable enough and clearly beyond the exit radius.
 * Uncertain GPS (very large accuracy) never counts as an exit.
 */
export function isOutsideGeofence(
  user: LatLng,
  site: LatLng,
  radiusM: number,
  accuracyMeters?: number | null,
): boolean {
  if (
    accuracyMeters != null &&
    Number.isFinite(accuracyMeters) &&
    accuracyMeters > GEOFENCE_MAX_USABLE_ACCURACY_M
  ) {
    return false;
  }

  const distanceM = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
  return distanceM > effectiveExitRadiusM(radiusM, accuracyMeters);
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
