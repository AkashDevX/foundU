import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Animated,
  Easing,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { fetchChatFaqs } from '../../services/messagingApi';
import { normalizeChatFaq, type ChatFaq } from './chatFaqs';

const NAVY = '#003D7A';
const ACCENT = '#004C99';
const METAL = '#F2F6FB';
const METAL_MID = '#D7E2EF';
const METAL_DARK = '#9FB2C9';
const BODY = '#0C457F';
const BODY_LIGHT = '#1560A8';
const VISOR = '#041526';
const GLOW = '#6EC1FF';
const GLOW_SOFT = 'rgba(110,193,255,0.28)';

const WELCOME =
  "Hi — I'm LynkBot, your CruLynk site guide. Tap a question below and I'll answer it for you.";

type Mood = 'idle' | 'thinking' | 'talking';

function HelpMascot({ mood }: { mood: Mood }) {
  const hover = useRef(new Animated.Value(0)).current;
  const antenna = useRef(new Animated.Value(0)).current;
  const eyeGlow = useRef(new Animated.Value(0.85)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const arm = useRef(new Animated.Value(0)).current;
  const speaker = useRef(new Animated.Value(0)).current;
  const thruster = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const chestPulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const hoverLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(hover, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(hover, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const thrusterLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(thruster, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(thruster, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const antennaLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(antenna, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(antenna, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(2800),
        Animated.timing(blink, { toValue: 0.15, duration: 70, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: true }),
      ]),
    );
    const chestLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(chestPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(chestPulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ]),
    );
    hoverLoop.start();
    thrusterLoop.start();
    antennaLoop.start();
    blinkLoop.start();
    chestLoop.start();
    return () => {
      hoverLoop.stop();
      thrusterLoop.stop();
      antennaLoop.stop();
      blinkLoop.stop();
      chestLoop.stop();
    };
  }, [hover, thruster, antenna, blink, chestPulse]);

  useEffect(() => {
    if (mood === 'thinking') {
      const scanLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(scan, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scan, {
            toValue: 0,
            duration: 650,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      const ringLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(ring, {
            toValue: 1,
            duration: 900,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      scanLoop.start();
      ringLoop.start();
      return () => {
        scanLoop.stop();
        ringLoop.stop();
      };
    }
    scan.setValue(0.5);
    ring.setValue(0);
  }, [mood, scan, ring]);

  useEffect(() => {
    if (mood === 'talking') {
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(eyeGlow, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(eyeGlow, { toValue: 0.5, duration: 180, useNativeDriver: true }),
        ]),
      );
      const speakerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(speaker, { toValue: 1, duration: 120, useNativeDriver: true }),
          Animated.timing(speaker, { toValue: 0.15, duration: 120, useNativeDriver: true }),
        ]),
      );
      const armLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(arm, {
            toValue: 1,
            duration: 340,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(arm, {
            toValue: 0,
            duration: 340,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      const ringLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(ring, {
            toValue: 1,
            duration: 700,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      glowLoop.start();
      speakerLoop.start();
      armLoop.start();
      ringLoop.start();
      return () => {
        glowLoop.stop();
        speakerLoop.stop();
        armLoop.stop();
        ringLoop.stop();
      };
    }
    Animated.timing(eyeGlow, { toValue: 0.85, duration: 200, useNativeDriver: true }).start();
    speaker.setValue(0);
    arm.setValue(0);
  }, [mood, eyeGlow, speaker, arm, ring]);

  const translateY = hover.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const shadowScale = hover.interpolate({ inputRange: [0, 1], outputRange: [1, 0.75] });
  const shadowOpacity = hover.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.08] });
  const antennaRotate = antenna.interpolate({
    inputRange: [0, 1],
    outputRange: ['-10deg', '10deg'],
  });
  const scanX = scan.interpolate({ inputRange: [0, 1], outputRange: [-12, 12] });
  const armRotateL = arm.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '14deg'],
  });
  const armRotateR = arm.interpolate({
    inputRange: [0, 1],
    outputRange: ['18deg', '-10deg'],
  });
  const speakerScale = speaker.interpolate({
    inputRange: [0, 1],
    outputRange: [0.65, 1.2],
  });
  const waveScale = speaker.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.35],
  });
  const waveOpacity = speaker.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 0.1],
  });
  const thrusterScale = thruster.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 1.15],
  });
  const thrusterOpacity = thruster.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.35] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const statusLabel =
    mood === 'thinking' ? 'Processing…' : mood === 'talking' ? 'Responding…' : 'Online';

  return (
    <View style={mascotStyles.stage}>
      <View style={mascotStyles.stageGlow} />

      <Animated.View
        pointerEvents="none"
        style={[
          mascotStyles.pulseRing,
          { opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />

      <Animated.View style={{ alignItems: 'center', transform: [{ translateY }] }}>
        <Animated.View
          style={[mascotStyles.antennaWrap, { transform: [{ rotate: antennaRotate }] }]}
        >
          <View style={mascotStyles.antennaBase} />
          <View style={mascotStyles.antennaRod} />
          <View
            style={[
              mascotStyles.antennaTip,
              mood === 'thinking' && mascotStyles.antennaTipThink,
              mood === 'talking' && mascotStyles.antennaTipTalk,
            ]}
          />
        </Animated.View>

        <View style={mascotStyles.head}>
          <View style={mascotStyles.headShine} />
          <View style={mascotStyles.headChin} />
          <View style={mascotStyles.earL}>
            <View style={mascotStyles.earInner} />
          </View>
          <View style={mascotStyles.earR}>
            <View style={mascotStyles.earInner} />
          </View>

          <View style={mascotStyles.visor}>
            <View style={mascotStyles.visorGloss} />
            <Animated.View
              style={[
                mascotStyles.eyeRow,
                mood === 'thinking' ? { transform: [{ translateX: scanX }] } : null,
              ]}
            >
              <Animated.View style={[mascotStyles.eyeShell, { transform: [{ scaleY: blink }] }]}>
                <Animated.View style={[mascotStyles.eye, { opacity: eyeGlow }]}>
                  <View style={mascotStyles.eyeCore} />
                  <View style={mascotStyles.eyeShine} />
                </Animated.View>
              </Animated.View>
              <Animated.View style={[mascotStyles.eyeShell, { transform: [{ scaleY: blink }] }]}>
                <Animated.View style={[mascotStyles.eye, { opacity: eyeGlow }]}>
                  <View style={mascotStyles.eyeCore} />
                  <View style={mascotStyles.eyeShine} />
                </Animated.View>
              </Animated.View>
            </Animated.View>
            {mood === 'thinking' ? (
              <Animated.View
                style={[mascotStyles.scanBeam, { transform: [{ translateX: scanX }] }]}
              />
            ) : null}
          </View>

          <View style={mascotStyles.mouthRow}>
            {mood === 'talking' ? (
              <>
                <Animated.View
                  style={[
                    mascotStyles.soundWave,
                    { opacity: waveOpacity, transform: [{ scale: waveScale }] },
                  ]}
                />
                <Animated.View
                  style={[mascotStyles.speaker, { transform: [{ scaleX: speakerScale }] }]}
                />
                <Animated.View
                  style={[
                    mascotStyles.soundWave,
                    { opacity: waveOpacity, transform: [{ scale: waveScale }] },
                  ]}
                />
              </>
            ) : (
              <View style={mascotStyles.speakerIdle} />
            )}
          </View>
        </View>

        <View style={mascotStyles.neck}>
          <View style={mascotStyles.neckRing} />
        </View>

        <View style={mascotStyles.body}>
          <View style={mascotStyles.bodyHighlight} />
          <View style={mascotStyles.chestPanel}>
            <Animated.View style={[mascotStyles.chestLed, { opacity: chestPulse }]}>
              <View
                style={[
                  mascotStyles.chestLedCore,
                  mood === 'thinking' && mascotStyles.chestLedThink,
                  mood === 'talking' && mascotStyles.chestLedTalk,
                ]}
              />
            </Animated.View>
            <Text style={mascotStyles.chestText}>CL</Text>
            <View style={mascotStyles.chestBars}>
              <View style={mascotStyles.chestBar} />
              <View style={[mascotStyles.chestBar, mascotStyles.chestBarMid]} />
              <View style={mascotStyles.chestBar} />
            </View>
          </View>

          <Animated.View
            style={[mascotStyles.arm, mascotStyles.armL, { transform: [{ rotate: armRotateL }] }]}
          >
            <View style={mascotStyles.armJoint} />
            <View style={mascotStyles.hand} />
          </Animated.View>
          <Animated.View
            style={[mascotStyles.arm, mascotStyles.armR, { transform: [{ rotate: armRotateR }] }]}
          >
            <View style={mascotStyles.armJoint} />
            <View style={mascotStyles.hand} />
          </Animated.View>

          <View style={mascotStyles.legRow}>
            <View style={mascotStyles.leg}>
              <Animated.View
                style={[
                  mascotStyles.thruster,
                  { opacity: thrusterOpacity, transform: [{ scaleY: thrusterScale }] },
                ]}
              />
            </View>
            <View style={mascotStyles.leg}>
              <Animated.View
                style={[
                  mascotStyles.thruster,
                  { opacity: thrusterOpacity, transform: [{ scaleY: thrusterScale }] },
                ]}
              />
            </View>
          </View>
        </View>
      </Animated.View>

      <Animated.View
        style={[
          mascotStyles.groundShadow,
          { opacity: shadowOpacity, transform: [{ scaleX: shadowScale }] },
        ]}
      />

      <View style={mascotStyles.statusPill}>
        <View
          style={[
            mascotStyles.statusDot,
            mood === 'thinking' && mascotStyles.statusDotThink,
            mood === 'talking' && mascotStyles.statusDotTalk,
          ]}
        />
        <Text style={mascotStyles.statusText}>{statusLabel}</Text>
      </View>
    </View>
  );
}

const mascotStyles = StyleSheet.create({
  stage: {
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingTop: spacing.lg,
    minHeight: 228,
  },
  stageGlow: {
    position: 'absolute',
    top: 28,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: GLOW_SOFT,
  },
  pulseRing: {
    position: 'absolute',
    top: 36,
    width: 136,
    height: 136,
    borderRadius: 68,
    borderWidth: 2,
    borderColor: 'rgba(110,193,255,0.55)',
  },
  antennaWrap: {
    alignItems: 'center',
    marginBottom: -2,
    zIndex: 6,
  },
  antennaBase: {
    width: 12,
    height: 6,
    borderRadius: 3,
    backgroundColor: METAL_DARK,
    marginBottom: -1,
  },
  antennaRod: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: METAL_MID,
  },
  antennaTip: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    marginTop: -3,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  antennaTipThink: { backgroundColor: '#F59E0B' },
  antennaTipTalk: { backgroundColor: GLOW },
  head: {
    width: 102,
    height: 86,
    borderRadius: 30,
    backgroundColor: METAL,
    borderWidth: 2,
    borderColor: METAL_MID,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 5,
    zIndex: 5,
  },
  headShine: {
    position: 'absolute',
    top: 7,
    left: 16,
    right: 16,
    height: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  headChin: {
    position: 'absolute',
    bottom: 6,
    width: 36,
    height: 8,
    borderRadius: 6,
    backgroundColor: METAL_MID,
    opacity: 0.55,
  },
  earL: {
    position: 'absolute',
    left: -12,
    top: 30,
    width: 16,
    height: 26,
    borderRadius: 8,
    backgroundColor: BODY,
    borderWidth: 2,
    borderColor: BODY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earR: {
    position: 'absolute',
    right: -12,
    top: 30,
    width: 16,
    height: 26,
    borderRadius: 8,
    backgroundColor: BODY,
    borderWidth: 2,
    borderColor: BODY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earInner: {
    width: 6,
    height: 10,
    borderRadius: 3,
    backgroundColor: GLOW,
    opacity: 0.85,
  },
  visor: {
    width: 74,
    height: 32,
    borderRadius: 16,
    backgroundColor: VISOR,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(110,193,255,0.4)',
  },
  visorGloss: {
    position: 'absolute',
    top: 3,
    left: 8,
    right: 8,
    height: 7,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  eyeRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  eyeShell: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eye: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: GLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeCore: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#EAF6FF',
  },
  eyeShine: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  scanBeam: {
    position: 'absolute',
    width: 18,
    height: 22,
    borderRadius: 4,
    backgroundColor: 'rgba(110,193,255,0.18)',
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: 'rgba(110,193,255,0.55)',
  },
  mouthRow: {
    marginTop: 8,
    height: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  speaker: {
    width: 24,
    height: 6,
    borderRadius: 3,
    backgroundColor: BODY_LIGHT,
  },
  speakerIdle: {
    width: 20,
    height: 4,
    borderRadius: 2,
    backgroundColor: METAL_DARK,
    opacity: 0.7,
  },
  soundWave: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: GLOW,
    backgroundColor: 'transparent',
  },
  neck: {
    width: 22,
    height: 12,
    borderRadius: 6,
    backgroundColor: METAL_MID,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    marginTop: -1,
  },
  neckRing: {
    width: 14,
    height: 4,
    borderRadius: 2,
    backgroundColor: METAL_DARK,
  },
  body: {
    width: 86,
    height: 72,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: BODY,
    alignItems: 'center',
    paddingTop: 10,
    borderWidth: 2,
    borderColor: BODY_LIGHT,
    zIndex: 3,
  },
  bodyHighlight: {
    position: 'absolute',
    top: 6,
    left: 12,
    right: 12,
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  chestPanel: {
    width: 48,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chestLed: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chestLedCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  chestLedThink: { backgroundColor: '#F59E0B' },
  chestLedTalk: { backgroundColor: GLOW },
  chestText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 1,
  },
  chestBars: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 1,
  },
  chestBar: {
    width: 7,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  chestBarMid: {
    backgroundColor: 'rgba(110,193,255,0.7)',
  },
  arm: {
    position: 'absolute',
    top: 12,
    width: 15,
    height: 38,
    borderRadius: 9,
    backgroundColor: METAL,
    borderWidth: 1.5,
    borderColor: METAL_MID,
    alignItems: 'center',
    paddingTop: 4,
    justifyContent: 'space-between',
    paddingBottom: 3,
  },
  armL: { left: -18 },
  armR: { right: -18 },
  armJoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: METAL_DARK,
  },
  hand: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: BODY_LIGHT,
    borderWidth: 1,
    borderColor: GLOW,
  },
  legRow: {
    position: 'absolute',
    bottom: -6,
    flexDirection: 'row',
    gap: 14,
  },
  leg: {
    width: 16,
    height: 14,
    borderRadius: 6,
    backgroundColor: METAL_MID,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  thruster: {
    width: 10,
    height: 12,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: GLOW,
    marginBottom: -8,
  },
  groundShadow: {
    marginTop: 10,
    width: 72,
    height: 12,
    borderRadius: 6,
    backgroundColor: NAVY,
  },
  statusPill: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(0,61,122,0.06)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  statusDotThink: { backgroundColor: '#F59E0B' },
  statusDotTalk: { backgroundColor: ACCENT },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.text.secondary,
  },
});

export function ChatHelpScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const answerPanelY = useRef(0);
  const [faqs, setFaqs] = useState<ChatFaq[]>([]);
  const [faqsLoading, setFaqsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [faqsError, setFaqsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [displayText, setDisplayText] = useState(WELCOME);
  const [mood, setMood] = useState<Mood>('idle');
  const bubbleFade = useRef(new Animated.Value(1)).current;
  const bubblePulse = useRef(new Animated.Value(0)).current;
  const cursorBlink = useRef(new Animated.Value(1)).current;
  const typeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFaqs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setFaqsLoading(true);
    setFaqsError(null);
    const result = await fetchChatFaqs();
    if (!result.ok) {
      setFaqsError(result.message);
      if (!isRefresh) setFaqs([]);
    } else {
      setFaqs((result.data.faqs ?? []).map(normalizeChatFaq));
    }
    setFaqsLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadFaqs(false);
  }, [loadFaqs]);

  const onRefresh = useCallback(() => {
    void loadFaqs(true);
  }, [loadFaqs]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorBlink, { toValue: 0.15, duration: 420, useNativeDriver: true }),
        Animated.timing(cursorBlink, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [cursorBlink]);

  useEffect(() => {
    return () => {
      if (typeTimer.current) clearInterval(typeTimer.current);
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
    };
  }, []);

  const focusAnswerPanel = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, answerPanelY.current - 8),
        animated: true,
      });
    });
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (typeTimer.current) clearInterval(typeTimer.current);
      if (thinkTimer.current) clearTimeout(thinkTimer.current);

      focusAnswerPanel();
      setMood('thinking');
      setDisplayText('…');
      Animated.parallel([
        Animated.timing(bubbleFade, { toValue: 0.4, duration: 160, useNativeDriver: true }),
        Animated.timing(bubblePulse, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();

      thinkTimer.current = setTimeout(() => {
        setMood('talking');
        Animated.timing(bubbleFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        focusAnswerPanel();

        let i = 0;
        setDisplayText('');
        typeTimer.current = setInterval(() => {
          i += 1;
          setDisplayText(text.slice(0, i));
          if (i >= text.length) {
            if (typeTimer.current) clearInterval(typeTimer.current);
            typeTimer.current = null;
            setMood('idle');
            Animated.timing(bubblePulse, {
              toValue: 0,
              duration: 280,
              useNativeDriver: true,
            }).start();
          }
        }, 14);
      }, 420);
    },
    [bubbleFade, bubblePulse, focusAnswerPanel],
  );

  const answering = mood === 'thinking' || mood === 'talking';

  const onPressFaq = useCallback(
    (faq: ChatFaq) => {
      setSelectedId(faq.id);
      speak(faq.answer);
    },
    [speak],
  );

  const bubbleScale = bubblePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.015],
  });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
          accessibilityLabel="Go back"
        >
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerTitle}>Help FAQ</Text>
          <Text style={styles.headerSub}>LynkBot · Site guide</Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={onRefresh}
          activeOpacity={0.75}
          disabled={refreshing || faqsLoading}
          accessibilityLabel="Refresh help topics"
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={NAVY} />
          ) : (
            <Feather name="help-circle" size={22} color={NAVY} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 20) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ACCENT}
            colors={[ACCENT]}
          />
        }
      >
        <View
          onLayout={(e) => {
            answerPanelY.current = e.nativeEvent.layout.y;
          }}
          style={styles.characterCard}
        >
          <HelpMascot mood={mood} />
          <Animated.View
            style={[
              styles.speechBubble,
              answering && styles.speechBubbleActive,
              {
                opacity: bubbleFade,
                transform: [{ scale: bubbleScale }],
              },
            ]}
          >
            <View style={styles.speechHeader}>
              <View style={styles.speechBadge}>
                <Feather name="cpu" size={12} color={ACCENT} />
              </View>
              <Text style={styles.speechName}>LynkBot</Text>
            </View>
            <Text style={styles.speechText}>
              {displayText}
              {mood === 'talking' ? (
                <Animated.Text style={[styles.cursor, { opacity: cursorBlink }]}>|</Animated.Text>
              ) : null}
            </Text>
          </Animated.View>
        </View>

        <Text style={styles.sectionLabel}>Tap a question</Text>
        {faqsLoading && !refreshing ? (
          <View style={styles.faqState}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.faqStateText}>Loading help topics…</Text>
          </View>
        ) : faqsError && faqs.length === 0 ? (
          <View style={styles.faqState}>
            <Text style={styles.faqStateText}>{faqsError}</Text>
            <TouchableOpacity
              style={styles.faqRetry}
              onPress={() => void loadFaqs(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.faqRetryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : faqs.length === 0 ? (
          <View style={styles.faqState}>
            <Text style={styles.faqStateText}>
              No help topics yet. Your organisation admin can add them under Organization setup.
            </Text>
          </View>
        ) : (
          <View style={styles.questionList}>
            {faqs.map((faq) => {
              const active = selectedId === faq.id;
              return (
                <TouchableOpacity
                  key={faq.id}
                  style={[styles.questionCard, active && styles.questionCardActive]}
                  onPress={() => onPressFaq(faq)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={faq.question}
                >
                  <View style={[styles.questionIcon, active && styles.questionIconActive]}>
                    <Feather name={faq.icon} size={18} color={active ? '#FFFFFF' : ACCENT} />
                  </View>
                  <View style={styles.questionTextCol}>
                    <Text style={[styles.questionLabel, active && styles.questionLabelActive]}>
                      {faq.label}
                    </Text>
                    <Text style={styles.questionText} numberOfLines={2}>
                      {faq.question}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={active ? ACCENT : '#94A3B8'} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 6,
  },
  headerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,61,122,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: NAVY,
    letterSpacing: -0.3,
  },
  headerSub: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.lg,
  },
  characterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,76,153,0.1)',
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 4,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  speechBubble: {
    backgroundColor: '#F5F8FC',
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(0,76,153,0.12)',
    minHeight: 104,
  },
  speechBubbleActive: {
    borderColor: 'rgba(0,76,153,0.32)',
    backgroundColor: '#F0F6FC',
  },
  speechHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xs,
  },
  speechBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,76,153,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speechName: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: ACCENT,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  speechText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text.primary,
  },
  cursor: {
    fontFamily: fontFamily.bold,
    color: ACCENT,
  },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  faqState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  faqStateText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  faqRetry: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  faqRetryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  questionList: {
    gap: spacing.sm,
  },
  questionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minHeight: 72,
  },
  questionCardActive: {
    borderColor: 'rgba(0,76,153,0.35)',
    backgroundColor: 'rgba(0,76,153,0.04)',
  },
  questionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,76,153,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionIconActive: {
    backgroundColor: ACCENT,
  },
  questionTextCol: {
    flex: 1,
    minWidth: 0,
  },
  questionLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: NAVY,
    marginBottom: 2,
  },
  questionLabelActive: {
    color: ACCENT,
  },
  questionText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
});
