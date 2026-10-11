import { DEFAULT_GEOFENCE_RADIUS_M } from '../src/utils/geofence';
import {
  activeShiftWorkLocation,
  mapTimeClockStatus,
  resolveGeofenceRadiusM,
  resolveGeofenceSiteCoords,
  workLocationCoords,
  type ScheduledShiftRow,
  type TimeClockStatus,
} from '../src/utils/timeClockStatus';
import { tradingHoursOnDate } from '../src/utils/tradingHours';

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

  it('falls back to session radius when the live work-location radius is missing', () => {
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

function shiftRow(
  id: number,
  isCurrent: boolean,
  latitude: number,
  radius: number,
): ScheduledShiftRow {
  return {
    id,
    start_time: '09:00',
    end_time: '17:00',
    start_label: '9:00 AM',
    end_label: '5:00 PM',
    within_window: false,
    is_current: isCurrent,
    is_finished: false,
    work_location_name: `Site ${id}`,
    work_location: {
      id,
      name: `Site ${id}`,
      address: null,
      notes: null,
      trading_hours: null,
      site_information: null,
      latitude,
      longitude: 153,
      geofence_radius_meters: radius,
    },
  };
}

describe('active shift site', () => {
  it('uses the current shift site when another shift is closer to the phone', () => {
    const current = shiftRow(2, true, -27.5, 50);
    const other = shiftRow(1, false, -27.47, 300);
    const site = activeShiftWorkLocation([other, current]);

    expect(site?.id).toBe(2);
    expect(workLocationCoords(site)).toEqual({ lat: -27.5, lng: 153 });
    expect(site?.geofence_radius_meters).toBe(50);
  });
});

describe('scheduled work location details', () => {
  it('keeps trading hours and site information from the weekly schedule site', () => {
    const status = mapTimeClockStatus({
      is_clocked_in: false,
      scheduled_shifts: [
        {
          id: 4,
          start_time: '09:00',
          end_time: '17:00',
          start_label: '9:00 AM',
          end_label: '5:00 PM',
          within_window: true,
          is_current: true,
          work_location_name: 'North depot',
          work_location: {
            id: 4,
            name: 'North depot',
            address: '1 Site Road',
            notes: 'Gate code 2580',
            trading_hours: {
              sun: { open: '09:00', close: '17:00', label: '9:00 AM – 5:00 PM' },
              mon: null,
            },
            site_information: ' Use the loading dock. ',
            latitude: -27.4,
            longitude: 153.02,
            geofence_radius_meters: 80,
          },
        },
      ],
    });

    const site = activeShiftWorkLocation(status?.scheduled_shifts);
    expect(site?.trading_hours?.sun?.label).toBe('9:00 AM – 5:00 PM');
    expect(tradingHoursOnDate(site?.trading_hours, '2026-10-11')?.hoursLabel).toBe('9:00 AM – 5:00 PM');
    expect(tradingHoursOnDate(site?.trading_hours, '2026-10-11')?.dateLabel).toContain('Sunday');
    expect(tradingHoursOnDate(site?.trading_hours, '2026-10-12')?.hoursLabel).toBe('Closed');
    expect(site?.site_information).toBe('Use the loading dock.');
    expect(site?.notes).toBe('Gate code 2580');
  });
});
