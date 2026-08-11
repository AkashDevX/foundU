import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Pressable,
  Platform,
  Linking,
  ScrollView,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../components/SweetAlert';
import type { SweetAlertProps } from '../../components/SweetAlert';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { dashboardStyles } from '../../styles/styles';
import { colors, spacing } from '../../theme/theme';
import { API_BASE_URL } from '../../config/api';
import { loadOpenStreetMapPreview, type MapPreviewResult } from '../../config/maps';
import { getDisplayProfilePhotoUri, loadAccountProfile, welcomeDisplayName } from '../../services/accountProfileStorage';
import { refreshAndCacheAccountProfileFromApi } from '../../services/accountProfileApi';
import { subscribeAssignmentChange } from '../../services/assignmentEvents';
import { getSessionAuthenticated } from '../../services/authSessionStorage';
import {
  hasAndroidForegroundOnly,
  hasWorkLocationPermission,
  requestWorkLocationPermission,
  resetWorkLocationPermissionGate,
  WORK_LOCATION_DENIED_MESSAGE,
} from '../../services/locationPermissions';
import {
  fetchTimeClockStatus,
  postAutoClockOut,
  postBreakIn,
  postBreakOut,
  postClockIn,
  postClockOut,
  resolveGeofenceRadiusM,
  resolveGeofenceSiteCoords,
  type TimeClockStatus,
} from '../../services/timeClockApi';
import { notifyTimeClockChange, subscribeTimeClockChange } from '../../services/timeClockEvents';
import { formatInstantInAppTimezone } from '../../utils/formatDateTime';
import {
  DEFAULT_GEOFENCE_RADIUS_M,
  formatZoneBadgeLabel,
  GEOFENCE_POLL_INTERVAL_MS,
  haversineDistanceM,
  isInsideGeofence,
} from '../../utils/geofence';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';

/** True when an API failure looks like network / unreachable server (not a business rule). */
function isConnectivityOrServerFailure(message: string): boolean {
  return /could not reach|timed out|network request failed|failed to fetch|ECONNREFUSED|ENOTFOUND|unreachable|unable to connect|no (internet|network)|offline/i.test(
    message,
  );
}

function connectivityAlertMessage(raw: string): string {
  const base =
    'We could not reach the CruLynk server. Check your internet connection and try again.';
  if (__DEV__) {
    return `${base}\n\n${raw}\n\nAPI: ${API_BASE_URL}`;
  }
  return base;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'CruLynkApp/1.0' } }
    );
    const data = await res.json();
    return data?.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

/** Shorter label for the heading (area / suburb) — full address shown below */
function shortLocationLabel(displayName: string): string {
  const parts = displayName.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 2) return displayName;
  return parts.slice(0, 3).join(', ');
}

function openMapsAt(lat: number, lng: number): void {
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  Linking.openURL(osm).catch(() => {
    const q = `${lat},${lng}`;
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
  });
}

function readCurrentPosition(): Promise<{ lat: number; lng: number; accuracyMeters: number | null }> {
  return new Promise((resolve, reject) => {
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
  });
}

