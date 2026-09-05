import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { SweetAlert } from './SweetAlert';
import {
  consumePendingAutoClockOutAlert,
  persistPendingAutoClockOutAlert,
} from '../services/autoClockOutAlertStorage';
import { refreshAndCacheAccountProfileFromApi } from '../services/accountProfileApi';
import { loadAccountProfile } from '../services/accountProfileStorage';
import { subscribeAssignmentChange } from '../services/assignmentEvents';
import { getSessionAuthenticated } from '../services/authSessionStorage';
import {
  hasAndroidForegroundOnly,
  hasWorkLocationPermission,
} from '../services/locationPermissions';
import {
  startNativeLocationMonitoring,
  stopNativeLocationMonitoring,
} from '../services/locationMonitorNative';
import {
  fetchTimeClockStatus,
  postAutoClockOut,
  resolveGeofenceRadiusM,
  resolveGeofenceSiteCoords,
  type TimeClockStatus,
} from '../services/timeClockApi';
import { notifyTimeClockChange, subscribeTimeClockChange } from '../services/timeClockEvents';
import {
  DEFAULT_GEOFENCE_RADIUS_M,
  GEOFENCE_POLL_INTERVAL_MS,
  isOutsideGeofence,
  type LatLng,
} from '../utils/geofence';

/** How often we re-hit `/me` for assignment coords (time-clock already covers punch state). */
const PROFILE_REFRESH_INTERVAL_MS = 60_000;
/** Server resync for clock-in/out changes — GPS watch handles exit checks locally. */
const CLOCK_RESYNC_INTERVAL_MS = 45_000;

let lastProfileRefreshAt = 0;

