import { Linking, NativeModules, Platform, PermissionsAndroid } from 'react-native';

type ShiftReminderPermissionNative = {
  areNotificationsEnabled?: () => Promise<boolean>;
  openNotificationSettings?: () => Promise<void>;
  requestIgnoreBatteryOptimizations?: () => Promise<boolean>;
};

function nativeShiftReminder(): ShiftReminderPermissionNative | undefined {
  return NativeModules.ShiftReminder as ShiftReminderPermissionNative | undefined;
}

/** Android notification master toggle + optional battery-optimization exemption. */
export async function requestShiftReminderNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Number(Platform.Version) >= 33) {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    if (!already) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: 'Shift reminders',
          message:
            'Allow CruLynk to show status-bar notifications when your assigned shift is coming up.',
          buttonPositive: 'Allow',
          buttonNegative: 'Not now',
        },
      );
      if (result !== PermissionsAndroid.RESULTS.GRANTED) {
        return false;
      }
    }
  }

  const native = nativeShiftReminder();
  if (native?.areNotificationsEnabled) {
    try {
      const enabled = await native.areNotificationsEnabled();
      if (!enabled) {
        return false;
      }
    } catch {
      /* ignore */
    }
  }

  // Best-effort: ask Samsung / OEM battery savers not to kill reminder alarms.
  if (native?.requestIgnoreBatteryOptimizations) {
    try {
      await native.requestIgnoreBatteryOptimizations();
    } catch {
      /* ignore */
    }
  }

  return true;
}

export async function openAppNotificationSettings(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const native = nativeShiftReminder();
  if (native?.openNotificationSettings) {
    try {
      await native.openNotificationSettings();
      return;
    } catch {
      /* fall through */
    }
  }

  try {
    await Linking.openSettings();
  } catch {
    /* ignore */
  }
}

export async function areAppNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const native = nativeShiftReminder();
  if (!native?.areNotificationsEnabled) {
    return true;
  }
  try {
    return Boolean(await native.areNotificationsEnabled());
  } catch {
    return true;
  }
}
