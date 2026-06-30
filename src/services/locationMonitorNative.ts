import { NativeModules, Platform } from 'react-native';

type LocationMonitorNativeModule = {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
};

const nativeModule = NativeModules.LocationMonitor as LocationMonitorNativeModule | undefined;

/** Keeps the Android process alive while clocked in so GPS monitoring can continue in background. */
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
