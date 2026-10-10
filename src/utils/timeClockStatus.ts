import { DEFAULT_GEOFENCE_RADIUS_M } from './geofence';

export type ScheduledShiftTimes = {
  start_time: string;
  end_time: string;
  start_label: string;
  end_label: string;
};

export type ShiftWorkLocation = {
  id: number | null;
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
};

export type ScheduledShiftRow = ScheduledShiftTimes & {
  id: number | null;
  within_window: boolean;
  is_current: boolean;
  /** True after this roster row has been clocked out. The card stays on Home. */
  is_finished: boolean;
  work_location_name: string | null;
  work_location: ShiftWorkLocation | null;
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

export type EarlyClockOutState = {
  needs_approval: boolean;
  approved: boolean;
  shift_end_label: string | null;
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
  /** Unfinished shifts for today. A clocked-out shift is omitted. */
  scheduled_shifts?: ScheduledShiftRow[];
  /** Work site for the open session, or the next shift the employee can clock into. */
  work_location?: ShiftWorkLocation | null;
  /** Allowed clock-in window around today's shift start. */
  clock_in_window?: ClockInWindow | null;
  /** Early clock-out still needs an admin, or that approval is already in. */
  early_clock_out?: EarlyClockOutState | null;
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

export function workLocationCoords(
  location: ShiftWorkLocation | null | undefined,
): GeofenceSiteCoords | null {
  if (!location) return null;
  const lat = location.latitude;
  const lng = location.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Work site for the shift the employee is clocked into, or the next one they
 * can clock into. Other same-day shifts are ignored so their sites cannot
 * make the range check pass.
 */
export function activeShiftWorkLocation(
  shifts: ScheduledShiftRow[] | null | undefined,
): ShiftWorkLocation | null {
  const rows = (shifts ?? []).filter((row) => !row.is_finished);
  const current = rows.find((row) => row.is_current);
  if (current?.work_location) return current.work_location;
  if (rows.length === 1) return rows[0].work_location ?? null;
  return null;
}

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

function mapEarlyClockOut(raw: unknown): EarlyClockOutState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.shift_end_label === 'string' ? o.shift_end_label.trim() : '';
  return {
    needs_approval: o.needs_approval === true,
    approved: o.approved === true,
    shift_end_label: label !== '' ? label : null,
  };
}

function mapWorkLocation(raw: unknown): ShiftWorkLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  const address = typeof o.address === 'string' ? o.address.trim() : '';
  const latitude = coerceFiniteNumber(o.latitude);
  const longitude = coerceFiniteNumber(o.longitude);
  if (name === '' && address === '' && latitude == null && longitude == null) return null;
  const id = coerceFiniteNumber(o.id);
  return {
    id: id != null ? id : null,
    name: name !== '' ? name : null,
    address: address !== '' ? address : null,
    latitude,
    longitude,
    geofence_radius_meters: coercePositiveMeters(o.geofence_radius_meters),
  };
}

function mapScheduledShiftRow(raw: unknown): ScheduledShiftRow | null {
  const times = mapScheduledShift(raw);
  if (!times || !raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = coerceFiniteNumber(o.id);
  const locationName = typeof o.work_location_name === 'string' ? o.work_location_name.trim() : '';
  return {
    ...times,
    id: id != null ? id : null,
    within_window: o.within_window === true,
    is_current: o.is_current === true && o.is_finished !== true,
    is_finished: o.is_finished === true,
    work_location_name: locationName !== '' ? locationName : null,
    work_location: mapWorkLocation(o.work_location),
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
    scheduled_shifts: Array.isArray(o.scheduled_shifts)
      ? o.scheduled_shifts
          .map((row) => mapScheduledShiftRow(row))
          .filter((row): row is ScheduledShiftRow => row != null)
      : [],
    work_location: mapWorkLocation(o.work_location),
    clock_in_window: mapClockInWindow(o.clock_in_window),
    early_clock_out: mapEarlyClockOut(o.early_clock_out),
    break_window: mapBreakWindow(o.break_window),
    open_session: openSession,
  };
}
