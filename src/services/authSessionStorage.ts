import AsyncStorage from '@react-native-async-storage/async-storage';

/** Set `true` only after login/auth API succeeds — not when opening the app or loading bootstrap. */
const SESSION_FLAG_KEY = '@foundu_session_authenticated_v1';

/** Laravel Sanctum (or similar) bearer token returned by POST /api/v1/login — used for authenticated API calls. */
const AUTH_TOKEN_KEY = '@foundu_auth_token_v1';

export async function getSessionAuthenticated(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_FLAG_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function setSessionAuthenticated(value: boolean): Promise<void> {
  await AsyncStorage.setItem(SESSION_FLAG_KEY, value ? '1' : '0');
}

export async function getAuthToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string | null): Promise<void> {
  if (token == null || token === '') {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
}
