import { DEFAULT_GEOFENCE_RADIUS_M } from '../src/utils/geofence';
import {
  mapTimeClockStatus,
  resolveGeofenceRadiusM,
  resolveGeofenceSiteCoords,
  type TimeClockStatus,
} from '../src/utils/timeClockStatus';

describe('geofence radius fetching', () => {
  it('prefers live geofence_radius_meters over a stale session stamp', () => {
    const status: TimeClockStatus = {
      is_clocked_in: true,
      is_on_break: false,
      can_clock_in: false,
      can_clock_out: true,
      can_break_in: true,
      can_break_out: false,
      geofence_radius_meters: 300,
      assignment_ready: true,
      open_session: {
        clocked_in_at: '2026-07-24T00:00:00Z',
        allowed_radius_meters: 100,
        geofence_latitude: -27.47,
        geofence_longitude: 153.02,
      },
    };

    expect(resolveGeofenceRadiusM(status)).toBe(300);
  });

  it('falls back to session radius when live config is missing', () => {
    const status = {
      is_clocked_in: true,
      is_on_break: false,
      can_clock_in: false,
      can_clock_out: true,
      can_break_in: true,
      can_break_out: false,
      geofence_radius_meters: 0,
      assignment_ready: true,
      open_session: {
        clocked_in_at: '2026-07-24T00:00:00Z',
        allowed_radius_meters: 250,
      },
    } as TimeClockStatus;

    expect(resolveGeofenceRadiusM(status)).toBe(250);
  });

  it('defaults to 300 m when status has no usable radius', () => {
    expect(resolveGeofenceRadiusM(null)).toBe(DEFAULT_GEOFENCE_RADIUS_M);
    expect(resolveGeofenceRadiusM(undefined)).toBe(300);
  });

  it('parses numeric string radii and coords from the API', () => {
    const mapped = mapTimeClockStatus({
      is_clocked_in: true,
      geofence_radius_meters: '300',
      open_session: {
        clocked_in_at: '2026-07-24T00:00:00Z',
        geofence_latitude: '-27.47',
        geofence_longitude: '153.02',
        allowed_radius_meters: '100',
      },
    });

    expect(mapped).not.toBeNull();
    expect(mapped!.geofence_radius_meters).toBe(300);
    expect(mapped!.open_session?.allowed_radius_meters).toBe(100);
    expect(mapped!.open_session?.geofence_latitude).toBe(-27.47);
    expect(mapped!.open_session?.geofence_longitude).toBe(153.02);
    expect(resolveGeofenceRadiusM(mapped)).toBe(300);
  });
});

describe('geofence site coords', () => {
  it('prefers live assigned work location over stale session stamp', () => {
    const site = resolveGeofenceSiteCoords(
      { lat: -27.5, lng: 153.1 },
      {
        geofence_latitude: -27.47,
        geofence_longitude: 153.02,
      },
    );

    expect(site).toEqual({ lat: -27.5, lng: 153.1 });
  });

  it('falls back to session coords when assigned location is missing', () => {
    const site = resolveGeofenceSiteCoords(null, {
      geofence_latitude: -27.47,
      geofence_longitude: 153.02,
    });

    expect(site).toEqual({ lat: -27.47, lng: 153.02 });
  });

  it('returns null when neither assigned nor session coords exist', () => {
    expect(resolveGeofenceSiteCoords(null, null)).toBeNull();
    expect(resolveGeofenceSiteCoords(undefined, undefined)).toBeNull();
  });
});
