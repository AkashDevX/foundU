/** Reminder windows (minutes before shift start), most urgent first. */
export const SHIFT_REMINDER_THRESHOLDS_MIN = [15, 30, 60] as const;

/** Single tray notification id so reminders update in place and clear at shift start. */
export const SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID = 2200;

export type ShiftReminderThresholdMin = (typeof SHIFT_REMINDER_THRESHOLDS_MIN)[number];

export type ShiftReminderCopy = {
  title: string;
  message: string;
  notificationBody: string;
};

type CopyBank = Record<ShiftReminderThresholdMin, ShiftReminderCopy[]>;

/** Fancy taglines with no hyphen / dash characters. */
const COPY: CopyBank = {
  60: [
    {
      title: 'Shift on the horizon',
      message:
        'Your assigned shift kicks off in about an hour. Stretch, hydrate, and lock in your game face.',
      notificationBody: 'Your shift starts in about an hour. Time to get ready.',
    },
    {
      title: 'One hour to showtime',
      message:
        "Curtain's rising soon. You've got roughly 60 minutes until your shift begins. Make them count.",
      notificationBody: 'Showtime in about 60 minutes. Your shift is coming up.',
    },
    {
      title: 'Gear up, you are on deck',
      message:
        'An hour out from start time. Check the map, lace up, and roll in ready to clock in.',
      notificationBody: 'You are an hour out from shift start. Gear up.',
    },
  ],
  30: [
    {
      title: 'Halfway to the clock',
      message:
        'Thirty minutes until your shift. Perfect window to head toward the site and get set.',
      notificationBody: 'Shift starts in about 30 minutes. Head toward your site.',
    },
    {
      title: 'Almost in the zone',
      message:
        'Half an hour to go. Your shift is closing in. Leave a little early so you are not racing the clock.',
      notificationBody: 'About 30 minutes until shift start. Almost in the zone.',
    },
    {
      title: 'Shift inbound',
      message:
        'Thirty and counting. Your assigned shift is nearly here. Finish prep and make your way in.',
      notificationBody: 'Shift inbound in about 30 minutes. Finish prep and head in.',
    },
  ],
  15: [
    {
      title: 'Final call, shift soon',
      message:
        'Fifteen minutes to start. This is your last easy window. Be on site and ready to clock in.',
      notificationBody: 'Final call: your shift starts in about 15 minutes.',
    },
    {
      title: 'Lights, site, action',
      message:
        'You are a quarter hour from go time. Arrive, settle in, and punch in when you are ready.',
      notificationBody: 'Lights, site, action. Shift starts in about 15 minutes.',
    },
    {
      title: 'Practically on the clock',
      message:
        'Fifteen minutes until your shift. The finish line is the start line. See you on site.',
      notificationBody: 'Practically on the clock. About 15 minutes to shift start.',
    },
  ],
};

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function stripHyphens(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Picks a stable fancy tagline for a given day + threshold so the same reminder
 * does not flip wording if the monitor re-runs.
 */
export function pickShiftReminderCopy(
  thresholdMin: ShiftReminderThresholdMin,
  seed: string,
  startLabel: string,
): ShiftReminderCopy {
  const bank = COPY[thresholdMin];
  const pick = bank[hashSeed(seed) % bank.length] ?? bank[0];
  const within =
    thresholdMin === 60
      ? 'within the hour'
      : thresholdMin === 30
        ? 'within 30 minutes'
        : 'within 15 minutes';

  return {
    title: stripHyphens(pick.title),
    message: stripHyphens(
      `${pick.message}\n\nStarts at ${startLabel}. Coming ${within}.`,
    ),
    notificationBody: stripHyphens(
      `${pick.notificationBody} Starts at ${startLabel}.`,
    ),
  };
}

export function notificationIdForThreshold(
  _thresholdMin: ShiftReminderThresholdMin,
  _ymd = '',
): number {
  // One live tray item so branding stays consistent and clearing at shift start is reliable.
  return SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID;
}
