import { AppState, Linking, Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { LOCATION_DISCLOSURE, promptLocationDisclosure } from './locationDisclosure';
import { openNativeLocationPermissionScreen, requestNativeBackgroundLocation } from './locationMonitorNative';

export type WorkLocationPermissionResult =
  | 'granted'
  | 'disclosure_denied'
  | 'foreground_denied'
  | 'background_denied';

export const WORK_LOCATION_DENIED_MESSAGE =
  'Location access is required. Accept the disclosure, choose While using the app, then Allow all the time to use clock-in and location.';

async function hasAndroidForegroundLocationPermission(): Promise<boolean> {
  const fineGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  );
  const coarseGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  );
  return fineGranted || coarseGranted;
}

export async function hasAndroidBackgroundLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (Number(Platform.Version) < 29) {
    return hasAndroidForegroundLocationPermission();
  }
  return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
}

export async function hasAndroidForegroundOnly(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  return hasAndroidForegroundLocationPermission();
}

export async function hasWorkLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    return hasAndroidBackgroundLocationPermission();
  }
  if (Platform.OS === 'ios') {
    const status = await Geolocation.requestAuthorization('always');
    return status === 'granted';
  }
  return true;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until app is active again, but never hang forever. */
function waitForAppActive(timeoutMs = 90_000): Promise<void> {
  return new Promise((resolve) => {
    if (AppState.currentState === 'active') {
      resolve();
      return;
    }

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      subscription.remove();
      clearTimeout(timer);
      resolve();
    };

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') finish();
    });
    const timer = setTimeout(finish, timeoutMs);
  });
}

/** Wait until user leaves and returns from settings / permission UI. */
function waitForReturnFromSettings(timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve) => {
    let leftActive = AppState.currentState !== 'active';
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      subscription.remove();
      clearTimeout(timer);
      resolve();
    };

    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        leftActive = true;
        return;
      }
      if (leftActive) finish();
    });

    const timer = setTimeout(finish, timeoutMs);

    if (leftActive && AppState.currentState === 'active') {
      finish();
    }
  });
}

/**
 * Tracks whether the app was backgrounded long enough to count as real
 * permission UI (ignores brief flickers that caused false "UI shown" no-ops).
 */
function trackSustainedBackground(minAwayMs = 700): {
  sawRealUi: () => boolean;
  stop: () => void;
} {
  let longestAwayMs = 0;
  let awaySince: number | null = AppState.currentState === 'active' ? null : Date.now();

  const sub = AppState.addEventListener('change', (next) => {
    if (next !== 'active') {
      if (awaySince == null) awaySince = Date.now();
      return;
    }
    if (awaySince != null) {
      longestAwayMs = Math.max(longestAwayMs, Date.now() - awaySince);
      awaySince = null;
    }
  });

  return {
    sawRealUi: () => {
      const currentAway = awaySince != null ? Date.now() - awaySince : 0;
      return Math.max(longestAwayMs, currentAway) >= minAwayMs;
    },
    stop: () => sub.remove(),
  };
}

async function showDisclosure(): Promise<boolean> {
  const accepted = await promptLocationDisclosure(LOCATION_DISCLOSURE);
  if (!accepted) return false;
  await delay(450);
  await waitForAppActive();
  await delay(200);
  return true;
}

async function requestAndroidForegroundPermission(): Promise<boolean> {
  if (await hasAndroidForegroundLocationPermission()) {
    return true;
  }

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  const fineStatus = result['android.permission.ACCESS_FINE_LOCATION'];
  const coarseStatus = result['android.permission.ACCESS_COARSE_LOCATION'];
  return (
    fineStatus === PermissionsAndroid.RESULTS.GRANTED ||
    coarseStatus === PermissionsAndroid.RESULTS.GRANTED
  );
}

/** First-time only: system dialog / Allow all the time prompt via runtime request. */
async function requestAndroidBackgroundPermissionRuntimeOnce(): Promise<boolean> {
  if (Number(Platform.Version) < 29) {
    return true;
  }
  if (await hasAndroidBackgroundLocationPermission()) {
    return true;
  }

  await waitForAppActive();
  await delay(350);
  await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION);
  if (AppState.currentState !== 'active') {
    await waitForAppActive();
  }
  await delay(300);
  return hasAndroidBackgroundLocationPermission();
}

/** Returns true if a settings/permission activity actually took the user away. */
async function openAndConfirmLeftApp(open: () => Promise<boolean>): Promise<boolean> {
  const tracker = trackSustainedBackground(400);
  const opened = await open();
  if (!opened) {
    tracker.stop();
    return false;
  }
  // Give the system a moment to background us.
  await delay(700);
  const left = tracker.sawRealUi();
  tracker.stop();
  return left;
}

async function promptOpenLocationSettings(): Promise<boolean> {
  const confirmed = await promptLocationDisclosure({
    title: 'Location permissions',
    message:
      'To enable clock-in and location, open settings and choose Permissions → Location → Allow all the time.',
    acceptText: 'Open',
    denyText: 'Cancel',
  });
  if (!confirmed) {
    return false;
  }

  const left = await openAndConfirmLeftApp(async () => {
    const viaNative = await openNativeLocationPermissionScreen();
    if (viaNative) return true;
    try {
      await Linking.openSettings();
      return true;
    } catch {
      return false;
    }
  });
  if (left) {
    await waitForReturnFromSettings();
    await delay(250);
  }
  return hasAndroidBackgroundLocationPermission();
}

/**
 * Enable location: every tap must show Location / Allow all the time UI.
 *
 * After a deny, Android often returns instantly with no UI. We detect that
 * (short elapsed + no sustained background) and force-open the Location page.
 * Never treat a silent deny as "user already dismissed" — that caused the
 * third-tap no-op.
 */
