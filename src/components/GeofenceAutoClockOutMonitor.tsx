import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { SweetAlert } from './SweetAlert';
import {
  consumePendingAutoClockOutAlert,
  persistPendingAutoClockOutAlert,
} from '../services/autoClockOutAlertStorage';
import { loadAccountProfile } from '../services/accountProfileStorage';
import { getSessionAuthenticated } from '../services/authSessionStorage';
import {
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
} from '../services/locationPermissions';
import {
  startNativeLocationMonitoring,
  stopNativeLocationMonitoring,
} from '../services/locationMonitorNative';
import {
  fetchTimeClockStatus,
  postAutoClockOut,
  resolveGeofenceRadiusM,
  type TimeClockStatus,
} from '../services/timeClockApi';
import { notifyTimeClockChange, subscribeTimeClockChange } from '../services/timeClockEvents';
import {
  DEFAULT_GEOFENCE_RADIUS_M,
  GEOFENCE_EXIT_CONFIRM_READINGS,
  GEOFENCE_EXIT_MIN_DURATION_MS,
  GEOFENCE_POLL_INTERVAL_MS,
  isOutsideGeofence,
  type LatLng,
} from '../utils/geofence';

function assignedCoordsFromProfile(profile: Awaited<ReturnType<typeof loadAccountProfile>>): LatLng | null {
  const lat = Number(profile?.assignedWorkLocationLat);
  const lng = Number(profile?.assignedWorkLocationLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function siteCoordsFromTimeClock(timeClock: TimeClockStatus, fallback: LatLng | null): LatLng | null {
  const session = timeClock.open_session;
  const lat = session?.geofence_latitude;
  const lng = session?.geofence_longitude;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return fallback;
}

/**
 * Monitors GPS while the employee is clocked in and auto-clocks out when they leave
 * the assigned work site geofence (300 m by default), including when the app is backgrounded.
 */
export function GeofenceAutoClockOutMonitor() {
  const [autoClockOutAlert, setAutoClockOutAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const monitoringRef = useRef(false);
  const autoClockOutInFlightRef = useRef(false);
  const outOfZoneStreakRef = useRef(0);
  const outsideSinceMsRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockStateRef = useRef<{
    isClockedIn: boolean;
    siteCoords: LatLng | null;
    radiusM: number;
  }>({
    isClockedIn: false,
    siteCoords: null,
    radiusM: DEFAULT_GEOFENCE_RADIUS_M,
  });

  const showAutoClockOutAlert = useCallback((title: string, message: string) => {
    setAutoClockOutAlert({ title, message });
  }, []);

  const loadPendingAlert = useCallback(async () => {
    const pending = await consumePendingAutoClockOutAlert();
    if (pending) {
      showAutoClockOutAlert(pending.title, pending.message);
    }
  }, [showAutoClockOutAlert]);

  const resetOutsideTracking = useCallback(() => {
    outOfZoneStreakRef.current = 0;
    outsideSinceMsRef.current = null;
  }, []);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    resetOutsideTracking();
    monitoringRef.current = false;
    void stopNativeLocationMonitoring();
  }, [resetOutsideTracking]);

  const handleAutoClockOutSuccess = useCallback(
    async (timeClock: TimeClockStatus, message: string) => {
      const alert = {
        title: 'Automatically clocked out',
        message:
          message || 'You left your assigned work site. Your shift was ended automatically.',
      };

      clockStateRef.current.isClockedIn = false;
      clearWatch();

      notifyTimeClockChange({
        timeClock,
        message: alert.message,
        source: 'auto_geofence_exit',
      });

      if (AppState.currentState === 'active') {
        showAutoClockOutAlert(alert.title, alert.message);
      } else {
        await persistPendingAutoClockOutAlert(alert);
      }
    },
    [clearWatch, showAutoClockOutAlert],
  );

  const handlePositionSample = useCallback(
    async (lat: number, lng: number, accuracyMeters: number | null) => {
      const { isClockedIn, siteCoords, radiusM } = clockStateRef.current;
      if (!isClockedIn || !siteCoords || autoClockOutInFlightRef.current) {
        return;
      }

      const outside = isOutsideGeofence({ lat, lng }, siteCoords, radiusM, accuracyMeters);

      if (!outside) {
        resetOutsideTracking();
        return;
      }

      const now = Date.now();
      if (outsideSinceMsRef.current == null) {
        outsideSinceMsRef.current = now;
      }
      outOfZoneStreakRef.current += 1;

      const outsideForMs = now - (outsideSinceMsRef.current ?? now);
      if (
        outOfZoneStreakRef.current < GEOFENCE_EXIT_CONFIRM_READINGS ||
        outsideForMs < GEOFENCE_EXIT_MIN_DURATION_MS
      ) {
        return;
      }

      autoClockOutInFlightRef.current = true;
      try {
        const result = await postAutoClockOut({
          latitude: lat,
          longitude: lng,
          accuracy_meters: accuracyMeters,
        });

        if (!result.ok) {
          if (result.code === 'not_clocked_in') {
            clockStateRef.current.isClockedIn = false;
            clearWatch();
          }
          // still_within_geofence / outside hysteresis: keep monitoring, reset streak
          resetOutsideTracking();
          return;
        }

        await handleAutoClockOutSuccess(result.time_clock, result.message);
      } finally {
        autoClockOutInFlightRef.current = false;
      }
    },
    [clearWatch, handleAutoClockOutSuccess, resetOutsideTracking],
  );

  const readCurrentPosition = useCallback(async () => {
    return new Promise<{ lat: number; lng: number; accuracyMeters: number | null }>(
      (resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracyMeters: position.coords.accuracy ?? null,
            });
          },
          (error) => reject(new Error(error.message || 'Unable to get location')),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
        );
      },
    );
  }, []);

  const applyClockState = useCallback((timeClock: TimeClockStatus, siteCoords: LatLng) => {
    clockStateRef.current = {
      isClockedIn: true,
      siteCoords,
      radiusM: resolveGeofenceRadiusM(timeClock),
    };
  }, []);

  const startMonitoring = useCallback(
    async (timeClock: TimeClockStatus, siteCoords: LatLng) => {
      const backgroundGranted = await requestBackgroundLocationPermission();
      const foregroundGranted =
        backgroundGranted || (await requestForegroundLocationPermission());
      if (!foregroundGranted) return;

      applyClockState(timeClock, siteCoords);

      if (monitoringRef.current) {
        return;
      }

      monitoringRef.current = true;
      resetOutsideTracking();

      await startNativeLocationMonitoring();

      watchIdRef.current = Geolocation.watchPosition(
        (position) => {
          void handlePositionSample(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.accuracy ?? null,
          );
        },
        () => {
          /* GPS errors are retried on the poll interval */
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 25,
          interval: 20000,
          fastestInterval: 15000,
          showsBackgroundLocationIndicator: true,
        },
      );

      pollTimerRef.current = setInterval(() => {
        void (async () => {
          if (!clockStateRef.current.isClockedIn) return;
          try {
            const position = await readCurrentPosition();
            await handlePositionSample(
              position.lat,
              position.lng,
              position.accuracyMeters,
            );
          } catch {
            /* ignore transient GPS failures */
          }
        })();
      }, GEOFENCE_POLL_INTERVAL_MS);
    },
    [applyClockState, handlePositionSample, readCurrentPosition, resetOutsideTracking],
  );

  const syncClockState = useCallback(async () => {
    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      clockStateRef.current.isClockedIn = false;
      clearWatch();
      return;
    }

    const [clockResult, profile] = await Promise.all([
      fetchTimeClockStatus(),
      loadAccountProfile(),
    ]);

    if (!clockResult.ok) {
      return;
    }

    const timeClock = clockResult.time_clock;
    const siteCoords = siteCoordsFromTimeClock(
      timeClock,
      assignedCoordsFromProfile(profile),
    );

    if (timeClock.is_clocked_in && siteCoords) {
      applyClockState(timeClock, siteCoords);
      await startMonitoring(timeClock, siteCoords);
      return;
    }

    clockStateRef.current.isClockedIn = false;
    clearWatch();
  }, [applyClockState, clearWatch, startMonitoring]);

  useEffect(() => {
    void loadPendingAlert();
    void syncClockState();

    const unsubscribe = subscribeTimeClockChange((event) => {
      if (event.timeClock.is_clocked_in) {
        void (async () => {
          const profile = await loadAccountProfile();
          const siteCoords = siteCoordsFromTimeClock(
            event.timeClock,
            assignedCoordsFromProfile(profile),
          );
          if (siteCoords) {
            await startMonitoring(event.timeClock, siteCoords);
          }
        })();
        return;
      }

      clockStateRef.current.isClockedIn = false;
      clearWatch();
    });

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void loadPendingAlert();
        void syncClockState();
      }
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    const resyncTimer = setInterval(() => {
      void syncClockState();
    }, GEOFENCE_POLL_INTERVAL_MS);

    return () => {
      unsubscribe();
      subscription.remove();
      clearInterval(resyncTimer);
      clearWatch();
    };
  }, [clearWatch, loadPendingAlert, startMonitoring, syncClockState]);

  return (
    <SweetAlert
      visible={autoClockOutAlert !== null}
      title={autoClockOutAlert?.title ?? ''}
      message={autoClockOutAlert?.message ?? ''}
      confirmText="OK"
      cancelText="Cancel"
      hideCancel
      variant="warning"
      onClose={() => setAutoClockOutAlert(null)}
      onConfirm={() => setAutoClockOutAlert(null)}
    />
  );
}
