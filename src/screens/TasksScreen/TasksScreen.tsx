import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { dashboardStyles, tasksStyles } from '../../styles/styles';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { getDisplayProfilePhotoUri } from '../../services/accountProfileStorage';
import { useHeaderProfileSnapshot } from '../../hooks/useHeaderProfileSnapshot';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { fetchAssignedTasks, updateTaskCompletion } from '../../services/tasksApi';
import type { EmployeeTask, TaskPriority } from '../../types/tasks';
import { SweetAlert } from '../../components/SweetAlert';

type TasksScreenProps = {
  /** Set by MainTabs when this tab is the visible screen. */
  isTabActive?: boolean;
};

type FilterKey = 'all' | 'pending' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Done' },
];

function priorityLabel(p: TaskPriority): string {
  switch (p) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    default:
      return 'Low';
  }
}

function priorityTheme(p: TaskPriority) {
  switch (p) {
    case 'high':
      return {
        bar: '#DC2626',
        chipBg: '#FEF2F2',
        chipText: '#B91C1C',
        iconBg: 'rgba(220,38,38,0.12)',
        icon: '#DC2626' as const,
      };
    case 'medium':
      return {
        bar: '#D97706',
        chipBg: '#FFFBEB',
        chipText: '#B45309',
        iconBg: 'rgba(217,119,6,0.12)',
        icon: '#D97706' as const,
      };
    default:
      return {
        bar: '#64748B',
        chipBg: '#F1F5F9',
        chipText: '#475569',
        iconBg: 'rgba(100,116,139,0.12)',
        icon: '#64748B' as const,
      };
  }
}

function categoryIcon(category: string): React.ComponentProps<typeof Feather>['name'] {
  const c = category.toLowerCase();
  if (c.includes('safety') || c.includes('induction')) return 'shield';
  if (c.includes('equipment') || c.includes('plant')) return 'tool';
  if (c.includes('hazard')) return 'alert-triangle';
  if (c.includes('access') || c.includes('ppe')) return 'key';
  if (c.includes('briefing') || c.includes('toolbox')) return 'users';
  if (c.includes('check') || c.includes('inspection')) return 'check-square';
  return 'clipboard';
}

