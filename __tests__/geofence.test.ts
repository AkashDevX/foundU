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
    // ~99 m north of site at this latitude scale — stay inside 100 m radius
    const user = { lat: -27.46911, lng: 153.02 };
    const distance = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
    expect(distance).toBeLessThan(100);
    expect(isInsideGeofence(user, site, 100, 10)).toBe(true);
  });

  it('does not treat near-boundary GPS drift as an exit', () => {
    const user = { lat: -27.4689, lng: 153.02 }; // a bit past 100 m
    expect(isOutsideGeofence(user, site, 100, 15)).toBe(false);
    expect(effectiveExitRadiusM(100, 15)).toBe(165);
  });

  it('ignores unusable high-accuracy-error samples for exit', () => {
    const user = { lat: -27.46, lng: 153.02 }; // clearly far
    expect(isOutsideGeofence(user, site, 100, 120)).toBe(false);
  });

  it('requires clear exit beyond hysteresis before auto clock-out', () => {
    const user = { lat: -27.468, lng: 153.02 };
    const distance = haversineDistanceM(user.lat, user.lng, site.lat, site.lng);
    expect(distance).toBeGreaterThan(effectiveEnterRadiusM(100, 0));
    expect(isOutsideGeofence(user, site, 100, 0)).toBe(distance > 150);
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
