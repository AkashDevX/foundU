import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, fontFamily } from '../theme/theme';

export type FullScreenLoaderProps = {
  /** Shown under the spinner (also used for accessibility). */
  message?: string;
  /** Brand = navy + white spinner; light = muted gray shell for stacked/light flows. */
  variant?: 'brand' | 'light';
};

export function FullScreenLoader({
  message = 'Loading…',
  variant = 'brand',
}: FullScreenLoaderProps) {
  const brand = variant === 'brand';
  return (
    <View
      style={[styles.root, { backgroundColor: brand ? colors.primary : colors.surfaceMuted }]}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="large" color={brand ? colors.white : colors.accent} />
      <Text style={[styles.message, brand ? styles.messageBrand : styles.messageLight]}>{message}</Text>
      <Text style={[styles.hint, brand ? styles.hintBrand : styles.hintLight]}>
        The app is still working
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  message: {
    marginTop: 20,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  messageBrand: { color: colors.white },
  messageLight: { color: colors.text.secondary },
  hint: {
    marginTop: 8,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  hintBrand: { color: 'rgba(255,255,255,0.82)' },
  hintLight: { color: colors.icon },
});
