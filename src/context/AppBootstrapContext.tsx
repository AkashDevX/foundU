import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchBootstrap } from '../services/bootstrapApi';
import { loadBootstrapCache } from '../services/bootstrapCacheStorage';
import type { BootstrapCompany, BootstrapPayload, PicklistOption } from '../types/bootstrap';
import { setAppLocale, setAppTimezone } from '../utils/formatDateTime';

type AppBootstrapContextValue = {
  /** True after the bootstrap cache read finishes (used by the startup loader gate). */
  cacheHydrated: boolean;
  /** True only on the first load when no cached organizations are available yet. */
  loading: boolean;
  /** True while a background refresh is in progress (does not block the login UI). */
  refreshing: boolean;
  error: string | null;
  companies: BootstrapCompany[];
  picklists: Record<string, PicklistOption[]>;
  refetch: () => Promise<void>;
};

const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(null);

export function AppBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [cacheHydrated, setCacheHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const mountedRef = useRef(true);
  const dataRef = useRef<BootstrapPayload | null>(null);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async (opts?: { isRefetch?: boolean; hadCache?: boolean }) => {
    const isRefetch = opts?.isRefetch ?? false;
    const hadCache = opts?.hadCache ?? false;

    if (isRefetch) {
      setRefreshing(true);
    } else if (!hadCache) {
      setLoading(true);
    }
    if (isRefetch || !hadCache) {
      setError(null);
    }

    try {
      const payload = await fetchBootstrap();
      if (!mountedRef.current) return;
      setData(payload);
      setError(null);
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      const msg = e instanceof Error ? e.message : String(e);
      const hasUsableOrgs = (dataRef.current?.companies.length ?? 0) > 0;
      if (!isRefetch && !hadCache) {
        setData(null);
        setError(msg);
      } else if (!hasUsableOrgs) {
        setError(msg);
      } else {
        // Background refresh failed but cached orgs are still usable — don't alarm the user.
        setError(null);
      }
    } finally {
      if (!mountedRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      let cached: BootstrapPayload | null = null;
      try {
        cached = await loadBootstrapCache();
      } finally {
        if (mountedRef.current) {
          setCacheHydrated(true);
        }
      }
      if (!mountedRef.current) return;

      if (cached) {
        setData(cached);
        setLoading(false);
        setAppTimezone(cached.timezone);
        setAppLocale(cached.locale);
      }

      await load({ isRefetch: !!cached, hadCache: !!cached });
    })();
  }, [load]);

  const value = useMemo<AppBootstrapContextValue>(
    () => ({
      cacheHydrated,
      loading,
      refreshing,
      error,
      companies: data?.companies ?? [],
      picklists: data?.picklists ?? {},
      refetch: () => load({ isRefetch: true, hadCache: (data?.companies.length ?? 0) > 0 }),
    }),
    [cacheHydrated, loading, refreshing, error, data, load],
  );

  return <AppBootstrapContext.Provider value={value}>{children}</AppBootstrapContext.Provider>;
}

export function useAppBootstrap(): AppBootstrapContextValue {
  const ctx = useContext(AppBootstrapContext);
  if (!ctx) {
    throw new Error('useAppBootstrap must be used within AppBootstrapProvider');
  }
  return ctx;
}