function assignedCoordsFromProfile(profile: Awaited<ReturnType<typeof loadAccountProfile>>): LatLng | null {
  const lat = Number(profile?.assignedWorkLocationLat);
  const lng = Number(profile?.assignedWorkLocationLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Prefer local assignment coords; refresh `/me` at most once per minute.
 * Hitting `/me` on every 10s resync starved other tab APIs on `artisan serve`.
 */
async function loadAssignedCoords(opts?: { forceProfileRefresh?: boolean }): Promise<LatLng | null> {
  const force = opts?.forceProfileRefresh === true;
  const due = force || Date.now() - lastProfileRefreshAt >= PROFILE_REFRESH_INTERVAL_MS;
  if (due) {
    lastProfileRefreshAt = Date.now();
    try {
      const api = await refreshAndCacheAccountProfileFromApi();
      if (api.ok) {
        return assignedCoordsFromProfile(api.profile);
      }
    } catch {
      /* fall through to local cache */
    }
  }
  return assignedCoordsFromProfile(await loadAccountProfile());
}

function siteCoordsForMonitoring(
  timeClock: TimeClockStatus,
  assigned: LatLng | null,
): LatLng | null {
  return resolveGeofenceSiteCoords(assigned, timeClock.open_session);
}

/**
 * Monitors GPS while clocked in and auto-clocks out as soon as the employee
 * is outside the live assigned work site (same rule as the Out of range badge).
 */
export function GeofenceAutoClockOutMonitor() {
  const [autoClockOutAlert, setAutoClockOutAlert] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const monitoringRef = useRef(false);
  const autoClockOutInFlightRef = useRef(false);
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

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    monitoringRef.current = false;
    void stopNativeLocationMonitoring();
  }, []);

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

      // Same rule as Dashboard "Out of range" badge.
      if (!isOutsideGeofence({ lat, lng }, siteCoords, radiusM, accuracyMeters)) {
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
          return;
        }

        await handleAutoClockOutSuccess(result.time_clock, result.message);
      } finally {
        autoClockOutInFlightRef.current = false;
      }
    },
    [clearWatch, handleAutoClockOutSuccess],
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
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
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

  const evaluateAgainstCurrentSite = useCallback(async () => {
    if (!clockStateRef.current.isClockedIn || !clockStateRef.current.siteCoords) {
      return;
    }
    try {
      const position = await readCurrentPosition();
      await handlePositionSample(
        position.lat,
        position.lng,
        position.accuracyMeters,
      );
    } catch {
      /* next poll / watch tick will retry */
    }
  }, [handlePositionSample, readCurrentPosition]);

  const beginLocationWatch = useCallback(
    async (timeClock: TimeClockStatus, siteCoords: LatLng) => {
      applyClockState(timeClock, siteCoords);

      if (monitoringRef.current) {
        await evaluateAgainstCurrentSite();
        return;
      }

      monitoringRef.current = true;
      await startNativeLocationMonitoring();
      await evaluateAgainstCurrentSite();

      if (!clockStateRef.current.isClockedIn) {
        return;
      }

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
          distanceFilter: 5,
          interval: 5000,
          fastestInterval: 3000,
          showsBackgroundLocationIndicator: true,
        },
      );

      pollTimerRef.current = setInterval(() => {
        void evaluateAgainstCurrentSite();
      }, GEOFENCE_POLL_INTERVAL_MS);
    },
    [applyClockState, evaluateAgainstCurrentSite, handlePositionSample],
  );

  const startMonitoring = useCallback(
    async (timeClock: TimeClockStatus, siteCoords: LatLng) => {
      applyClockState(timeClock, siteCoords);

      // Foreground exit checks should run even without "Allow all the time".
      // Background watch still needs full permission.
      const canBackground = await hasWorkLocationPermission();
      const canForeground = canBackground || (await hasAndroidForegroundOnly());

      if (!canForeground) {
        clearWatch();
        return;
      }

      if (monitoringRef.current || !canBackground) {
        // Update site + evaluate now (covers reassignment while Dashboard shows Out of range).
        await evaluateAgainstCurrentSite();
        if (!canBackground) {
          return;
        }
        if (monitoringRef.current) {
          return;
        }
      }

      await beginLocationWatch(timeClock, siteCoords);
    },
    [
      applyClockState,
      beginLocationWatch,
      clearWatch,
      evaluateAgainstCurrentSite,
    ],
  );

  const syncClockState = useCallback(async () => {
    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      clockStateRef.current.isClockedIn = false;
      clearWatch();
      return;
    }

    const [clockResult, assigned] = await Promise.all([
      fetchTimeClockStatus(),
      loadAssignedCoords(),
    ]);

    if (!clockResult.ok) {
      return;
    }

    const timeClock = clockResult.time_clock;
    const siteCoords = siteCoordsForMonitoring(timeClock, assigned);

    if (timeClock.is_clocked_in && siteCoords) {
      await startMonitoring(timeClock, siteCoords);
      return;
    }

    clockStateRef.current.isClockedIn = false;
    clearWatch();
  }, [clearWatch, startMonitoring]);

  useEffect(() => {
    void loadPendingAlert();
    void syncClockState();

    const unsubscribeClock = subscribeTimeClockChange((event) => {
      if (event.timeClock.is_clocked_in) {
        void (async () => {
          const assigned = await loadAssignedCoords({ forceProfileRefresh: true });
          const siteCoords = siteCoordsForMonitoring(event.timeClock, assigned);
          if (siteCoords) {
            await startMonitoring(event.timeClock, siteCoords);
          }
        })();
        return;
      }

      clockStateRef.current.isClockedIn = false;
      clearWatch();
    });

    // Assignment reassigned mid-shift — pick up new site and clock out if now outside.
    const unsubscribeAssignment = subscribeAssignmentChange((event) => {
      if (!clockStateRef.current.isClockedIn) return;
      const assigned = assignedCoordsFromProfile(event.profile);
      if (!assigned) return;
      clockStateRef.current.siteCoords = assigned;
      void evaluateAgainstCurrentSite();
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
    }, CLOCK_RESYNC_INTERVAL_MS);

    return () => {
      unsubscribeClock();
      unsubscribeAssignment();
      subscription.remove();
      clearInterval(resyncTimer);
      clearWatch();
    };
  }, [
    clearWatch,
    evaluateAgainstCurrentSite,
    loadPendingAlert,
    startMonitoring,
    syncClockState,
  ]);

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
