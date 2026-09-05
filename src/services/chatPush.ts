/**
 * Chat FCM registration + open-from-notification helpers.
 * Messages stay on Laravel; FCM only wakes the device.
 */
import { Platform, PermissionsAndroid } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { registerDeviceToken, unregisterDeviceToken } from './deviceTokenApi';

export const navigationRef = createNavigationContainerRef();

let activeConversationId: number | null = null;
let tokenRefreshUnsub: (() => void) | null = null;
let openedUnsub: (() => void) | null = null;
let foregroundUnsub: (() => void) | null = null;
let started = false;

type RemoteMessageLike = {
  data?: Record<string, string | object | undefined>;
} | null;

function loadMessaging(): null | typeof import('@react-native-firebase/messaging') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-firebase/messaging');
  } catch (e) {
    console.warn('[chatPush] Firebase messaging unavailable:', (e as Error)?.message || e);
    return null;
  }
}

export function setActiveChatConversationId(id: number | null): void {
  activeConversationId = id;
}

export function getActiveChatConversationId(): number | null {
  return activeConversationId;
}

function conversationIdFromMessage(remoteMessage: RemoteMessageLike): number | null {
  const raw = remoteMessage?.data?.conversation_id;
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function openChatFromPush(remoteMessage: RemoteMessageLike): void {
  const conversationId = conversationIdFromMessage(remoteMessage);
  if (!conversationId) return;

  if (!navigationRef.isReady()) {
    setTimeout(() => openChatFromPush(remoteMessage), 400);
    return;
  }

  (navigationRef as { navigate: (name: string, params: object) => void }).navigate(
    'ConversationThread',
    { conversationId },
  );
}

async function requestAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 33) return true;
  const already = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
  );
  if (already) return true;
  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'Chat notifications',
      message: 'Allow CruLynk to notify you about new chat messages when the app is closed.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function syncTokenToBackend(): Promise<void> {
  const fb = loadMessaging();
  if (!fb) return;

  const messaging = fb.getMessaging();
  try {
    await fb.registerDeviceForRemoteMessages(messaging);
  } catch {
    /* iOS / already registered */
  }

  try {
    const authStatus = await fb.requestPermission(messaging);
    const enabled =
      authStatus === fb.AuthorizationStatus.AUTHORIZED ||
      authStatus === fb.AuthorizationStatus.PROVISIONAL;
    if (!enabled && Platform.OS === 'ios') {
      return;
    }
  } catch {
    /* Android may not need this */
  }

  const token = await fb.getToken(messaging);
  if (!token) return;
  await registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
}

/** Call after login / when Main tabs mount while authenticated. */
export async function startChatPush(): Promise<void> {
  const fb = loadMessaging();
  if (!fb) return;

  if (started) {
    await syncTokenToBackend();
    return;
  }
  started = true;

  try {
    await requestAndroidPostNotifications();
    await syncTokenToBackend();

    const messaging = fb.getMessaging();

    tokenRefreshUnsub = fb.onTokenRefresh(messaging, async (token) => {
      await registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    });

    openedUnsub = fb.onNotificationOpenedApp(messaging, (remoteMessage) => {
      openChatFromPush(remoteMessage);
    });

    foregroundUnsub = fb.onMessage(messaging, async (remoteMessage) => {
      const id = conversationIdFromMessage(remoteMessage);
      if (id && activeConversationId === id) {
        return;
      }
    });

    const initial = await fb.getInitialNotification(messaging);
    if (initial) {
      openChatFromPush(initial);
    }
  } catch (e) {
    started = false;
    console.warn('[chatPush] startChatPush failed:', (e as Error)?.message || e);
  }
}

/** Call on logout — removes this device token from the server. */
export async function stopChatPush(): Promise<void> {
  try {
    const fb = loadMessaging();
    if (fb) {
      const token = await fb.getToken(fb.getMessaging());
      await unregisterDeviceToken(token || undefined);
    } else {
      await unregisterDeviceToken();
    }
  } catch {
    await unregisterDeviceToken();
  }

  tokenRefreshUnsub?.();
  openedUnsub?.();
  foregroundUnsub?.();
  tokenRefreshUnsub = null;
  openedUnsub = null;
  foregroundUnsub = null;
  started = false;
  activeConversationId = null;
}
