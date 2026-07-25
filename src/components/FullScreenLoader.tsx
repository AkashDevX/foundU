import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated, Easing } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily } from '../theme/theme';

export type FullScreenLoaderProps = {
  /** Shown under the wordmark (also used for accessibility). */
  message?: string;
  /** Brand = animated navy splash; light = muted gray shell for stacked/light flows. */
  variant?: 'brand' | 'light';
};

export function FullScreenLoader({
  message = 'Loading…',
  variant = 'brand',
}: FullScreenLoaderProps) {
  if (variant === 'light') {
    return <LightLoader message={message} />;
  }
  return <BrandLoader message={message} />;
}

/**
 * Animated brand splash. Uses the native driver so the pulse/breathe loops stay
 * smooth even while the JS thread is busy hydrating cache on cold start. Its navy
 * background matches the native launch window for a seamless startup transition.
 */
function BrandLoader({ message }: { message: string }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 1800,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const dot = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay(400),
        ]),
      );

    const animations = [
      pulse(ring1, 0),
      pulse(ring2, 900),
      breatheLoop,
      dot(dot1, 0),
      dot(dot2, 150),
      dot(dot3, 300),
    ];
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [ring1, ring2, breathe, dot1, dot2, dot3]);

  const ringStyle = (value: Animated.Value) => ({
    transform: [
      {
        scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.1] }),
      },
    ],
    opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.32, 0] }),
  });

  const badgeStyle = {
    transform: [
      {
        scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
      },
    ],
  };

  const dotStyle = (value: Animated.Value) => ({
    opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }),
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
    ],
  });

  return (
    <View
      style={styles.brandRoot}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      {/* Brand geometric accents (echoes the login header) */}
      <View style={[styles.geo, styles.geoTopRight]} />
      <View style={[styles.geo, styles.geoBottomLeft]} />

      <View style={styles.markWrap}>
        <Animated.View style={[styles.ring, ringStyle(ring1)]} />
        <Animated.View style={[styles.ring, ringStyle(ring2)]} />
        <Animated.View style={[styles.badge, badgeStyle]}>
          <Feather name="navigation" size={30} color={colors.white} />
        </Animated.View>
      </View>

      <Text style={styles.wordmark}>CruLynk</Text>
      <Text style={styles.tagline}>Precision in Motion</Text>

      <View style={styles.messageRow}>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.dots}>
          <Animated.View style={[styles.dot, dotStyle(dot1)]} />
          <Animated.View style={[styles.dot, dotStyle(dot2)]} />
          <Animated.View style={[styles.dot, dotStyle(dot3)]} />
        </View>
      </View>
    </View>
  );
}

function LightLoader({ message }: { message: string }) {
  const label = useMemo(() => message, [message]);
  return (
    <View
      style={styles.lightRoot}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.lightMessage}>{label}</Text>
    </View>
  );
}

const RING_SIZE = 96;
const BADGE_SIZE = 72;

const styles = StyleSheet.create({
  brandRoot: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    overflow: 'hidden',
  },
  geo: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 40,
  },
  geoTopRight: {
    width: 220,
    height: 220,
    top: -80,
    right: -70,
    transform: [{ rotate: '25deg' }],
  },
  geoBottomLeft: {
    width: 180,
    height: 180,
    bottom: -60,
    left: -60,
    transform: [{ rotate: '18deg' }],
  },
  markWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.white,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fontFamily.bold,
    fontSize: 30,
    letterSpacing: 0.5,
    color: colors.white,
  },
  tagline: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
  },
  messageRow: {
    marginTop: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  message: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    marginLeft: 6,
    alignItems: 'flex-end',
    paddingBottom: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 1.5,
    backgroundColor: colors.white,
  },
  lightRoot: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  lightMessage: {
    marginTop: 20,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});
