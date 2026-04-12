import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { SweetAlert } from '../components/SweetAlert';

type LogoutSweetAlertContextValue = {
  openLogoutSweetAlert: () => void;
};

const LogoutSweetAlertContext = createContext<LogoutSweetAlertContextValue | null>(null);

export function LogoutSweetAlertProvider({ children }: { children: React.ReactNode }) {
  const navigation = useNavigation<any>();
  const [visible, setVisible] = useState(false);

  const close = useCallback(() => setVisible(false), []);

  const onConfirm = useCallback(() => {
    setVisible(false);
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      }),
    );
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
