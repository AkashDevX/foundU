import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Pressable, Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Geolocation from 'react-native-geolocation-service';
import Feather from 'react-native-vector-icons/Feather';
import { dashboardStyles } from '../../styles/styles';
import { colors, spacing } from '../../theme/theme';

const WORK_ZONE_CENTER = { lat: -33.8688, lng: 151.2093 }; // Sydney CBD - configure as needed
const WORK_ZONE_RADIUS_M = 500;

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

export function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [locationAddress, setLocationAddress] = useState<string | null>(null);
  const [isInZone, setIsInZone] = useState<boolean | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);

  const styles = dashboardStyles;

  const openAppSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  const fetchLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError(null);
    try {
      if (Platform.OS === 'android') {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);
        const fineGranted = result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
        const coarseGranted = result['android.permission.ACCESS_COARSE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
        if (!fineGranted && !coarseGranted) {
          setLocationError('permission_denied');
          setLocationLoading(false);
          return;
        }
      }
      Geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const address = await reverseGeocode(latitude, longitude);
          setLocationAddress(address);
          const distanceM = haversineDistance(
            latitude,
            longitude,
            WORK_ZONE_CENTER.lat,
            WORK_ZONE_CENTER.lng
          );
          setIsInZone(distanceM <= WORK_ZONE_RADIUS_M);
          setLocationLoading(false);
        },
        (error) => {
          setLocationError(error.message || 'Unable to get location');
          setLocationLoading(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    } catch (err: any) {
      setLocationError(err?.message || 'Location failed');
      setLocationLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  const handleClockIn = () => {
    setIsClockedIn((prev) => !prev);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.header}>
        <View style={styles.profileAvatarWrap}>
          <View style={styles.profileAvatar}>
            <Feather name="user" size={22} color={colors.primary} />
          </View>
        </View>
        <Text style={styles.headerTitle}>Workforce</Text>
        <TouchableOpacity style={styles.bellBtn} activeOpacity={0.7}>
          <View style={styles.bellBadge} />
          <Feather name="bell" size={24} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.greetingCard}>
        <Text style={styles.greetingText}>Welcome back,</Text>
        <Text style={styles.userName}>Alex Rivera</Text>
      </View>

      <View style={[styles.content, { paddingBottom: 100 }]}>
        <View style={styles.clockInCard}>
          <View style={[styles.clockInGeo, styles.clockInGeo1]} />
          <View style={[styles.clockInGeo, styles.clockInGeo2]} />
          <Text style={styles.statusLabel}>CURRENT STATUS</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isClockedIn && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isClockedIn ? 'Clocked In' : 'Not Clocked In'}
            </Text>
          </View>
          <Pressable style={styles.clockInBtn} onPress={handleClockIn}>
            <Feather
              name={isClockedIn ? 'log-out' : 'log-in'}
              size={52}
              color={colors.primary}
              style={styles.clockInBtnIcon}
            />
            <Text style={styles.clockInBtnText}>
              {isClockedIn ? 'Clock Out' : 'Clock In'}
            </Text>
          </Pressable>
          <View style={styles.shiftPill}>
            <Feather name="clock" size={20} color="#FFFFFF" />
            <Text style={styles.shiftPillText}>Shift starts at 09:00 AM</Text>
          </View>
        </View>

        <View style={styles.locationCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
            <Text style={[styles.locationHeading, { marginBottom: 0 }]}>Current Location</Text>
            {!locationLoading && isInZone !== null && (
              <View style={isInZone ? styles.inZoneBadge : styles.outZoneBadge}>
                <Feather
                  name="briefcase"
                  size={18}
                  color={isInZone ? '#059669' : '#D97706'}
                />
                <Text style={isInZone ? styles.inZoneText : styles.outZoneText}>
                  {isInZone ? 'In Zone' : 'Out of Zone'}
                </Text>
              </View>
            )}
          </View>
          {locationLoading && (
            <Text style={styles.locationAddress}>Getting location...</Text>
          )}
          {locationError && (
            <View>
              <Text style={[styles.locationAddress, { color: '#EF4444' }]}>
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
          {locationAddress && !locationLoading && (
            <Text style={styles.locationAddress} numberOfLines={4}>{locationAddress}</Text>
          )}
          <TouchableOpacity
            style={styles.locationRefreshBtn}
            onPress={fetchLocation}
            disabled={locationLoading}
          >
            <Feather name="refresh-cw" size={18} color={locationLoading ? '#9CA3AF' : colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
