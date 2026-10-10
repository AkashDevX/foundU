import { useEffect } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { navigationRef } from '../services/chatPush';
import { refreshAndCacheAccountProfileFromApi } from '../services/accountProfileApi';
import { loadAccountProfile } from '../services/accountProfileStorage';
import {
  consumeDocumentRenewalOpenRequest,
  syncDocumentRenewalReminders,
} from '../services/documentRenewalNative';
import { renewalsForProfile } from '../utils/documentRenewal';

export const DOCUMENT_RENEWAL_OPEN_EVENT = 'documentRenewalOpen';

function openMyProfile(): void {
  if (!navigationRef.isReady()) {
    setTimeout(openMyProfile, 400);
    return;
  }
  (navigationRef as { navigate: (name: string) => void }).navigate('MyProfile');
}

async function syncFromProfile(): Promise<void> {
  const result = await refreshAndCacheAccountProfileFromApi();
  const profile = result.ok ? result.profile : await loadAccountProfile();
  await syncDocumentRenewalReminders(renewalsForProfile(profile));
}

/** Schedules the daily renewal reminder and opens My profile when that notification is tapped. */
export function DocumentRenewalMonitor() {
  useEffect(() => {
    let cancelled = false;

    const sync = () => {
      void (async () => {
        if (cancelled) return;
        await syncFromProfile();
        if (cancelled) return;
        if (await consumeDocumentRenewalOpenRequest()) {
          openMyProfile();
        }
      })();
    };

    sync();
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync();
    });
    const opened = DeviceEventEmitter.addListener(DOCUMENT_RENEWAL_OPEN_EVENT, () => {
      openMyProfile();
    });

    return () => {
      cancelled = true;
      appState.remove();
      opened.remove();
    };
  }, []);

  return null;
}
