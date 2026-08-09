import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Pressable,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { dashboardStyles } from '../../styles/styles';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { getDisplayProfilePhotoUri } from '../../services/accountProfileStorage';
import { useHeaderProfileSnapshot } from '../../hooks/useHeaderProfileSnapshot';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import {
  acknowledgeTrainingMaterials,
  fetchAssignedTrainings,
  fetchTrainingDetail,
  submitTrainingAnswers,
} from '../../services/trainingApi';
import type {
  TrainingBand,
  TrainingDetail,
  TrainingSummary,
} from '../../types/training';
import { SweetAlert } from '../../components/SweetAlert';

type TrainingScreenProps = {
  isTabActive?: boolean;
};

type ViewMode = 'list' | 'detail' | 'reader' | 'quiz' | 'result';
type FilterKey = 'all' | 'pending' | 'completed';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'To do' },
  { key: 'completed', label: 'Done' },
];

const DEFAULT_QUESTION_SECONDS = 45;

function statusLabel(status: TrainingSummary['status']): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in_quiz':
      return 'Quiz ready';
    case 'studying':
      return 'Studying';
    default:
      return 'Not started';
  }
}

function bandTheme(band: TrainingBand) {
  switch (band) {
    case 'strong':
      return { bg: '#ECFDF5', text: '#047857', label: 'Strong', icon: 'award' as const };
    case 'pass':
      return { bg: '#EFF6FF', text: '#1D4ED8', label: 'Pass', icon: 'check-circle' as const };
    case 'weak':
      return { bg: '#FFFBEB', text: '#B45309', label: 'Needs work', icon: 'alert-circle' as const };
    case 'fail':
      return { bg: '#FEF2F2', text: '#B91C1C', label: 'Fail', icon: 'x-circle' as const };
    default:
      return { bg: '#F1F5F9', text: '#475569', label: 'Pending', icon: 'clock' as const };
  }
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function TrainingScreen({ isTabActive = true }: TrainingScreenProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { openLogoutSweetAlert } = useLogoutSweetAlert();
  const headerProfile = useHeaderProfileSnapshot();
  const headerStyles = dashboardStyles;

  const [view, setView] = useState<ViewMode>('list');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [trainings, setTrainings] = useState<TrainingSummary[]>([]);
  const [detail, setDetail] = useState<TrainingDetail | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_QUESTION_SECONDS);
  const [viewedPageIds, setViewedPageIds] = useState<Set<number>>(new Set());
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const timerPulse = useRef(new Animated.Value(1)).current;

  const questionSeconds = Math.max(
    10,
    detail?.assignment.question_time_seconds ?? DEFAULT_QUESTION_SECONDS,
  );

  const loadList = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setError(null);
    const result = await fetchAssignedTrainings();
    if (!result.ok) {
      setError(result.message);
      if (!opts?.soft) setTrainings([]);
    } else {
      setTrainings(result.trainings);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (isTabActive && view === 'list') {
      loadList({ soft: trainings.length > 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTabActive]);

  // Keep the new page / question at the top after Next / Previous.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [view, pageIndex, quizIndex]);

  const submitQuizWithAnswers = useCallback(
    async (answerMap: Record<number, number>) => {
      if (!detail || submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      const payload = detail.questions
        .filter((q) => answerMap[q.id] != null)
        .map((q) => ({
          question_id: q.id,
          option_id: answerMap[q.id],
        }));
      const result = await submitTrainingAnswers(detail.assignment.id, payload);
      setBusy(false);
      submittingRef.current = false;
      if (!result.ok) {
        setAlert({ title: 'Could not submit', message: result.message });
        return;
      }
      setDetail(result.detail);
      setView('result');
    },
    [detail],
  );

  const advanceOrSubmit = useCallback(
    (fromIndex: number, answerMap: Record<number, number>) => {
      if (!detail) return;
      if (fromIndex >= detail.questions.length - 1) {
        void submitQuizWithAnswers(answerMap);
        return;
      }
      setQuizIndex(fromIndex + 1);
      setSecondsLeft(questionSeconds);
    },
    [detail, questionSeconds, submitQuizWithAnswers],
  );

  // Per-question countdown while on quiz.
  useEffect(() => {
    if (view !== 'quiz' || !detail || detail.questions.length === 0) return;

    setSecondsLeft(questionSeconds);
    let remaining = questionSeconds;
    const id = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearInterval(id);
        advanceOrSubmit(quizIndex, answersRef.current);
      }
    }, 1000);

    return () => clearInterval(id);
    // Only reset timer when question index / quiz view changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, quizIndex, detail?.assignment.id]);

  useEffect(() => {
    if (view !== 'quiz') return;
    const urgent = secondsLeft <= 10;
    Animated.loop(
      Animated.sequence([
        Animated.timing(timerPulse, {
          toValue: urgent ? 1.08 : 1,
          duration: urgent ? 400 : 1,
          useNativeDriver: true,
        }),
        Animated.timing(timerPulse, {
          toValue: 1,
          duration: urgent ? 400 : 1,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [secondsLeft, view, timerPulse]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (view === 'list') {
      loadList({ soft: true });
      return;
    }
    if (detail) {
      fetchTrainingDetail(detail.assignment.id).then((result) => {
        setRefreshing(false);
        if (result.ok) setDetail(result.detail);
        else setAlert({ title: 'Could not refresh', message: result.message });
      });
    } else {
      setRefreshing(false);
    }
  }, [view, detail, loadList]);

  const openAssignment = useCallback(async (item: TrainingSummary) => {
    setBusy(true);
    const result = await fetchTrainingDetail(item.id);
    setBusy(false);
    if (!result.ok) {
      setAlert({ title: 'Could not open training', message: result.message });
      return;
    }
    setDetail(result.detail);
    setAnswers({});
    setPageIndex(0);
    setQuizIndex(0);
    setViewedPageIds(new Set());
    setExpandedSectionIds(new Set());
    if (result.detail.assignment.status === 'completed') {
      setView('result');
    } else {
      setView('detail');
    }
  }, []);

  const goBackToList = useCallback(() => {
    setView('list');
    setDetail(null);
    setAnswers({});
    setPageIndex(0);
    setQuizIndex(0);
    setViewedPageIds(new Set());
    setExpandedSectionIds(new Set());
    loadList({ soft: true });
  }, [loadList]);

  const startReader = useCallback(() => {
    if (!detail || detail.pages.length === 0) {
      setAlert({ title: 'No study pages', message: 'This module has no study pages yet.' });
      return;
    }
    setPageIndex(0);
    setViewedPageIds(new Set([detail.pages[0].id]));
    setExpandedSectionIds(new Set());
    setView('reader');
  }, [detail]);

  const markPageViewed = useCallback((pageId: number) => {
    setViewedPageIds((prev) => {
      if (prev.has(pageId)) return prev;
      const next = new Set(prev);
      next.add(pageId);
      return next;
    });
  }, []);

  const toggleSection = useCallback((sectionId: number) => {
    setExpandedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }, []);

  const goToPage = useCallback(
    (index: number) => {
      if (!detail) return;
      const clamped = Math.max(0, Math.min(index, detail.pages.length - 1));
      setPageIndex(clamped);
      setExpandedSectionIds(new Set());
      markPageViewed(detail.pages[clamped].id);
    },
    [detail, markPageViewed],
  );

  const startQuiz = useCallback((nextDetail: TrainingDetail) => {
    setDetail(nextDetail);
    setAnswers({});
    setQuizIndex(0);
    setSecondsLeft(Math.max(10, nextDetail.assignment.question_time_seconds || DEFAULT_QUESTION_SECONDS));
    setView('quiz');
  }, []);

  const onAcknowledge = useCallback(async () => {
    if (!detail) return;
    if (detail.pages.length > 0 && viewedPageIds.size < detail.pages.length) {
      setAlert({
        title: 'Read all pages',
        message: 'Go through every study page before unlocking the quiz.',
      });
      return;
    }
    setBusy(true);
    const result = await acknowledgeTrainingMaterials(detail.assignment.id);
    setBusy(false);
    if (!result.ok) {
      setAlert({ title: 'Could not unlock quiz', message: result.message });
      return;
    }
    startQuiz(result.detail);
  }, [detail, viewedPageIds, startQuiz]);

  const selectOption = useCallback((questionId: number, optionId: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }, []);

  const onQuizNext = useCallback(() => {
    if (!detail) return;
    const question = detail.questions[quizIndex];
    if (!question) return;
    if (answers[question.id] == null) {
      setAlert({
        title: 'Pick an answer',
        message: 'Select an option before continuing, or wait for the timer to move on.',
      });
      return;
    }
    advanceOrSubmit(quizIndex, answers);
  }, [detail, quizIndex, answers, advanceOrSubmit]);

  const visibleTrainings = useMemo(() => {
    if (filter === 'completed') return trainings.filter((t) => t.status === 'completed');
    if (filter === 'pending') return trainings.filter((t) => t.status !== 'completed');
    return trainings;
  }, [trainings, filter]);

  const pendingCount = trainings.filter((t) => t.status !== 'completed').length;
  const completedCount = trainings.filter((t) => t.status === 'completed').length;

  const currentPage = detail?.pages[pageIndex] ?? null;
  const currentQuestion = detail?.questions[quizIndex] ?? null;
  const allPagesRead =
    !!detail && detail.pages.length > 0 && viewedPageIds.size >= detail.pages.length;
  const timerUrgent = secondsLeft <= 10;
  const timerRatio = questionSeconds > 0 ? secondsLeft / questionSeconds : 0;

  const title =
    view === 'list'
      ? 'Training'
      : view === 'reader'
        ? 'Study'
        : view === 'quiz'
          ? `Q${quizIndex + 1}`
          : view === 'result'
            ? 'Results'
            : detail?.assignment.title ?? 'Training';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={headerStyles.header}>
        {view === 'list' ? (
          <TouchableOpacity
            style={headerStyles.profileAvatarWrap}
            onPress={() => navigation.navigate('MyProfile' as never)}
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
        ) : (
          <TouchableOpacity
            style={headerStyles.profileAvatarWrap}
            onPress={() => {
              if (view === 'quiz') {
                setAlert({
                  title: 'Leave quiz?',
                  message: 'Leaving now will lose this attempt progress. Finish the quiz if you can.',
                });
                return;
              }
              if (view === 'reader') setView('detail');
              else if (view === 'result') setView('detail');
              else goBackToList();
            }}
            activeOpacity={0.75}
            accessibilityLabel="Go back"
          >
            <View style={styles.backBtn}>
              <Feather name="arrow-left" size={22} color={colors.primary} />
            </View>
          </TouchableOpacity>
        )}
        <Text style={headerStyles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
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
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: floatingTabBarClearance(insets.bottom) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          view === 'quiz' ? undefined : (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          )
        }
      >
        {view === 'list' ? (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroGlow} />
              <View style={styles.heroTopRow}>
                <View style={styles.heroIconWrap}>
                  <Feather name="book-open" size={22} color="#FFFFFF" />
                </View>
                <View style={styles.heroTextCol}>
                  <Text style={styles.heroTitle}>Cleaning training</Text>
                  <Text style={styles.heroSubtitle}>
                    {loading
                      ? 'Loading your modules…'
                      : trainings.length === 0
                        ? 'No training assigned yet'
                        : `${pendingCount} to complete · ${completedCount} done`}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.filterRow}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
            ) : error && trainings.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="wifi-off" size={36} color={colors.icon} />
                <Text style={styles.emptyTitle}>{error}</Text>
              </View>
            ) : visibleTrainings.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Feather name="book-open" size={28} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>Nothing here yet</Text>
                <Text style={styles.emptyHint}>
                  When your supervisor assigns a training module, it will show up here.
                </Text>
              </View>
            ) : (
              visibleTrainings.map((item) => {
                const theme = bandTheme(item.band);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() => openAssignment(item)}
                    disabled={busy}
                  >
                    <View style={styles.cardAccent} />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      {item.description ? (
                        <Text style={styles.cardDesc} numberOfLines={2}>
                          {item.description}
                        </Text>
                      ) : null}
                      <View style={styles.metaRow}>
                        <View style={styles.metaItem}>
                          <Feather name="book" size={13} color={colors.text.secondary} />
                          <Text style={styles.metaText}>{item.pages_count} pages</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Feather name="help-circle" size={13} color={colors.text.secondary} />
                          <Text style={styles.metaText}>{item.questions_count} Qs</Text>
                        </View>
                        <View style={styles.metaItem}>
                          <Feather name="clock" size={13} color={colors.text.secondary} />
                          <Text style={styles.metaText}>{item.question_time_seconds}s each</Text>
                        </View>
                      </View>
                      <View style={styles.badgeRow}>
                        <View style={styles.statusBadge}>
                          <Text style={styles.statusBadgeText}>{statusLabel(item.status)}</Text>
                        </View>
                        {item.status === 'completed' ? (
                          <View style={[styles.statusBadge, { backgroundColor: theme.bg }]}>
                            <Text style={[styles.statusBadgeText, { color: theme.text }]}>
                              {formatPercent(item.percent)} · {theme.label}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.icon} />
                  </TouchableOpacity>
                );
              })
            )}
          </>
        ) : null}

        {view === 'detail' && detail ? (
          <>
            <View style={styles.detailHero}>
              <Text style={styles.detailHeroTitle}>{detail.assignment.title}</Text>
              {detail.assignment.description ? (
                <Text style={styles.detailHeroDesc}>{detail.assignment.description}</Text>
              ) : null}
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name="book" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Study pages</Text>
                  <Text style={styles.infoText}>
                    {detail.pages.length} page{detail.pages.length === 1 ? '' : 's'} to read
                  </Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name="help-circle" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Timed quiz</Text>
                  <Text style={styles.infoText}>
                    {detail.assignment.questions_count} questions ·{' '}
                    {detail.assignment.question_time_seconds}s each
                  </Text>
                </View>
              </View>
            </View>

            {detail.quiz_unlocked ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  if (detail.assignment.status === 'completed') setView('result');
                  else startQuiz(detail);
                }}
              >
                <Text style={styles.primaryBtnText}>
                  {detail.assignment.status === 'completed' ? 'View results' : 'Continue quiz'}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={startReader}>
                <Text style={styles.primaryBtnText}>Start reading</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}

        {view === 'reader' && detail && currentPage ? (
          <>
            <View style={styles.pageProgress}>
              <Text style={styles.pageProgressText}>
                Page {pageIndex + 1} of {detail.pages.length}
              </Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${((pageIndex + 1) / detail.pages.length) * 100}%` },
                  ]}
                />
              </View>
            </View>

            <View style={styles.readerCard}>
              <Text style={styles.readerTitle}>{currentPage.title}</Text>
              {currentPage.body.trim().length > 0 ? (
                <Text style={styles.readerBody}>{currentPage.body}</Text>
              ) : null}

              {currentPage.sections.length > 0 ? (
                <View
                  style={[
                    styles.sectionList,
                    currentPage.body.trim().length > 0 && styles.sectionListSpaced,
                  ]}
                >
                  {currentPage.sections.map((section) => {
                    const open = expandedSectionIds.has(section.id);
                    return (
                      <View key={section.id} style={styles.sectionItem}>
                        <Pressable
                          onPress={() => toggleSection(section.id)}
                          style={styles.sectionHeader}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: open }}
                        >
                          <Text style={styles.sectionTitle}>{section.title}</Text>
                          <Feather
                            name={open ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={colors.text.secondary}
                          />
                        </Pressable>
                        {open ? (
                          <Text style={styles.sectionBody}>{section.body}</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.readerNav}>
              <TouchableOpacity
                style={[styles.navBtn, pageIndex === 0 && styles.navBtnDisabled]}
                disabled={pageIndex === 0}
                onPress={() => goToPage(pageIndex - 1)}
                activeOpacity={0.8}
              >
                <Feather name="chevron-left" size={20} color={pageIndex === 0 ? '#94A3B8' : colors.primary} />
                <Text style={[styles.navBtnText, pageIndex === 0 && styles.navBtnTextDisabled]}>
                  Previous
                </Text>
              </TouchableOpacity>

              {pageIndex < detail.pages.length - 1 ? (
                <TouchableOpacity
                  style={styles.navBtnPrimary}
                  onPress={() => goToPage(pageIndex + 1)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.navBtnPrimaryText}>Next page</Text>
                  <Feather name="chevron-right" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.navBtnPrimary, (!allPagesRead || busy) && styles.btnDisabled]}
                  onPress={onAcknowledge}
                  disabled={!allPagesRead || busy}
                  activeOpacity={0.85}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.navBtnPrimaryText}>Start timed quiz</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        ) : null}

        {view === 'quiz' && detail && currentQuestion ? (
          <>
            <View style={styles.quizTop}>
              <View style={styles.quizMeta}>
                <Text style={styles.quizMetaLabel}>
                  Question {quizIndex + 1} of {detail.questions.length}
                </Text>
                <View style={styles.quizTrack}>
                  <View
                    style={[
                      styles.quizTrackFill,
                      { width: `${((quizIndex + 1) / detail.questions.length) * 100}%` },
                    ]}
                  />
                </View>
              </View>

              <Animated.View
                style={[
                  styles.timerBadge,
                  timerUrgent && styles.timerBadgeUrgent,
                  { transform: [{ scale: timerUrgent ? timerPulse : 1 }] },
                ]}
              >
                <Feather name="clock" size={16} color={timerUrgent ? '#B91C1C' : colors.primary} />
                <Text style={[styles.timerText, timerUrgent && styles.timerTextUrgent]}>
                  {formatTimer(secondsLeft)}
                </Text>
              </Animated.View>
            </View>

            <View style={styles.timerBarTrack}>
              <View
                style={[
                  styles.timerBarFill,
                  timerUrgent && styles.timerBarUrgent,
                  { width: `${Math.max(0, timerRatio * 100)}%` },
                ]}
              />
            </View>

            <View style={styles.questionCardSolo}>
              <Text style={styles.questionTextSolo}>{currentQuestion.question_text}</Text>
              <View style={styles.optionsWrap}>
                {currentQuestion.options.map((option, optIndex) => {
                  const selected = answers[currentQuestion.id] === option.id;
                  const letter = String.fromCharCode(65 + optIndex);
                  return (
                    <Pressable
                      key={option.id}
                      style={[styles.optionRowSolo, selected && styles.optionRowSoloSelected]}
                      onPress={() => selectOption(currentQuestion.id, option.id)}
                    >
                      <View style={[styles.optionLetter, selected && styles.optionLetterSelected]}>
                        <Text style={[styles.optionLetterText, selected && styles.optionLetterTextSelected]}>
                          {letter}
                        </Text>
                      </View>
                      <Text style={[styles.optionTextSolo, selected && styles.optionTextSoloSelected]}>
                        {option.option_text}
                      </Text>
                      {selected ? (
                        <Feather name="check" size={18} color={colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={onQuizNext}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {quizIndex >= detail.questions.length - 1 ? 'Finish & see results' : 'Next question'}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.quizHint}>
              Unanswered questions when time runs out are marked incorrect.
            </Text>
          </>
        ) : null}

        {view === 'result' && detail ? (
          <>
            {(() => {
              const band = detail.result?.band ?? detail.assignment.band;
              const theme = bandTheme(band);
              return (
                <View style={[styles.resultHero, { backgroundColor: theme.bg }]}>
                  <View style={[styles.resultIconWrap, { backgroundColor: `${theme.text}18` }]}>
                    <Feather name={theme.icon} size={28} color={theme.text} />
                  </View>
                  <Text style={[styles.resultScore, { color: theme.text }]}>
                    {formatPercent(detail.result?.percent ?? detail.assignment.percent)}
                  </Text>
                  <Text style={[styles.resultBand, { color: theme.text }]}>{theme.label}</Text>
                  <Text style={styles.resultMeta}>
                    {(detail.result?.score ?? detail.assignment.score) ?? 0}/
                    {(detail.result?.max_score ?? detail.assignment.max_score) ?? 0} correct
                    {detail.result?.pass_percent != null || detail.assignment.pass_percent != null
                      ? ` · pass mark ${detail.result?.pass_percent ?? detail.assignment.pass_percent}%`
                      : ''}
                  </Text>
                </View>
              );
            })()}

            <Text style={styles.sectionTitle}>            Review</Text>
            {detail.questions.map((question, index) => (
              <View key={question.id} style={styles.questionCard}>
                <View style={styles.reviewHeader}>
                  <Text style={styles.questionIndex}>Question {index + 1}</Text>
                  <Text
                    style={[
                      styles.reviewFlag,
                      question.is_correct ? styles.reviewFlagOk : styles.reviewFlagBad,
                    ]}
                  >
                    {question.is_correct ? 'Correct' : question.selected_option_id ? 'Incorrect' : 'Skipped'}
                  </Text>
                </View>
                <Text style={styles.questionText}>{question.question_text}</Text>
                {question.options.map((option) => {
                  const selected = question.selected_option_id === option.id;
                  const correct = option.is_correct === true;
                  return (
                    <View
                      key={option.id}
                      style={[
                        styles.optionRow,
                        correct && styles.optionCorrect,
                        selected && !correct && styles.optionWrong,
                      ]}
                    >
                      <Text style={styles.optionText}>
                        {correct ? '✓ ' : selected ? '✗ ' : ''}
                        {option.option_text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}

            <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={goBackToList}>
              <Text style={styles.secondaryBtnText}>Back to training list</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      <SweetAlert
        visible={!!alert}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="info"
        onConfirm={() => setAlert(null)}
        onClose={() => setAlert(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F2F5' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2F7',
  },
  heroCard: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 22,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    right: -40,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: { flex: 1 },
  heroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 4,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxxl,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.inputBg,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    color: colors.text.secondary,
  },
  filterChipTextActive: { color: colors.white },
  card: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardAccent: {
    width: 4,
    borderRadius: 2,
    alignSelf: 'stretch',
    minHeight: 48,
    backgroundColor: colors.primary,
  },
  cardBody: { flex: 1 },
  cardTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 22,
  },
  cardDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  metaText: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.text.secondary },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: 8,
    backgroundColor: '#EEF2F7',
  },
  statusBadgeText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  emptyState: {
    marginHorizontal: spacing.xxxl,
    paddingVertical: spacing.xxl * 2,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#E8F1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.secondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  emptyHint: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.xl,
  },
  detailHero: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  detailHeroTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.text.primary,
    letterSpacing: -0.4,
  },
  detailHeroDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: colors.text.primary,
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    letterSpacing: -0.3,
  },
  infoCard: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
  infoText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text.primary,
    marginTop: 2,
  },
  infoDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  pageProgress: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  pageProgressText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  readerCard: {
    marginHorizontal: spacing.xxxl,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    minHeight: 280,
  },
  readerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginBottom: spacing.lg,
    lineHeight: 28,
  },
  readerBody: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 26,
  },
  sectionList: {
    gap: spacing.sm,
  },
  sectionListSpaced: {
    marginTop: spacing.lg,
  },
  sectionItem: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 20,
  },
  sectionBody: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 24,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  readerNav: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  navBtnDisabled: { opacity: 0.5 },
  navBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.primary,
  },
  navBtnTextDisabled: { color: '#94A3B8' },
  navBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  navBtnPrimaryText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  quizTop: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  quizMeta: { flex: 1 },
  quizMetaLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  quizTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  quizTrackFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F1FB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  timerBadgeUrgent: { backgroundColor: '#FEE2E2' },
  timerText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  timerTextUrgent: { color: '#B91C1C' },
  timerBarTrack: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.md,
    marginBottom: spacing.md,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  timerBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  timerBarUrgent: { backgroundColor: '#DC2626' },
  questionCardSolo: {
    marginHorizontal: spacing.xxxl,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
    minHeight: 320,
  },
  questionTextSolo: {
    fontFamily: fontFamily.semiBold,
    fontSize: 20,
    color: colors.text.primary,
    lineHeight: 28,
    letterSpacing: -0.2,
    marginBottom: spacing.xl,
  },
  optionsWrap: { gap: spacing.sm },
  optionRowSolo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionRowSoloSelected: {
    backgroundColor: '#E8F1FB',
    borderColor: colors.primary,
  },
  optionLetter: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetterSelected: { backgroundColor: colors.primary },
  optionLetterText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#475569',
  },
  optionLetterTextSelected: { color: '#FFFFFF' },
  optionTextSolo: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 21,
  },
  optionTextSoloSelected: {
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  quizHint: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 17,
  },
  primaryBtn: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  secondaryBtn: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    backgroundColor: '#EEF2F7',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.primary,
  },
  btnDisabled: { opacity: 0.7 },
  questionCard: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  questionIndex: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  questionText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: spacing.sm,
  },
  optionCorrect: { backgroundColor: '#ECFDF5' },
  optionWrong: { backgroundColor: '#FEF2F2' },
  optionText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  resultHero: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 22,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  resultIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultScore: {
    fontFamily: fontFamily.bold,
    fontSize: 52,
    letterSpacing: -1.5,
  },
  resultBand: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resultMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: spacing.sm,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewFlag: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  reviewFlagOk: { color: '#047857' },
  reviewFlagBad: { color: '#B91C1C' },
});
