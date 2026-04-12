import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { dashboardStyles, tasksStyles } from '../../styles/styles';
import { colors } from '../../theme/theme';

type TaskPriority = 'high' | 'medium' | 'low';

export type TaskItem = {
  id: string;
  title: string;
  description: string;
  dueLabel: string;
  priority: TaskPriority;
  completed: boolean;
  category: string;
};

/** Worksite-only: safety, access, equipment on site, site briefings — not HR/payroll/scheduling. */
const INITIAL_TASKS: TaskItem[] = [
  {
    id: '1',
    title: 'Complete site induction & safety briefing',
    description:
      'Read the site-specific rules, hazards, and emergency assembly point. Sign the digital acknowledgement before you enter the work zone.',
    dueLabel: 'Today · before first shift',
    priority: 'high',
    completed: false,
    category: 'Site safety',
  },
  {
    id: '2',
    title: 'Daily pre-start equipment check',
    description:
      'Record your assigned plant or vehicle pre-start on this site (brakes, hydraulics, lights). Required for every shift on location.',
    dueLabel: 'Today · start of shift',
    priority: 'high',
    completed: false,
    category: 'Site equipment',
  },
  {
    id: '3',
    title: 'Report or confirm site hazards',
    description:
      'If you see an unsafe condition (spills, damaged barriers, exposed services), log it here or confirm “no new hazards” for your area.',
    dueLabel: 'Today · 4:00 PM',
    priority: 'medium',
    completed: false,
    category: 'Hazard reporting',
  },
  {
    id: '4',
    title: 'PPE & site access compliance',
    description:
      'Verify hi-vis, hard hat, and site pass are correct for this location. Site gate rules apply — not general office HR.',
    dueLabel: 'Tomorrow',
    priority: 'medium',
    completed: false,
    category: 'Site access',
  },
  {
    id: '5',
    title: 'Toolbox talk — manual handling (on site)',
    description: 'Attend the 15-minute session at the site briefing area (Bay 2). Site attendance only.',
    dueLabel: 'Wed 10 Apr · Done',
    priority: 'low',
    completed: true,
    category: 'Site briefing',
  },
];

type FilterKey = 'all' | 'pending' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Done' },
];

function priorityBarStyle(p: TaskPriority) {
  switch (p) {
    case 'high':
      return tasksStyles.priorityHigh;
    case 'medium':
      return tasksStyles.priorityMedium;
    default:
      return tasksStyles.priorityLow;
  }
}

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

export function TasksScreen() {
  const navigation = useNavigation<any>();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const insets = useSafeAreaInsets();
  const headerStyles = dashboardStyles;
  const styles = tasksStyles;
  const [tasks, setTasks] = useState<TaskItem[]>(INITIAL_TASKS);
  const [filter, setFilter] = useState<FilterKey>('all');

  const visibleTasks = useMemo(() => {
    if (filter === 'pending') return tasks.filter((t) => !t.completed);
    if (filter === 'completed') return tasks.filter((t) => t.completed);
    return tasks;
  }, [tasks, filter]);

  const pendingCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }, []);

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
            <Feather name="user" size={22} color={colors.primary} />
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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
      >
        <Text style={styles.sectionTitle}>Site tasks</Text>
        <Text style={styles.sectionSubtitle}>
          Things you must do on this worksite: safety, access, equipment checks, and site briefings. Payroll, HR
          documents, and roster changes are handled elsewhere.
          {'\n\n'}
          {pendingCount === 0
            ? 'You are all caught up on site tasks.'
            : `${pendingCount} site task${pendingCount === 1 ? '' : 's'} still open.`}
        </Text>

        <View style={styles.filterRow}>
          {FILTERS.map(({ key, label }) => {
            const active = filter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {visibleTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No tasks in this view</Text>
            <Text style={styles.emptyHint}>
              Try another filter or check back when your site supervisor assigns new on-site tasks.
            </Text>
          </View>
        ) : (
          visibleTasks.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[styles.taskCard, task.completed && styles.taskCardDone]}
              activeOpacity={0.92}
              onPress={() => toggleTask(task.id)}
              accessibilityRole="button"
              accessibilityLabel={`${task.title}. ${task.completed ? 'Completed' : 'Not completed'}. Tap to toggle.`}
            >
              <View style={[styles.priorityBar, priorityBarStyle(task.priority)]} />
              <View style={styles.taskBody}>
                <Text style={[styles.taskTitle, task.completed && styles.taskTitleDone]}>{task.title}</Text>
                <Text style={styles.taskDesc}>{task.description}</Text>
                <View style={styles.taskBadge}>
                  <Text style={styles.taskBadgeText}>{task.category}</Text>
                </View>
                <View style={styles.taskMetaRow}>
                  <View style={styles.taskMetaItem}>
                    <Feather name="calendar" size={14} color="#9CA3AF" />
                    <Text style={styles.taskMetaText}>{task.dueLabel}</Text>
                  </View>
                  <View style={styles.taskMetaItem}>
                    <Feather name="flag" size={14} color="#9CA3AF" />
                    <Text style={styles.taskMetaText}>{priorityLabel(task.priority)} priority</Text>
                  </View>
                </View>
              </View>
              <View
                style={styles.checkBtn}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Feather
                  name={task.completed ? 'check-circle' : 'circle'}
                  size={28}
                  color={task.completed ? '#059669' : '#CBD5E1'}
                />
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}
