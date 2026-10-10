export const DEFAULT_GEOFENCE_RADIUS_M = 300;

/**
 * @deprecated Exit no longer waits for confirm readings — kept for import safety.
 */
export const GEOFENCE_EXIT_CONFIRM_READINGS = 1;

/**
 * @deprecated Exit no longer uses a grace duration — kept for import safety.
 */
export const GEOFENCE_EXIT_MIN_DURATION_MS = 0;

/**
 * @deprecated GPS accuracy no longer expands the site radius.
 * Kept so older imports still resolve.
 */
export const GEOFENCE_ACCURACY_BUFFER_CAP_M = 0;

/**
 * @deprecated Exit uses the work-location radius as set.
 * Keep in sync with AutoClockOut::isOutside() on the server.
 */
export const GEOFENCE_MAX_USABLE_ACCURACY_M = 0;

/** @deprecated Exit no longer adds a cushion past the site radius. */
export const GEOFENCE_EXIT_CUSHION_CAP_M = 0;

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

/** The boundary is the radius saved on the work location. GPS accuracy is not added. */
export function effectiveEnterRadiusM(
  radiusM: number,
  _accuracyMeters?: number | null,
): number {
  return radiusM;
}

/** Auto clock-out uses the same work-location radius. GPS accuracy is not added. */
export function effectiveExitRadiusM(
  radiusM: number,
  _accuracyMeters?: number | null,
): number {
  return radiusM;
}

export function isInsideGeofence(
  user: LatLng,
  site: LatLng,
  radiusM: number,
  _accuracyMeters?: number | null,
): boolean {
  const distanceM = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
  return distanceM <= radiusM;
}

/**
 * True when the employee is farther from the site than that site's radius.
 * Keep in sync with AutoClockOut::isOutside() on the server.
 */
export function isOutsideGeofence(
  user: LatLng,
  site: LatLng,
  radiusM: number,
  _accuracyMeters?: number | null,
): boolean {
  const distanceM = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
  return distanceM > radiusM;
}

export function formatZoneBadgeLabel(
  distanceToSiteM: number,
  geofenceRadiusM: number,
  _accuracyMeters?: number | null,
): string {
  if (distanceToSiteM <= geofenceRadiusM) {
    // const remainingM = Math.max(0, Math.round(geofenceRadiusM - distanceToSiteM));
    // return `Within range · ${remainingM} m remaining`;
    return `You are within range of your assigned work location. `;
  }

  // const beyondM = Math.max(0, Math.round(distanceToSiteM - geofenceRadiusM));
  // return `Out of range · ${beyondM} m beyond`;
  return `You are out of range of your assigned work location. `;
}
