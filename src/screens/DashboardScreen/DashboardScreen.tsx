import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Pressable,
  Platform,
  PermissionsAndroid,
  Linking,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Geolocation from 'react-native-geolocation-service';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../components/SweetAlert';
import type { SweetAlertProps } from '../../components/SweetAlert';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { dashboardStyles } from '../../styles/styles';
import { colors, spacing } from '../../theme/theme';
import { loadOpenStreetMapPreview, type MapPreviewResult } from '../../config/maps';
import { getDisplayProfilePhotoUri, loadAccountProfile, welcomeDisplayName } from '../../services/accountProfileStorage';
import { refreshAndCacheAccountProfileFromApi } from '../../services/accountProfileApi';
import { getSessionAuthenticated } from '../../services/authSessionStorage';
import {
  fetchTimeClockStatus,
  postClockIn,
  postClockOut,
  type TimeClockStatus,
} from '../../services/timeClockApi';
import { formatInstantInAppTimezone } from '../../utils/formatDateTime';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';

const DEFAULT_GEOFENCE_RADIUS_M = 100;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'WorkforceApp/1.0' } }
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

async function requestLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fineGranted = result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
    const coarseGranted = result['android.permission.ACCESS_COARSE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
    return fineGranted || coarseGranted;
  }
  return true;
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

function formatZoneBadgeLabel(distanceToSiteM: number, geofenceRadiusM: number): string {
  if (distanceToSiteM <= geofenceRadiusM) {
    return `In zone (${geofenceRadiusM} m)`;
  }
  const outsideM = Math.max(0, Math.round(distanceToSiteM - geofenceRadiusM));
  return `Out of zone (${outsideM} m outside)`;
}

