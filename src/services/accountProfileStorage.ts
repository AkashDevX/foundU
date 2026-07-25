import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfileSnapshot } from '../types/userProfile';

const STORAGE_KEY = '@workforce_account_profile_v1';

/** Baseline before any registration or API-filled data (no demo placeholders). */
export const DEFAULT_ACCOUNT_PROFILE: UserProfileSnapshot = {};

export async function loadAccountProfile(): Promise<UserProfileSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UserProfileSnapshot;
      return { ...DEFAULT_ACCOUNT_PROFILE, ...parsed };
    }
  } catch {
    /* corrupt or unreadable storage — start empty */
  }
  return { ...DEFAULT_ACCOUNT_PROFILE };
}

export async function saveAccountProfile(profile: UserProfileSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** Removes the cached profile — call on logout so the next user never sees stale name/photo. */
export async function clearAccountProfile(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* best-effort */
  }
}

/** Greeting line under "Welcome back," — prefers full name from registration, then email local-part. */
/** For avatars: use the server `profilePhotoUrl` if present, else the on-device `profilePhotoLocalUri` from registration. */
export function getDisplayProfilePhotoUri(
  profile: UserProfileSnapshot | null | undefined,
): string | null {
  if (!profile) return null;
  const remote = profile.profilePhotoUrl?.trim();
  if (remote) return remote;
  const local = profile.profilePhotoLocalUri?.trim();
  if (local) return local;
  return null;
}

export function welcomeDisplayName(profile: UserProfileSnapshot): string {
  const full = profile.fullLegalName?.trim();
  if (full) return full;
  const email = profile.email?.trim();
  if (email) {
    const local = email.split('@')[0]?.trim();
    if (local) return local;
  }
  return 'there';
}