function isDueToday(task: EmployeeTask): boolean {
  if (!task.dueAt || task.completed) return false;
  const d = new Date(task.dueAt);
  if (Number.isNaN(d.getTime())) return task.dueLabel.toLowerCase().includes('today');
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function TasksScreen({ isTabActive = true }: TasksScreenProps) {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const headerProfile = useHeaderProfileSnapshot();
  const headerStyles = dashboardStyles;
  const styles = tasksStyles;

  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const loadedOnceRef = useRef(false);
  const tasksRef = useRef<EmployeeTask[]>([]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const loadTasks = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);

    try {
      const result = await fetchAssignedTasks();
      if (result.ok) {
        setTasks(result.payload.tasks);
        setError(null);
      } else {
        const hadTasks = tasksRef.current.length > 0;
        if (hadTasks) {
          setError(result.message);
        } else {
          setTasks([]);
          setError(null);
        }
      }
    } finally {
      loadedOnceRef.current = true;
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isTabActive) return;
    void loadTasks({ silent: loadedOnceRef.current });
  }, [isTabActive, loadTasks]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTasks({ silent: true });
    setRefreshing(false);
  }, [loadTasks]);

  const visibleTasks = useMemo(() => {
    if (filter === 'pending') return tasks.filter((t) => !t.completed);
    if (filter === 'completed') return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const pendingCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);
  const dueTodayCount = useMemo(() => tasks.filter((t) => isDueToday(t)).length, [tasks]);
  const progressPct = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((completedCount / tasks.length) * 100);
  }, [tasks.length, completedCount]);

  const toggleTask = useCallback(
    async (task: EmployeeTask) => {
      if (togglingId) return;

      const nextCompleted = !task.completed;
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id
            ? {
                ...t,
                completed: nextCompleted,
                status: nextCompleted ? 'completed' : 'pending',
                dueLabel: nextCompleted ? 'Completed' : t.dueLabel,
              }
            : t,
        ),
      );

      setTogglingId(task.id);
      const result = await updateTaskCompletion(task.id, nextCompleted);
      setTogglingId(null);

      if (!result.ok) {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...task, completed: task.completed, status: task.status } : t)),
        );
        setAlert({ title: 'Could not update task', message: result.message });
        return;
      }

      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...result.task } : t)));
    },
    [togglingId],
  );

  const hasAssignedTasks = tasks.length > 0;
  const showEmptyAssigned = !loading && !hasAssignedTasks;
  const showErrorBanner = !loading && !!error && hasAssignedTasks;
  const showFilterEmpty = !loading && hasAssignedTasks && visibleTasks.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
              photoUri={getDisplayProfilePhotoUri(headerProfile)}
              size={44}
              iconSize={24}
              iconColor={colors.primary}
            />
          </View>
        </TouchableOpacity>
        <Text style={headerStyles.headerTitle}>Tasks</Text>
        <TouchableOpacity
          style={headerStyles.bellBtn}
          activeOpacity={0.7}
          onPress={openLogoutSweetAlert}
          accessibilityLabel="Log out"
        >
          <Feather name="log-out" size={24} color={colors.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: floatingTabBarClearance(insets.bottom) },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={local.heroCard}>
          <View style={local.heroTopRow}>
            <View style={local.heroIconWrap}>
              <Feather name="clipboard" size={22} color="#FFFFFF" />
            </View>
            <View style={local.heroTextCol}>
              <Text style={local.heroTitle}>Your site tasks</Text>
              <Text style={local.heroSubtitle}>
                {loading
                  ? 'Checking for new assignments…'
                  : !hasAssignedTasks
                    ? 'No tasks found — you are all clear for now'
                    : error
                      ? 'Showing your last loaded tasks'
                      : pendingCount === 0
                        ? 'All caught up — great work on site.'
                        : `${pendingCount} open · ${dueTodayCount} due today`}
              </Text>
            </View>
            {!loading && tasks.length > 0 ? (
              <View style={local.progressRing}>
                <Text style={local.progressPct}>{progressPct}%</Text>
                <Text style={local.progressLabel}>done</Text>
              </View>
            ) : null}
          </View>

          {!loading && tasks.length > 0 ? (
            <View style={local.statsRow}>
              <View style={local.statPill}>
                <Feather name="clock" size={14} color="#BFDBFE" />
                <Text style={local.statPillText}>{pendingCount} pending</Text>
              </View>
              <View style={local.statPill}>
                <Feather name="check-circle" size={14} color="#A7F3D0" />
                <Text style={local.statPillText}>{completedCount} done</Text>
              </View>
              {dueTodayCount > 0 ? (
                <View style={[local.statPill, local.statPillUrgent]}>
                  <Feather name="zap" size={14} color="#FDE68A" />
                  <Text style={local.statPillText}>{dueTodayCount} today</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {hasAssignedTasks ? (
          <Text style={styles.sectionSubtitle}>
            Worksite actions from your supervisor. Tap a task when you have completed it.
          </Text>
        ) : null}

        {hasAssignedTasks ? (
          <View style={styles.filterRow}>
            {FILTERS.map(({ key, label }) => {
              const active = filter === key;
              const count =
                key === 'all'
                  ? tasks.length
                  : key === 'pending'
                    ? pendingCount
                    : completedCount;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setFilter(key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {label}
                    {count > 0 ? ` · ${count}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {loading && tasks.length === 0 && !refreshing ? (
          <View style={local.loadingWrap}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={local.loadingText}>Loading your tasks…</Text>
          </View>
        ) : null}

        {refreshing && tasks.length === 0 ? (
          <View style={local.refreshHintRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={local.refreshHintText}>Refreshing…</Text>
          </View>
        ) : null}

        {showErrorBanner ? (
          <View style={local.errorBanner}>
            <Feather name="refresh-cw" size={20} color="#B45309" />
            <View style={local.errorTextCol}>
              <Text style={local.errorTitle}>Could not refresh tasks</Text>
              <Text style={local.errorBody}>{error}</Text>
            </View>
            <TouchableOpacity style={local.retryBtn} onPress={() => void loadTasks()} activeOpacity={0.8}>
              <Text style={local.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showEmptyAssigned ? (
          <View style={local.emptyCard}>
            <View style={local.emptyIconOuter}>
              <View style={local.emptyIconWrap}>
                <Feather name="clipboard" size={38} color={colors.primary} />
              </View>
            </View>
            <Text style={local.emptyTitle}>No tasks found</Text>
            <Text style={local.emptyHint}>
              There are no worksite tasks assigned to you at the moment. New tasks from your
              supervisor will appear here when they are ready.
            </Text>
            <View style={local.emptyTips}>
              <View style={local.emptyTipRow}>
                <Feather name="refresh-cw" size={16} color={colors.primary} />
                <Text style={local.emptyTipText}>Pull down to refresh</Text>
              </View>
              <View style={local.emptyTipRow}>
                <Feather name="calendar" size={16} color={colors.primary} />
                <Text style={local.emptyTipText}>Check again before your next shift</Text>
              </View>
            </View>
          </View>
        ) : null}

        {showFilterEmpty ? (
          <View style={local.filterEmptyCard}>
            <Feather name="filter" size={28} color="#94A3B8" />
            <Text style={local.filterEmptyTitle}>Nothing in this view</Text>
            <Text style={local.filterEmptyHint}>
              Try another filter to see your assigned tasks.
            </Text>
          </View>
        ) : null}

        {visibleTasks.map((task) => {
          const theme = priorityTheme(task.priority);
          const dueToday = isDueToday(task);
          const busy = togglingId === task.id;

          return (
            <TouchableOpacity
              key={task.id}
              style={[local.taskCard, task.completed && local.taskCardDone]}
              activeOpacity={0.92}
              onPress={() => void toggleTask(task)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={`${task.title}. ${task.completed ? 'Completed' : 'Not completed'}. Tap to toggle.`}
            >
              <View style={[local.priorityStripe, { backgroundColor: theme.bar }]} />

              <View style={local.taskCardInner}>
                <View style={local.taskTopRow}>
                  <View style={[local.categoryIconWrap, { backgroundColor: theme.iconBg }]}>
                    <Feather name={categoryIcon(task.category)} size={18} color={theme.icon} />
                  </View>
                  <View style={local.taskTitleCol}>
                    <Text style={[local.taskTitle, task.completed && local.taskTitleDone]} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <View style={local.chipRow}>
                      <View style={[local.categoryChip, { backgroundColor: theme.chipBg }]}>
                        <Text style={[local.categoryChipText, { color: theme.chipText }]}>{task.category}</Text>
                      </View>
                      <View style={[local.priorityChip, { backgroundColor: theme.chipBg }]}>
                        <Feather name="flag" size={10} color={theme.icon} />
                        <Text style={[local.priorityChipText, { color: theme.chipText }]}>
                          {priorityLabel(task.priority)}
                        </Text>
                      </View>
                      {dueToday && !task.completed ? (
                        <View style={local.dueTodayChip}>
                          <Feather name="zap" size={10} color="#B45309" />
                          <Text style={local.dueTodayChipText}>Due today</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={local.checkWrap}>
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Feather
                        name={task.completed ? 'check-circle' : 'circle'}
                        size={28}
                        color={task.completed ? '#059669' : '#CBD5E1'}
                      />
                    )}
                  </View>
                </View>

                {task.description.trim() !== '' ? (
                  <Text style={local.taskDesc} numberOfLines={3}>
                    {task.description}
                  </Text>
                ) : null}

                <View style={local.taskMetaRow}>
                  <View style={local.taskMetaItem}>
                    <Feather name="calendar" size={14} color="#64748B" />
                    <Text style={local.taskMetaText}>{task.dueLabel}</Text>
                  </View>
                  {task.locationLabel ? (
                    <View style={local.taskMetaItem}>
                      <Feather name="map-pin" size={14} color="#64748B" />
                      <Text style={local.taskMetaText} numberOfLines={1}>
                        {task.locationLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <SweetAlert
        visible={alert !== null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="warning"
        onClose={() => setAlert(null)}
        onConfirm={() => setAlert(null)}
      />
    </View>
  );
}

const local = StyleSheet.create({
  heroCard: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 20,
    padding: spacing.xl,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: { flex: 1 },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginTop: 4,
    lineHeight: 18,
  },
  progressRing: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressPct: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
    lineHeight: 16,
  },
  progressLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    color: 'rgba(255,255,255,0.82)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statPillUrgent: {
    backgroundColor: 'rgba(245,158,11,0.22)',
  },
  statPillText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#FFFFFF',
  },
  loadingWrap: {
    paddingVertical: spacing.xxl * 2,
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: colors.text.secondary,
  },
  refreshHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
  },
  refreshHintText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.text.secondary,
  },
  errorBanner: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderRadius: 16,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: spacing.sm,
  },
  errorTextCol: { gap: 4 },
  errorTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#B45309',
  },
  errorBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
  },
  retryText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: '#B45309',
  },
  emptyCard: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.md,
    padding: spacing.xxl,
    borderRadius: 24,
    backgroundColor: colors.white,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,61,122,0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyIconOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0,61,122,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,61,122,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  emptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },
  emptyTips: {
    marginTop: spacing.xl,
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  emptyTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
  },
  emptyTipText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.text.secondary,
  },
  filterEmptyCard: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    padding: spacing.xxl,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterEmptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: spacing.md,
  },
  filterEmptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  taskCard: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 18,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  taskCardDone: { opacity: 0.78 },
  priorityStripe: { width: 5 },
  taskCardInner: {
    flex: 1,
    padding: spacing.lg,
    paddingLeft: spacing.md,
  },
  taskTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  categoryIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTitleCol: { flex: 1 },
  taskTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  taskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.text.secondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  categoryChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  categoryChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  priorityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  priorityChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    textTransform: 'uppercase',
  },
  dueTodayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFFBEB',
  },
  dueTodayChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: '#B45309',
    textTransform: 'uppercase',
  },
  checkWrap: {
    paddingTop: 2,
    minWidth: 32,
    alignItems: 'center',
  },
  taskDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  taskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  taskMetaText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#64748B',
    flexShrink: 1,
  },
});
