export const DEFAULT_GEOFENCE_RADIUS_M = 100;

/** Consecutive out-of-zone GPS readings required before auto clock-out. */
export const GEOFENCE_EXIT_CONFIRM_READINGS = 2;

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

export function isOutsideGeofence(
  user: LatLng,
  site: LatLng,
  radiusM: number,
  accuracyMeters?: number | null,
): boolean {
  const distanceM = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
  const accuracyBuffer = Math.min(Math.max(accuracyMeters ?? 0, 0), 50);
  return distanceM > radiusM + accuracyBuffer;
}

export function formatZoneBadgeLabel(distanceToSiteM: number, geofenceRadiusM: number): string {
  if (distanceToSiteM <= geofenceRadiusM) {
    return `In zone (${geofenceRadiusM} m)`;
  }
  const outsideM = Math.max(0, Math.round(distanceToSiteM - geofenceRadiusM));
  return `Out of zone (${outsideM} m outside)`;
}
