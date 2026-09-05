import { useState, useCallback, useEffect } from 'react';
import { loadAccountProfile } from '../services/accountProfileStorage';
import type { UserProfileSnapshot } from '../types/userProfile';

/**
 * Header avatars use the local profile cache only.
 * Hitting `/api/v1/me` on every tab mount stacked with geofence/chat polls and
 * delayed Shifts/Tasks/Training on single-threaded local Laravel.
 */
export function useHeaderProfileSnapshot(): UserProfileSnapshot | null {
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      setProfile(await loadAccountProfile());
    })();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return profile;
}
