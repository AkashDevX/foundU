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
  BackHandler,
  Image,
  DeviceEventEmitter,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { useLogoutSweetAlert } from '../../context/LogoutSweetAlertContext';
import { MainTabHeaderRight } from '../../components/HeaderIncidentReportButton';
import { dashboardStyles } from '../../styles/styles';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { getDisplayProfilePhotoUri } from '../../services/accountProfileStorage';
import { useHeaderProfileSnapshot } from '../../hooks/useHeaderProfileSnapshot';
import { ProfilePhotoAvatar } from '../../components/ProfilePhotoAvatar';
import { floatingTabBarClearance } from '../../navigation/floatingTabBarMetrics';
import { TrainingQuizQuestion } from '../../components/TrainingQuizQuestion';
import { TrainingSlideBlocks } from '../../components/TrainingSlideBlocks';
import { TrainingSlideImage } from '../../components/TrainingSlideImage';
import type { TrainingBlock } from '../../types/training';
import {
  acknowledgeTrainingMaterials,
  fetchAssignedTrainings,
  fetchTrainingDetail,
  finishTraining,
  quizDraftAnswered,
  quizDraftToAnswer,
  retakeTraining,
  submitTrainingAnswers,
  trainingPageImageUrl,
  trainingSectionImageUrl,
} from '../../services/trainingApi';
import type {
  TrainingBand,
  TrainingDetail,
  TrainingQuizDraft,
  TrainingSummary,
} from '../../types/training';
import { SweetAlert } from '../../components/SweetAlert';
import { SignaturePad, SignaturePreview, type SignatureDrawing } from '../../components/SignaturePad';
import { TRAINING_ASSIGNED_EVENT } from '../../services/chatPush';

type TrainingScreenProps = {
  isTabActive?: boolean;
};

type ViewMode = 'list' | 'certificates' | 'detail' | 'reader' | 'quiz' | 'sign' | 'result' | 'certificate';
type CertificateOrigin = 'certificates' | 'result' | 'detail';
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
    case 'pending_review':
      return 'Needs review';
    case 'failed':
      return 'Failed';
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

