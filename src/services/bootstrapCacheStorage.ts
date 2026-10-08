import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';
import type { BootstrapPayload } from '../types/bootstrap';

const BOOTSTRAP_CACHE_KEY = '@foundu/bootstrap_cache_v1';

type CachedBootstrap = BootstrapPayload & { apiBaseUrl?: string };

export async function loadBootstrapCache(): Promise<BootstrapPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedBootstrap;
    if (!parsed || !Array.isArray(parsed.companies) || parsed.companies.length === 0) {
      return null;
    }
    // Ignore a cache saved against a different server (local vs live).
    if (parsed.apiBaseUrl !== API_BASE_URL) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveBootstrapCache(payload: BootstrapPayload): Promise<void> {
  try {
    const cached: CachedBootstrap = { ...payload, apiBaseUrl: API_BASE_URL };
    await AsyncStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(cached));
  } catch {
    /* cache is best-effort */
  }
}
