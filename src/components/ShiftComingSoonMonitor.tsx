import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SweetAlert } from './SweetAlert';
import { getSessionAuthenticated } from '../services/authSessionStorage';
import {
  areAppNotificationsEnabled,
  openAppNotificationSettings,
  requestShiftReminderNotificationPermission,
} from '../services/notificationPermissions';
import {
  pickShiftReminderCopy,
  SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID,
  SHIFT_REMINDER_THRESHOLDS_MIN,
  type ShiftReminderThresholdMin,
} from '../services/shiftReminderCopy';
import {
  cancelShiftReminderNotifications,
  consumeNativePendingShiftAlert,
  isShiftReminderNativeLinked,
  scheduleShiftReminderNotifications,
  showShiftReminderNotification,
} from '../services/shiftReminderNative';
import {
  consumePendingShiftReminderAlert,
  hasFiredShiftReminder,
  markShiftReminderFired,
  persistPendingShiftReminderAlert,
} from '../services/shiftReminderStorage';
import { fetchTimeClockStatus } from '../services/timeClockApi';
import { subscribeTimeClockChange } from '../services/timeClockEvents';
import {
  approxShiftStartUtcMs,
  getDeviceTimezoneClock,
  minutesUntilTodayShiftStart,
} from '../utils/shiftReminderTime';

const POLL_INTERVAL_MS = 45_000;

/**
 * Watches today's assigned shift and nudges the employee when start time is nearby:
 * branded system status-bar notification (valid until shift start) + styled SweetAlert.
 */
