import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ShiftReminderThresholdMin } from './shiftReminderCopy';

const FIRED_KEYS = 'foundu:shift_reminders_fired_v3';
const PENDING_ALERT_KEY = 'foundu:pending_shift_reminder_alert_v3';

export type PendingShiftReminderAlert = {
  title: string;
  message: string;
};

function firedKey(ymd: string, startHm: string, thresholdMin: ShiftReminderThresholdMin): string {
  return `${ymd}:${startHm}:${thresholdMin}`;
}

async function readFiredSet(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(FIRED_KEYS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

async function writeFiredSet(set: Set<string>): Promise<void> {
  const trimmed = [...set].slice(-60);
  await AsyncStorage.setItem(FIRED_KEYS, JSON.stringify(trimmed));
}

export async function hasFiredShiftReminder(
  ymd: string,
  startHm: string,
  thresholdMin: ShiftReminderThresholdMin,
): Promise<boolean> {
  const set = await readFiredSet();
  return set.has(firedKey(ymd, startHm, thresholdMin));
}

export async function markShiftReminderFired(
  ymd: string,
  startHm: string,
  thresholdMin: ShiftReminderThresholdMin,
): Promise<void> {
  const set = await readFiredSet();
  set.add(firedKey(ymd, startHm, thresholdMin));
  await writeFiredSet(set);
}

export async function persistPendingShiftReminderAlert(
  alert: PendingShiftReminderAlert,
): Promise<void> {
  await AsyncStorage.setItem(PENDING_ALERT_KEY, JSON.stringify(alert));
}

export async function consumePendingShiftReminderAlert(): Promise<PendingShiftReminderAlert | null> {
  const raw = await AsyncStorage.getItem(PENDING_ALERT_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_ALERT_KEY);
  try {
    const parsed = JSON.parse(raw) as PendingShiftReminderAlert;
    if (typeof parsed.title === 'string' && typeof parsed.message === 'string') {
      return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}
