import {
  effectiveEnterRadiusM,
  effectiveExitRadiusM,
  formatZoneBadgeLabel,
  haversineDistanceM,
  isInsideGeofence,
  isOutsideGeofence,
} from '../src/utils/geofence';

describe('geofence', () => {
  const site = { lat: -27.47, lng: 153.02 };

  it('keeps a near-boundary reading inside for enter checks', () => {
    const user = { lat: -27.46911, lng: 153.02 };
    const distance = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
    expect(distance).toBeLessThan(100);
    expect(isInsideGeofence(user, site, 100, 10)).toBe(true);
  });

  it('treats past-radius readings as an immediate exit', () => {
    const user = { lat: -27.4689, lng: 153.02 };
    const distance = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
    expect(distance).toBeGreaterThan(100);
    expect(isOutsideGeofence(user, site, 100, 0)).toBe(true);
    expect(effectiveExitRadiusM(100, 0)).toBe(100);
    expect(effectiveExitRadiusM(100, 15)).toBe(effectiveEnterRadiusM(100, 15));
  });

  it('still clocks out when GPS accuracy is poor but distance is beyond the radius', () => {
    const user = { lat: -27.46, lng: 153.02 };
    expect(isInsideGeofence(user, site, 100, 120)).toBe(false);
    expect(isOutsideGeofence(user, site, 100, 120)).toBe(true);
  });

  it('clocks out as soon as distance exceeds the geofence radius', () => {
    const user = { lat: -27.468, lng: 153.02 };
    const distance = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
    expect(distance).toBeGreaterThan(effectiveEnterRadiusM(100, 0));
    expect(isOutsideGeofence(user, site, 100, 0)).toBe(true);
  });

  it('formats within-range badge with meters remaining inside the radius', () => {
    expect(formatZoneBadgeLabel(42, 100, 12)).toBe('Within range · 58 m remaining');
    expect(formatZoneBadgeLabel(100, 100, 0)).toBe('Within range · 0 m remaining');
  });

  it('formats out-of-range badge with meters past the radius', () => {
    expect(formatZoneBadgeLabel(150, 100, 10)).toBe('Out of range · 50 m beyond');
    expect(formatZoneBadgeLabel(150, 100, 45)).toBe('Out of range · 50 m beyond');
  });
});
