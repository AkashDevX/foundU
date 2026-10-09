import { DEFAULT_GEOFENCE_RADIUS_M } from './geofence';

export type ScheduledShiftTimes = {
  start_time: string;
  end_time: string;
  start_label: string;
  end_label: string;
};

export type BreakWindowPhase =
  | 'upcoming'
  | 'approaching'
  | 'open'
  | 'on_break'
  | 'taken'
  | 'closed';

export type BreakWindow = {
  required: boolean;
  opens_at: string;
  closes_at: string;
  opens_label: string;
  closes_label: string;
  message: string;
  phase: BreakWindowPhase;
  within_window: boolean;
  break_taken: boolean;
  reminder_lead_minutes: number;
  block_message: string | null;
};

export type ClockInWindow = {
  grace_minutes: number;
  policy: 'prevent' | 'exception';
  earliest_label: string;
  latest_label: string;
  start_label: string;
  within_window: boolean;
  deviation: 'early' | 'late' | null;
  exception_status: 'pending' | 'cleared' | null;
  block_message: string | null;
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
  induction_required?: boolean;
  induction_message?: string | null;
  /** Today's scheduled shift times (null when there is no shift today). */
  scheduled_shift?: ScheduledShiftTimes | null;
  /** Allowed clock-in window around today's shift start. */
  clock_in_window?: ClockInWindow | null;
  /** Meal break must be taken inside this part of today's shift. */
  break_window?: BreakWindow | null;
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
 * Prefers `geofence_radius_meters` for the employee's current work location
 * over a session-stamped `allowed_radius_meters`, so an admin radius edit
 * applies without waiting for the next clock-in.
 */
export function resolveGeofenceRadiusM(status: TimeClockStatus | null | undefined): number {
  const live = coercePositiveMeters(status?.geofence_radius_meters);
  if (live != null) return live;
  const session = coercePositiveMeters(status?.open_session?.allowed_radius_meters);
  if (session != null) return session;
  return DEFAULT_GEOFENCE_RADIUS_M;
}

export type GeofenceSiteCoords = { lat: number; lng: number };

/**
 * Live assigned work location wins over session-stamped clock-in coords.
 * When assignment is reassigned mid-shift, zone UI and auto clock-out must
 * follow the new site (same idea as resolveGeofenceRadiusM).
 */
export function resolveGeofenceSiteCoords(
  assigned: GeofenceSiteCoords | null | undefined,
  session:
    | {
        geofence_latitude?: number | null;
        geofence_longitude?: number | null;
      }
    | null
    | undefined,
): GeofenceSiteCoords | null {
  if (
    assigned &&
    Number.isFinite(assigned.lat) &&
    Number.isFinite(assigned.lng)
  ) {
    return { lat: assigned.lat, lng: assigned.lng };
  }

  const lat = session?.geofence_latitude;
  const lng = session?.geofence_longitude;
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }

  return null;
}

/** True when the geofence center moved enough to matter (~5–6 m). */
export function geofenceSitesDiffer(
  a: GeofenceSiteCoords | null | undefined,
  b: GeofenceSiteCoords | null | undefined,
): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  return Math.abs(a.lat - b.lat) > 0.00005 || Math.abs(a.lng - b.lng) > 0.00005;
}

function mapClockInWindow(raw: unknown): ClockInWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const earliest = typeof o.earliest_label === 'string' ? o.earliest_label : '';
  const latest = typeof o.latest_label === 'string' ? o.latest_label : '';
  if (earliest.trim() === '' || latest.trim() === '') return null;
  const deviation = o.deviation === 'early' || o.deviation === 'late' ? o.deviation : null;
  const exceptionStatus =
    o.exception_status === 'pending' || o.exception_status === 'cleared'
      ? o.exception_status
      : null;
  const grace = coerceFiniteNumber(o.grace_minutes);

  return {
    grace_minutes: grace != null && grace >= 0 ? grace : 20,
    policy: o.policy === 'prevent' ? 'prevent' : 'exception',
    earliest_label: earliest,
    latest_label: latest,
    start_label: typeof o.start_label === 'string' ? o.start_label : '',
    within_window: o.within_window === true,
    deviation,
    exception_status: exceptionStatus,
    block_message: typeof o.block_message === 'string' && o.block_message.trim() !== '' ? o.block_message : null,
  };
}

function mapBreakPhase(value: unknown): BreakWindowPhase {
  switch (value) {
    case 'upcoming':
    case 'approaching':
    case 'open':
    case 'on_break':
    case 'taken':
    case 'closed':
      return value;
    default:
      return 'upcoming';
  }
}

function mapBreakWindow(raw: unknown): BreakWindow | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.required !== true) return null;
  const opensLabel = typeof o.opens_label === 'string' ? o.opens_label.trim() : '';
  const closesLabel = typeof o.closes_label === 'string' ? o.closes_label.trim() : '';
  const message = typeof o.message === 'string' ? o.message.trim() : '';
  if (opensLabel === '' || closesLabel === '' || message === '') return null;
  const lead = coerceFiniteNumber(o.reminder_lead_minutes);

  return {
    required: true,
    opens_at: typeof o.opens_at === 'string' ? o.opens_at : '',
    closes_at: typeof o.closes_at === 'string' ? o.closes_at : '',
    opens_label: opensLabel,
    closes_label: closesLabel,
    message,
    phase: mapBreakPhase(o.phase),
    within_window: o.within_window === true,
    break_taken: o.break_taken === true,
    reminder_lead_minutes: lead != null && lead >= 0 ? lead : 15,
    block_message:
      typeof o.block_message === 'string' && o.block_message.trim() !== ''
        ? o.block_message
        : null,
  };
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
    induction_required: o.induction_required === true,
    induction_message: typeof o.induction_message === 'string' ? o.induction_message : null,
    scheduled_shift: mapScheduledShift(o.scheduled_shift),
    clock_in_window: mapClockInWindow(o.clock_in_window),
    break_window: mapBreakWindow(o.break_window),
    open_session: openSession,
  };
}