export function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockPunching, setClockPunching] = useState(false);
  const [timeClockStatus, setTimeClockStatus] = useState<TimeClockStatus | null>(null);
  const [geofenceRadiusM, setGeofenceRadiusM] = useState(DEFAULT_GEOFENCE_RADIUS_M);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapPreview, setMapPreview] = useState<MapPreviewResult | null>(null);
  const [mapPreviewLoading, setMapPreviewLoading] = useState(false);
  const mapLoadSeq = useRef(0);
  const [welcomeName, setWelcomeName] = useState('there');
  const [assignmentProfile, setAssignmentProfile] = useState<UserProfileSnapshot | null>(null);
  const [clockAlert, setClockAlert] = useState<{
    title: string;
    message: string;
    variant: NonNullable<SweetAlertProps['variant']>;
  } | null>(null);

  const showClockAlert = useCallback(
    (title: string, message: string, variant: NonNullable<SweetAlertProps['variant']>) => {
      setClockAlert({ title, message, variant });
    },
    [],
  );

  const dismissClockAlert = useCallback(() => setClockAlert(null), []);

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

  const mapTargetCoords = assignedCoords ?? userCoords;
  const mapTargetAddress = assignmentProfile?.assignedWorkLocationAddress ?? locationAddress;

  const distanceToSiteM = useMemo(() => {
    if (!userCoords || !assignedCoords) return null;
    return haversineDistance(
      userCoords.lat,
      userCoords.lng,
      assignedCoords.lat,
      assignedCoords.lng,
    );
  }, [userCoords, assignedCoords]);

  const isInZone = useMemo(() => {
    if (distanceToSiteM === null) return null;
    return distanceToSiteM <= geofenceRadiusM;
  }, [distanceToSiteM, geofenceRadiusM]);

  const zoneBadgeLabel = useMemo(() => {
    if (distanceToSiteM === null) return null;
    return formatZoneBadgeLabel(distanceToSiteM, geofenceRadiusM);
  }, [distanceToSiteM, geofenceRadiusM]);

  const openAppSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const refreshDeviceLocation = useCallback(
    async (opts?: {
      /** When false, caller owns loading state (e.g. combined profile + GPS refresh). */
      manageLoading?: boolean;
    }) => {
      const manageLoading = opts?.manageLoading !== false;
      if (manageLoading) {
        setLocationLoading(true);
        setLocationError(null);
      }
      try {
        const granted = await requestLocationPermission();
        if (!granted) {
          setLocationError('permission_denied');
          setUserCoords(null);
          setLocationAddress(null);
          return;
        }

        const position = await readCurrentPosition();
        setUserCoords({ lat: position.lat, lng: position.lng });
        const address = await reverseGeocode(position.lat, position.lng);
        setLocationAddress(address);
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
    [],
  );

  const handleUpdateLocation = useCallback(async () => {
    if (locationLoading) return;

    setLocationLoading(true);
    setLocationError(null);

    let profileSnapshot = assignmentProfile;
    let radiusM = geofenceRadiusM;

    try {
      const signedIn = await getSessionAuthenticated();
      if (signedIn) {
        const api = await refreshAndCacheAccountProfileFromApi();
        if (api.ok) {
          profileSnapshot = api.profile;
          setAssignmentProfile(api.profile);
        }

        const clock = await fetchTimeClockStatus();
        if (clock.ok) {
          setTimeClockStatus(clock.time_clock);
          setIsClockedIn(clock.time_clock.is_clocked_in);
          radiusM = clock.time_clock.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_M;
          setGeofenceRadiusM(radiusM);
        }
      }

      await refreshDeviceLocation({ manageLoading: false });
    } finally {
      setLocationLoading(false);
    }
  }, [assignmentProfile, geofenceRadiusM, locationLoading, refreshDeviceLocation]);

  useEffect(() => {
    void refreshDeviceLocation();
  }, [refreshDeviceLocation]);

  useFocusEffect(
    useCallback(() => {
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
        const api = await refreshAndCacheAccountProfileFromApi();
        if (api.ok) setAssignmentProfile(api.profile);

        const clock = await fetchTimeClockStatus();
        if (clock.ok) {
          setTimeClockStatus(clock.time_clock);
          setIsClockedIn(clock.time_clock.is_clocked_in);
          setGeofenceRadiusM(clock.time_clock.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_M);
        }
      })();
    }, []),
  );

  useEffect(() => {
    if (!mapTargetCoords || locationError || locationLoading) {
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
  }, [mapTargetCoords, locationError, locationLoading]);

  const handleClockIn = async () => {
    if (clockPunching) return;

    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      showClockAlert(
        'Sign in required',
        'Please sign in before using the time clock.',
        'info',
      );
      return;
    }

    if (!isClockedIn && timeClockStatus && !timeClockStatus.can_clock_in) {
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

    setClockPunching(true);
    try {
      const granted = await requestLocationPermission();
      if (!granted) {
        showClockAlert(
          'Location required',
          'Allow location access so we can verify you are at your assigned work site.',
          'info',
        );
        return;
      }

      const position = await readCurrentPosition();
      setUserCoords({ lat: position.lat, lng: position.lng });
      const address = await reverseGeocode(position.lat, position.lng);
      setLocationAddress(address);

      const coords = {
        latitude: position.lat,
        longitude: position.lng,
        accuracy_meters: position.accuracyMeters,
      };

      const result = isClockedIn ? await postClockOut(coords) : await postClockIn(coords);
      if (!result.ok) {
        showClockAlert(
          isClockedIn ? 'Clock out failed' : 'Clock in failed',
          result.message,
          'error',
        );
        return;
      }

      setIsClockedIn(result.time_clock.is_clocked_in);
      setTimeClockStatus(result.time_clock);
      setGeofenceRadiusM(result.time_clock.geofence_radius_meters || DEFAULT_GEOFENCE_RADIUS_M);
      showClockAlert(
        result.time_clock.is_clocked_in ? 'Clocked in' : 'Clocked out',
        result.message,
        'success',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not read GPS location.';
      showClockAlert('Location error', message, 'error');
    } finally {
      setClockPunching(false);
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
        <Text style={styles.headerTitle}>Workforce</Text>
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
            <View style={[styles.statusDot, isClockedIn ? styles.statusDotIn : styles.statusDotOut]} />
            <Text style={[styles.statusText, isClockedIn ? styles.statusTextIn : styles.statusTextOut]}>
              {isClockedIn ? 'Clocked In' : 'Not Clocked In'}
            </Text>
          </View>
          {isClockedIn && timeClockStatus?.open_session?.clocked_in_at ? (
            <Text style={styles.clockSinceText}>
              Since {formatInstantInAppTimezone(timeClockStatus.open_session.clocked_in_at)}
            </Text>
          ) : null}
          <Pressable
            style={[styles.clockInBtn, isClockedIn ? styles.clockInBtnIn : styles.clockInBtnOut]}
            onPress={() => void handleClockIn()}
            disabled={clockPunching}
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
          <View style={[styles.shiftPill, isClockedIn ? styles.shiftPillIn : styles.shiftPillOut]}>
            <Feather name="clock" size={20} color="#FFFFFF" />
            <Text style={styles.shiftPillText}>
              {assignmentProfile?.assignedShiftStartTime
                ? `Shift starts at ${assignmentProfile.assignedShiftStartTime}`
                : 'Shift start time unavailable'}
            </Text>
          </View>
        </View>

        <View style={styles.locationCard}>
          <View style={styles.locationCardHeaderRow}>
            <Text style={styles.locationHeading}>
              {assignedCoords ? 'Assigned work location' : 'Current location'}
            </Text>
            {!locationLoading && isInZone !== null && assignedCoords && zoneBadgeLabel ? (
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
                  ? 'Location permission is required. Please enable it in Settings.'
                  : locationError}
              </Text>
              {locationError === 'permission_denied' && (
                <TouchableOpacity
                  style={styles.locationOpenSettingsBtn}
                  onPress={openAppSettings}
                >
                  <Feather name="settings" size={18} color={colors.white} />
                  <Text style={styles.locationOpenSettingsText}>Open Settings</Text>
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
