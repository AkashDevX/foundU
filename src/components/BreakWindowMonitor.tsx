import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { SweetAlert } from './SweetAlert';
import { getSessionAuthenticated } from '../services/authSessionStorage';
import {
  cancelBreakWindowNotifications,
  scheduleBreakWindowNotifications,
} from '../services/breakWindowNative';
import { hasFiredBreakReminder, markBreakReminderFired } from '../services/breakWindowStorage';
import { requestShiftReminderNotificationPermission } from '../services/notificationPermissions';
import { fetchTimeClockStatus } from '../services/timeClockApi';
import { subscribeTimeClockChange } from '../services/timeClockEvents';
import {
  BREAK_WINDOW_APPROACH_NOTIFICATION_ID,
  BREAK_WINDOW_OPEN_NOTIFICATION_ID,
  breakReminderCopy,
  resolveBreakPhase,
} from '../utils/breakWindow';
import type { BreakWindow } from '../utils/timeClockStatus';

const POLL_INTERVAL_MS = 45_000;

/**
 * Reminds the employee when today's meal-break window is about to open, and again
 * when it opens, until they start the break.
 */
export function BreakWindowMonitor() {
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const inFlightRef = useRef(false);
  const permissionAskedRef = useRef(false);
  const armedKeyRef = useRef<string | null>(null);

  const showAlert = useCallback((title: string, message: string) => {
    setAlert({ title, message });
  }, []);

  const maybeAlert = useCallback(
    async (window: BreakWindow, kind: 'approach' | 'open') => {
      if (appStateRef.current !== 'active') return;
      if (await hasFiredBreakReminder(window.opens_at, kind)) return;
      await markBreakReminderFired(window.opens_at, kind);
      const copy = breakReminderCopy(kind, window.message);
      showAlert(copy.title, copy.message);
    },
    [showAlert],
  );

  const arm = useCallback(
    async (window: BreakWindow | null | undefined, onBreak: boolean) => {
      if (!window?.required || onBreak || window.break_taken) {
        armedKeyRef.current = null;
        await cancelBreakWindowNotifications();
        return;
      }

      const phase = resolveBreakPhase(window, Date.now(), onBreak);
      if (phase === 'closed' || phase === 'taken') {
        armedKeyRef.current = null;
        await cancelBreakWindowNotifications();
        return;
      }

      const opens = Date.parse(window.opens_at);
      const closes = Date.parse(window.closes_at);
      if (!Number.isFinite(opens) || !Number.isFinite(closes)) return;

      const fingerprint = `${window.opens_at}:${window.reminder_lead_minutes}`;
      if (armedKeyRef.current !== fingerprint) {
        armedKeyRef.current = fingerprint;
        const now = Date.now();
        const leadMs = Math.max(0, window.reminder_lead_minutes) * 60_000;
        const reminders = [];
        const approachAt = opens - leadMs;
        if (leadMs > 0 && approachAt > now + 5_000 && approachAt < closes) {
          const copy = breakReminderCopy('approach', window.message);
          reminders.push({
            title: copy.title,
            body: copy.message,
            triggerAtMs: approachAt,
            notificationId: BREAK_WINDOW_APPROACH_NOTIFICATION_ID,
          });
        }
        if (opens > now + 5_000 && opens < closes) {
          const copy = breakReminderCopy('open', window.message);
          reminders.push({
            title: copy.title,
            body: copy.message,
            triggerAtMs: opens,
            notificationId: BREAK_WINDOW_OPEN_NOTIFICATION_ID,
          });
        }
        if (reminders.length > 0) {
          await scheduleBreakWindowNotifications(reminders);
        } else {
          await cancelBreakWindowNotifications();
        }
      }

      if (phase === 'approaching') await maybeAlert(window, 'approach');
      if (phase === 'open') await maybeAlert(window, 'open');
    },
    [maybeAlert],
  );

  const evaluate = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const signedIn = await getSessionAuthenticated();
      if (!signedIn) {
        armedKeyRef.current = null;
        await cancelBreakWindowNotifications();
        return;
      }
      const result = await fetchTimeClockStatus();
      if (!result.ok) return;
      const window = result.time_clock.break_window;
      if (window?.required && !permissionAskedRef.current) {
        permissionAskedRef.current = true;
        await requestShiftReminderNotificationPermission();
      }
      await arm(window, result.time_clock.is_on_break === true);
    } catch (error) {
      if (__DEV__) {
        console.warn('[BreakWindow] evaluate failed:', error);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [arm]);

  useEffect(() => {
    void evaluate();
    const interval = setInterval(() => {
      void evaluate();
    }, POLL_INTERVAL_MS);
    const onAppState = (next: AppStateStatus) => {
      appStateRef.current = next;
      if (next === 'active') void evaluate();
    };
    const appSub = AppState.addEventListener('change', onAppState);
    const clockSub = subscribeTimeClockChange(event => {
      void arm(event.timeClock.break_window, event.timeClock.is_on_break === true);
    });
    return () => {
      clearInterval(interval);
      appSub.remove();
      clockSub();
    };
  }, [arm, evaluate]);

  return (
    <SweetAlert
      visible={alert !== null}
      title={alert?.title ?? ''}
      message={alert?.message ?? ''}
      confirmText="Got it"
      cancelText="Dismiss"
      hideCancel
      variant="info"
      onConfirm={() => setAlert(null)}
      onClose={() => setAlert(null)}
    />
  );
}
