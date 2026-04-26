import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Platform,
  ActivityIndicator,
  type ImageStyle,
  type ViewStyle,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors } from '../theme/theme';
import {
  fetchProfileImageAsDataUri,
  getProfileImageLoadSource,
  resolveNetworkProfilePhotoToDisplayableUri,
} from '../utils/profileImageLoad';

type ProfilePhotoAvatarProps = {
  /** Full URL; empty/invalid shows the default user icon */
  photoUri: string | null | undefined;
  size: number;
  iconSize: number;
  iconColor?: string;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Rounded profile image, or a Feather "user" placeholder.
 * Same-origin images are loaded with `fetch` + `data:` (RN `Image` often ignores `source.headers` on Android).
 * All hooks run unconditionally; any `return` is only after every hook.
 */
export function ProfilePhotoAvatar({
  photoUri,
  size,
  iconSize,
  iconColor = colors.primary,
  style,
  testID,
}: ProfilePhotoAvatarProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [fetchedDisplayUri, setFetchedDisplayUri] = useState<string | null>(null);
  const retriedWithAuthDataUri = useRef(false);

  const raw = useMemo((): string | null => {
    if (!photoUri) return null;
    const t = String(photoUri).trim();
    return t === '' ? null : t;
  }, [photoUri]);

  const needsNetwork = useMemo(
    () => Boolean(raw && (raw.startsWith('http://') || raw.startsWith('https://'))),
    [raw],
  );

  const effectiveDisplayUri = useMemo(() => {
    if (!raw) return null;
    if (!needsNetwork) return raw;
    return fetchedDisplayUri;
  }, [raw, needsNetwork, fetchedDisplayUri]);

  useEffect(() => {
    setLoadFailed(false);
    retriedWithAuthDataUri.current = false;
    if (!raw) {
      setFetchedDisplayUri(null);
      return;
    }
    if (!needsNetwork) {
      setFetchedDisplayUri(null);
      return;
    }
    setFetchedDisplayUri(null);
    void (async () => {
      try {
        setFetchedDisplayUri(await resolveNetworkProfilePhotoToDisplayableUri(raw));
      } catch {
        setLoadFailed(true);
        setFetchedDisplayUri(null);
      }
    })();
  }, [raw, needsNetwork]);

  const onError = useCallback(() => {
    if (!raw || !raw.startsWith('http') || retriedWithAuthDataUri.current) {
      setLoadFailed(true);
      return;
    }
    if (fetchedDisplayUri?.startsWith('data:')) {
      setLoadFailed(true);
      return;
    }
    retriedWithAuthDataUri.current = true;
    void (async () => {
      try {
        const s = await getProfileImageLoadSource(raw);
        if (!s.headers?.Authorization) {
          setLoadFailed(true);
          return;
        }
        const dataUri = await fetchProfileImageAsDataUri(s.uri, s.headers);
        setFetchedDisplayUri(dataUri);
        setLoadFailed(false);
      } catch {
        setLoadFailed(true);
      }
    })();
  }, [raw, fetchedDisplayUri]);

  const r = size / 2;
  const sizeBox: ViewStyle = { width: size, height: size, borderRadius: r, backgroundColor: '#E8EEF5' };
  const imageFill: ImageStyle = { width: size, height: size, position: 'absolute', top: 0, left: 0 };
  const fallbackSize: ViewStyle = { width: size, height: size, borderRadius: r };

  const isLoading = Boolean(needsNetwork && raw && !loadFailed && !fetchedDisplayUri);
  const hasImage = Boolean(raw && !loadFailed && effectiveDisplayUri);

  if (!raw || loadFailed) {
    return (
      <View
        testID={testID}
        style={[styles.fallback, fallbackSize, style]}
        accessibilityLabel="Default profile"
      >
        <Feather name="user" size={iconSize} color={iconColor} />
      </View>
    );
  }

  if (isLoading) {
    return (
      <View
        testID={testID}
        style={[styles.fallback, fallbackSize, { overflow: 'hidden' }, style]}
        accessibilityLabel="Loading profile"
      >
        <ActivityIndicator color={iconColor} />
      </View>
    );
  }

  if (hasImage && effectiveDisplayUri) {
    return (
      <View
        testID={testID}
        style={[sizeBox, styles.imageClip, style]}
        collapsable={false}
        accessibilityLabel="Profile photo container"
      >
        <Image
          key={effectiveDisplayUri}
          source={{ uri: effectiveDisplayUri }}
          style={imageFill}
          resizeMode="cover"
          accessible
          accessibilityLabel="Profile photo"
          onError={onError}
          {...(Platform.OS === 'android' ? { fadeDuration: 0 } : {})}
        />
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={[styles.fallback, fallbackSize, style]}
      accessibilityLabel="Default profile"
    >
      <Feather name="user" size={iconSize} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  imageClip: { overflow: 'hidden' },
  fallback: {
    backgroundColor: '#E8EEF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
