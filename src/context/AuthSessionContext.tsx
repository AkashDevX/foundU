import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAuthToken, getSessionAuthenticated } from '../services/authSessionStorage';

type AuthSessionContextValue = {
  /** True once the persisted session has been read from storage on startup. */
  hydrated: boolean;
  /**
   * Whether a valid session existed at app launch. Used only to choose the
   * initial route (Login vs Main); login/logout continue to drive navigation
   * imperatively and write the persisted flags directly.
   */
  initialAuthenticated: boolean;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

/**
 * Reads the persisted auth session (flag + token) once at startup so a returning
 * user is sent straight to the app instead of the login screen. Keeps the user
 * signed in across restarts / recents-clear until they explicitly log out.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [initialAuthenticated, setInitialAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      let authenticated = false;
      try {
        const [flag, token] = await Promise.all([
          getSessionAuthenticated(),
          getAuthToken(),
        ]);
        authenticated = flag && token != null && token.trim() !== '';
      } finally {
        if (mounted) {
          setInitialAuthenticated(authenticated);
          setHydrated(true);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({ hydrated, initialAuthenticated }),
    [hydrated, initialAuthenticated],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }
  return ctx;
}
