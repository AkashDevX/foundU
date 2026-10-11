/**
 * Chat FCM registration + open-from-notification helpers.
 * Messages stay on Laravel; FCM only wakes the device.
 */
import { Platform, PermissionsAndroid, DeviceEventEmitter } from 'react-native';
import { createNavigationContainerRef } from '@react-navigation/native';
import { registerDeviceToken, unregisterDeviceToken } from './deviceTokenApi';
import { showDocumentRenewalNotification } from './documentRenewalNative';

export const navigationRef = createNavigationContainerRef();

/** Fired when a chat or announcement push arrives while the app is open. */
export const CHAT_INCOMING_EVENT = 'crulynk.chat.incoming';

/** Fired when a training assignment push arrives. */
export const TRAINING_ASSIGNED_EVENT = 'crulynk.training.assigned';

/** Fired when the employee opens a training assignment notification. */
export const OPEN_TRAINING_TAB_EVENT = 'crulynk.training.open';

/** Fired when a task assignment push arrives, or the task list should reload. */
export const TASK_ASSIGNED_EVENT = 'crulynk.tasks.assigned';

/** Fired when the employee opens a task assignment notification. */
export const OPEN_TASKS_TAB_EVENT = 'crulynk.tasks.open';

/** Pending task count reported by the Tasks screen so the tab badge stays current. */
export const TASKS_PENDING_EVENT = 'crulynk.tasks.pending';

export type TaskAssignedPayload = {
  notify?: boolean;
  title?: string;
  body?: string;
};

export type TrainingAssignedPayload = {
  notify?: boolean;
  moduleTitle?: string;
  dueLabel?: string;
  body?: string;
};

export type ChatIncomingPayload = {
  conversationId: number;
  kind: string;
};

let activeConversationId: number | null = null;
let tokenRefreshUnsub: (() => void) | null = null;
let openedUnsub: (() => void) | null = null;
let foregroundUnsub: (() => void) | null = null;
let started = false;

type RemoteMessageLike = {
  data?: Record<string, string | object | undefined>;
  notification?: { title?: string; body?: string };
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

function emitIncomingChat(remoteMessage: RemoteMessageLike): void {
  const conversationId = conversationIdFromMessage(remoteMessage);
  if (!conversationId) return;
  const kindRaw = remoteMessage?.data?.kind;
  const kind = typeof kindRaw === 'string' && kindRaw !== '' ? kindRaw : 'chat_message';
  const payload: ChatIncomingPayload = { conversationId, kind };
  DeviceEventEmitter.emit(CHAT_INCOMING_EVENT, payload);
}

function kindFromMessage(remoteMessage: RemoteMessageLike): string {
  const kind = remoteMessage?.data?.kind ?? remoteMessage?.data?.type;
  return typeof kind === 'string' ? kind : '';
}

function isTrainingAssigned(remoteMessage: RemoteMessageLike): boolean {
  return kindFromMessage(remoteMessage) === 'training_assigned';
}

function isTaskAssigned(remoteMessage: RemoteMessageLike): boolean {
  return kindFromMessage(remoteMessage) === 'task_assigned';
}

function dataString(remoteMessage: RemoteMessageLike, key: string): string {
  const raw = remoteMessage?.data?.[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function trainingAssignedPayload(
  remoteMessage: RemoteMessageLike,
  notify: boolean,
): TrainingAssignedPayload {
  return {
    notify,
    moduleTitle: dataString(remoteMessage, 'module_title') || 'Training',
    dueLabel: dataString(remoteMessage, 'due_label'),
    body: remoteMessage?.notification?.body || '',
  };
}

function taskAssignedPayload(remoteMessage: RemoteMessageLike, notify: boolean): TaskAssignedPayload {
  return {
    notify,
    title: remoteMessage?.notification?.title || 'Task assigned',
    body: remoteMessage?.notification?.body || 'A new task has been assigned.',
  };
}

function openMyProfileFromPush(): void {
  if (!navigationRef.isReady()) {
    setTimeout(openMyProfileFromPush, 400);
    return;
  }
  (navigationRef as { navigate: (name: string) => void }).navigate('MyProfile');
}

function routeOpenedNotification(remoteMessage: RemoteMessageLike): void {
  if (isTaskAssigned(remoteMessage)) {
    DeviceEventEmitter.emit(OPEN_TASKS_TAB_EVENT);
    DeviceEventEmitter.emit(TASK_ASSIGNED_EVENT, taskAssignedPayload(remoteMessage, false));
    return;
  }
  if (isTrainingAssigned(remoteMessage)) {
    DeviceEventEmitter.emit(OPEN_TRAINING_TAB_EVENT);
    DeviceEventEmitter.emit(TRAINING_ASSIGNED_EVENT, trainingAssignedPayload(remoteMessage, true));
    return;
  }
  if (kindFromMessage(remoteMessage) === 'document_renewal') {
    openMyProfileFromPush();
    return;
  }
  openChatFromPush(remoteMessage);
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
    const messaging = fb.getMessaging();

    tokenRefreshUnsub = fb.onTokenRefresh(messaging, async (token) => {
      await registerDeviceToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    });

    openedUnsub = fb.onNotificationOpenedApp(messaging, (remoteMessage) => {
      routeOpenedNotification(remoteMessage);
    });

    // Read a tap that launched the app from a fully closed state before any
    // token work, so that launch is not lost if registration is slow.
    const initial = await fb.getInitialNotification(messaging);
    if (initial) {
      routeOpenedNotification(initial);
    }

    foregroundUnsub = fb.onMessage(messaging, async (remoteMessage) => {
      if (kindFromMessage(remoteMessage) === 'document_renewal') {
        const title = dataString(remoteMessage, 'title') || remoteMessage?.notification?.title || '';
        const body = dataString(remoteMessage, 'body') || remoteMessage?.notification?.body || '';
        await showDocumentRenewalNotification(title, body);
        return;
      }
      if (isTaskAssigned(remoteMessage)) {
        DeviceEventEmitter.emit(TASK_ASSIGNED_EVENT, taskAssignedPayload(remoteMessage, true));
        return;
      }
      if (isTrainingAssigned(remoteMessage)) {
        DeviceEventEmitter.emit(TRAINING_ASSIGNED_EVENT, trainingAssignedPayload(remoteMessage, true));
        return;
      }
      emitIncomingChat(remoteMessage);
      const id = conversationIdFromMessage(remoteMessage);
      if (id && activeConversationId === id) {
        return;
      }
    });

    await requestAndroidPostNotifications();
    await syncTokenToBackend();
  } catch (e) {
    started = false;
    console.warn('[chatPush] startChatPush failed:', (e as Error)?.message || e);
  }
}

function withBudget<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise.then(
      (value) => value,
      () => undefined,
    ),
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), ms);
    }),
  ]);
}

/** Call on logout — removes this device token from the server (best-effort, time-capped). */
export async function stopChatPush(): Promise<void> {
  // Always drop local listeners first so logout cannot leave push handlers active.
  tokenRefreshUnsub?.();
  openedUnsub?.();
  foregroundUnsub?.();
  tokenRefreshUnsub = null;
  openedUnsub = null;
  foregroundUnsub = null;
  started = false;
  activeConversationId = null;

  try {
    const fb = loadMessaging();
    if (fb) {
      const token = await withBudget(fb.getToken(fb.getMessaging()), 800);
      await withBudget(unregisterDeviceToken(token || undefined), 1200);
    } else {
      await withBudget(unregisterDeviceToken(), 1200);
    }
  } catch {
    await withBudget(unregisterDeviceToken(), 800);
  }
}
