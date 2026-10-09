import { NativeModules, Platform } from 'react-native';

export type BreakWindowScheduleItem = {
  title: string;
  body: string;
  triggerAtMs: number;
  notificationId: number;
};

type BreakWindowNativeModule = {
  scheduleBreakReminders?: (reminders: BreakWindowScheduleItem[]) => Promise<number>;
  cancelBreakReminders?: () => Promise<void>;
};

const nativeModule = NativeModules.ShiftReminder as BreakWindowNativeModule | undefined;

export function isBreakWindowNativeLinked(): boolean {
  return (
    Platform.OS === 'android' &&
    nativeModule != null &&
    typeof nativeModule.scheduleBreakReminders === 'function'
  );
}

export async function scheduleBreakWindowNotifications(
  reminders: BreakWindowScheduleItem[],
): Promise<void> {
  if (!isBreakWindowNativeLinked() || !nativeModule?.scheduleBreakReminders) return;
  try {
    await nativeModule.scheduleBreakReminders(reminders);
  } catch (error) {
    if (__DEV__) {
      console.warn('[BreakWindow] scheduleBreakReminders failed:', error);
    }
  }
}

export async function cancelBreakWindowNotifications(): Promise<void> {
  if (!isBreakWindowNativeLinked() || !nativeModule?.cancelBreakReminders) return;
  try {
    await nativeModule.cancelBreakReminders();
  } catch (error) {
    if (__DEV__) {
      console.warn('[BreakWindow] cancelBreakReminders failed:', error);
    }
  }
}
