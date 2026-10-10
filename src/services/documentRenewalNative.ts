import { NativeModules, Platform } from 'react-native';
import { getSessionAuthenticated } from './authSessionStorage';
import { requestShiftReminderNotificationPermission } from './notificationPermissions';
import {
  documentsStillNeedingRenewal,
  type DocumentRenewalItem,
} from '../utils/documentRenewal';

type DocumentRenewalNativeModule = {
  syncReminder: (documentsJson: string) => Promise<void>;
  cancelReminders: () => Promise<void>;
  consumeOpenRequest: () => Promise<boolean>;
};

const nativeModule = NativeModules.DocumentRenewal as DocumentRenewalNativeModule | undefined;

export function isDocumentRenewalNativeLinked(): boolean {
  return Platform.OS === 'android' && nativeModule != null && typeof nativeModule.syncReminder === 'function';
}

export async function syncDocumentRenewalReminders(items: DocumentRenewalItem[]): Promise<void> {
  const signedIn = await getSessionAuthenticated();
  const due = signedIn ? documentsStillNeedingRenewal(items) : [];
  if (!signedIn || due.length === 0) {
    await cancelDocumentRenewalReminders();
    return;
  }
  if (!isDocumentRenewalNativeLinked() || !nativeModule) {
    return;
  }

  await requestShiftReminderNotificationPermission({
    title: 'Document renewals',
    message:
      'Allow CruLynk to remind you every day when a certificate, licence, permit, or check is close to expiry, until you upload the renewed document.',
  });

  try {
    await nativeModule.syncReminder(
      JSON.stringify(due.map((item) => ({ label: item.label, expiry: item.expiry }))),
    );
  } catch (error) {
    if (__DEV__) {
      console.warn('[DocumentRenewal] syncReminder failed:', error);
    }
  }
}

export async function cancelDocumentRenewalReminders(): Promise<void> {
  if (!isDocumentRenewalNativeLinked() || !nativeModule?.cancelReminders) {
    return;
  }
  try {
    await nativeModule.cancelReminders();
  } catch {
    /* ignore */
  }
}

export async function consumeDocumentRenewalOpenRequest(): Promise<boolean> {
  if (!isDocumentRenewalNativeLinked() || !nativeModule?.consumeOpenRequest) {
    return false;
  }
  try {
    return Boolean(await nativeModule.consumeOpenRequest());
  } catch {
    return false;
  }
}