export function ShiftComingSoonMonitor() {
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const inFlightRef = useRef(false);
  const scheduledStartHmRef = useRef<string | null>(null);
  const scheduledArmedRef = useRef<string | null>(null);
  const missingShiftStreakRef = useRef(0);
  const permissionAskedRef = useRef(false);
  const nativeWarnedRef = useRef(false);
  const settingsPromptedRef = useRef(false);

  const showAlert = useCallback(
    (
      title: string,
      message: string,
      options?: { confirmText?: string; onConfirm?: () => void },
    ) => {
      setAlert({
        title,
        message,
        confirmText: options?.confirmText,
        onConfirm: options?.onConfirm,
      });
    },
    [],
  );

  const clearTrayReminder = useCallback(async () => {
    // Cancels native AlarmManager schedule + tray card (needed when shift ends / clock in).
    await cancelShiftReminderNotifications([SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID]);
  }, []);

  const loadPendingAlert = useCallback(async () => {
    try {
      const fromNative = await consumeNativePendingShiftAlert();
      if (fromNative) {
        showAlert(fromNative.title, fromNative.message);
        return;
      }
      const pending = await consumePendingShiftReminderAlert();
      if (pending) {
        showAlert(pending.title, pending.message);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[ShiftReminder] loadPendingAlert failed:', error);
      }
    }
  }, [showAlert]);

  const scheduleNativeAlarms = useCallback(
    async (startHm: string, startLabel: string, ymd: string, shiftStartMs: number) => {
      const now = Date.now();
      const reminders = [];
      for (const threshold of SHIFT_REMINDER_THRESHOLDS_MIN) {
        if (await hasFiredShiftReminder(ymd, startHm, threshold)) continue;
        let triggerAtMs = shiftStartMs - threshold * 60_000;
        if (triggerAtMs >= shiftStartMs - 1_000) continue;

        // Due windows still need a short-delayed AlarmClock so shade delivery works
        // after Home / Recents swipe (fireReminder covers the immediate in-app path).
        if (triggerAtMs <= now + 5_000) {
          triggerAtMs = now + 12_000;
        }
        if (triggerAtMs >= shiftStartMs - 1_000) continue;

        const copy = pickShiftReminderCopy(threshold, `${ymd}:${threshold}:${startHm}`, startLabel);
        reminders.push({
          title: copy.title,
          body: copy.notificationBody,
          alertMessage: copy.message,
          triggerAtMs,
          expiresAtMs: shiftStartMs,
          notificationId: SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID,
          thresholdMin: threshold,
        });
      }

      if (reminders.length > 0) {
        await scheduleShiftReminderNotifications(reminders);
      }
    },
    [],
  );

  const fireReminder = useCallback(
    async (
      threshold: ShiftReminderThresholdMin,
      ymd: string,
      startHm: string,
      startLabel: string,
      shiftStartMs: number,
    ) => {
      if (await hasFiredShiftReminder(ymd, startHm, threshold)) return;

      const notificationId = SHIFT_REMINDER_ACTIVE_NOTIFICATION_ID;
      const copy = pickShiftReminderCopy(threshold, `${ymd}:${threshold}:${startHm}`, startLabel);

      const result = await showShiftReminderNotification(
        copy.title,
        copy.notificationBody,
        notificationId,
        shiftStartMs,
      );
      if (!result.ok && __DEV__) {
        console.warn('[ShiftReminder] system notification not posted:', result.reason);
      }

      await markShiftReminderFired(ymd, startHm, threshold);

      const foreground = appStateRef.current === 'active';
      if (foreground) {
        showAlert(copy.title, copy.message);
      } else if (!result.ok) {
        await persistPendingShiftReminderAlert({ title: copy.title, message: copy.message });
      }
    },
    [showAlert],
  );

  const evaluate = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const authed = await getSessionAuthenticated();
      if (!authed) {
        // Only cancel when this session had armed reminders (logout / session end).
        // Avoid wiping native ARM_TEST / leftover AlarmClock schedules on cold start.
        if (scheduledArmedRef.current != null || scheduledStartHmRef.current != null) {
          scheduledStartHmRef.current = null;
          scheduledArmedRef.current = null;
          await clearTrayReminder();
        }
        return;
      }

      if (!permissionAskedRef.current) {
        permissionAskedRef.current = true;
        const granted = await requestShiftReminderNotificationPermission();
        const enabled = granted && (await areAppNotificationsEnabled());
        if (!enabled && !settingsPromptedRef.current) {
          settingsPromptedRef.current = true;
          showAlert(
            'Enable CruLynk notifications',
            'Background shift reminders are blocked because notifications are turned off for CruLynk. Turn notifications ON in system settings, then come back. Alarms already fire, but Android will not show the status bar popup until this is enabled.',
            {
              confirmText: 'Open settings',
              onConfirm: () => {
                void openAppNotificationSettings();
              },
            },
          );
          void openAppNotificationSettings();
        }
        if (!isShiftReminderNativeLinked() && !nativeWarnedRef.current) {
          nativeWarnedRef.current = true;
          console.warn(
            '[ShiftReminder] Native module missing. Rebuild the Android app to enable status bar notifications.',
          );
        }
      } else {
        // Keep checking: user may enable notifications after the first prompt.
        const enabled = await areAppNotificationsEnabled();
        if (!enabled && !settingsPromptedRef.current) {
          settingsPromptedRef.current = true;
          showAlert(
            'Enable CruLynk notifications',
            'Turn CruLynk notifications ON so shift reminders can appear in the status bar after you leave the app.',
            {
              confirmText: 'Open settings',
              onConfirm: () => {
                void openAppNotificationSettings();
              },
            },
          );
        }
      }

      const statusResult = await fetchTimeClockStatus();
      if (!statusResult.ok) return;

      const timeClock = statusResult.time_clock;
      if (timeClock.is_clocked_in) {
        scheduledStartHmRef.current = null;
        scheduledArmedRef.current = null;
        await clearTrayReminder();
        return;
      }

      const shift = timeClock.scheduled_shift;
      if (!shift?.start_time || !shift.start_label) {
        // Ignore brief API gaps so we do not cancel an armed shade reminder.
        missingShiftStreakRef.current += 1;
        if (missingShiftStreakRef.current >= 3) {
          scheduledStartHmRef.current = null;
          scheduledArmedRef.current = null;
          await clearTrayReminder();
        }
        return;
      }
      missingShiftStreakRef.current = 0;

      const { ymd } = getDeviceTimezoneClock();
      const minutesUntil = minutesUntilTodayShiftStart(shift.start_time);
      const shiftStartMs = approxShiftStartUtcMs(shift.start_time);

      // Reminder is only valid until the shift starts.
      if (minutesUntil == null || minutesUntil <= 0 || shiftStartMs == null) {
        scheduledStartHmRef.current = null;
        scheduledArmedRef.current = null;
        await clearTrayReminder();
        return;
      }

      scheduledStartHmRef.current = shift.start_time;

      // Arm native AlarmClock once per shift start time BEFORE firing due windows.
      // Re-arming every poll was cancelling alarms every few seconds and broke
      // background delivery after Recents swipe-away.
      if (scheduledArmedRef.current !== shift.start_time) {
        scheduledArmedRef.current = shift.start_time;
        await scheduleNativeAlarms(shift.start_time, shift.start_label, ymd, shiftStartMs);
      }

      const threshold = SHIFT_REMINDER_THRESHOLDS_MIN.find((t) => minutesUntil <= t);
      if (threshold != null) {
        await fireReminder(threshold, ymd, shift.start_time, shift.start_label, shiftStartMs);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('[ShiftReminder] evaluate failed:', error);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [clearTrayReminder, fireReminder, scheduleNativeAlarms, showAlert]);

  useEffect(() => {
    void loadPendingAlert();
    void evaluate();

    const poll = setInterval(() => {
      void evaluate();
    }, POLL_INTERVAL_MS);

    const onAppState = (next: AppStateStatus) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      appStateRef.current = next;
      if (wasBackground && next === 'active') {
        void loadPendingAlert();
        void evaluate();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    const unsubClock = subscribeTimeClockChange(() => {
      void evaluate();
    });

    return () => {
      clearInterval(poll);
      sub.remove();
      unsubClock();
    };
  }, [evaluate, loadPendingAlert]);

  return (
    <SweetAlert
      visible={alert != null}
      title={alert?.title ?? ''}
      message={alert?.message ?? ''}
      confirmText={alert?.confirmText ?? 'Got it'}
      cancelText="Dismiss"
      hideCancel
      variant="info"
      onConfirm={() => {
        const action = alert?.onConfirm;
        setAlert(null);
        action?.();
      }}
      onClose={() => setAlert(null)}
    />
  );
}
