import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { loadAccountProfile } from '../services/accountProfileStorage';
import { refreshAndCacheAccountProfileFromApi } from '../services/accountProfileApi';
import { getSessionAuthenticated } from '../services/authSessionStorage';
import type { UserProfileSnapshot } from '../types/userProfile';

/**
 * Loads the signed-in profile (cache first, then `/api/v1/me` when authenticated) for tab header avatars.
 */
export function useHeaderProfileSnapshot(): UserProfileSnapshot | null {
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      const local = await loadAccountProfile();
      setProfile(local);
      const signedIn = await getSessionAuthenticated();
      if (!signedIn) return;
      const api = await refreshAndCacheAccountProfileFromApi();
      if (api.ok) setProfile(api.profile);
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return profile;
}
