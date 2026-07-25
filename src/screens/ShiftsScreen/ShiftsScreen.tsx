import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  TextInput,
  Platform,
} from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerChangeEvent,
} from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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
import {
  fetchTimeOffRequests,
  submitTimeOffRequest,
  type TimeOffRequestItem,
} from '../../services/timeOffApi';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import { SweetAlert } from '../../components/SweetAlert';
import {
  formatAssignedShiftDays,
  formatTimeHm,
  isPastWeek,
} from '../../utils/weeklySchedule';

type TabType = 'Upcoming' | 'Time off';

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

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatRequestDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function timeOffStatusMeta(status: string): { label: string; color: string; bg: string } {
  const s = status.toLowerCase();
  if (s === 'approved') return { label: 'APPROVED', color: '#166534', bg: '#DCFCE7' };
  if (s === 'rejected') return { label: 'REJECTED', color: '#B91C1C', bg: '#FEE2E2' };
  if (s === 'cancelled') return { label: 'CANCELLED', color: '#4B5563', bg: '#E5E7EB' };
  return { label: 'PENDING', color: '#92400E', bg: '#FEF3C7' };
}

function TimeOffRequestCard({ item }: { item: TimeOffRequestItem }) {
  const meta = timeOffStatusMeta(item.status);
  return (
    <View style={s.timeOffCard}>
      <View style={s.timeOffCardTop}>
        <Text style={s.timeOffCardDate}>{item.date_label || item.requested_date || '—'}</Text>
        <View style={[s.timeOffBadge, { backgroundColor: meta.bg }]}>
          <Text style={[s.timeOffBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>
      {item.reason ? <Text style={s.timeOffCardReason}>{item.reason}</Text> : null}
      {item.decision_note ? (
        <View style={s.timeOffNoteBox}>
          <Text style={s.timeOffNoteLabel}>Manager note</Text>
          <Text style={s.timeOffNoteText}>{item.decision_note}</Text>
        </View>
      ) : null}
    </View>
  );
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

function formatBreakMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

function BreaksAndNotesCard({ profile }: { profile: UserProfileSnapshot }) {
  const breaks = profile.assignedShiftBreaks ?? [];
  const paidBreaks = breaks.filter((b) => b.paid);
  const unpaidBreaks = breaks.filter((b) => !b.paid);
  const summary = profile.assignedShiftBreaksSummary?.trim();
  const hasStructuredBreaks = breaks.length > 0;
  const hasNotes =
    !!profile.assignmentNotes?.trim() ||
    !!profile.assignedShiftNotes?.trim() ||
    !!profile.assignedWorkLocationNotes?.trim();

  if (!hasStructuredBreaks && !summary && !hasNotes) return null;

  const paidMinutes = paidBreaks.reduce((sum, b) => sum + b.minutes, 0);
  const unpaidMinutes = unpaidBreaks.reduce((sum, b) => sum + b.minutes, 0);

  return (
    <View style={s.shiftCard}>
      <Text style={s.shiftCardTitle}>Breaks & notes</Text>

      {hasStructuredBreaks ? (
        <View style={s.breaksBlock}>
          <Text style={s.breaksFromShiftHint}>From your assigned shift</Text>
          <View style={s.breakCountRow}>
            <View style={[s.breakCountPill, s.breakCountPillPaid]}>
              <Text style={[s.breakCountPillText, s.breakCountPillTextPaid]}>
                {paidBreaks.length} paid
                {paidMinutes > 0 ? ` · ${formatBreakMinutes(paidMinutes)}` : ''}
              </Text>
            </View>
            <View style={[s.breakCountPill, s.breakCountPillUnpaid]}>
              <Text style={[s.breakCountPillText, s.breakCountPillTextUnpaid]}>
                {unpaidBreaks.length} unpaid
                {unpaidMinutes > 0 ? ` · ${formatBreakMinutes(unpaidMinutes)}` : ''}
              </Text>
            </View>
            <View style={[s.breakCountPill, s.breakCountPillTotal]}>
              <Text style={[s.breakCountPillText, s.breakCountPillTextTotal]}>
                {breaks.length} total
              </Text>
            </View>
          </View>

          {breaks.map((item, index) => (
            <View
              key={`${item.label}-${item.minutes}-${index}`}
              style={[s.breakItemRow, item.paid ? s.breakItemPaid : s.breakItemUnpaid]}
            >
              <View style={s.breakItemText}>
                <Text style={s.breakItemLabel}>{item.label}</Text>
                <Text style={s.breakItemMeta}>
                  {formatBreakMinutes(item.minutes)} · {item.paid ? 'Paid' : 'Unpaid'}
                </Text>
              </View>
              <View style={[s.breakTypeBadge, item.paid ? s.breakTypeBadgePaid : s.breakTypeBadgeUnpaid]}>
                <Text style={[s.breakTypeBadgeText, item.paid ? s.breakTypeBadgeTextPaid : s.breakTypeBadgeTextUnpaid]}>
                  {item.paid ? 'PAID' : 'UNPAID'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : summary ? (
        <NotesSection title="Shift breaks" body={summary} />
      ) : (
        <Text style={s.breaksEmptyHint}>No breaks configured on this shift.</Text>
      )}

      <NotesSection title="From your employer" body={profile.assignmentNotes} />
      <NotesSection title="Shift notes" body={profile.assignedShiftNotes} />
      <NotesSection title="Site notes" body={profile.assignedWorkLocationNotes} />
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

function ScheduleDayRow({
  day,
  onTodayLayout,
}: {
  day: ScheduleDay;
  onTodayLayout?: (y: number) => void;
}) {
  const entries = day.entries ?? [];
  const hasEntries = entries.length > 0;

  return (
    <View
      collapsable={false}
      style={[s.scheduleDayRow, day.is_today && s.scheduleDayRowToday]}
      onLayout={(e) => {
        if (day.is_today) onTodayLayout?.(e.nativeEvent.layout.y);
      }}
    >
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
          entries.map((entry, index) => (
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

export function ShiftsScreen({ isTabActive = true }: { isTabActive?: boolean }) {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const headerStyles = dashboardStyles;
  const scrollRef = useRef<ScrollView>(null);
  const todayScrollYRef = useRef<number | null>(null);
  const scrolledToTodayKeyRef = useRef<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('Upcoming');
  const [profile, setProfile] = useState<UserProfileSnapshot | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => mondayOfWeek());
  const [schedule, setSchedule] = useState<WeeklySchedulePayload | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [screenReady, setScreenReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequestItem[]>([]);
  const [timeOffLoading, setTimeOffLoading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestDate, setRequestDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [requestReason, setRequestReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    title: string;
    message: string;
    variant: 'success' | 'error' | 'info';
  } | null>(null);

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
      // Keep Shifts quiet — connection problems are surfaced on the Dashboard.
      const isNetwork =
        /could not reach|timed out|network request failed|failed to fetch|connection/i.test(
          result.message,
        );
      setScheduleError(
        isNetwork
          ? 'Unable to load your schedule. Check your connection and try again from the Dashboard.'
          : result.message,
      );
    }
    setScheduleLoading(false);
  }, []);

  const loadTimeOffRequests = useCallback(async () => {
    const signedIn = await getSessionAuthenticated();
    if (!signedIn) {
      setTimeOffRequests([]);
      return;
    }
    setTimeOffLoading(true);
    const result = await fetchTimeOffRequests();
    if (result.ok) {
      setTimeOffRequests(result.requests);
    }
    setTimeOffLoading(false);
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
      await loadTimeOffRequests();
    },
    [loadSchedule, loadTimeOffRequests],
  );

  const submitRequest = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    const result = await submitTimeOffRequest({
      date: toIsoDate(requestDate),
      reason: requestReason,
    });
    setSubmitting(false);
    if (result.ok) {
      setShowRequestForm(false);
      setRequestReason('');
      setRequestDate(new Date());
      setFeedback({ title: 'Request sent', message: result.message, variant: 'success' });
      await loadTimeOffRequests();
    } else {
      setFeedback({ title: 'Could not submit', message: result.message, variant: 'error' });
    }
  }, [submitting, requestDate, requestReason, loadTimeOffRequests]);

  const dismissDatePicker = useCallback(() => setShowDatePicker(false), []);

  const onDateSelected = useCallback((_event: DateTimePickerChangeEvent, picked?: Date) => {
    setShowDatePicker(false);
    if (picked instanceof Date && !Number.isNaN(picked.getTime())) {
      setRequestDate(picked);
    }
  }, []);

  const openDatePicker = useCallback(() => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: requestDate,
        mode: 'date',
        display: 'calendar',
        minimumDate: new Date(),
        onValueChange: (_event, picked) => {
          if (picked instanceof Date && !Number.isNaN(picked.getTime())) {
            setRequestDate(picked);
          }
        },
        onDismiss: () => {},
      });
      return;
    }
    setShowDatePicker(true);
  }, [requestDate]);

  useEffect(() => {
    if (!isTabActive) return;
    let cancelled = false;
    void (async () => {
      // Only show the full-screen gate on the first load; later revisits refresh quietly.
      if (!screenReady) {
        setProfileLoading(true);
      }
      try {
        const local = await loadAccountProfile();
        if (cancelled) return;
        setProfile(local);
        const signedIn = await getSessionAuthenticated();
        if (!signedIn || cancelled) return;
        const api = await refreshAndCacheAccountProfileFromApi();
        if (cancelled) return;
        if (api.ok) setProfile(api.profile);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // screenReady intentionally omitted — read as a one-shot gate for the first visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTabActive]);

  useEffect(() => {
    if (!isTabActive || activeTab !== 'Upcoming') return;
    // Opening Shifts on Upcoming always lands on the current local week.
    setWeekStart(mondayOfWeek());
  }, [isTabActive, activeTab]);

  useEffect(() => {
    if (!isTabActive) return;
    void loadSchedule(weekStart);
  }, [weekStart, loadSchedule, isTabActive]);

  useEffect(() => {
    if (!profileLoading && !scheduleLoading) {
      setScreenReady(true);
    }
  }, [profileLoading, scheduleLoading]);

  const isCurrentWeek = weekStart === mondayOfWeek();
  const hasTodayInSchedule = !!schedule?.days?.some((d) => d.is_today);
  const todayFocusKey =
    isTabActive && activeTab === 'Upcoming' && isCurrentWeek && hasTodayInSchedule
      ? `${weekStart}:${schedule?.week_start ?? ''}`
      : null;

  const scrollToToday = useCallback(
    (animated = true) => {
      if (!todayFocusKey) return;
      if (scrolledToTodayKeyRef.current === todayFocusKey) return;
      const y = todayScrollYRef.current;
      if (y == null) return;
      scrolledToTodayKeyRef.current = todayFocusKey;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated });
    },
    [todayFocusKey],
  );

  const onTodayLayout = useCallback(
    (y: number) => {
      todayScrollYRef.current = y;
      if (!screenReady || !todayFocusKey) return;
      requestAnimationFrame(() => scrollToToday(true));
    },
    [screenReady, todayFocusKey, scrollToToday],
  );

  useEffect(() => {
    if (!screenReady || !todayFocusKey) return;
    const t = setTimeout(() => scrollToToday(true), 120);
    return () => clearTimeout(t);
  }, [screenReady, todayFocusKey, scrollToToday]);

  // Clear the one-shot focus lock when leaving Upcoming / the current week.
  useEffect(() => {
    if (!isTabActive || activeTab !== 'Upcoming' || !isCurrentWeek) {
      scrolledToTodayKeyRef.current = null;
    }
  }, [activeTab, isTabActive, isCurrentWeek]);

  useEffect(() => {
    if (!isTabActive || activeTab !== 'Time off') return;
    void loadTimeOffRequests();
  }, [isTabActive, activeTab, loadTimeOffRequests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll(weekStart);
    setRefreshing(false);
  }, [refreshAll, weekStart]);

  const onTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    // Always land Upcoming on the current week (today → Sunday).
    if (tab === 'Upcoming') {
      setWeekStart(mondayOfWeek());
    }
  }, []);

  const goPrevWeek = useCallback(() => {
    setWeekStart((prev) => shiftWeekStart(prev, -1));
  }, []);

  const goNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const current = mondayOfWeek();
      const next = shiftWeekStart(prev, 1);
      // Allow browsing past weeks and a limited window of future weeks.
      const maxFuture = shiftWeekStart(current, 8);
      return next <= maxFuture ? next : prev;
    });
  }, []);

  const employmentStatus = profile?.employmentStatus?.toLowerCase() ?? '';
  const isPendingApproval = employmentStatus === 'pending';
  const workCoords = parseWorkCoords(profile);

  const rosterTitle = !profile
    ? 'Your assignment'
    : profile.assignedShiftName?.trim() ||
      profile.jobTitle?.trim() ||
      profile.companyName?.trim() ||
      'Your assignment';

  const workSiteLabel = profile?.assignedWorkLocationName?.trim()
    ? `${profile.assignedWorkLocationName}${
        profile?.assignedWorkLocationAddress?.trim()
          ? ` — ${profile.assignedWorkLocationAddress.trim()}`
          : ''
      }`
    : profile?.assignedWorkLocationAddress?.trim() ?? '';

  const hasAssignment =
    !!profile?.assignedShiftName?.trim() ||
    !!profile?.assignedShiftStartTime?.trim() ||
    !!profile?.assignedWorkLocationName?.trim() ||
    departmentLine(profile ?? {}) !== 'Not assigned';

  const currentWeek = mondayOfWeek();
  const canGoNext = weekStart < shiftWeekStart(currentWeek, 8);

  const visibleScheduleDays = schedule?.days ?? [];

  const scheduleSection = (
    <>
      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>
          {isPastWeek(weekStart) ? 'PAST SCHEDULE' : 'WEEKLY SCHEDULE'}
        </Text>
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

      {visibleScheduleDays.map((day) => (
        <ScheduleDayRow
          key={day.date || day.day_key}
          day={day}
          onTodayLayout={day.is_today ? onTodayLayout : undefined}
        />
      ))}

      {schedule && visibleScheduleDays.every((d) => (d.entries?.length ?? 0) === 0) ? (
        <View style={s.emptyScheduleHint}>
          <Feather name="calendar" size={20} color="#9CA3AF" />
          <Text style={s.emptyScheduleHintText}>
            {isPastWeek(weekStart)
              ? 'No shifts were published for this week.'
              : 'No shifts published for this week yet. Your default assignment is shown below — your manager may still be building the roster.'}
          </Text>
        </View>
      ) : null}

      {isPastWeek(weekStart) ? (
        <Text style={s.historyFootnote}>
          Browsing a past week. Use the right arrow to return to this week.
        </Text>
      ) : null}
    </>
  );

  const assignmentSection = hasAssignment ? (
    <>
      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>WORK ASSIGNMENT</Text>
      </View>

      <View style={s.shiftCard}>
        <Text style={s.shiftCardTitle}>{rosterTitle}</Text>

        <View style={s.shiftHoursRow}>
          <Feather name="clock" size={18} color={colors.primary} />
          <View style={s.shiftHoursText}>
            <Text style={s.shiftHoursLabel}>Shift hours</Text>
            <Text style={s.shiftHoursValue}>{shiftTimeWindow(profile ?? {})}</Text>
          </View>
        </View>

        <ShiftInfoRow
          icon="repeat"
          label="Repeats on"
          value={formatAssignedShiftDays(profile?.assignedShiftDays)}
        />
        <ShiftInfoRow icon="briefcase" label="Department" value={departmentLine(profile ?? {})} />
        <ShiftInfoRow icon="map-pin" label="Work site" value={workSiteLabel} />

        {workCoords ? (
          <TouchableOpacity
            style={s.mapsBtn}
            onPress={() => openMapsAt(workCoords.lat, workCoords.lng)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Open assigned work location in maps"
          >
            <Feather name="navigation" size={18} color={colors.white} />
            <Text style={s.mapsBtnText}>Open site on map</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {profile ? <BreaksAndNotesCard profile={profile} /> : null}
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
        </>
      ) : null}
    </>
  );

  const initialLoader = (
    <View style={s.initialLoader} accessibilityLabel="Loading shifts">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={s.initialLoaderText}>Loading your shifts…</Text>
    </View>
  );

  const timeOffBody = isPendingApproval ? (
    <View style={s.emptyCard}>
      <Feather name="inbox" size={36} color="#D97706" />
      <Text style={s.emptyTitle}>Awaiting organization approval</Text>
      <Text style={s.emptyHint}>
        You can request time off once your account is active. Check with your administrator if you need help.
      </Text>
    </View>
  ) : (
    <>
      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>REQUEST TIME OFF</Text>
      </View>

      <View style={s.shiftCard}>
        {!showRequestForm ? (
          <>
            <Text style={s.timeOffIntro}>
              Need a day off? Send a request to your manager. You will see the outcome here once it is reviewed.
            </Text>
            <TouchableOpacity
              style={s.requestBtn}
              onPress={() => setShowRequestForm(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Request time off"
            >
              <Feather name="plus-circle" size={18} color={colors.white} />
              <Text style={s.requestBtnText}>Request time off</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.formLabel}>DATE</Text>
            <TouchableOpacity
              style={s.dateField}
              onPress={openDatePicker}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Pick a date"
            >
              <Feather name="calendar" size={18} color={colors.primary} />
              <Text style={s.dateFieldText}>{formatRequestDate(requestDate)}</Text>
            </TouchableOpacity>

            {Platform.OS === 'ios' && showDatePicker ? (
              <DateTimePicker
                value={requestDate}
                mode="date"
                display="inline"
                minimumDate={new Date()}
                onValueChange={onDateSelected}
                onDismiss={dismissDatePicker}
              />
            ) : null}

            <Text style={s.formLabel}>REASON (OPTIONAL)</Text>
            <TextInput
              style={s.reasonInput}
              value={requestReason}
              onChangeText={setRequestReason}
              placeholder="e.g. Family commitment, medical appointment…"
              placeholderTextColor="#9CA3AF"
              multiline
              maxLength={500}
            />

            <View style={s.formActions}>
              <TouchableOpacity
                style={s.formCancelBtn}
                onPress={() => {
                  setShowRequestForm(false);
                  setRequestReason('');
                }}
                activeOpacity={0.85}
                disabled={submitting}
              >
                <Text style={s.formCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.formSubmitBtn, submitting && s.formSubmitBtnDisabled]}
                onPress={() => void submitRequest()}
                activeOpacity={0.88}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={s.formSubmitText}>Submit request</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <View style={s.scheduleHeader}>
        <Text style={s.sectionLabel}>YOUR REQUESTS</Text>
      </View>

      {timeOffLoading && timeOffRequests.length === 0 ? (
        <View style={s.loadingCard}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={s.loadingText}>Loading your requests…</Text>
        </View>
      ) : null}

      {!timeOffLoading && timeOffRequests.length === 0 ? (
        <View style={s.emptyCard}>
          <Feather name="calendar" size={32} color="#9CA3AF" />
          <Text style={s.emptyTitle}>No requests yet</Text>
          <Text style={s.emptyHint}>Your time-off requests and their status will appear here.</Text>
        </View>
      ) : null}

      {timeOffRequests.map((item) => (
        <TimeOffRequestCard key={item.id} item={item} />
      ))}
    </>
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
          <Feather name="log-out" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.bodyPad}>
        <View style={s.segmentedWrap}>
          {(['Upcoming', 'Time off'] as TabType[]).map((tab) => (
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
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, !screenReady && activeTab === 'Upcoming' ? s.scrollContentCentered : null]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            screenReady ? (
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
            ) : undefined
          }
        >
          {activeTab === 'Upcoming' ? (screenReady ? upcomingBody : initialLoader) : null}
          {activeTab === 'Time off' ? timeOffBody : null}
        </ScrollView>
      </View>

      <SweetAlert
        visible={feedback !== null}
        title={feedback?.title ?? ''}
        message={feedback?.message ?? ''}
        confirmText="OK"
        cancelText="Close"
        hideCancel
        variant={feedback?.variant ?? 'info'}
        onClose={() => setFeedback(null)}
        onConfirm={() => setFeedback(null)}
      />
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
  scrollContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  initialLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 14,
  },
  initialLoaderText: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: '#6B7280',
  },
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
    marginBottom: 12,
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
  breaksBlock: {
    marginTop: spacing.sm,
    gap: 8,
  },
  breaksFromShiftHint: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  breaksEmptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: spacing.sm,
  },
  breakCountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  breakCountPill: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  breakCountPillPaid: {
    backgroundColor: '#DCFCE7',
  },
  breakCountPillUnpaid: {
    backgroundColor: '#F3F4F6',
  },
  breakCountPillTotal: {
    backgroundColor: '#EFF6FF',
  },
  breakCountPillText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
  },
  breakCountPillTextPaid: {
    color: '#166534',
  },
  breakCountPillTextUnpaid: {
    color: '#4B5563',
  },
  breakCountPillTextTotal: {
    color: '#1D4ED8',
  },
  breakItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  breakItemPaid: {
    backgroundColor: '#F0FDF4',
    borderColor: 'rgba(22,101,52,0.15)',
  },
  breakItemUnpaid: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
  },
  breakItemText: {
    flex: 1,
  },
  breakItemLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text.primary,
  },
  breakItemMeta: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  breakTypeBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  breakTypeBadgePaid: {
    backgroundColor: '#DCFCE7',
  },
  breakTypeBadgeUnpaid: {
    backgroundColor: '#E5E7EB',
  },
  breakTypeBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  breakTypeBadgeTextPaid: {
    color: '#166534',
  },
  breakTypeBadgeTextUnpaid: {
    color: '#4B5563',
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
  timeOffIntro: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  requestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  requestBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  formLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: '#9CA3AF',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,86,164,0.12)',
  },
  dateFieldText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  reasonInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    minHeight: 88,
    textAlignVertical: 'top',
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: spacing.lg,
  },
  formActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  formCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#4B5563',
  },
  formSubmitBtn: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSubmitBtnDisabled: {
    opacity: 0.6,
  },
  formSubmitText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.white,
  },
  timeOffCard: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  timeOffCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeOffCardDate: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: colors.text.primary,
  },
  timeOffBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  timeOffBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.6,
  },
  timeOffCardReason: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginTop: 8,
  },
  timeOffNoteBox: {
    marginTop: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  timeOffNoteLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: '#6B7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  timeOffNoteText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
});
