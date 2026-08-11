import { Linking, NativeModules, Platform } from 'react-native';

type LocationMonitorNativeModule = {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  openLocationPermissionScreen?: () => Promise<string>;
  requestBackgroundLocation?: () => Promise<boolean>;
};

const nativeModule = NativeModules.LocationMonitor as LocationMonitorNativeModule | undefined;

const APP_ID = 'com.blugreenfac.crulynk';

export async function startNativeLocationMonitoring(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule?.startMonitoring) {
    return;
  }
  await nativeModule.startMonitoring();
}

export async function stopNativeLocationMonitoring(): Promise<void> {
  if (Platform.OS !== 'android' || !nativeModule?.stopMonitoring) {
    return;
  }
  await nativeModule.stopMonitoring();
}

async function openLocationPermissionViaSendIntent(): Promise<boolean> {
  if (Platform.OS !== 'android' || typeof Linking.sendIntent !== 'function') {
    return false;
  }

  const permissionNames = [
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
  ];

  for (const permissionName of permissionNames) {
    try {
      await Linking.sendIntent('android.intent.action.MANAGE_APP_PERMISSION', [
        { key: 'android.intent.extra.PERMISSION_NAME', value: permissionName },
        { key: 'android.intent.extra.PACKAGE_NAME', value: APP_ID },
      ]);
      return true;
    } catch {
      // try next
    }
  }

  return false;
}

/** Opens Location permission page only (never App Info). Returns false if unavailable. */
export async function openNativeLocationPermissionScreen(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (nativeModule?.openLocationPermissionScreen) {
    try {
      await nativeModule.openLocationPermissionScreen();
      return true;
    } catch {
      // fall through to sendIntent
    }
  }

  return openLocationPermissionViaSendIntent();
}

/** System Allow all the time request via the current Activity (not App Info). */
export async function requestNativeBackgroundLocation(): Promise<boolean | null> {
  if (Platform.OS !== 'android' || !nativeModule?.requestBackgroundLocation) {
    return null;
  }
  try {
    return await nativeModule.requestBackgroundLocation();
  } catch {
    return null;
  }
}
