import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  LayoutChangeEvent,
  Platform,
  AppState,
  type AppStateStatus,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeofenceAutoClockOutMonitor } from '../components/GeofenceAutoClockOutMonitor';
import { ShiftComingSoonMonitor } from '../components/ShiftComingSoonMonitor';
import { LogoutSweetAlertProvider } from '../context/LogoutSweetAlertContext';
import { colors, fontFamily } from '../theme/theme';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ShiftsScreen } from '../screens/ShiftsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { TrainingScreen } from '../screens/TrainingScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { FLOATING_TAB_BAR_BOTTOM_INSET } from './floatingTabBarMetrics';
import { runWhenIdle } from '../utils/runWhenIdle';
import { fetchConversations } from '../services/messagingApi';
import { startChatPush } from '../services/chatPush';

const ACTIVE = colors.primary;
const INACTIVE = '#94A3B8';
const DOCK_PAD_H = 8;
const DOCK_PAD_V = 8;

const TABS = [
  { key: 'dashboard', label: 'Home', icon: 'home', screen: DashboardScreen },
  { key: 'shifts', label: 'Shifts', icon: 'calendar', screen: ShiftsScreen },
  { key: 'tasks', label: 'Tasks', icon: 'check-square', screen: TasksScreen },
  { key: 'training', label: 'Train', icon: 'book-open', screen: TrainingScreen },
  { key: 'chat', label: 'Chat', icon: 'message-circle', screen: ChatScreen },
] as const;

export type MainTabKey = (typeof TABS)[number]['key'];

type TabLayout = { x: number; width: number };

