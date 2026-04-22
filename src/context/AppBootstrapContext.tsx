import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchBootstrap } from '../services/bootstrapApi';
import type { BootstrapCompany, BootstrapPayload, PicklistOption } from '../types/bootstrap';

type AppBootstrapContextValue = {
  loading: boolean;
  error: string | null;
  companies: BootstrapCompany[];
  picklists: Record<string, PicklistOption[]>;
  refetch: () => Promise<void>;
};

const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(null);

export function AppBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BootstrapPayload | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchBootstrap());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<AppBootstrapContextValue>(
    () => ({
      loading,
      error,
      companies: data?.companies ?? [],
      picklists: data?.picklists ?? {},
      refetch: load,
    }),
    [loading, error, data, load],
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