function SlidePieces({
  layout,
  title,
  body,
  bullets,
  hasImage,
  imageUrl,
  blocks,
  includeTitle,
}: {
  layout: string[];
  title: string;
  body: string;
  bullets: string[];
  hasImage: boolean;
  imageUrl: string;
  blocks: TrainingBlock[];
  includeTitle: boolean;
}) {
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const used = new Set<number>();
  return (
    <>
      {layout.map((token, index) => {
        const key = `${token}-${index}`;
        if (token === 'title') {
          if (!includeTitle) return null;
          return (
            <Text key={key} style={styles.readerTitle}>
              {title}
            </Text>
          );
        }
        if (token === 'body') {
          if (body.trim().length === 0) return null;
          return (
            <Text key={key} style={includeTitle ? styles.readerBody : styles.sectionBody}>
              {body}
            </Text>
          );
        }
        if (token === 'bullets') {
          if (bullets.length === 0) return null;
          return (
            <View key={key} style={styles.bulletList}>
              {bullets.map((line, bulletIndex) => (
                <View key={`${key}-${bulletIndex}`} style={styles.bulletRow}>
                  <View style={styles.bulletDot} />
                  <Text style={styles.bulletText}>{line}</Text>
                </View>
              ))}
            </View>
          );
        }
        if (token === 'image') {
          if (!hasImage) return null;
          return <TrainingSlideImage key={key} url={imageUrl} />;
        }
        if (token.startsWith('block:')) {
          const block = blockMap.get(Number(token.slice(6)));
          if (!block) return null;
          used.add(block.id);
          return <TrainingSlideBlocks key={key} blocks={[block]} />;
        }
        return null;
      })}
      <TrainingSlideBlocks blocks={blocks.filter((block) => !used.has(block.id))} />
    </>
  );
}

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
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
  const [certificateOrigin, setCertificateOrigin] = useState<CertificateOrigin>('result');
  const [pageIndex, setPageIndex] = useState(0);
  const [quizIndex, setQuizIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_QUESTION_SECONDS);
  const [timerPaused, setTimerPaused] = useState(false);
  const [viewedPageIds, setViewedPageIds] = useState<Set<number>>(new Set());
  const [retakeSlidesDone, setRetakeSlidesDone] = useState(false);
  const [expandedSectionIds, setExpandedSectionIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    hideCancel?: boolean;
    variant?: 'success' | 'error' | 'info' | 'warning' | 'danger';
    onConfirm?: () => void;
  } | null>(null);
  const [answers, setAnswers] = useState<Record<number, TrainingQuizDraft>>({});

  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const signatureRef = useRef<SignatureDrawing | null>(null);
  const quizIndexRef = useRef(0);
  const deadlineRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number | null>(null);
  const advanceRef = useRef<
    (fromIndex: number, answerMap: Record<number, TrainingQuizDraft>) => void
  >(() => {});
  const [timerTrackWidth, setTimerTrackWidth] = useState(0);

  const questionSeconds = Math.max(
    10,
    Number(detail?.assignment.question_time_seconds) || DEFAULT_QUESTION_SECONDS,
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

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(TRAINING_ASSIGNED_EVENT, () => {
      if (view === 'list') void loadList({ soft: true });
    });
    return () => sub.remove();
  }, [view, loadList]);

  useEffect(() => {
    if (!isTabActive || view !== 'result' || !detail) return;
    let cancelled = false;
    const assignmentId = detail.assignment.id;
    fetchTrainingDetail(assignmentId).then((result) => {
      if (cancelled || !result.ok) return;
      setDetail((current) => {
        if (current?.result && result.detail.result == null) {
          return {
            ...current,
            assignment: {
              ...current.assignment,
              can_retry: result.detail.assignment.can_retry,
              attempts_remaining: result.detail.assignment.attempts_remaining,
              attempts_used: result.detail.assignment.attempts_used,
              max_attempts: result.detail.assignment.max_attempts,
            },
            induction: result.detail.induction ?? current.induction,
          };
        }
        return result.detail;
      });
    });
    return () => {
      cancelled = true;
    };
    // Refresh a failed result so a new try limit shows without leaving this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTabActive, view, detail?.assignment.id]);

  // Keep the new page / question at the top after Next / Previous.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [view, pageIndex, quizIndex]);

  const submitQuizWithAnswers = useCallback(
    async (answerMap: Record<number, TrainingQuizDraft>, signature?: SignatureDrawing | null) => {
      if (!detail || submittingRef.current) return;
      submittingRef.current = true;
      setBusy(true);
      const payload = detail.questions
        .map((question) => quizDraftToAnswer(question, answerMap[question.id]))
        .filter((row): row is Record<string, unknown> => row !== null);
      const result = await submitTrainingAnswers(detail.assignment.id, payload, signature);
      if (!result.ok) {
        const alreadySubmitted = result.message.toLowerCase().includes('already been submitted');
        if (alreadySubmitted) {
          const again = await fetchTrainingDetail(detail.assignment.id);
          const status = again.ok ? again.detail.assignment.status : null;
          if (
            again.ok &&
            (again.detail.result != null ||
              again.detail.assignment.submitted_at != null ||
              status === 'completed' ||
              status === 'failed' ||
              status === 'pending_review')
          ) {
            setDetail(again.detail);
            setView('result');
            setBusy(false);
            submittingRef.current = false;
            return;
          }
        }
        setBusy(false);
        submittingRef.current = false;
        setAlert({ title: 'Could not submit', message: result.message });
        return;
      }
      setDetail(result.detail);
      setView('result');
      setBusy(false);
      submittingRef.current = false;
    },
    [detail],
  );

  const advanceOrSubmit = useCallback(
    (fromIndex: number, answerMap: Record<number, TrainingQuizDraft>) => {
      if (!detail) return;
      if (fromIndex >= detail.questions.length - 1) {
        signatureRef.current = null;
        setView('sign');
        return;
      }
      setQuizIndex(fromIndex + 1);
      setSecondsLeft(questionSeconds);
    },
    [detail, questionSeconds],
  );

  advanceRef.current = advanceOrSubmit;
  quizIndexRef.current = quizIndex;

  // Fresh deadline for each question. Pause stores the remaining time so the
  // leave dialog does not eat the countdown or freeze the next attempt.
  useEffect(() => {
    if (view !== 'quiz' || !detail || detail.questions.length === 0) {
      deadlineRef.current = null;
      pausedRemainingRef.current = null;
      return;
    }
    const total = Math.max(10, Number(questionSeconds) || DEFAULT_QUESTION_SECONDS);
    deadlineRef.current = Date.now() + total * 1000;
    pausedRemainingRef.current = null;
    setSecondsLeft(total);
  }, [view, quizIndex, detail?.assignment.id, detail?.questions.length, questionSeconds]);

  useEffect(() => {
    if (view !== 'quiz' || !detail || detail.questions.length === 0) return;

    if (timerPaused) {
      if (deadlineRef.current != null) {
        pausedRemainingRef.current = Math.max(0, deadlineRef.current - Date.now());
      }
      return;
    }

    if (pausedRemainingRef.current != null) {
      deadlineRef.current = Date.now() + pausedRemainingRef.current;
      pausedRemainingRef.current = null;
    }
    if (deadlineRef.current == null) {
      const total = Math.max(10, Number(questionSeconds) || DEFAULT_QUESTION_SECONDS);
      deadlineRef.current = Date.now() + total * 1000;
    }

    let movedOn = false;
    const tick = () => {
      if (movedOn || deadlineRef.current == null) return;
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsLeft((prev) => (prev === left ? prev : left));
      if (left <= 0) {
        movedOn = true;
        advanceRef.current(quizIndexRef.current, answersRef.current);
      }
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [view, quizIndex, detail?.assignment.id, detail?.questions.length, timerPaused, questionSeconds]);

  const onRefresh = useCallback(() => {
    if (view === 'quiz' || view === 'sign') {
      setRefreshing(false);
      return;
    }
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

  const openCertificate = useCallback(async (item: TrainingSummary) => {
    setBusy(true);
    const result = await fetchTrainingDetail(item.id);
    setBusy(false);
    if (!result.ok || !result.detail.assignment.certificate) {
      setAlert({
        title: 'Could not open certificate',
        message: result.ok ? 'This certificate is no longer available.' : result.message,
      });
      return;
    }
    setDetail(result.detail);
    setCertificateOrigin('certificates');
    setView('certificate');
  }, []);

  const openAssignment = useCallback(async (item: TrainingSummary) => {
    setBusy(true);
    const result = await fetchTrainingDetail(item.id);
    setBusy(false);
    if (!result.ok) {
      setAlert({ title: 'Could not open training', message: result.message });
      return;
    }
    const next = result.detail;
    setDetail(next);
    setAnswers({});
    setPageIndex(0);
    setQuizIndex(0);
    setExpandedSectionIds(new Set());
    setRetakeSlidesDone(false);
    const status = next.assignment.status;
    const retakeInProgress =
      ((next.assignment.attempts_used ?? 0) > 0 || (next.induction?.attempts_used ?? 0) > 0) &&
      status !== 'completed' &&
      status !== 'failed' &&
      status !== 'pending_review';
    if (status === 'completed' || status === 'failed' || status === 'pending_review') {
      setViewedPageIds(new Set());
      setView('result');
    } else if (retakeInProgress && next.pages.length > 0) {
      setViewedPageIds(new Set([next.pages[0].id]));
      setView('reader');
    } else {
      setViewedPageIds(new Set());
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
    setTimerPaused(false);
    pausedRemainingRef.current = null;
    const total = Math.max(10, Number(nextDetail.assignment.question_time_seconds) || DEFAULT_QUESTION_SECONDS);
    deadlineRef.current = Date.now() + total * 1000;
    setSecondsLeft(total);
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
    setRetakeSlidesDone(true);
    startQuiz(result.detail);
  }, [detail, viewedPageIds, startQuiz]);

  const finishWithoutQuiz = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    const result = await finishTraining(detail.assignment.id);
    setBusy(false);
    if (!result.ok) {
      setAlert({ title: 'Could not finish', message: result.message });
      return;
    }
    setDetail(result.detail);
    setView('result');
  }, [detail]);

  const retryQuiz = useCallback(async () => {
    if (!detail) return;
    setBusy(true);
    const result = await retakeTraining(detail.assignment.id);
    setBusy(false);
    if (!result.ok) {
      setAlert({ title: 'Could not start the next attempt', message: result.message });
      return;
    }
    const next = result.detail;
    setDetail(next);
    setAnswers({});
    setPageIndex(0);
    setQuizIndex(0);
    setExpandedSectionIds(new Set());
    setRetakeSlidesDone(false);
    const status = next.assignment.status;
    const finished = status === 'completed' || status === 'failed' || status === 'pending_review';
    if (finished) {
      setViewedPageIds(new Set());
      setView('result');
      return;
    }
    if (next.pages.length > 0) {
      setViewedPageIds(new Set([next.pages[0].id]));
      setView('reader');
      return;
    }
    setViewedPageIds(new Set());
    setView('detail');
  }, [detail]);

  const submitSigned = useCallback(() => {
    const drawing = signatureRef.current;
    if (!drawing || drawing.strokes.length === 0) {
      setAlert({
        title: 'Signature required',
        message: 'Draw your signature in the box. It is placed on your certificate of completion.',
      });
      return;
    }
    void submitQuizWithAnswers(answersRef.current, drawing);
  }, [submitQuizWithAnswers]);

  const leaveQuiz = useCallback(async () => {
    if (!detail || submittingRef.current) return;
    submittingRef.current = true;
    setAlert(null);
    setBusy(true);
    const payload = detail.questions
      .map((question) => quizDraftToAnswer(question, answersRef.current[question.id]))
      .filter((row): row is Record<string, unknown> => row !== null);
    const result = await submitTrainingAnswers(detail.assignment.id, payload, null, true);
    setBusy(false);
    submittingRef.current = false;
    if (!result.ok) {
      setTimerPaused(false);
      setAlert({ title: 'Could not leave', message: result.message });
      return;
    }
    setDetail(result.detail);
    setView('result');
  }, [detail]);

  const confirmLeaveQuiz = useCallback(() => {
    setTimerPaused(true);
    setAlert({
      title: 'Leave quiz?',
      message: 'If you leave now, this attempt will be marked as a fail.',
      confirmText: 'Leave quiz',
      cancelText: 'Stay',
      hideCancel: false,
      variant: 'danger',
      onConfirm: () => {
        void leaveQuiz();
      },
    });
  }, [leaveQuiz]);

  useEffect(() => {
    if (view !== 'quiz' && view !== 'sign') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (alert) return true;
      confirmLeaveQuiz();
      return true;
    });
    return () => sub.remove();
  }, [view, alert, confirmLeaveQuiz]);

  const onQuizNext = useCallback(() => {
    if (!detail) return;
    const question = detail.questions[quizIndex];
    if (!question) return;
    if (!quizDraftAnswered(question, answers[question.id])) {
      setAlert({
        title: 'Answer required',
        message: 'Answer this question before continuing, or wait for the timer to move on.',
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
  const earnedCertificates = trainings.filter((item) => item.certificate);

  const currentPage = detail?.pages?.[pageIndex] ?? null;
  const currentQuestion = detail?.questions?.[quizIndex] ?? null;

  useEffect(() => {
    if (view !== 'quiz' || !currentQuestion || currentQuestion.question_type !== 'ordering') return;
    setAnswers((prev) => {
      if (prev[currentQuestion.id]?.order?.length) return prev;
      return {
        ...prev,
        [currentQuestion.id]: { order: currentQuestion.options.map((option) => option.id) },
      };
    });
  }, [view, currentQuestion]);
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
          : view === 'sign'
            ? 'Sign'
            : view === 'result'
              ? 'Results'
              : view === 'certificates'
                ? 'Certificates'
                : view === 'certificate'
                  ? 'Certificate'
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
              if (view === 'quiz' || view === 'sign') {
                confirmLeaveQuiz();
                return;
              }
              if (view === 'certificates') setView('list');
              else if (view === 'certificate') setView(certificateOrigin);
              else if (view === 'reader') setView('detail');
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
        <MainTabHeaderRight>
          <TouchableOpacity
            style={headerStyles.bellBtn}
            activeOpacity={0.7}
            onPress={openLogoutSweetAlert}
            accessibilityLabel="Log out"
          >
            <Feather name="log-out" size={24} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        </MainTabHeaderRight>
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
        removeClippedSubviews={false}
        bounces={view !== 'sign'}
        overScrollMode={view === 'sign' ? 'never' : 'auto'}
        refreshControl={
          view === 'quiz' || view === 'sign' ? undefined : (
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

            {earnedCertificates.length > 0 ? (
              <TouchableOpacity
                style={styles.certEntry}
                activeOpacity={0.85}
                onPress={() => setView('certificates')}
                accessibilityRole="button"
                accessibilityLabel="Certificates"
              >
                <View style={styles.certEntryIcon}>
                  <Feather name="award" size={20} color={colors.primary} />
                </View>
                <View style={styles.heroTextCol}>
                  <Text style={styles.certEntryTitle}>Certificates</Text>
                  <Text style={styles.certEntryHint}>
                    {earnedCertificates.length} earned
                  </Text>
                </View>
                <Feather name="chevron-right" size={20} color={colors.icon} />
              </TouchableOpacity>
            ) : null}

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
                        {item.is_induction ? (
                          <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.statusBadgeText, { color: '#92400E' }]}>Induction</Text>
                          </View>
                        ) : null}
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
                        {item.is_induction && item.max_attempts ? (
                          <View style={styles.statusBadge}>
                            <Text style={styles.statusBadgeText}>
                              {item.attempts_used ?? 0}/{item.max_attempts} attempts
                            </Text>
                          </View>
                        ) : null}
                        {item.can_retry ? (
                          <View style={[styles.statusBadge, { backgroundColor: '#FEF2F2' }]}>
                            <Text style={[styles.statusBadgeText, { color: '#B91C1C' }]}>
                              Try again · {item.attempts_remaining ?? 0} left
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

        {view === 'certificates' ? (
          <>
            <Text style={styles.sectionTitle}>Your certificates</Text>
            {earnedCertificates.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Feather name="award" size={28} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No certificates yet</Text>
                <Text style={styles.emptyHint}>Pass a training module to earn one.</Text>
              </View>
            ) : (
              earnedCertificates.map((item) => (
                <TouchableOpacity
                  key={`certificate-${item.id}`}
                  style={styles.card}
                  activeOpacity={0.85}
                  onPress={() => void openCertificate(item)}
                  disabled={busy}
                >
                  <View style={styles.cardAccent} />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle}>{item.certificate?.training_name || item.title}</Text>
                    <Text style={styles.cardDesc}>{item.certificate?.employee_name}</Text>
                    {item.certificate?.completed_on_label ? (
                      <Text style={styles.cardDesc}>Completed {item.certificate.completed_on_label}</Text>
                    ) : null}
                    {item.certificate?.expires_on_label ? (
                      <Text style={styles.cardDesc}>Refresher {item.certificate.expires_on_label}</Text>
                    ) : null}
                    <Text style={styles.certificateListRef}>{item.certificate?.reference_number}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={colors.icon} />
                </TouchableOpacity>
              ))
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
              {detail.induction?.is_induction ? (
                <Text style={styles.detailHeroDesc}>
                  Mandatory induction. Pass mark {detail.assignment.pass_percent ?? 92}%. Attempt{' '}
                  {Math.min((detail.induction.attempts_used ?? 0) + 1, detail.induction.max_attempts)} of{' '}
                  {detail.induction.max_attempts}. You cannot be rostered or clock in and out until you pass.
                </Text>
              ) : null}
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name="book" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Slides</Text>
                  <Text style={styles.infoText}>
                    {detail.pages.length} slide{detail.pages.length === 1 ? '' : 's'} to view
                  </Text>
                </View>
              </View>
              <View style={styles.infoDivider} />
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name="help-circle" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>
                    {detail.assignment.quiz_required === false ? 'Optional quiz' : 'Timed quiz'}
                  </Text>
                  <Text style={styles.infoText}>
                    {detail.assignment.questions_count} questions ·{' '}
                    {detail.assignment.question_time_seconds}s each
                    {detail.assignment.pass_percent != null ? ` · pass ${detail.assignment.pass_percent}%` : ''}
                    {detail.assignment.allow_retakes && detail.assignment.max_attempts
                      ? ` · ${detail.assignment.max_attempts} attempts`
                      : ''}
                  </Text>
                </View>
              </View>
            </View>

            {(() => {
              const retakeMustStudy =
                !retakeSlidesDone &&
                ((detail.assignment.attempts_used ?? 0) > 0 || (detail.induction?.attempts_used ?? 0) > 0) &&
                detail.assignment.status !== 'completed' &&
                detail.assignment.status !== 'failed' &&
                detail.assignment.status !== 'pending_review';
              if (retakeMustStudy || !detail.quiz_unlocked) {
                return (
                  <>
                    {(detail.assignment.attempts_used ?? 0) > 0 || (detail.induction?.attempts_used ?? 0) > 0 ? (
                      <Text style={styles.quizHint}>
                        View every slide again. The next try opens only after the slides are finished.
                      </Text>
                    ) : null}
                    <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={startReader}>
                      <Text style={styles.primaryBtnText}>View slides</Text>
                    </TouchableOpacity>
                  </>
                );
              }
              return (
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  const status = detail.assignment.status;
                  if (status === 'completed' || status === 'failed' || status === 'pending_review') setView('result');
                  else startQuiz(detail);
                }}
              >
                <Text style={styles.primaryBtnText}>
                  {detail.assignment.status === 'completed' ||
                  detail.assignment.status === 'failed' ||
                  detail.assignment.status === 'pending_review'
                    ? 'View results'
                    : 'Continue quiz'}
                </Text>
              </TouchableOpacity>
              );
            })()}
            {detail.assignment.certificate ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setCertificateOrigin('detail');
                  setView('certificate');
                }}
              >
                <Text style={styles.secondaryBtnText}>View certificate</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}

        {view === 'reader' && detail && currentPage ? (
          <>
            <View style={styles.pageProgress}>
              <Text style={styles.pageProgressText}>
                Slide {pageIndex + 1} of {detail.pages.length}
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
              {currentPage.layout ? (
                <>
                  {!currentPage.has_image &&
                  !(currentPage.blocks ?? []).some((block) => block.kind === 'photo' && block.has_file) ? (
                    <View style={styles.slideBand}>
                      <Text style={styles.slideBandIndex}>
                        {String(pageIndex + 1).padStart(2, '0')}
                      </Text>
                    </View>
                  ) : null}
                  <SlidePieces
                    layout={currentPage.layout}
                    title={currentPage.title}
                    body={currentPage.body}
                    bullets={currentPage.bullets}
                    hasImage={currentPage.has_image}
                    imageUrl={trainingPageImageUrl(currentPage.id)}
                    blocks={currentPage.blocks ?? []}
                    includeTitle
                  />
                </>
              ) : (
                <>
                  {currentPage.has_image ? (
                    <TrainingSlideImage url={trainingPageImageUrl(currentPage.id)} />
                  ) : (
                    <View style={styles.slideBand}>
                      <Text style={styles.slideBandIndex}>
                        {String(pageIndex + 1).padStart(2, '0')}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.readerTitle}>{currentPage.title}</Text>
                  {currentPage.body.trim().length > 0 ? (
                    <Text style={styles.readerBody}>{currentPage.body}</Text>
                  ) : null}
                  {currentPage.bullets.length > 0 ? (
                    <View style={styles.bulletList}>
                      {currentPage.bullets.map((line, bulletIndex) => (
                        <View key={`${currentPage.id}-${bulletIndex}`} style={styles.bulletRow}>
                          <View style={styles.bulletDot} />
                          <Text style={styles.bulletText}>{line}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <TrainingSlideBlocks blocks={currentPage.blocks ?? []} />
                </>
              )}

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
                          <Text style={styles.accordionSectionTitle}>{section.title}</Text>
                          <Feather
                            name={open ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={colors.text.secondary}
                          />
                        </Pressable>
                        {open ? (
                          <View style={styles.sectionPanel}>
                            {section.layout ? (
                              <SlidePieces
                                layout={section.layout}
                                title={section.title}
                                body={section.body}
                                bullets={[]}
                                hasImage={section.has_image}
                                imageUrl={trainingSectionImageUrl(section.id)}
                                blocks={section.blocks ?? []}
                                includeTitle={false}
                              />
                            ) : (
                              <>
                                {section.body.trim().length > 0 ? (
                                  <Text style={styles.sectionBody}>{section.body}</Text>
                                ) : null}
                                {section.has_image ? (
                                  <TrainingSlideImage url={trainingSectionImageUrl(section.id)} />
                                ) : null}
                                <TrainingSlideBlocks blocks={section.blocks ?? []} />
                              </>
                            )}
                          </View>
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
                  <Text style={styles.navBtnPrimaryText}>Next slide</Text>
                  <Feather name="chevron-right" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              ) : (
                <>
                {detail.assignment.quiz_required === false ? (
                  <TouchableOpacity
                    style={[styles.navBtn, busy && styles.btnDisabled]}
                    onPress={() => void finishWithoutQuiz()}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.navBtnText}>Finish without quiz</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.navBtnPrimary, (!allPagesRead || busy || detail.assignment.questions_count === 0) && styles.btnDisabled]}
                  onPress={onAcknowledge}
                  disabled={!allPagesRead || busy || detail.assignment.questions_count === 0}
                  activeOpacity={0.85}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.navBtnPrimaryText}>
                      {detail.assignment.questions_count === 0 ? 'No quiz' : 'Start timed quiz'}
                    </Text>
                  )}
                </TouchableOpacity>
                </>
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

              <View style={[styles.timerBadge, timerUrgent && styles.timerBadgeUrgent]}>
                <Feather name="clock" size={16} color={timerUrgent ? '#B91C1C' : colors.primary} />
                <Text style={[styles.timerText, timerUrgent && styles.timerTextUrgent]}>
                  {formatTimer(secondsLeft)}
                </Text>
              </View>
            </View>

            <View
              style={styles.timerBarTrack}
              onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                setTimerTrackWidth((prev) => (prev === width ? prev : width));
              }}
            >
              <View
                style={[
                  styles.timerBarFill,
                  timerUrgent && styles.timerBarUrgent,
                  { width: timerTrackWidth * Math.max(0, Math.min(1, timerRatio)) },
                ]}
              />
            </View>

            <View style={styles.questionCardSolo}>
              <TrainingQuizQuestion
                question={currentQuestion}
                draft={answers[currentQuestion.id]}
                onChange={(draft) => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: draft }))}
              />
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
                  {quizIndex >= detail.questions.length - 1 ? 'Sign certificate' : 'Next question'}
                </Text>
              )}
            </TouchableOpacity>
            <Text style={styles.quizHint}>
              Unanswered questions when time runs out are marked incorrect.
            </Text>
          </>
        ) : null}

        {view === 'sign' && detail ? (
          <>
            <View style={styles.detailHero}>
              <Text style={styles.detailHeroTitle}>Sign your certificate</Text>
              <Text style={styles.detailHeroDesc}>
                Draw your signature . It is saved on the certificate of completion for {detail.assignment.title}.
              </Text>
            </View>
            <View style={styles.signPad}>
              <SignaturePad drawingRef={signatureRef} scrollRef={scrollRef} />
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              activeOpacity={0.85}
              onPress={submitSigned}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Submit training</Text>
              )}
            </TouchableOpacity>
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

            {detail.induction?.can_retry || detail.assignment.can_retry ? (
              <>
                <Text style={styles.quizHint}>
                  Attempt {(detail.induction?.attempts_used ?? detail.assignment.attempts_used ?? 0)} of{' '}
                  {detail.induction?.max_attempts ?? detail.assignment.max_attempts ?? 1}. You can take this quiz again.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => void retryQuiz()} disabled={busy}>
                  <Text style={styles.primaryBtnText}>
                    Try again (
                    {detail.induction?.can_retry
                      ? detail.induction.attempts_remaining
                      : detail.assignment.attempts_remaining ?? 0}{' '}
                    left)
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}

            {detail.assignment.quiz_waived || detail.result?.quiz_waived ? (
              <Text style={styles.quizHint}>
                Training complete. The quiz was optional, so this was recorded from the study pages.
              </Text>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Review</Text>
                {detail.questions.map((question, index) => (
                  <View key={question.id} style={styles.questionCard}>
                    <Text style={styles.questionIndex}>Question {index + 1}</Text>
                    <TrainingQuizQuestion question={question} reveal />
                  </View>
                ))}
              </>
            )}
            {detail.assignment.status === 'completed' &&
            detail.assignment.passed === false &&
            detail.assignment.quiz_required === false ? (
              <Text style={styles.quizHint}>
                This quiz was optional, so the training is complete even though this attempt did not pass.
              </Text>
            ) : null}
            {detail.result?.pending_review || detail.assignment.status === 'pending_review' ? (
              <Text style={styles.quizHint}>
                Some answers need an administrator to mark them. Your result updates after that review.
              </Text>
            ) : null}

            {detail.induction?.passed ? (
              <Text style={styles.quizHint}>
                Induction complete. You are eligible for shifts. Your administrator has been notified.
              </Text>
            ) : null}
            {detail.induction?.locked ? (
              <Text style={styles.quizHint}>
                You have used all {detail.induction.max_attempts} attempts. Ask an administrator to reset them or grant an override.
              </Text>
            ) : null}
            {!detail.induction?.is_induction &&
            detail.assignment.status === 'failed' &&
            !detail.assignment.can_retry &&
            !detail.result?.pending_review ? (
              <Text style={styles.quizHint}>
                No tries left. Ask an administrator to allow another attempt.
              </Text>
            ) : null}
            {detail.assignment.certificate ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                activeOpacity={0.85}
                onPress={() => {
                  setCertificateOrigin('result');
                  setView('certificate');
                }}
              >
                <Text style={styles.primaryBtnText}>View certificate</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={goBackToList}>
              <Text style={styles.secondaryBtnText}>Back to training list</Text>
            </TouchableOpacity>
          </>
        ) : null}

        {view === 'certificate' && detail?.assignment.certificate ? (
          <View style={styles.certificateSheet}>
            <View style={styles.certificateFrame}>
              <Image
                source={require('../../assets/crulynk-logo.png')}
                style={styles.certificateLogo}
                resizeMode="contain"
                accessibilityLabel="CruLynk"
              />
              <Text style={styles.certificateCompany}>{detail.assignment.certificate.company_name}</Text>
              <Text style={styles.certificateEyebrow}>Certificate of completion</Text>
              <View style={styles.certificateRule} />
              <Text style={styles.certificateLead}>This is to certify that</Text>
              <Text style={styles.certificateName}>{detail.assignment.certificate.employee_name}</Text>
              <Text style={styles.certificateLead}>has successfully completed</Text>
              <Text style={styles.certificateTraining}>{detail.assignment.certificate.training_name}</Text>
              <View style={styles.certificateDates}>
                <View style={styles.certificateDateBlock}>
                  <Text style={styles.certificateDateLabel}>Completion date</Text>
                  <Text style={styles.certificateDateValue}>
                    {detail.assignment.certificate.completed_on_label ?? '—'}
                  </Text>
                </View>
                {detail.assignment.certificate.expires_on_label ? (
                  <View style={styles.certificateDateBlock}>
                    <Text style={styles.certificateDateLabel}>Valid until</Text>
                    <Text style={styles.certificateDateValue}>
                      {detail.assignment.certificate.expires_on_label}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.certificateRuleWide} />
              <Text style={styles.certificateRefLabel}>Certificate number</Text>
              <Text style={styles.certificateRef}>{detail.assignment.certificate.reference_number}</Text>
              {detail.assignment.certificate.signature ? (
                <View style={styles.certificateSignature}>
                  <SignaturePreview drawing={detail.assignment.certificate.signature} plain />
                  <Text style={styles.certificateDateLabel}>Employee signature</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <SweetAlert
        visible={!!alert}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        confirmText={alert?.confirmText ?? 'OK'}
        cancelText={alert?.cancelText ?? 'Cancel'}
        hideCancel={alert?.hideCancel ?? true}
        variant={alert?.variant ?? 'info'}
        onConfirm={() => {
          const action = alert?.onConfirm;
          setAlert(null);
          action?.();
        }}
        onClose={() => {
          setTimerPaused(false);
          setAlert(null);
        }}
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
  slideBand: {
    height: 72,
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: colors.primary,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  slideBandIndex: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  bulletList: {
    marginTop: 14,
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
    backgroundColor: colors.primary,
  },
  bulletText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text.primary,
  },
  sectionPanel: {
    paddingBottom: 4,
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
  accordionSectionTitle: {
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
    minHeight: 160,
    overflow: 'visible',
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
  certEntry: {
    marginHorizontal: spacing.xxxl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 18,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 61, 122, 0.12)',
  },
  certEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#E8F1FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  certEntryTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  certEntryHint: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
  },
  certificateSheet: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    backgroundColor: '#003D7A',
    borderRadius: 8,
    padding: 8,
  },
  certificateFrame: {
    backgroundColor: '#FBF7EF',
    borderWidth: 1,
    borderColor: '#C4A35A',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  certificateLogo: {
    width: 168,
    height: 96,
    marginBottom: spacing.sm,
  },
  certificateEyebrow: {
    marginTop: spacing.md,
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: 0.4,
    color: '#003D7A',
    textAlign: 'center',
  },
  certificateLead: {
    marginTop: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#5C5346',
    textAlign: 'center',
  },
  certificateCompany: {
    marginTop: spacing.md,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: '#8A6A2F',
    textAlign: 'center',
  },
  certificateName: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.bold,
    fontSize: 28,
    color: '#1C1915',
    textAlign: 'center',
  },
  certificateTraining: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: '#003D7A',
    textAlign: 'center',
  },
  certificateRule: {
    marginTop: spacing.md,
    width: 72,
    height: 2,
    backgroundColor: '#C4A35A',
  },
  certificateRuleWide: {
    marginTop: spacing.xl,
    width: '78%',
    height: 1,
    backgroundColor: '#C4A35A',
  },
  certificateDates: {
    marginTop: spacing.xl,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xl,
  },
  certificateDateBlock: { alignItems: 'center', maxWidth: 150 },
  certificateDateLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#8A6A2F',
    textAlign: 'center',
  },
  certificateDateValue: {
    marginTop: 4,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#1C1915',
    textAlign: 'center',
  },
  certificateRefLabel: {
    marginTop: spacing.md,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#8A6A2F',
  },
  certificateRef: {
    marginTop: 4,
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    letterSpacing: 1.4,
    color: '#003D7A',
  },
  certificateSignature: {
    marginTop: spacing.lg,
    width: '82%',
    alignItems: 'center',
  },
  certificateListRef: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.primary,
  },
  signPad: {
    marginHorizontal: spacing.xxxl,
    marginTop: spacing.lg,
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
