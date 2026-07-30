import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_AUTO_CLOCK_OUT_ALERT_KEY = 'foundu:pending_auto_clock_out_alert';

export type PendingAutoClockOutAlert = {
  title: string;
  message: string;
};

export async function persistPendingAutoClockOutAlert(
  alert: PendingAutoClockOutAlert,
): Promise<void> {
  await AsyncStorage.setItem(PENDING_AUTO_CLOCK_OUT_ALERT_KEY, JSON.stringify(alert));
}

export async function consumePendingAutoClockOutAlert(): Promise<PendingAutoClockOutAlert | null> {
  const raw = await AsyncStorage.getItem(PENDING_AUTO_CLOCK_OUT_ALERT_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_AUTO_CLOCK_OUT_ALERT_KEY);
  try {
    const parsed = JSON.parse(raw) as PendingAutoClockOutAlert;
    if (typeof parsed.title === 'string' && typeof parsed.message === 'string') {
      return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}
