import { DEFAULT_GEOFENCE_RADIUS_M } from './geofence';

export type ScheduledShiftTimes = {
  start_time: string;
  end_time: string;
  start_label: string;
  end_label: string;
};

export type TimeClockStatus = {
  is_clocked_in: boolean;
  is_on_break: boolean;
  can_clock_in: boolean;
  can_clock_out: boolean;
  can_break_in: boolean;
  can_break_out: boolean;
  geofence_radius_meters: number;
  assignment_ready: boolean;
  assignment_not_ready_reason?: string | null;
  shift_issue?: string | null;
  /** Today's scheduled shift times (null when there is no shift today). */
  scheduled_shift?: ScheduledShiftTimes | null;
  open_session?: {
    clocked_in_at: string | null;
    break_started_at?: string | null;
    total_break_seconds?: number;
    /** Geofence center used for this open shift (from the clock-in punch). */
    geofence_latitude?: number | null;
    geofence_longitude?: number | null;
    allowed_radius_meters?: number | null;
  } | null;
};

/** Coerce API numbers that may arrive as JSON numbers or numeric strings. */
function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function coercePositiveMeters(value: unknown): number | null {
  const n = coerceFiniteNumber(value);
  if (n == null || n <= 0) return null;
  return n;
}

/**
 * Live geofence radius from the server.
 * Prefers `geofence_radius_meters` (current config) over a session-stamped
 * `allowed_radius_meters`, which can stay at an older value (e.g. 100) after
 * the configured radius was raised to 300.
 */
export function resolveGeofenceRadiusM(status: TimeClockStatus | null | undefined): number {
  const live = coercePositiveMeters(status?.geofence_radius_meters);
  if (live != null) return live;
  const session = coercePositiveMeters(status?.open_session?.allowed_radius_meters);
  if (session != null) return session;
  return DEFAULT_GEOFENCE_RADIUS_M;
}

function mapScheduledShift(raw: unknown): ScheduledShiftTimes | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const startLabel = typeof o.start_label === 'string' ? o.start_label : '';
  if (startLabel.trim() === '') return null;
  return {
    start_time: typeof o.start_time === 'string' ? o.start_time : '',
    end_time: typeof o.end_time === 'string' ? o.end_time : '',
    start_label: startLabel,
    end_label: typeof o.end_label === 'string' ? o.end_label : '',
  };
}

export function mapTimeClockStatus(raw: unknown): TimeClockStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const openRaw = o.open_session;
  let openSession: TimeClockStatus['open_session'] = null;
  if (openRaw && typeof openRaw === 'object') {
    const open = openRaw as Record<string, unknown>;
    const totalBreakSeconds = coerceFiniteNumber(open.total_break_seconds);
    openSession = {
      clocked_in_at: typeof open.clocked_in_at === 'string' ? open.clocked_in_at : null,
      break_started_at: typeof open.break_started_at === 'string' ? open.break_started_at : null,
      total_break_seconds: totalBreakSeconds != null ? totalBreakSeconds : undefined,
      geofence_latitude: coerceFiniteNumber(open.geofence_latitude),
      geofence_longitude: coerceFiniteNumber(open.geofence_longitude),
      allowed_radius_meters: coercePositiveMeters(open.allowed_radius_meters),
    };
  }

  return {
    is_clocked_in: o.is_clocked_in === true,
    is_on_break: o.is_on_break === true,
    can_clock_in: o.can_clock_in === true,
    can_clock_out: o.can_clock_out === true,
    can_break_in: o.can_break_in === true,
    can_break_out: o.can_break_out === true,
    geofence_radius_meters:
      coercePositiveMeters(o.geofence_radius_meters) ?? DEFAULT_GEOFENCE_RADIUS_M,
    assignment_ready: o.assignment_ready === true,
    assignment_not_ready_reason:
      typeof o.assignment_issue === 'string' ? o.assignment_issue : null,
    shift_issue: typeof o.shift_issue === 'string' ? o.shift_issue : null,
    scheduled_shift: mapScheduledShift(o.scheduled_shift),
    open_session: openSession,
  };
}
