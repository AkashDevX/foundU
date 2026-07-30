import React, { useEffect, useMemo, useState } from 'react';
import { FullScreenLoader } from './FullScreenLoader';
import { useAppBootstrap } from '../context/AppBootstrapContext';
import { useAuthSession } from '../context/AuthSessionContext';
import { runWhenIdle } from '../utils/runWhenIdle';

const STARTUP_TIMEOUT_MS = 10_000;

type AppShellProps = {
  children: React.ReactNode;
};

function startupMessage(uiReady: boolean, cacheHydrated: boolean): string {
  if (!uiReady) {
    return 'Starting CruLynk…';
  }
  if (!cacheHydrated) {
    return 'Loading organizations…';
  }
  return 'Preparing sign-in…';
}

/**
 * Shows a branded loader until the JS thread has settled and bootstrap cache
 * has been read — avoids a frozen-looking navy screen and reduces ANR risk
 * from mounting the full navigator during heavy module evaluation.
 */
export function AppShell({ children }: AppShellProps) {
  const { cacheHydrated } = useAppBootstrap();
  const { hydrated: sessionHydrated } = useAuthSession();
  const [uiReady, setUiReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    // Defer marking the UI as ready until the JS thread goes idle, so we don't
    // flip the loader off in the middle of heavy startup work.
    return runWhenIdle(() => requestAnimationFrame(() => setUiReady(true)));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const appReady = (uiReady && cacheHydrated && sessionHydrated) || timedOut;
  const message = useMemo(() => startupMessage(uiReady, cacheHydrated), [uiReady, cacheHydrated]);

  if (!appReady) {
    return <FullScreenLoader message={message} />;
  }

  return <>{children}</>;
}
