import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { dashboardStyles } from '../../styles/styles';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { getDisplayProfilePhotoUri, loadAccountProfile } from '../../services/accountProfileStorage';
import { refreshAndCacheAccountProfileFromApi } from '../../services/accountProfileApi';
import { getSessionAuthenticated } from '../../services/authSessionStorage';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';

type TabType = 'Upcoming' | 'History' | 'Pending';

function formatEmploymentLabel(status: string | undefined): string {
  if (!status || status.trim() === '') return 'Status unknown';
  const s = status.toLowerCase();
  if (s === 'active') return 'Active';
  if (s === 'pending') return 'Pending approval';
  if (s === 'declined' || s === 'rejected') return 'Not approved';
  return status.replace(/_/g, ' ');
}

function departmentLine(profile: UserProfileSnapshot): string {
  const name = profile.assignedDepartment?.trim();
  const code = profile.assignedDepartmentCode?.trim();
  if (name && code) return `${name} (${code})`;
  if (name) return name;
  if (code) return code;
  return 'Not assigned';
}

function shiftTimeWindow(profile: UserProfileSnapshot): string {
  const start = profile.assignedShiftStartTime?.trim();
  const end = profile.assignedShiftEndTime?.trim();
  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return 'Times not set';
}

function parseWorkCoords(profile: UserProfileSnapshot | null): { lat: number; lng: number } | null {
  if (!profile) return null;
  const lat = Number(profile.assignedWorkLocationLat);
  const lng = Number(profile.assignedWorkLocationLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function openMapsAt(lat: number, lng: number): void {
  const osm = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
  Linking.openURL(osm).catch(() => {
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`);
  });
}

function ShiftInfoRow({
  icon,
  label,
  value,
  muted,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  value: string;
  muted?: boolean;
}) {
  if (!value || value.trim() === '') return null;
  return (
    <View style={s.infoRow}>
      <Feather name={icon} size={16} color={muted ? '#9CA3AF' : '#6B7280'} />
      <View style={s.infoRowText}>
        <Text style={s.infoRowLabel}>{label}</Text>
        <Text style={[s.infoRowValue, muted && s.infoRowValueMuted]}>{value}</Text>
      </View>
    </View>
  );
}

function NotesSection({ title, body }: { title: string; body: string | undefined }) {
  if (!body || body.trim() === '') return null;
  return (
    <View style={s.notesSection}>
      <Text style={s.notesSectionTitle}>{title}</Text>
      <Text style={s.notesSectionBody}>{body.trim()}</Text>
    </View>
  );
}

export function ShiftsScreen() {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const headerStyles = dashboardStyles;
  const [activeTab, setActiveTab] = useState<TabType>('Upcoming');
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);

  const refreshProfile = useCallback(() => {
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
      refreshProfile();
    }, [refreshProfile]),
  );

  const employmentStatus = profile?.employmentStatus?.toLowerCase() ?? '';
  const isPendingApproval = employmentStatus === 'pending';
  const isActiveEmployee = employmentStatus === 'active';
  const workCoords = parseWorkCoords(profile);

  const rosterTitle = !profile
    ? 'Your assignment'
    : profile.assignedShiftName?.trim() ||
      profile.jobTitle?.trim() ||
      profile.companyName?.trim() ||
      'Your assignment';

  const rosterSubtitle = !profile
    ? ''
    : [
        profile.companyName?.trim(),
        departmentLine(profile) !== 'Not assigned' ? departmentLine(profile) : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const hasExtraNotes =
    !!profile?.assignedShiftBreaksSummary?.trim() ||
    !!profile?.assignmentNotes?.trim() ||
    !!profile?.assignedShiftNotes?.trim() ||
    !!profile?.assignedWorkLocationNotes?.trim();

  const upcomingBody = (
    <>
      {isPendingApproval ? (
        <View style={s.pendingBanner}>
          <Feather name="clock" size={22} color="#92400E" />
          <Text style={s.pendingBannerText}>
            Your registration is still being reviewed. Shift and site details will appear here after your organization
            approves your account.
          </Text>
        </View>
      ) : null}

      {!isPendingApproval ? (
        <>
          <View style={s.scheduleHeader}>
            <Text style={s.sectionLabel}>YOUR ROSTER</Text>
          </View>

          <View style={s.shiftCard}>
            <View style={s.shiftCardTopRow}>
              <View style={[s.statusPill, isActiveEmployee ? s.statusPillActive : s.statusPillNeutral]}>
                <Text style={[s.statusPillText, isActiveEmployee ? s.statusPillTextActive : s.statusPillTextNeutral]}>
                  {formatEmploymentLabel(profile?.employmentStatus).toUpperCase()}
                </Text>
              </View>
              <View style={s.shiftCardBadgeConfirmed}>
                <Text style={s.shiftCardBadgeTextConfirmed}>FROM WORKPLACE</Text>
              </View>
            </View>

            <Text style={s.shiftCardTitle}>{rosterTitle}</Text>
            {rosterSubtitle ? <Text style={s.shiftCardSubtitle}>{rosterSubtitle}</Text> : null}

            <View style={s.shiftHoursRow}>
              <Feather name="clock" size={18} color={colors.primary} />
              <View style={s.shiftHoursText}>
                <Text style={s.shiftHoursLabel}>Scheduled hours</Text>
                <Text style={s.shiftHoursValue}>
                  {profile?.assignedShiftStartTime
                    ? `${profile.assignedShiftStartTime}${profile.assignedShiftEndTime ? ` – ${profile.assignedShiftEndTime}` : ''}`
                    : shiftTimeWindow(profile ?? {})}
                </Text>
              </View>
            </View>

            <ShiftInfoRow icon="calendar" label="Effective from" value={profile?.assignedShiftDate ?? ''} />
            <ShiftInfoRow icon="briefcase" label="Department" value={departmentLine(profile ?? {})} />
            <ShiftInfoRow icon="user" label="Role" value={profile?.jobTitle?.trim() ?? ''} />
            <ShiftInfoRow
              icon="map-pin"
              label="Work site"
              value={
                profile?.assignedWorkLocationName?.trim()
                  ? `${profile.assignedWorkLocationName}${profile?.assignedWorkLocationAddress ? ` — ${profile.assignedWorkLocationAddress}` : ''}`
                  : profile?.assignedWorkLocationAddress?.trim() ?? ''
              }
            />

            {workCoords ? (
              <TouchableOpacity
                style={s.mapsBtn}
                onPress={() => openMapsAt(workCoords.lat, workCoords.lng)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Open assigned work location in maps"
              >
                <Feather name="navigation" size={18} color={colors.white} />
                <Text style={s.mapsBtnText}>
                  Open site on map ({workCoords.lat.toFixed(5)}, {workCoords.lng.toFixed(5)})
                </Text>
              </TouchableOpacity>
            ) : null}

            {profile?.hoursPerWeek?.trim() ? (
              <ShiftInfoRow icon="pie-chart" label="Contracted hours / week" value={profile.hoursPerWeek.trim()} />
            ) : null}
          </View>

          {hasExtraNotes ? (
            <View style={s.shiftCard}>
              <Text style={s.shiftCardTitle}>Breaks & notes</Text>
              <NotesSection title="Breaks" body={profile?.assignedShiftBreaksSummary} />
              <NotesSection title="From your employer" body={profile?.assignmentNotes} />
              <NotesSection title="Shift notes" body={profile?.assignedShiftNotes} />
              <NotesSection title="Site notes" body={profile?.assignedWorkLocationNotes} />
            </View>
          ) : null}
        </>
      ) : null}
    </>
  );

  const historyBody = (
    <View style={s.emptyCard}>
      <Feather name="archive" size={36} color="#9CA3AF" />
      <Text style={s.emptyTitle}>No shift history yet</Text>
      <Text style={s.emptyHint}>
        Completed shifts will list here once your workplace connects time & attendance to this app.
      </Text>
    </View>
  );

  const pendingTabBody =
    isPendingApproval ? (
      <View style={s.emptyCard}>
        <Feather name="inbox" size={36} color="#D97706" />
        <Text style={s.emptyTitle}>Awaiting organization approval</Text>
        <Text style={s.emptyHint}>
          There are no pending shift offers until your account is active. Check with your administrator if you need
          help.
        </Text>
      </View>
    ) : (
      <View style={s.emptyCard}>
        <Feather name="check-circle" size={36} color="#059669" />
        <Text style={s.emptyTitle}>Nothing pending</Text>
        <Text style={s.emptyHint}>
          You have no outstanding shift requests. Your current roster is under &quot;Upcoming&quot;.
        </Text>
      </View>
    );

  return (
    <View style={[s.container, { paddingTop: insets.top, paddingBottom: floatingTabBarClearance(insets.bottom) }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={headerStyles.header}>
        <TouchableOpacity
          style={headerStyles.profileAvatarWrap}
          onPress={() => navigation.navigate('MyProfile')}
          activeOpacity={0.75}
          accessibilityLabel="Open my profile"
        >
          <View style={headerStyles.profileAvatar}>
            <ProfilePhotoAvatar
              photoUri={getDisplayProfilePhotoUri(profile)}
              size={44}
              iconSize={24}
              iconColor={colors.primary}
            />
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
              <Text style={[s.segmentedTabText, activeTab === tab && s.segmentedTabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'Upcoming' ? upcomingBody : null}
          {activeTab === 'History' ? historyBody : null}
          {activeTab === 'Pending' ? pendingTabBody : null}
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
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.35)',
  },
  pendingBannerText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  statusPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusPillActive: {
    backgroundColor: '#DCFCE7',
  },
  statusPillNeutral: {
    backgroundColor: '#F3F4F6',
  },
  statusPillText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  statusPillTextActive: {
    color: '#166534',
  },
  statusPillTextNeutral: {
    color: '#6B7280',
  },
  scheduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  shiftCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: spacing.sm,
  },
  shiftCardBadgeConfirmed: {
    backgroundColor: '#DBEAFE',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  shiftCardBadgeTextConfirmed: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#1E40AF',
  },
  shiftCardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.text.primary,
    marginBottom: 4,
  },
  shiftCardSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    lineHeight: 20,
  },
  shiftHoursRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,86,164,0.12)',
  },
  shiftHoursText: {
    flex: 1,
  },
  shiftHoursLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.primary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  shiftHoursValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  infoRowText: {
    flex: 1,
  },
  infoRowLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: '#9CA3AF',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  infoRowValue: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 22,
  },
  infoRowValueMuted: {
    color: '#9CA3AF',
  },
  mapsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  mapsBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.white,
    flex: 1,
  },
  notesSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  notesSectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  notesSectionBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 21,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.xxl,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.text.primary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 21,
  },
});
