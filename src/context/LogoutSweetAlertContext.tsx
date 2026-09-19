import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { SweetAlert } from '../components/SweetAlert';
import { setAuthToken, setLastCompanySlug, setSessionAuthenticated } from '../services/authSessionStorage';
import { clearAccountProfile } from '../services/accountProfileStorage';
import { navigationRef, stopChatPush } from '../services/chatPush';

type LogoutSweetAlertContextValue = {
  openLogoutSweetAlert: () => void;
};

const LogoutSweetAlertContext = createContext<LogoutSweetAlertContextValue | null>(null);

/** Cap FCM/network cleanup so a hung getToken/fetch never traps the user on Main. */
const PUSH_CLEANUP_BUDGET_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
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

export function LogoutSweetAlertProvider({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<any>();
  const [visible, setVisible] = useState(false);

  const close = useCallback(() => setVisible(false), []);

  const onConfirm = useCallback(async () => {
    setVisible(false);

    // Unregister while the auth token is still present, but never block logout.
    await withTimeout(stopChatPush(), PUSH_CLEANUP_BUDGET_MS);

    await Promise.all([
      setSessionAuthenticated(false),
      setAuthToken(null),
      setLastCompanySlug(null),
      clearAccountProfile(),
    ]);

    const reset = CommonActions.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
    if (navigationRef.isReady()) {
      navigationRef.dispatch(reset);
    } else {
      navigation.dispatch(reset);
    }
  }, [navigation]);

  const value = useMemo(
    () => ({
      openLogoutSweetAlert: () => setVisible(true),
    }),
    [],
  );

  return (
    <LogoutSweetAlertContext.Provider value={value}>
      {children}
      <SweetAlert
        visible={visible}
        variant="danger"
        title="Log out?"
        message="Are you sure you want to log out? You will need to sign in again to use the app."
        confirmText="Yes, log out"
        cancelText="Cancel"
        onConfirm={onConfirm}
        onClose={close}
      />
    </LogoutSweetAlertContext.Provider>
  );
}

export function useLogoutSweetAlert(): LogoutSweetAlertContextValue {
  const ctx = useContext(LogoutSweetAlertContext);
  if (!ctx) {
    throw new Error('useLogoutSweetAlert must be used within LogoutSweetAlertProvider');
  }
  return ctx;
}
