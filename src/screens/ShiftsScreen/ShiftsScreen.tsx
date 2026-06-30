import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  Linking,
  ActivityIndicator,
  RefreshControl,
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
import {
  fetchWeeklySchedule,
  mondayOfWeek,
  shiftWeekStart,
  type ScheduleDay,
  type ScheduleDayEntry,
  type WeeklySchedulePayload,
} from '../../services/shiftsApi';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import {
  WEEK_DAY_KEYS,
  WEEK_DAY_SHORT,
  formatAssignedShiftDays,
  formatTimeHm,
  isPastWeek,
  parseWeeklyAvailabilityGrid,
  weeklyAvailabilityHasSelection,
  type WeeklyAvailabilityGrid,
} from '../../utils/weeklySchedule';

type TabType = 'Upcoming' | 'History' | 'Pending';

const MORNING_RANGE = '6:00 AM – 11:00 AM';
const EVENING_RANGE = '5:00 PM – 10:00 PM';

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
  if (start && end) return `${formatTimeHm(start)} – ${formatTimeHm(end)}`;
  if (start) return `From ${formatTimeHm(start)}`;
  if (end) return `Until ${formatTimeHm(end)}`;
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

function defaultWeekForTab(tab: TabType): string {
  const current = mondayOfWeek();
  if (tab === 'History') return shiftWeekStart(current, -1);
  return current;
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

function AvailabilityGrid({ grid }: { grid: WeeklyAvailabilityGrid }) {
  return (
    <View style={s.availabilityCard}>
      <View style={s.availabilityHeaderRow}>
        {WEEK_DAY_KEYS.map((day) => (
          <View key={day} style={s.availabilityDayCol}>
            <Text style={s.availabilityDayLetter}>{WEEK_DAY_SHORT[day]}</Text>
          </View>
        ))}
      </View>

      {(['morning', 'evening'] as const).map((slot) => (
        <View key={slot} style={s.availabilitySlotRow}>
          <View style={s.availabilitySlotLabel}>
            <Feather name={slot === 'morning' ? 'sun' : 'moon'} size={14} color={colors.primary} />
            <Text style={s.availabilitySlotText}>{slot === 'morning' ? 'Morning' : 'Evening'}</Text>
          </View>
          <View style={s.availabilityCellsRow}>
            {WEEK_DAY_KEYS.map((day) => {
              const active = grid[day][slot];
              return (
                <View key={`${day}-${slot}`} style={s.availabilityDayCol}>
                  <View style={[s.availabilityCell, active && s.availabilityCellActive]}>
                    {active ? <Feather name="check" size={12} color={colors.primary} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={s.availabilityRangeHint}>{slot === 'morning' ? MORNING_RANGE : EVENING_RANGE}</Text>
        </View>
      ))}
    </View>
  );
}

function ScheduleEntryCard({ entry }: { entry: ScheduleDayEntry }) {
  const isTimeOff = entry.type === 'time_off';
  const isSuggestion = entry.is_suggestion;

  return (
    <View
      style={[
        s.scheduleEntryCard,
        isTimeOff && s.scheduleEntryTimeOff,
        isSuggestion && s.scheduleEntrySuggestion,
      ]}
    >
      <View style={s.scheduleEntryTop}>
        <Text style={[s.scheduleEntryTime, isTimeOff && s.scheduleEntryTimeMuted]}>
          {entry.time_range || '—'}
        </Text>
        {entry.duration_label ? (
          <Text style={s.scheduleEntryDuration}>{entry.duration_label}</Text>
        ) : null}
      </View>
      <Text style={s.scheduleEntryTitle}>{isTimeOff ? 'Day off' : entry.title || entry.subtitle}</Text>
      {!isTimeOff && entry.subtitle ? <Text style={s.scheduleEntrySubtitle}>{entry.subtitle}</Text> : null}
      {entry.meta ? <Text style={s.scheduleEntryMeta}>{entry.meta}</Text> : null}
      {entry.notes ? <Text style={s.scheduleEntryNotes}>{entry.notes}</Text> : null}
      {isSuggestion ? (
        <View style={s.suggestionBadge}>
          <Text style={s.suggestionBadgeText}>FROM ASSIGNMENT</Text>
        </View>
      ) : null}
    </View>
  );
}

function ScheduleDayRow({ day }: { day: ScheduleDay }) {
  const hasEntries = day.entries.length > 0;

  return (
    <View style={[s.scheduleDayRow, day.is_today && s.scheduleDayRowToday]}>
      <View style={s.scheduleDayLeft}>
        <Text style={[s.scheduleDayWeekday, day.is_today && s.scheduleDayWeekdayToday]}>
          {day.weekday_label}
        </Text>
        <Text style={[s.scheduleDayNumber, day.is_today && s.scheduleDayNumberToday]}>{day.day_number}</Text>
      </View>
      <View style={s.scheduleDayBody}>
        {!hasEntries ? (
          <Text style={s.scheduleDayEmpty}>No shift scheduled</Text>
        ) : (
          day.entries.map((entry, index) => (
            <ScheduleEntryCard key={`${day.date}-${entry.id ?? index}`} entry={entry} />
          ))
        )}
      </View>
    </View>
  );
}

function WeekNavigator({
  schedule,
  loading,
  onPrev,
  onNext,
  canGoNext,
}: {
  schedule: WeeklySchedulePayload | null;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  return (
    <View style={s.weekNav}>
      <TouchableOpacity
        style={s.weekNavBtn}
        onPress={onPrev}
        disabled={loading}
        accessibilityLabel="Previous week"
      >
        <Feather name="chevron-left" size={22} color={colors.primary} />
      </TouchableOpacity>
      <View style={s.weekNavCenter}>
        <Text style={s.weekNavLabel}>{schedule?.week_label ?? 'This week'}</Text>
        {schedule?.scheduled_hours_label ? (
          <Text style={s.weekNavSub}>{schedule.scheduled_hours_label} scheduled</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[s.weekNavBtn, !canGoNext && s.weekNavBtnDisabled]}
        onPress={onNext}
        disabled={loading || !canGoNext}
        accessibilityLabel="Next week"
      >
        <Feather name="chevron-right" size={22} color={canGoNext ? colors.primary : '#CBD5E1'} />
      </TouchableOpacity>
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
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek());
  const [schedule, setSchedule] = useState<WeeklySchedulePayload | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadSchedule = useCallback(async (week: string) => {
    setScheduleLoading(true);
    setScheduleError(null);
    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      setSchedule(null);
      setScheduleLoading(false);
      return;
    }
    const result = await fetchWeeklySchedule(week);
    if (result.ok) {
      setSchedule(result.schedule);
    } else {
      setSchedule(null);
      setScheduleError(result.message);
    }
    setScheduleLoading(false);
  }, []);

  const refreshAll = useCallback(
    async (week: string) => {
      const local = await loadAccountProfile();
      setProfile(local);
      const signedIn = await getSessionAuthenticated();
      if (!signedIn) return;
      const api = await refreshAndCacheAccountProfileFromApi();
      if (api.ok) setProfile(api.profile);
      await loadSchedule(week);
    },
    [loadSchedule],
  );

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const local = await loadAccountProfile();
        setProfile(local);
        const signedIn = await getSessionAuthenticated();
        if (!signedIn) return;
        const api = await refreshAndCacheAccountProfileFromApi();
        if (api.ok) setProfile(api.profile);
      })();
    }, []),
  );

  useEffect(() => {
    void loadSchedule(weekStart);
  }, [weekStart, loadSchedule]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll(weekStart);
    setRefreshing(false);
  }, [refreshAll, weekStart]);

  const onTabChange = useCallback(
    (tab: TabType) => {
      setActiveTab(tab);
      setWeekStart(defaultWeekForTab(tab));
    },
    [],
  );

  const goPrevWeek = useCallback(() => {
    setWeekStart((prev) => shiftWeekStart(prev, -1));
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekStart((prev) => shiftWeekStart(prev, 1));
  }, []);

  const employmentStatus = profile?.employmentStatus?.toLowerCase() ?? '';
  const isPendingApproval = employmentStatus === 'pending';
  const isActiveEmployee = employmentStatus === 'active';
  const workCoords = parseWorkCoords(profile);
  const availabilityGrid = useMemo(
    () => parseWeeklyAvailabilityGrid(profile?.weeklyAvailabilityJson),
    [profile?.weeklyAvailabilityJson],
  );
  const hasAvailability =
    weeklyAvailabilityHasSelection(availabilityGrid) || !!profile?.weeklyAvailabilitySummary?.trim();

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

  const hasAssignment =
    !!profile?.assignedShiftName?.trim() ||
    !!profile?.assignedShiftStartTime?.trim() ||
    !!profile?.assignedWorkLocationName?.trim() ||
    departmentLine(profile ?? {}) !== 'Not assigned';

  const currentWeek = mondayOfWeek();
  const canGoNext =
    activeTab === 'History' ? weekStart < shiftWeekStart(currentWeek, -1) : weekStart < shiftWeekStart(currentWeek, 8);

  const scheduleSection = (
    <>
      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>{activeTab === 'History' ? 'PAST SCHEDULE' : 'WEEKLY SCHEDULE'}</Text>
      </View>

      <WeekNavigator
        schedule={schedule}
        loading={scheduleLoading}
        onPrev={goPrevWeek}
        onNext={goNextWeek}
        canGoNext={canGoNext}
      />

      {scheduleLoading && !schedule ? (
        <View style={s.loadingCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={s.loadingText}>Loading your schedule…</Text>
        </View>
      ) : null}

      {scheduleError ? (
        <View style={s.errorCard}>
          <Feather name="alert-circle" size={20} color="#B45309" />
          <Text style={s.errorText}>{scheduleError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => void loadSchedule(weekStart)}>
            <Text style={s.retryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {schedule?.days.map((day) => (
        <ScheduleDayRow key={day.date} day={day} />
      ))}

      {schedule && schedule.days.every((d) => d.entries.length === 0) ? (
        <View style={s.emptyScheduleHint}>
          <Feather name="calendar" size={20} color="#9CA3AF" />
          <Text style={s.emptyScheduleHintText}>
            No shifts published for this week yet. Your default assignment is shown below — your manager may still be
            building the roster.
          </Text>
        </View>
      ) : null}
    </>
  );

  const assignmentSection = hasAssignment ? (
    <>
      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>WORK ASSIGNMENT</Text>
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
            <Text style={s.shiftHoursLabel}>Default shift hours</Text>
            <Text style={s.shiftHoursValue}>{shiftTimeWindow(profile ?? {})}</Text>
          </View>
        </View>

        <ShiftInfoRow
          icon="repeat"
          label="Repeats on"
          value={formatAssignedShiftDays(profile?.assignedShiftDays)}
        />
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
  ) : (
    <View style={s.emptyCard}>
      <Feather name="briefcase" size={32} color="#9CA3AF" />
      <Text style={s.emptyTitle}>No work assignment yet</Text>
      <Text style={s.emptyHint}>
        Your manager has not linked a shift template, site, or department to your profile. Check back after roster setup.
      </Text>
    </View>
  );

  const availabilitySection = hasAvailability ? (
    <>
      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>YOUR AVAILABILITY</Text>
      </View>
      <View style={s.shiftCard}>
        <Text style={s.availabilityIntro}>
          Times you said you can work when you registered. Your published roster above may differ.
        </Text>
        {weeklyAvailabilityHasSelection(availabilityGrid) ? (
          <AvailabilityGrid grid={availabilityGrid} />
        ) : null}
        {profile?.weeklyAvailabilitySummary?.trim() ? (
          <Text style={s.availabilitySummary}>{profile.weeklyAvailabilitySummary.trim()}</Text>
        ) : null}
      </View>
    </>
  ) : null;

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
          {scheduleSection}
          {assignmentSection}
          {availabilitySection}
        </>
      ) : null}
    </>
  );

  const historyBody = (
    <>
      {isPendingApproval ? (
        <View style={s.emptyCard}>
          <Feather name="inbox" size={36} color="#D97706" />
          <Text style={s.emptyTitle}>No history yet</Text>
          <Text style={s.emptyHint}>Shift history will appear after your account is approved.</Text>
        </View>
      ) : (
        <>
          {scheduleSection}
          {isPastWeek(weekStart) ? (
            <Text style={s.historyFootnote}>
              Showing published roster for a past week. Use the arrows to browse earlier weeks.
            </Text>
          ) : null}
        </>
      )}
    </>
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
              onPress={() => onTabChange(tab)}
            >
              <Text style={[s.segmentedTabText, activeTab === tab && s.segmentedTabTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
        >
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
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  weekNavBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  weekNavBtnDisabled: {
    opacity: 0.45,
  },
  weekNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  weekNavLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  weekNavSub: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  loadingText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
  },
  errorCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(217,119,6,0.25)',
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  retryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.white,
  },
  scheduleDayRow: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  scheduleDayRowToday: {
    borderColor: 'rgba(0,86,164,0.35)',
    backgroundColor: '#F8FBFF',
  },
  scheduleDayLeft: {
    width: 44,
    alignItems: 'center',
    paddingTop: 2,
  },
  scheduleDayWeekday: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  scheduleDayWeekdayToday: {
    color: colors.primary,
  },
  scheduleDayNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.text.primary,
    marginTop: 2,
  },
  scheduleDayNumberToday: {
    color: colors.primary,
  },
  scheduleDayBody: {
    flex: 1,
    gap: 8,
  },
  scheduleDayEmpty: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#9CA3AF',
    paddingTop: 6,
  },
  scheduleEntryCard: {
    backgroundColor: '#F0F7FF',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,86,164,0.12)',
  },
  scheduleEntrySuggestion: {
    backgroundColor: '#FAFAFA',
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
  },
  scheduleEntryTimeOff: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  scheduleEntryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: spacing.sm,
  },
  scheduleEntryTime: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: colors.primary,
  },
  scheduleEntryTimeMuted: {
    color: '#6B7280',
  },
  scheduleEntryDuration: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#6B7280',
  },
  scheduleEntryTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  scheduleEntrySubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  scheduleEntryMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  scheduleEntryNotes: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 6,
    fontStyle: 'italic',
  },
  suggestionBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: '#E5E7EB',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  suggestionBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#6B7280',
  },
  emptyScheduleHint: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyScheduleHintText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },
  historyFootnote: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
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
    marginTop: spacing.md,
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
  availabilityIntro: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  availabilitySummary: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 20,
    marginTop: spacing.md,
  },
  availabilityCard: {
    marginTop: spacing.sm,
  },
  availabilityHeaderRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    paddingLeft: 72,
  },
  availabilityDayCol: {
    flex: 1,
    alignItems: 'center',
  },
  availabilityDayLetter: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: colors.primary,
  },
  availabilitySlotRow: {
    marginBottom: spacing.md,
  },
  availabilitySlotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  availabilitySlotText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.text.primary,
  },
  availabilityCellsRow: {
    flexDirection: 'row',
    paddingLeft: 72,
    marginBottom: 4,
  },
  availabilityCell: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  availabilityCellActive: {
    backgroundColor: 'rgba(0,86,164,0.1)',
    borderColor: colors.primary,
  },
  availabilityRangeHint: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 72,
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
