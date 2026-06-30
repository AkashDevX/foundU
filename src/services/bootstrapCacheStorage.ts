import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BootstrapPayload } from '../types/bootstrap';

const BOOTSTRAP_CACHE_KEY = '@foundu/bootstrap_cache_v1';

export async function loadBootstrapCache(): Promise<BootstrapPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(BOOTSTRAP_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BootstrapPayload;
    if (!parsed || !Array.isArray(parsed.companies) || parsed.companies.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveBootstrapCache(payload: BootstrapPayload): Promise<void> {
  try {
    await AsyncStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* cache is best-effort */
  }
}