async function openBackgroundLocationPermissionScreenOnce(): Promise<boolean> {
  if (Number(Platform.Version) < 29) {
    return true;
  }
  if (await hasAndroidBackgroundLocationPermission()) {
    return true;
  }

  await waitForAppActive();
  await delay(300);

  // --- Attempt A: runtime request (works until Android stops showing it) ---
  const runtimeTracker = trackSustainedBackground(700);
  const runtimeRequest = PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
  );
  // If Android shows nothing, request resolves almost instantly.
  // If it hangs with no UI, don't wait forever — fall through and force-open.
  const runtimeRace = await Promise.race([
    runtimeRequest.then((result) => ({ type: 'done' as const, result })),
    delay(2500).then(() => ({ type: 'timeout' as const })),
  ]);

  if (runtimeRace.type === 'timeout' && runtimeTracker.sawRealUi()) {
    // Permission UI is up — wait for the user to finish.
    await runtimeRequest;
  } else if (runtimeRace.type === 'timeout') {
    // No UI after 2.5s — abandon waiting on this request.
    void runtimeRequest.catch(() => undefined);
  }

  const runtimeSawUi = runtimeTracker.sawRealUi();
  runtimeTracker.stop();

  if (AppState.currentState !== 'active') {
    await waitForAppActive();
  }
  await delay(200);
  if (await hasAndroidBackgroundLocationPermission()) {
    return true;
  }
  // User actually saw and dismissed the system UI this tap.
  if (runtimeSawUi) {
    return false;
  }

  // --- Attempt B: silent deny → force Location permission page ---
  const openedLocation = await openAndConfirmLeftApp(() => openNativeLocationPermissionScreen());
  if (openedLocation) {
    await waitForReturnFromSettings();
    await delay(250);
    return hasAndroidBackgroundLocationPermission();
  }

  // --- Attempt C: native Activity.requestPermissions ---
  const nativeTracker = trackSustainedBackground(700);
  const nativeRequest = requestNativeBackgroundLocation();
  const nativeRace = await Promise.race([
    nativeRequest.then((result) => ({ type: 'done' as const, result })),
    delay(2500).then(() => ({ type: 'timeout' as const })),
  ]);

  if (nativeRace.type === 'timeout' && nativeTracker.sawRealUi()) {
    await nativeRequest;
  } else if (nativeRace.type === 'timeout') {
    void nativeRequest.catch(() => undefined);
  }

  const nativeSawUi = nativeTracker.sawRealUi();
  nativeTracker.stop();

  if (AppState.currentState !== 'active') {
    await waitForAppActive();
  }
  await delay(200);
  if (await hasAndroidBackgroundLocationPermission()) {
    return true;
  }
  if (nativeSawUi) {
    return false;
  }

  // --- Attempt D: Location page again ---
  const openedAgain = await openAndConfirmLeftApp(() => openNativeLocationPermissionScreen());
  if (openedAgain) {
    await waitForReturnFromSettings();
    await delay(250);
    return hasAndroidBackgroundLocationPermission();
  }

  // --- Attempt E: always show something (Alert → settings) so tap never no-ops ---
  return promptOpenLocationSettings();
}

let workPermissionInFlight: Promise<WorkLocationPermissionResult> | null = null;

/** Clears any stuck in-flight gate so Enable location always responds. */
export function resetWorkLocationPermissionGate(): void {
  workPermissionInFlight = null;
}

export type RequestWorkLocationOptions = {
  /**
   * When true and foreground is already granted, open the Location permission
   * screen (Enable location retry). No disclosure, no auto-loop.
   */
  backgroundOnly?: boolean;
};

export async function requestWorkLocationPermission(
  options?: RequestWorkLocationOptions,
): Promise<WorkLocationPermissionResult> {
  if (await hasWorkLocationPermission()) {
    return 'granted';
  }

  // Enable location must never join a stale promise — always start fresh.
  if (options?.backgroundOnly) {
    resetWorkLocationPermissionGate();
  } else if (workPermissionInFlight) {
    return workPermissionInFlight;
  }

  const run = (async (): Promise<WorkLocationPermissionResult> => {
    const backgroundOnly =
      options?.backgroundOnly === true && (await hasAndroidForegroundLocationPermission());

    if (backgroundOnly) {
      const backgroundGranted = await openBackgroundLocationPermissionScreenOnce();
      return backgroundGranted ? 'granted' : 'background_denied';
    }

    const accepted = await showDisclosure();
    if (!accepted) {
      return 'disclosure_denied';
    }

    if (Platform.OS === 'ios') {
      const whenInUse = await Geolocation.requestAuthorization('whenInUse');
      if (whenInUse !== 'granted') {
        return 'foreground_denied';
      }
      await delay(350);
      const always = await Geolocation.requestAuthorization('always');
      return always === 'granted' ? 'granted' : 'background_denied';
    }

    if (Platform.OS !== 'android') {
      return 'granted';
    }

    const foregroundGranted = await requestAndroidForegroundPermission();
    if (!foregroundGranted) {
      return 'foreground_denied';
    }

    await delay(350);

    const backgroundGranted = await requestAndroidBackgroundPermissionRuntimeOnce();
    return backgroundGranted ? 'granted' : 'background_denied';
  })();

  workPermissionInFlight = run;

  try {
    return await run;
  } finally {
    if (workPermissionInFlight === run) {
      workPermissionInFlight = null;
    }
  }
}

export async function requestBackgroundLocationPermission(): Promise<WorkLocationPermissionResult> {
  return requestWorkLocationPermission();
}
