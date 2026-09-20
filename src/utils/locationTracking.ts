import { haversineDistanceM, type LatLng } from './geofence';

/** Align with backend defaults (config/time_clock.php). */
export const LOCATION_PING_MIN_INTERVAL_MS = 120_000;
export const IDLE_WINDOW_MS = 30 * 60_000;
export const IDLE_MAX_DISPLACEMENT_M = 40;
export const IDLE_MIN_SAMPLES = 3;
export const IDLE_MAX_USABLE_ACCURACY_M = 80;

export type LocationSamplePoint = {
  lat: number;
  lng: number;
  atMs: number;
  accuracyMeters: number | null;
};

/**
 * Max distance from the centroid of samples (meters).
 */
export function maxDisplacementFromCentroid(samples: LocationSamplePoint[]): number {
  if (samples.length === 0) return 0;
  const centerLat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
  const centerLng = samples.reduce((s, p) => s + p.lng, 0) / samples.length;
  let max = 0;
  for (const p of samples) {
    const d = haversineDistanceM(centerLat, centerLng, p.lat, p.lng);
    if (d > max) max = d;
  }
  return max;
}

export function pruneSamples(
  samples: LocationSamplePoint[],
  nowMs: number,
  windowMs: number = IDLE_WINDOW_MS,
): LocationSamplePoint[] {
  const cutoff = nowMs - windowMs;
  return samples.filter((s) => s.atMs >= cutoff);
}

export function isLocallyIdle(
  samples: LocationSamplePoint[],
  nowMs: number = Date.now(),
): { idle: boolean; idleMinutes: number; displacementM: number } {
  const usable = pruneSamples(samples, nowMs).filter(
    (s) => s.accuracyMeters == null || s.accuracyMeters <= IDLE_MAX_USABLE_ACCURACY_M,
  );

  if (usable.length < IDLE_MIN_SAMPLES) {
    return { idle: false, idleMinutes: 0, displacementM: 0 };
  }

  const spanMs = usable[usable.length - 1].atMs - usable[0].atMs;
  if (spanMs < IDLE_WINDOW_MS) {
    return { idle: false, idleMinutes: 0, displacementM: 0 };
  }

  const displacementM = maxDisplacementFromCentroid(usable);
  const idle = displacementM <= IDLE_MAX_DISPLACEMENT_M;
  return {
    idle,
    idleMinutes: Math.max(1, Math.round(spanMs / 60_000)),
    displacementM,
  };
}

export function sampleFromCoords(
  lat: number,
  lng: number,
  accuracyMeters: number | null,
  atMs: number = Date.now(),
): LocationSamplePoint {
  return { lat, lng, accuracyMeters, atMs };
}

export type { LatLng };
