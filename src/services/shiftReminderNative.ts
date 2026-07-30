import { NativeModules, Platform } from 'react-native';
import { SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID } from './shiftReminderCopy';

export type ShiftReminderScheduleItem = {
  title: string;
  body: string;
  alertMessage: string;
  triggerAtMs: number;
  expiresAtMs: number;
  notificationId: number;
  thresholdMin: number;
};

export type PendingNativeShiftAlert = {
  title: string;
  message: string;
};

type ShiftReminderNativeModule = {
  isAvailable: () => Promise<boolean>;
  areNotificationsEnabled: () => Promise<boolean>;
  openNotificationSettings: () => Promise<void>;
  showNow: (
    title: string,
    body: string,
    notificationId: number,
    expiresAtMs: number,
  ) => Promise<void>;
  scheduleReminders: (reminders: ShiftReminderScheduleItem[]) => Promise<number>;
  cancelReminders: (notificationIds: number[]) => Promise<void>;
  cancelActive: () => Promise<void>;
  wasDelivered: (notificationId: number) => Promise<boolean>;
  consumePendingAlert: () => Promise<PendingNativeShiftAlert | null>;
};

const nativeModule = NativeModules.ShiftReminder as ShiftReminderNativeModule | undefined;

export function isShiftReminderNativeLinked(): boolean {
  return Platform.OS === 'android' && nativeModule != null && typeof nativeModule.showNow === 'function';
}

export async function showShiftReminderNotification(
  title: string,
  body: string,
  notificationId: number = SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID,
  expiresAtMs: number,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isShiftReminderNativeLinked() || !nativeModule) {
    return {
      ok: false,
      reason: 'Native ShiftReminder module is not linked. Rebuild the Android app.',
    };
  }
  try {
    const enabled = nativeModule.areNotificationsEnabled
      ? await nativeModule.areNotificationsEnabled()
      : true;
    if (!enabled) {
      return {
        ok: false,
        reason: 'Notifications are disabled for CruLynk. Enable them in system settings.',
      };
    }
    await nativeModule.showNow(title, body, notificationId, expiresAtMs);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (__DEV__) {
      console.warn('[ShiftReminder] showNow failed:', message);
    }
    return { ok: false, reason: message };
  }
}

export async function scheduleShiftReminderNotifications(
  reminders: ShiftReminderScheduleItem[],
): Promise<void> {
  if (!isShiftReminderNativeLinked() || !nativeModule?.scheduleReminders) {
    return;
  }
  if (reminders.length === 0) return;
  try {
    await nativeModule.scheduleReminders(reminders);
  } catch (error) {
    if (__DEV__) {
      console.warn('[ShiftReminder] scheduleReminders failed:', error);
    }
  }
}

export async function cancelShiftReminderNotifications(notificationIds: number[]): Promise<void> {
  if (!isShiftReminderNativeLinked() || !nativeModule?.cancelReminders) {
    return;
  }
  const ids =
    notificationIds.length > 0 ? notificationIds : [SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID];
  try {
    await nativeModule.cancelReminders(ids);
    if (nativeModule.cancelActive) {
      await nativeModule.cancelActive();
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[ShiftReminder] cancelReminders failed:', error);
    }
  }
}

export async function cancelActiveShiftReminderNotification(): Promise<void> {
  if (!isShiftReminderNativeLinked() || !nativeModule) {
    return;
  }
  try {
    if (nativeModule.cancelActive) {
      await nativeModule.cancelActive();
    } else if (nativeModule.cancelReminders) {
      await nativeModule.cancelReminders([SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID]);
    }
  } catch {
    /* ignore */
  }
}

export async function wasShiftReminderDelivered(notificationId: number): Promise<boolean> {
  if (!isShiftReminderNativeLinked() || !nativeModule?.wasDelivered) {
    return false;
  }
  try {
    return Boolean(await nativeModule.wasDelivered(notificationId));
  } catch {
    return false;
  }
}

export async function consumeNativePendingShiftAlert(): Promise<PendingNativeShiftAlert | null> {
  if (!isShiftReminderNativeLinked() || !nativeModule?.consumePendingAlert) {
    return null;
  }
  try {
    const pending = await nativeModule.consumePendingAlert();
    if (
      pending &&
      typeof pending.title === 'string' &&
      typeof pending.message === 'string' &&
      pending.title.trim() !== '' &&
      pending.message.trim() !== ''
    ) {
      return pending;
    }
  } catch (error) {
    if (__DEV__) {
      console.warn('[ShiftReminder] consumePendingAlert failed:', error);
    }
  }
  return null;
}
