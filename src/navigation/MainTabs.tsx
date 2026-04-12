import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogoutSweetAlertProvider } from '../context/LogoutSweetAlertContext';
import { fontFamily } from '../theme/theme';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ShiftsScreen } from '../screens/ShiftsScreen';
import { TasksScreen } from '../screens/TasksScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { FLOATING_TAB_BAR_BOTTOM_INSET } from './floatingTabBarMetrics';

const tabBlue = '#004C99';
const tabInactive = '#9CA3AF';

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'grid', screen: DashboardScreen },
  { key: 'shifts', label: 'Shifts', icon: 'clock', screen: ShiftsScreen },
  { key: 'tasks', label: 'Tasks', icon: 'clipboard', screen: TasksScreen },
  { key: 'chat', label: 'Chat', icon: 'message-circle', screen: ChatScreen },
] as const;

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'shifts' | 'tasks' | 'chat'>('dashboard');

  const ActiveScreen = TABS.find((t) => t.key === activeTab)?.screen ?? DashboardScreen;

  return (
    <LogoutSweetAlertProvider>
      <View style={styles.container}>
        <View style={styles.screenWrap}>
          <ActiveScreen />
        </View>
        <View
          style={[styles.tabBarOuter, { bottom: Math.max(insets.bottom, FLOATING_TAB_BAR_BOTTOM_INSET) }]}
        >
          <View style={styles.tabBar}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  style={({ pressed }) => [
                    styles.tabItem,
                    pressed && styles.tabItemPressed,
                  ]}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <View style={[styles.tabIconWrap, isActive && styles.tabIconWrapActive]}>
                    <Feather
                      name={tab.icon as any}
                      size={isActive ? 24 : 22}
                      color={isActive ? tabBlue : tabInactive}
                    />
                  </View>
                  <Text
                    style={[
                      styles.tabLabel,
                      { color: isActive ? tabBlue : tabInactive },
                      isActive && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                  {isActive && <View style={styles.tabIndicator} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </LogoutSweetAlertProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenWrap: { flex: 1 },
  tabBarOuter: {
    position: 'absolute',
    left: 20,
    right: 20,
    /** Must sit above Chat composer (elevation) so tabs stay tappable on Android */
    zIndex: 100,
    elevation: 24,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    minHeight: 72,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 12,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 20,
  },
  tabItemPressed: {
    backgroundColor: 'rgba(0,76,153,0.04)',
  },
  tabIconWrap: {
    width: 48,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(0,76,153,0.1)',
  },
  tabLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    fontFamily: fontFamily.bold,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: tabBlue,
  },
});
