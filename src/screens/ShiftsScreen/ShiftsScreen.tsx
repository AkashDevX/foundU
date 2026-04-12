import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { dashboardStyles } from '../../styles/styles';
import { colors, fontFamily, spacing } from '../../theme/theme';

type TabType = 'Upcoming' | 'History' | 'Pending';

export function ShiftsScreen() {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const headerStyles = dashboardStyles;
  const [activeTab, setActiveTab] = useState<TabType>('Upcoming');
  const [elapsed, setElapsed] = useState({ h: 4, m: 18, s: 22 });

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((prev) => {
        let { h, m, s } = prev;
        s += 1;
        if (s >= 60) {
          s = 0;
          m += 1;
        }
        if (m >= 60) {
          m = 0;
          h += 1;
        }
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const timerStr = `${String(elapsed.h).padStart(2, '0')}:${String(elapsed.m).padStart(2, '0')}:${String(elapsed.s).padStart(2, '0')}`;

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: 100 }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={headerStyles.header}>
        <TouchableOpacity
          style={headerStyles.profileAvatarWrap}
          onPress={() => navigation.navigate('MyProfile')}
          activeOpacity={0.75}
          accessibilityLabel="Open my profile"
        >
          <View style={headerStyles.profileAvatar}>
            <Feather name="user" size={22} color={colors.primary} />
          </View>
        </TouchableOpacity>
        <Text style={headerStyles.headerTitle}>Shifts</Text>
        <TouchableOpacity
          style={headerStyles.bellBtn}
          activeOpacity={0.7}
          onPress={openLogoutSweetAlert}
          accessibilityLabel="Log out"
        >
          <Feather name="log-out" size={24} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={s.bodyPad}>
        <View style={s.segmentedWrap}>
          {(['Upcoming', 'History', 'Pending'] as TabType[]).map((tab) => (
            <Pressable
              key={tab}
              style={[s.segmentedTab, activeTab === tab && s.segmentedTabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  s.segmentedTabText,
                  activeTab === tab && s.segmentedTabTextActive,
                ]}
              >
                {tab}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {/* CURRENT SESSION */}
        <Text style={s.sectionLabel}>CURRENT SESSION</Text>
        <View style={s.sessionCard}>
          <View style={s.sessionCardHeader}>
            <View style={s.inProgressBadge}>
              <View style={s.inProgressDot} />
              <Text style={s.inProgressText}>IN PROGRESS</Text>
            </View>
            <View style={s.sessionIconWrap}>
              <Feather name="user" size={24} color="#FFFFFF" strokeWidth={2} />
            </View>
          </View>
          <Text style={s.sessionJobTitle}>Northside Construction</Text>
          <Text style={s.sessionStartTime}>Started at 08:42 AM Today</Text>
          <View style={s.sessionFooter}>
            <View>
              <Text style={s.durationLabel}>CURRENT DURATION</Text>
              <Text style={s.durationTimer}>{timerStr}</Text>
            </View>
            <Pressable style={s.clockOutBtn}>
              <Text style={s.clockOutBtnText}>Clock Out</Text>
            </Pressable>
          </View>
        </View>

        {/* SCHEDULE */}
        <View style={s.scheduleHeader}>
          <Text style={s.sectionLabel}>SCHEDULE</Text>
          <TouchableOpacity>
            <Text style={s.viewCalendarLink}>View Calendar</Text>
          </TouchableOpacity>
        </View>

        {/* Confirmed Shift Card */}
        <View style={s.shiftCard}>
          <View style={s.shiftCardBadgeConfirmed}>
            <Text style={s.shiftCardBadgeTextConfirmed}>CONFIRMED</Text>
          </View>
          <Text style={s.shiftCardTitle}>Harbor Logistics</Text>
          <View style={s.shiftCardRow}>
            <Feather name="calendar" size={16} color="#6B7280" />
            <Text style={s.shiftCardInfo}>
              Mon, Oct 23 • 09:00 AM - 05:00 PM
            </Text>
          </View>
          <View style={s.shiftCardRow}>
            <Feather name="map-pin" size={16} color="#6B7280" />
            <Text style={s.shiftCardInfo}>882 Shipping Way, Port District</Text>
          </View>
          <View style={s.shiftCardFooter}>
            <View style={s.avatarRow}>
              <View style={s.avatar} />
              <View style={s.avatarMore}>
                <Text style={s.avatarMoreText}>+3</Text>
              </View>
            </View>
            <TouchableOpacity style={s.viewDetailsBtn}>
              <Text style={s.viewDetailsText}>View Details</Text>
              <Feather name="chevron-right" size={16} color="#004B8D" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Pending Shift Card */}
        <View style={s.shiftCardPending}>
          <View style={s.shiftCardBadgePending}>
            <Text style={s.shiftCardBadgeTextPending}>PENDING</Text>
          </View>
          <Text style={s.shiftCardTitlePending}>City Medical Plaza</Text>
          <View style={s.shiftCardRow}>
            <Feather name="calendar" size={16} color="#9CA3AF" />
            <Text style={s.shiftCardInfoPending}>
              Tue, Oct 24 • 10:00 AM - 06:00 PM
            </Text>
          </View>
          <View style={s.shiftCardRow}>
            <Feather name="map-pin" size={16} color="#9CA3AF" />
            <Text style={s.shiftCardInfoPending}>
              402 Health Blvd, Central Wing
            </Text>
          </View>
        </View>
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  bodyPad: {
    flex: 1,
    paddingHorizontal: spacing.xxxl,
  },
  segmentedWrap: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    padding: 4,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedTabActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 4,
  },
  segmentedTabText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#6B7280',
  },
  segmentedTabTextActive: {
    color: '#0056A4',
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  sectionLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  sessionCard: {
    backgroundColor: '#0056A4',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
    overflow: 'hidden',
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  inProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D4F7D4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  inProgressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A531A',
  },
  inProgressText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#1A531A',
  },
  sessionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionJobTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.white,
    marginBottom: 4,
  },
  sessionStartTime: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 16,
  },
  sessionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 14,
    padding: 16,
  },
  durationLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  durationTimer: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: colors.white,
  },
  clockOutBtn: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
  },
  clockOutBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#0056A4',
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewCalendarLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#004B8D',
  },
  shiftCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  shiftCardPending: {
    backgroundColor: '#E5E7EB',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  shiftCardBadgeConfirmed: {
    alignSelf: 'flex-end',
    backgroundColor: '#DBEAFE',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  shiftCardBadgeTextConfirmed: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#1E40AF',
  },
  shiftCardBadgePending: {
    alignSelf: 'flex-end',
    backgroundColor: '#D1D5DB',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  shiftCardBadgeTextPending: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#6B7280',
  },
  shiftCardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.text.primary,
    marginBottom: 10,
  },
  shiftCardTitlePending: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: '#6B7280',
    marginBottom: 10,
  },
  shiftCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  shiftCardInfo: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
  },
  shiftCardInfoPending: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#9CA3AF',
    flex: 1,
  },
  shiftCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#9CA3AF',
  },
  avatarMore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#D1D5DB',
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  avatarMoreText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#6B7280',
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewDetailsText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#004B8D',
  },
});
