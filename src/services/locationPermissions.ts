import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

/**
 * Foreground location (clock-in button, map preview).
 */
export async function requestForegroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    ]);
    const fineGranted =
      result['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
    const coarseGranted =
      result['android.permission.ACCESS_COARSE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;
    return fineGranted || coarseGranted;
  }
  return true;
}

/**
 * Background / always location while clocked in so geofence monitoring continues
 * when the user leaves the app.
 */
export async function requestBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    const result = await Geolocation.requestAuthorization('always');
    return result === 'granted';
  }

  const foregroundGranted = await requestForegroundLocationPermission();
  if (!foregroundGranted) {
    return false;
  }

  if (Platform.Version < 29) {
    return true;
  }

  const backgroundGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
  );
  if (backgroundGranted) {
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}