function TabItem({
  label,
  icon,
  isActive,
  onPress,
  onLayout,
  badgeCount = 0,
}: {
  label: string;
  icon: string;
  isActive: boolean;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  badgeCount?: number;
}) {
  const focus = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const showBadge = badgeCount > 0;
  const badgeLabel = badgeCount > 99 ? '99+' : String(badgeCount);

  useEffect(() => {
    Animated.spring(focus, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 140,
    }).start();
  }, [isActive, focus]);

  const iconScale = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.12],
  });

  const labelOpacity = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [0.72, 1],
  });

  const onPressIn = () => {
    Animated.spring(press, {
      toValue: 0.92,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(press, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
      tension: 200,
    }).start();
  };

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onLayout={onLayout}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={showBadge ? `${label}, ${badgeCount} unread` : label}
    >
      <Animated.View
        style={[
          styles.tabItemInner,
          { transform: [{ scale: Animated.multiply(press, iconScale) }] },
        ]}
      >
        <View style={styles.iconSlot}>
          {isActive ? <View style={styles.iconGlow} pointerEvents="none" /> : null}
          <Feather
            name={icon as React.ComponentProps<typeof Feather>['name']}
            size={isActive ? 23 : 21}
            color={isActive ? ACTIVE : INACTIVE}
          />
          {showBadge ? (
            <View style={styles.tabBadge} pointerEvents="none">
              <Text style={styles.tabBadgeText}>{badgeLabel}</Text>
            </View>
          ) : null}
        </View>
        <Animated.Text
          style={[
            styles.tabLabel,
            isActive ? styles.tabLabelActive : styles.tabLabelInactive,
            { opacity: labelOpacity },
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

function FloatingTabDock({
  activeTab,
  onChange,
  chatUnreadCount = 0,
}: {
  activeTab: MainTabKey;
  onChange: (key: MainTabKey) => void;
  chatUnreadCount?: number;
}) {
  const [layouts, setLayouts] = useState<Partial<Record<MainTabKey, TabLayout>>>({});
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const activeIndex = TABS.findIndex((t) => t.key === activeTab);

  const onTabLayout = useCallback((key: MainTabKey, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const cur = prev[key];
      if (cur && cur.x === x && cur.width === width) return prev;
      return { ...prev, [key]: { x, width } };
    });
  }, []);

  const activeLayout = layouts[activeTab];
  const allMeasured = TABS.every((t) => layouts[t.key] != null);

  useEffect(() => {
    if (!activeLayout || !allMeasured) return;

    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: activeLayout.x,
        useNativeDriver: false,
        friction: 8,
        tension: 100,
      }),
      Animated.spring(indicatorW, {
        toValue: activeLayout.width,
        useNativeDriver: false,
        friction: 8,
        tension: 100,
      }),
      Animated.timing(indicatorOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [activeLayout, allMeasured, activeTab, indicatorX, indicatorW, indicatorOpacity]);

  const dockEntrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(dockEntrance, {
      toValue: 1,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
      delay: 40,
    }).start();
  }, [dockEntrance]);

  const dockTranslate = dockEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });

  return (
    <Animated.View
      style={[
        styles.dockMotion,
        {
          opacity: dockEntrance,
          transform: [{ translateY: dockTranslate }],
        },
      ]}
    >
      {/* Soft ground shadow under the dock */}
      <View style={styles.dockShadow} pointerEvents="none" />

      <View style={styles.dock}>
        <View style={styles.dockSheen} pointerEvents="none" />

        {allMeasured ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.activeCapsule,
              {
                opacity: indicatorOpacity,
                width: indicatorW,
                transform: [{ translateX: indicatorX }],
              },
            ]}
          >
            <View style={styles.activeCapsuleInner} />
          </Animated.View>
        ) : null}

        <View style={styles.tabRow}>
          {TABS.map((tab, index) => (
            <TabItem
              key={tab.key}
              label={tab.label}
              icon={tab.icon}
              isActive={activeIndex === index}
              onPress={() => onChange(tab.key)}
              onLayout={(e) => onTabLayout(tab.key, e)}
              badgeCount={tab.key === 'chat' ? chatUnreadCount : 0}
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** Count of conversations that have at least one unread message. */
function unreadChatCountFromInbox(
  conversations: Array<{ unread_count?: number | null }>,
): number {
  return conversations.reduce((total, c) => total + ((c.unread_count || 0) > 0 ? 1 : 0), 0);
}

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<MainTabKey>('dashboard');
  const [mountedTabs, setMountedTabs] = useState<Set<MainTabKey>>(() => new Set(['dashboard']));
  const [monitorReady, setMonitorReady] = useState(false);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const bottomOffset = useMemo(
    () => Math.max(insets.bottom, FLOATING_TAB_BAR_BOTTOM_INSET),
    [insets.bottom],
  );

  const refreshChatBadge = useCallback(async () => {
    const res = await fetchConversations();
    if (!res.ok) return;
    setChatUnreadCount(unreadChatCountFromInbox(res.data.conversations || []));
  }, []);

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    const cancel = runWhenIdle(() => setMonitorReady(true));
    return cancel;
  }, []);

  // Register FCM token for locked/background chat alerts.
  useEffect(() => {
    void startChatPush();
  }, []);

  // Badge sync while signed in — keep light so local `artisan serve` is not starved.
  // Skip while Chat is open (ChatScreen already polls the inbox).
  useEffect(() => {
    if (activeTab === 'chat') return undefined;

    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (cancelled || inFlight || AppState.currentState !== 'active') return;
      inFlight = true;
      try {
        await refreshChatBadge();
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const interval = setInterval(() => {
      void tick();
    }, 45_000);

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') void tick();
    };
    const sub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [activeTab, refreshChatBadge]);

  // Refresh once after leaving Chat (messages may have been marked read).
  useEffect(() => {
    if (activeTab !== 'chat') {
      void refreshChatBadge();
    }
  }, [activeTab, refreshChatBadge]);

  return (
    <LogoutSweetAlertProvider>
      {monitorReady ? <GeofenceAutoClockOutMonitor /> : null}
      {monitorReady ? <ShiftComingSoonMonitor /> : null}

      <View style={styles.container}>
        <View style={styles.screenStack}>
          {TABS.map((tab) => {
            if (!mountedTabs.has(tab.key)) return null;
            const Screen = tab.screen;
            const isActive = activeTab === tab.key;
            return (
              <View
                key={tab.key}
                style={[styles.screenWrap, isActive ? styles.screenVisible : styles.screenHidden]}
                pointerEvents={isActive ? 'auto' : 'none'}
              >
                <Screen isTabActive={isActive} />
              </View>
            );
          })}
        </View>

        <View style={[styles.tabBarOuter, { bottom: bottomOffset }]}>
          <FloatingTabDock
            activeTab={activeTab}
            onChange={setActiveTab}
            chatUnreadCount={chatUnreadCount}
          />
        </View>
      </View>
    </LogoutSweetAlertProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenStack: { flex: 1, backgroundColor: '#F0F2F5' },
  screenWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F0F2F5' },
  screenVisible: { opacity: 1, zIndex: 1 },
  screenHidden: { opacity: 0, zIndex: 0 },

  tabBarOuter: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    elevation: 28,
  },

  dockMotion: {
    width: '100%',
  },

  dockShadow: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 2,
    height: 22,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 16,
      },
      android: { elevation: 0 },
      default: {},
    }),
  },

  dock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: DOCK_PAD_H,
    paddingVertical: DOCK_PAD_V,
    minHeight: 72,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.16,
        shadowRadius: 28,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },

  dockSheen: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    height: StyleSheet.hairlineWidth * 2,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },

  activeCapsule: {
    position: 'absolute',
    top: DOCK_PAD_V,
    bottom: DOCK_PAD_V,
    left: DOCK_PAD_H,
    borderRadius: 20,
    padding: 2,
  },

  activeCapsuleInner: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 61, 122, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 61, 122, 0.1)',
  },

  tabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    zIndex: 2,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },

  tabItemInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },

  iconSlot: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconGlow: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0, 61, 122, 0.12)',
  },

  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    lineHeight: 11,
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
  },

  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },

  tabLabelActive: {
    fontFamily: fontFamily.semiBold,
    color: ACTIVE,
  },

  tabLabelInactive: {
    fontFamily: fontFamily.medium,
    color: INACTIVE,
  },
});