function assignedCoordsFromProfile(profile: UserProfileSnapshot | null | undefined) {
  const lat = Number(profile?.assignedWorkLocationLat);
  const lng = Number(profile?.assignedWorkLocationLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function clockInFailureAlert(
  code: string | undefined,
  message: string,
): { title: string; message: string; variant: NonNullable<SweetAlertProps['variant']> } {
  if (code === 'no_scheduled_shift_today') {
    return {
      title: 'No shift today',
      message: "You don't have any shifts today.",
      variant: 'info',
    };
  }
  if (code === 'outside_geofence') {
    return {
      title: 'Outside work site',
      message,
      variant: 'warning',
    };
  }
  return {
    title: 'Clock in failed',
    message,
    variant: 'error',
  };
}

function shiftIssueAlert(
  shiftIssue: string | null | undefined,
): { title: string; message: string; variant: NonNullable<SweetAlertProps['variant']> } | null {
  if (shiftIssue === 'no_scheduled_shift_today') {
    return {
      title: 'No shift today',
      message: "You don't have any shifts today.",
      variant: 'info',
    };
  }
  return null;
}

/**
 * Text for the shift pill under the clock button: while clocked in it shows when the shift ends,
 * otherwise when it starts; falls back to a clear empty state when there's no shift today.
 */
function shiftPillLabel(
  isClockedIn: boolean,
  status: TimeClockStatus | null,
  fallbackStart: string | null | undefined,
): string {
  const shift = status?.scheduled_shift;
  if (isClockedIn && shift?.end_label) {
    return `Shift ends at ${shift.end_label}`;
  }
  if (shift?.start_label) {
    return `Shift starts at ${shift.start_label}`;
  }
  if (status?.shift_issue === 'no_scheduled_shift_today') {
    return 'No shifts assigned today.';
  }
  if (fallbackStart) {
    return `Shift starts at ${fallbackStart}`;
  }
  if (status) {
    return 'No shifts assigned today.';
  }
  return 'Checking today’s shift…';
}

export function DashboardScreen({ isTabActive = true }: { isTabActive?: boolean }) {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockPunching, setClockPunching] = useState(false);
  const [breakPunching, setBreakPunching] = useState(false);
  const [timeClockStatus, setTimeClockStatus] = useState<TimeClockStatus | null>(null);
  const [geofenceRadiusM, setGeofenceRadiusM] = useState(DEFAULT_GEOFENCE_RADIUS_M);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
    accuracyMeters?: number | null;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  /** Clock-in is blocked until Allow all the time (background) is granted. */
  const [workLocationReady, setWorkLocationReady] = useState(false);
  const workPermissionPromptInFlight = useRef(false);
  const didInitialLocationPromptRef = useRef(false);
  const autoClockOutInFlightRef = useRef(false);
  const autoClockOutAttemptedSiteRef = useRef<string | null>(null);
  const [mapPreview, setMapPreview] = useState<MapPreviewResult | null>(null);
  const [mapPreviewLoading, setMapPreviewLoading] = useState(false);
  const mapLoadSeq = useRef(0);
  /** Avoid re-prompting the same outage every time the Dashboard tab remounts/activates. */
  const connectivityAlertShownRef = useRef(false);
  const [welcomeName, setWelcomeName] = useState('there');
  const [assignmentProfile, setAssignmentProfile] = useState<UserProfileSnapshot | null>(null);
  const [clockAlert, setClockAlert] = useState<{
    title: string;
    message: string;
    variant: NonNullable<SweetAlertProps['variant']>;
  } | null>(null);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [clockOutComment, setClockOutComment] = useState('');
  const isOnBreak = timeClockStatus?.is_on_break === true;
  const punchBusy = clockPunching || breakPunching;

  const showClockAlert = useCallback(
    (title: string, message: string, variant: NonNullable<SweetAlertProps['variant']>) => {
      setClockAlert({ title, message, variant });
    },
    [],
  );

  const dismissClockAlert = useCallback(() => setClockAlert(null), []);

  /** Surfaces network / unreachable-server failures on Dashboard (open + pull-to-refresh). */
  const showConnectivityAlert = useCallback(
    (message: string, opts?: { force?: boolean }) => {
      if (!isConnectivityOrServerFailure(message)) {
        return;
      }
      if (!opts?.force && connectivityAlertShownRef.current) {
        return;
      }
      connectivityAlertShownRef.current = true;
      showClockAlert("Can't reach server", connectivityAlertMessage(message), 'error');
    },
    [showClockAlert],
  );

  const styles = dashboardStyles;
  const scrollBottomPad = floatingTabBarClearance(insets.bottom) + spacing.lg;

  const locationLabel = useMemo(
    () => (locationAddress ? shortLocationLabel(locationAddress) : null),
    [locationAddress],
  );

  const assignedCoords = useMemo(
    () => assignedCoordsFromProfile(assignmentProfile),
    [assignmentProfile],
  );

  const geofenceSiteCoords = useMemo(() => {
    return resolveGeofenceSiteCoords(
      assignedCoords,
      timeClockStatus?.open_session,
    );
  }, [assignedCoords, timeClockStatus?.open_session]);

  const mapTargetCoords = geofenceSiteCoords ?? userCoords;
  const mapTargetAddress = assignmentProfile?.assignedWorkLocationAddress ?? locationAddress;

  const distanceToSiteM = useMemo(() => {
    if (!userCoords || !geofenceSiteCoords) return null;
    return haversineDistanceM(
      userCoords.lat,
      userCoords.lng,
      geofenceSiteCoords.lat,
      geofenceSiteCoords.lng,
    );
  }, [userCoords, geofenceSiteCoords]);

  const isInZone = useMemo(() => {
    if (!userCoords || !geofenceSiteCoords) return null;
    return isInsideGeofence(
      { lat: userCoords.lat, lng: userCoords.lng },
      geofenceSiteCoords,
      geofenceRadiusM,
      userCoords.accuracyMeters,
    );
  }, [userCoords, geofenceSiteCoords, geofenceRadiusM]);

  const zoneBadgeLabel = useMemo(() => {
    if (distanceToSiteM === null) return null;
    return formatZoneBadgeLabel(
      distanceToSiteM,
      geofenceRadiusM,
      userCoords?.accuracyMeters,
    );
  }, [distanceToSiteM, geofenceRadiusM, userCoords?.accuracyMeters]);

  const siteLat = geofenceSiteCoords?.lat ?? null;
  const siteLng = geofenceSiteCoords?.lng ?? null;
  const userLat = userCoords?.lat ?? null;
  const userLng = userCoords?.lng ?? null;

  // When Out of range while clocked in, auto clock-out once per site.
  // Primitive lat/lng deps so the assignment poll cannot cancel the request.
  useEffect(() => {
    if (!isClockedIn) {
      autoClockOutAttemptedSiteRef.current = null;
      return;
    }
    if (isInZone !== false) return;
    if (userLat == null || userLng == null || siteLat == null || siteLng == null) return;
    if (punchBusy) return;

    const siteKey = `${siteLat.toFixed(5)},${siteLng.toFixed(5)}`;
    if (autoClockOutAttemptedSiteRef.current === siteKey) return;
    if (autoClockOutInFlightRef.current) return;

    autoClockOutAttemptedSiteRef.current = siteKey;
    autoClockOutInFlightRef.current = true;
    const lat = userLat;
    const lng = userLng;
    const accuracy = userCoords?.accuracyMeters ?? null;

    void (async () => {
      try {
        const result = await postAutoClockOut({
          latitude: lat,
          longitude: lng,
          accuracy_meters: accuracy,
        });

        if (!result.ok) {
          // Allow another attempt on the next poll / location update.
          autoClockOutAttemptedSiteRef.current = null;
          if (result.code === 'not_clocked_in') {
            setIsClockedIn(false);
            return;
          }
          showClockAlert(
            'Auto clock-out failed',
            result.message || 'Could not end your shift automatically. Please clock out manually.',
            'error',
          );
          return;
        }

        setTimeClockStatus(result.time_clock);
        setIsClockedIn(false);
        setGeofenceRadiusM(resolveGeofenceRadiusM(result.time_clock));
        notifyTimeClockChange({
          timeClock: result.time_clock,
          message: result.message,
          source: 'auto_geofence_exit',
        });
        showClockAlert(
          'Automatically clocked out',
          result.message ||
            'You left your assigned work site. Your shift was ended automatically.',
          'warning',
        );
      } catch (err: unknown) {
        autoClockOutAttemptedSiteRef.current = null;
        const message = err instanceof Error ? err.message : 'Auto clock-out failed.';
        showClockAlert('Auto clock-out failed', message, 'error');
      } finally {
        autoClockOutInFlightRef.current = false;
      }
    })();
  }, [
    isClockedIn,
    isInZone,
    punchBusy,
    showClockAlert,
    siteLat,
    siteLng,
    userCoords?.accuracyMeters,
    userLat,
    userLng,
  ]);

  const markWorkLocationDenied = useCallback(() => {
    setWorkLocationReady(false);
    setLocationError('permission_denied');
    setUserCoords(null);
    setLocationAddress(null);
    setLocationLoading(false);
  }, []);

  const ensureWorkLocationAccess = useCallback(
    async (opts?: { forcePrompt?: boolean }): Promise<boolean> => {
      const already = await hasWorkLocationPermission();
      if (already) {
        setWorkLocationReady(true);
        setLocationError(null);
        return true;
      }

      setWorkLocationReady(false);

      // Passive checks (refresh / AppState) must never open disclosure or system UI.
      if (!opts?.forcePrompt) {
        return false;
      }

      if (workPermissionPromptInFlight.current) {
        resetWorkLocationPermissionGate();
        workPermissionPromptInFlight.current = false;
      }

      workPermissionPromptInFlight.current = true;
      try {
        // First-time / forced prompt uses the same rules as Enable location.
        const foregroundReady = await hasAndroidForegroundOnly();
        const result = await requestWorkLocationPermission(
          foregroundReady ? { backgroundOnly: true } : undefined,
        );
        if (result === 'granted') {
          setWorkLocationReady(true);
          setLocationError(null);
          return true;
        }
        markWorkLocationDenied();
        return false;
      } finally {
        workPermissionPromptInFlight.current = false;
        resetWorkLocationPermissionGate();
      }
    },
    [markWorkLocationDenied],
  );

  const refreshDeviceLocation = useCallback(
    async (opts?: {
      manageLoading?: boolean;
      forcePermissionPrompt?: boolean;
    }) => {
      const manageLoading = opts?.manageLoading !== false;
      const forcePrompt = opts?.forcePermissionPrompt === true;

      if (manageLoading) {
        setLocationLoading(true);
        // Don't wipe a permission_denied error unless we're about to re-prompt.
        if (forcePrompt || locationError !== 'permission_denied') {
          setLocationError(null);
        }
      }
      try {
        const ready = await ensureWorkLocationAccess({ forcePrompt });
        if (!ready) {
          setWorkLocationReady(false);
          setLocationError('permission_denied');
          setUserCoords(null);
          setLocationAddress(null);
          return;
        }

        const position = await readCurrentPosition();
        setUserCoords({
          lat: position.lat,
          lng: position.lng,
          accuracyMeters: position.accuracyMeters,
        });
        const address = await reverseGeocode(position.lat, position.lng);
        setLocationAddress(address);
        setLocationError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Location failed';
        setLocationError(message);
        setUserCoords(null);
        setLocationAddress(null);
      } finally {
        if (manageLoading) {
          setLocationLoading(false);
        }
      }
    },
    [ensureWorkLocationAccess, locationError],
  );

  const requestWorkLocationForAction = useCallback(async (): Promise<boolean> => {
    if (await hasWorkLocationPermission()) {
      setWorkLocationReady(true);
      setLocationError(null);
      return true;
    }

    // Always allow Enable location / clock-in to start a fresh attempt.
    resetWorkLocationPermissionGate();
    workPermissionPromptInFlight.current = false;

    workPermissionPromptInFlight.current = true;
    try {
      const foregroundReady = await hasAndroidForegroundOnly();
      const result = await requestWorkLocationPermission(
        foregroundReady ? { backgroundOnly: true } : undefined,
      );
      if (result === 'granted') {
        setWorkLocationReady(true);
        setLocationError(null);
        return true;
      }
      markWorkLocationDenied();
      return false;
    } finally {
      workPermissionPromptInFlight.current = false;
      resetWorkLocationPermissionGate();
    }
  }, [markWorkLocationDenied]);

  /** Enable location: every tap starts a fresh Allow-all-the-time attempt. */
  const retryLocationPermission = useCallback(() => {
    void (async () => {
      // Always clear stuck gates before a user-initiated retry.
      resetWorkLocationPermissionGate();
      workPermissionPromptInFlight.current = false;
      setLocationLoading(true);
      setLocationError('permission_denied');

      const ready = await requestWorkLocationForAction();
      if (!ready) {
        setLocationLoading(false);
        setLocationError('permission_denied');
        return;
      }
      try {
        const position = await readCurrentPosition();
        setUserCoords({
          lat: position.lat,
          lng: position.lng,
          accuracyMeters: position.accuracyMeters,
        });
        const address = await reverseGeocode(position.lat, position.lng);
        setLocationAddress(address);
        setLocationError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Location failed';
        setLocationError(message);
      } finally {
        setLocationLoading(false);
      }
    })();
  }, [requestWorkLocationForAction]);

  const refreshDashboardData = useCallback(
    async (opts?: { pullToRefresh?: boolean }) => {
      const pullToRefresh = opts?.pullToRefresh === true;
      if (pullToRefresh) {
        if (refreshing) return;
        setRefreshing(true);
      } else if (locationLoading) {
        return;
      } else {
        setLocationLoading(true);
      }
      // Never clear permission_denied on refresh — that was re-triggering a broken prompt flow.
      if (locationError !== 'permission_denied') {
        setLocationError(null);
      }

      try {
        const signedIn = await getSessionAuthenticated();
        if (signedIn) {
          let connectivityError: string | null = null;

          const api = await refreshAndCacheAccountProfileFromApi();
          if (api.ok) {
            setAssignmentProfile(api.profile);
            setWelcomeName(welcomeDisplayName(api.profile));
          } else if (isConnectivityOrServerFailure(api.message)) {
            connectivityError = api.message;
          }

          const clock = await fetchTimeClockStatus();
          if (clock.ok) {
            setTimeClockStatus(clock.time_clock);
            setIsClockedIn(clock.time_clock.is_clocked_in);
            setGeofenceRadiusM(resolveGeofenceRadiusM(clock.time_clock));
            notifyTimeClockChange({
              timeClock: clock.time_clock,
              source: 'refresh',
            });
          } else if (!connectivityError && isConnectivityOrServerFailure(clock.message)) {
            connectivityError = clock.message;
          }

          if (connectivityError) {
            showConnectivityAlert(connectivityError, { force: pullToRefresh });
          } else if (api.ok || clock.ok) {
            connectivityAlertShownRef.current = false;
          }
        } else {
          const local = await loadAccountProfile();
          setAssignmentProfile(local);
          setWelcomeName(welcomeDisplayName(local));
        }

        await refreshDeviceLocation({ manageLoading: false });
      } finally {
        if (pullToRefresh) {
          setRefreshing(false);
        } else {
          setLocationLoading(false);
        }
      }
    },
    [locationError, locationLoading, refreshDeviceLocation, refreshing, showConnectivityAlert],
  );

  const handleUpdateLocation = useCallback(() => {
    void refreshDashboardData();
  }, [refreshDashboardData]);

  const handlePullToRefresh = useCallback(() => {
    void refreshDashboardData({ pullToRefresh: true });
  }, [refreshDashboardData]);

  useEffect(() => {
    if (!isTabActive) return;
    // One automatic prompt per Dashboard visit / fresh session.
    if (didInitialLocationPromptRef.current) return;
    didInitialLocationPromptRef.current = true;
    void refreshDeviceLocation({ forcePermissionPrompt: true });
  }, [isTabActive, refreshDeviceLocation]);

  // Returning from Android Allow all the time screen — unlock if granted.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      void (async () => {
        if (await hasWorkLocationPermission()) {
          setWorkLocationReady(true);
          setLocationError(null);
          if (!userCoords) {
            void refreshDeviceLocation({ forcePermissionPrompt: false });
          }
        }
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [refreshDeviceLocation, userCoords]);

  useEffect(() => {
    if (!isTabActive) return;
    void (async () => {
      const local = await loadAccountProfile();
      setWelcomeName(welcomeDisplayName(local));
      setAssignmentProfile(local);
      const signedIn = await getSessionAuthenticated();
      if (!signedIn) {
        setIsClockedIn(false);
        setTimeClockStatus(null);
        return;
      }

      let connectivityError: string | null = null;

      const api = await refreshAndCacheAccountProfileFromApi();
      if (api.ok) {
        setAssignmentProfile(api.profile);
        setWelcomeName(welcomeDisplayName(api.profile));
      } else if (isConnectivityOrServerFailure(api.message)) {
        connectivityError = api.message;
      }

      const clock = await fetchTimeClockStatus();
      if (clock.ok) {
        setTimeClockStatus(clock.time_clock);
        setIsClockedIn(clock.time_clock.is_clocked_in);
        setGeofenceRadiusM(resolveGeofenceRadiusM(clock.time_clock));
      } else if (!connectivityError && isConnectivityOrServerFailure(clock.message)) {
        connectivityError = clock.message;
      }

      if (connectivityError) {
        showConnectivityAlert(connectivityError);
      } else if (api.ok || clock.ok) {
        connectivityAlertShownRef.current = false;
      }
    })();
  }, [isTabActive, showConnectivityAlert]);

  useEffect(() => {
    return subscribeTimeClockChange((event) => {
      setTimeClockStatus(event.timeClock);
      setIsClockedIn(event.timeClock.is_clocked_in);
      setGeofenceRadiusM(resolveGeofenceRadiusM(event.timeClock));
    });
  }, []);

  // Keep assigned work location / zone badge live when admin reassigns mid-shift.
  useEffect(() => {
    return subscribeAssignmentChange((event) => {
      setAssignmentProfile(event.profile);
      setWelcomeName(welcomeDisplayName(event.profile));
    });
  }, []);

  // While clocked in on Dashboard, poll /me + time-clock so reassignment shows
  // Out of range and the monitor can auto clock-out without pull-to-refresh.
  useEffect(() => {
    if (!isTabActive || !isClockedIn) return undefined;

    let cancelled = false;
    const syncAssignment = async () => {
      try {
        const api = await refreshAndCacheAccountProfileFromApi();
        if (cancelled || !api.ok) return;
        setAssignmentProfile((prev) => {
          const next = api.profile;
          if (
            prev &&
            prev.assignedWorkLocationLat === next.assignedWorkLocationLat &&
            prev.assignedWorkLocationLng === next.assignedWorkLocationLng &&
            prev.assignedWorkLocationName === next.assignedWorkLocationName &&
            prev.assignedWorkLocationAddress === next.assignedWorkLocationAddress
          ) {
            return prev;
          }
          return next;
        });
        setWelcomeName(welcomeDisplayName(api.profile));

        const clock = await fetchTimeClockStatus();
        if (cancelled || !clock.ok) return;
        setTimeClockStatus(clock.time_clock);
        setIsClockedIn(clock.time_clock.is_clocked_in);
        setGeofenceRadiusM(resolveGeofenceRadiusM(clock.time_clock));
        notifyTimeClockChange({
          timeClock: clock.time_clock,
          source: 'refresh',
        });
      } catch {
        /* ignore transient sync failures */
      }
    };

    void syncAssignment();
    const timer = setInterval(() => {
      void syncAssignment();
    }, GEOFENCE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isTabActive, isClockedIn]);

  useEffect(() => {
    if (!isTabActive || !mapTargetCoords || locationError || locationLoading) {
      return;
    }

    const seq = ++mapLoadSeq.current;
    setMapPreviewLoading(true);
    setMapPreview(null);

    loadOpenStreetMapPreview(mapTargetCoords.lat, mapTargetCoords.lng)
      .then((result) => {
        if (seq !== mapLoadSeq.current) return;
        setMapPreview(result);
      })
      .finally(() => {
        if (seq !== mapLoadSeq.current) return;
        setMapPreviewLoading(false);
      });
  }, [isTabActive, mapTargetCoords, locationError, locationLoading]);

  const handleClockPunch = async () => {
    if (punchBusy) return;

    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      showClockAlert(
        'Sign in required',
        'Please sign in before using the time clock.',
        'info',
      );
      return;
    }

    // Clock-in / clock-out require Allow all the time before anything else.
    const ready = workLocationReady
      ? await hasWorkLocationPermission()
      : await requestWorkLocationForAction();
    if (!ready) {
      setWorkLocationReady(false);
      showClockAlert('Location required', WORK_LOCATION_DENIED_MESSAGE, 'warning');
      return;
    }
    setWorkLocationReady(true);

    if (isClockedIn) {
      setClockOutComment('');
      setShowClockOutModal(true);
      return;
    }

    if (timeClockStatus && !timeClockStatus.can_clock_in) {
      const shiftAlert = shiftIssueAlert(timeClockStatus.shift_issue);
      if (shiftAlert) {
        showClockAlert(shiftAlert.title, shiftAlert.message, shiftAlert.variant);
        return;
      }
      if (timeClockStatus.assignment_not_ready_reason === 'no_work_location_assigned') {
        showClockAlert(
          'No work site assigned',
          'Your administrator must assign a work location before you can clock in.',
          'info',
        );
      } else if (timeClockStatus.assignment_not_ready_reason === 'work_location_missing_coordinates') {
        showClockAlert(
          'Work site not configured',
          'Your assigned work location needs map coordinates. Contact your administrator.',
          'info',
        );
      } else {
        showClockAlert('Cannot clock in', 'Clock in is not available right now.', 'warning');
      }
      return;
    }

    await performClockIn();
  };

  const performClockIn = async () => {
    setClockPunching(true);
    try {
      const ready = await requestWorkLocationForAction();
      if (!ready) {
        showClockAlert('Location required', WORK_LOCATION_DENIED_MESSAGE, 'warning');
        return;
      }

      const position = await readCurrentPosition();
      setUserCoords({
        lat: position.lat,
        lng: position.lng,
        accuracyMeters: position.accuracyMeters,
      });
      const address = await reverseGeocode(position.lat, position.lng);
      setLocationAddress(address);

      const coords = {
        latitude: position.lat,
        longitude: position.lng,
        accuracy_meters: position.accuracyMeters,
      };

      const clockResult = await postClockIn(coords);
      if (!clockResult.ok) {
        const alert = clockInFailureAlert(clockResult.code, clockResult.message);
        showClockAlert(alert.title, alert.message, alert.variant);
        return;
      }

      setIsClockedIn(clockResult.time_clock.is_clocked_in);
      setTimeClockStatus(clockResult.time_clock);
      setGeofenceRadiusM(resolveGeofenceRadiusM(clockResult.time_clock));
      notifyTimeClockChange({
        timeClock: clockResult.time_clock,
        message: clockResult.message,
        source: 'manual',
      });
      showClockAlert('Clocked in', clockResult.message, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not read GPS location.';
      showClockAlert('Location error', message, 'error');
    } finally {
      setClockPunching(false);
    }
  };

  const performClockOut = async () => {
    setShowClockOutModal(false);
    setClockPunching(true);
    try {
      const ready = await requestWorkLocationForAction();
      if (!ready) {
        showClockAlert('Location required', WORK_LOCATION_DENIED_MESSAGE, 'warning');
        return;
      }

      const position = await readCurrentPosition();
      setUserCoords({
        lat: position.lat,
        lng: position.lng,
        accuracyMeters: position.accuracyMeters,
      });
      const address = await reverseGeocode(position.lat, position.lng);
      setLocationAddress(address);

      const coords = {
        latitude: position.lat,
        longitude: position.lng,
        accuracy_meters: position.accuracyMeters,
      };

      const trimmedComment = clockOutComment.trim();
      const clockResult = await postClockOut(coords, trimmedComment || undefined);
      if (!clockResult.ok) {
        showClockAlert('Clock out failed', clockResult.message, 'error');
        return;
      }

      setClockOutComment('');
      setIsClockedIn(clockResult.time_clock.is_clocked_in);
      setTimeClockStatus(clockResult.time_clock);
      setGeofenceRadiusM(resolveGeofenceRadiusM(clockResult.time_clock));
      notifyTimeClockChange({
        timeClock: clockResult.time_clock,
        message: clockResult.message,
        source: 'manual',
      });
      showClockAlert('Clocked out', clockResult.message, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not read GPS location.';
      showClockAlert('Location error', message, 'error');
    } finally {
      setClockPunching(false);
    }
  };

  const handleBreakPunch = async () => {
    if (clockPunching || breakPunching || !isClockedIn) return;

    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      showClockAlert(
        'Sign in required',
        'Please sign in before using the time clock.',
        'info',
      );
      return;
    }

    const onBreak = timeClockStatus?.is_on_break === true;
    setBreakPunching(true);
    try {
      const ready = await requestWorkLocationForAction();
      if (!ready) {
        showClockAlert('Location required', WORK_LOCATION_DENIED_MESSAGE, 'warning');
        return;
      }

      const position = await readCurrentPosition();
      setUserCoords({
        lat: position.lat,
        lng: position.lng,
        accuracyMeters: position.accuracyMeters,
      });
      const address = await reverseGeocode(position.lat, position.lng);
      setLocationAddress(address);

      const coords = {
        latitude: position.lat,
        longitude: position.lng,
        accuracy_meters: position.accuracyMeters,
      };

      const result = onBreak ? await postBreakOut(coords) : await postBreakIn(coords);
      if (!result.ok) {
        showClockAlert(onBreak ? 'Break out failed' : 'Break in failed', result.message, 'error');
        return;
      }

      setIsClockedIn(result.time_clock.is_clocked_in);
      setTimeClockStatus(result.time_clock);
      setGeofenceRadiusM(resolveGeofenceRadiusM(result.time_clock));
      notifyTimeClockChange({
        timeClock: result.time_clock,
        message: result.message,
        source: 'manual',
      });
      showClockAlert(
        onBreak ? 'Break ended' : 'Break started',
        result.message,
        'success',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not read GPS location.';
      showClockAlert('Location error', message, 'error');
    } finally {
      setBreakPunching(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.profileAvatarWrap}
          onPress={() => navigation.navigate('MyProfile')}
          activeOpacity={0.75}
          accessibilityLabel="Open my profile"
        >
          <View style={styles.profileAvatar}>
            <ProfilePhotoAvatar
              photoUri={getDisplayProfilePhotoUri(assignmentProfile)}
              size={44}
              iconSize={24}
              iconColor={colors.primary}
            />
          </View>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CruLynk</Text>
        <TouchableOpacity
          style={styles.bellBtn}
          activeOpacity={0.7}
          onPress={openLogoutSweetAlert}
          accessibilityLabel="Log out"
        >
          <Feather name="log-out" size={24} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottomPad }]}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handlePullToRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.greetingCard}>
          <Text style={styles.greetingText}>Welcome back,</Text>
          <Text style={styles.userName}>{welcomeName}</Text>
        </View>

        <View style={[styles.clockInCard, isClockedIn ? styles.clockInCardIn : styles.clockInCardOut]}>
          <View
            style={[
              styles.clockInGeo,
              styles.clockInGeo1,
              isClockedIn ? styles.clockInGeo1In : styles.clockInGeo1Out,
            ]}
          />
          <View
            style={[
              styles.clockInGeo,
              styles.clockInGeo2,
              isClockedIn ? styles.clockInGeo2In : styles.clockInGeo2Out,
            ]}
          />
          <Text style={styles.statusLabel}>CURRENT STATUS</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                isOnBreak ? styles.statusDotBreak : isClockedIn ? styles.statusDotIn : styles.statusDotOut,
              ]}
            />
            <Text
              style={[
                styles.statusText,
                isOnBreak ? styles.statusTextBreak : isClockedIn ? styles.statusTextIn : styles.statusTextOut,
              ]}
            >
              {isOnBreak ? 'On Break' : isClockedIn ? 'Clocked In' : 'Not Clocked In'}
            </Text>
          </View>
          {isClockedIn && timeClockStatus?.open_session?.clocked_in_at ? (
            <Text style={styles.clockSinceText}>
              Since {formatInstantInAppTimezone(timeClockStatus.open_session.clocked_in_at)}
            </Text>
          ) : null}
          {isOnBreak && timeClockStatus?.open_session?.break_started_at ? (
            <Text style={styles.breakSinceText}>
              Break since {formatInstantInAppTimezone(timeClockStatus.open_session.break_started_at)}
            </Text>
          ) : null}
          <Pressable
            style={[
              styles.clockInBtn,
              isClockedIn ? styles.clockInBtnIn : styles.clockInBtnOut,
              !isClockedIn ? styles.clockInBtnSolo : null,
              !workLocationReady ? { opacity: 0.45 } : null,
            ]}
            onPress={() => void handleClockPunch()}
            disabled={punchBusy}
          >
            {clockPunching ? (
              <ActivityIndicator
                size="large"
                color={isClockedIn ? '#166534' : '#991B1B'}
                style={styles.clockInBtnIcon}
              />
            ) : (
              <Feather
                name={isClockedIn ? 'log-out' : 'log-in'}
                size={52}
                color={isClockedIn ? '#166534' : '#991B1B'}
                style={styles.clockInBtnIcon}
              />
            )}
            <Text style={[styles.clockInBtnText, isClockedIn ? styles.clockInBtnTextIn : styles.clockInBtnTextOut]}>
              {isClockedIn ? 'Clock Out' : 'Clock In'}
            </Text>
          </Pressable>
          {isClockedIn ? (
            <Pressable
              style={[styles.breakBtn, isOnBreak ? styles.breakBtnOut : styles.breakBtnIn]}
              onPress={() => void handleBreakPunch()}
              disabled={punchBusy}
              accessibilityLabel={isOnBreak ? 'Break out' : 'Break in'}
            >
              {breakPunching ? (
                <ActivityIndicator size="small" color={isOnBreak ? '#92400E' : '#1E3A5F'} />
              ) : (
                <Feather
                  name={isOnBreak ? 'play' : 'coffee'}
                  size={18}
                  color={isOnBreak ? '#92400E' : '#1E3A5F'}
                />
              )}
              <Text style={[styles.breakBtnText, isOnBreak ? styles.breakBtnTextOut : styles.breakBtnTextIn]}>
                {isOnBreak ? 'Break Out' : 'Break In'}
              </Text>
            </Pressable>
          ) : null}
          <View style={[styles.shiftPill, isClockedIn ? styles.shiftPillIn : styles.shiftPillOut]}>
            <Feather name="clock" size={20} color="#FFFFFF" />
            <Text style={styles.shiftPillText}>
              {shiftPillLabel(
                isClockedIn,
                timeClockStatus,
                assignmentProfile?.assignedShiftStartTime,
              )}
            </Text>
          </View>
        </View>

        <View style={styles.locationCard}>
          <View style={styles.locationCardHeaderRow}>
            <Text style={styles.locationHeading}>
              {geofenceSiteCoords ? 'Assigned work location' : 'Current location'}
            </Text>
            {!locationLoading && isInZone !== null && geofenceSiteCoords && zoneBadgeLabel ? (
              <View style={isInZone ? styles.inZoneBadge : styles.outZoneBadge}>
                <Feather
                  name="briefcase"
                  size={16}
                  color={isInZone ? '#059669' : '#D97706'}
                />
                <Text
                  style={isInZone ? styles.inZoneText : styles.outZoneText}
                  numberOfLines={2}
                >
                  {zoneBadgeLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {locationLoading && (
            <View style={styles.locationLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.locationAddress, styles.locationLoadingText]}>Getting location…</Text>
            </View>
          )}

          {locationError && (
            <View>
              <Text style={[styles.locationAddress, styles.locationErrorText]}>
                {locationError === 'permission_denied'
                  ? WORK_LOCATION_DENIED_MESSAGE
                  : locationError}
              </Text>
              {locationError === 'permission_denied' && (
                <TouchableOpacity
                  style={styles.locationOpenSettingsBtn}
                  onPress={retryLocationPermission}
                  accessibilityRole="button"
                  accessibilityLabel="Review location disclosure and allow location"
                >
                  <Feather name="map-pin" size={18} color={colors.white} />
                  <Text style={styles.locationOpenSettingsText}>Enable location</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {mapTargetAddress && !locationLoading && !locationError && (
            <>
              {assignmentProfile?.assignedWorkLocationName ? (
                <Text style={styles.locationShortName}>{assignmentProfile.assignedWorkLocationName}</Text>
              ) : locationLabel ? (
                <Text style={styles.locationShortName}>{locationLabel}</Text>
              ) : null}
              <Text style={styles.locationAddress}>{mapTargetAddress}</Text>
              {mapTargetCoords ? (
                <View style={styles.locationCoordsRow}>
                  <Feather name="map-pin" size={14} color={colors.primary} />
                  <Text style={styles.locationCoordsText}>
                    {mapTargetCoords.lat.toFixed(5)}, {mapTargetCoords.lng.toFixed(5)}
                  </Text>
                </View>
              ) : null}
              {assignmentProfile?.assignedDepartment ? (
                <View style={styles.locationCoordsRow}>
                  <Feather name="briefcase" size={14} color={colors.primary} />
                  <Text style={styles.locationCoordsText}>
                    Department: {assignmentProfile.assignedDepartment}
                  </Text>
                </View>
              ) : null}
            </>
          )}

          {mapTargetCoords && !locationLoading && !locationError && (
            <TouchableOpacity
              style={styles.locationMapTouchable}
              activeOpacity={0.92}
              onPress={() => openMapsAt(mapTargetCoords.lat, mapTargetCoords.lng)}
              accessibilityRole="button"
              accessibilityLabel="Open map at assigned location"
            >
              {mapPreviewLoading ? (
                <View style={styles.locationMapLoadingBox}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.locationMapLoadingHint}>Loading map…</Text>
                </View>
              ) : mapPreview ? (
                <View style={styles.locationMapImageWrap}>
                  <Image
                    source={{ uri: mapPreview.uri }}
                    style={styles.locationMapImage}
                    resizeMode="cover"
                  />
                  {mapPreview.mode === 'tile' ? (
                    <View style={styles.locationMapPinOverlay} pointerEvents="none">
                      <Feather name="map-pin" size={32} color="#DC2626" />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View style={styles.locationMapFallback}>
                  <Feather name="map" size={40} color={colors.primary} />
                  <Text style={styles.locationMapFallbackText}>Could not load map preview</Text>
                  <Text style={styles.locationMapKeyHint}>
                    Network or map service unreachable. Tap below to open your position on openstreetmap.org,
                    or tap refresh after checking your connection.
                  </Text>
                  <Text style={styles.locationMapHint}>Tap to open in OpenStreetMap</Text>
                </View>
              )}
              <Text style={styles.locationMapAttribution}>© OpenStreetMap contributors</Text>
              <Text style={styles.locationMapHintBelow}>
                {mapPreview?.mode === 'tile'
                  ? 'Tile preview (approx. area). Tap to open exact position on OpenStreetMap.'
                  : 'Preview uses free OSM data. Tap to open the same place on OpenStreetMap.'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.locationRefreshRow}>
            <Text style={styles.locationCoordsText}>Update location</Text>
            <TouchableOpacity
              style={styles.locationRefreshBtn}
              onPress={() => void handleUpdateLocation()}
              disabled={locationLoading}
              hitSlop={12}
            >
              <Feather name="refresh-cw" size={20} color={locationLoading ? '#9CA3AF' : colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={showClockOutModal} transparent animationType="fade" onRequestClose={() => setShowClockOutModal(false)}>
        <KeyboardAvoidingView
          style={styles.clockOutModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.clockOutModalBackdrop} onPress={() => setShowClockOutModal(false)} />
          <View style={styles.clockOutModalCard}>
            <Text style={styles.clockOutModalTitle}>Clock out</Text>
            <Text style={styles.clockOutModalSubtitle}>
              Add an optional comment for your manager (e.g. reason for leaving early).
            </Text>
            <TextInput
              style={styles.clockOutModalInput}
              placeholder="Comment (optional)"
              placeholderTextColor="#9CA3AF"
              value={clockOutComment}
              onChangeText={setClockOutComment}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.clockOutModalActions}>
              <TouchableOpacity
                style={styles.clockOutModalCancelBtn}
                onPress={() => setShowClockOutModal(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.clockOutModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.clockOutModalConfirmBtn}
                onPress={() => void performClockOut()}
                activeOpacity={0.85}
              >
                <Text style={styles.clockOutModalConfirmText}>Clock out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SweetAlert
        visible={clockAlert !== null}
        title={clockAlert?.title ?? ''}
        message={clockAlert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant={clockAlert?.variant ?? 'info'}
        onClose={dismissClockAlert}
        onConfirm={dismissClockAlert}
      />
    </View>
  );
}
