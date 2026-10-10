import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Modal,
  Pressable,
  ScrollView,
  BackHandler,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../components/SweetAlert';
import { createAccountScreenStyles } from '../../styles/styles';
import type { RegistrationCompany, UserProfileSnapshot } from '../../types/userProfile';
import {
  emptyRegistrationUploads,
  mergeRegistrationUploads,
  type RegistrationUploads,
} from '../../types/registrationUploads';
import { loadAccountProfile, saveAccountProfile } from '../../services/accountProfileStorage';
import { tryParseApiJson } from '../../utils/parseApiJson';
import {
  parseRegistrationApplicationResults,
  submitFoundURegistrationApplications,
  type RegistrationApplicationResult,
} from '../../services/registerAccountApi';
import { Step1PersonalProfile, Step2WorkEligibility, Step3Qualifications, Step4EmploymentDetails } from './steps';

const STEPS = [
  { step: 1, label: 'Personal Profile', progress: '25%' },
  { step: 2, label: 'Work Eligibility', progress: '50%' },
  { step: 3, label: 'Qualifications', progress: '75%' },
  { step: 4, label: 'Employment Details', progress: '100%' },
] as const;

const TOTAL_STEPS = STEPS.length;

function joinOrgNames(names: string[]): string {
  if (names.length === 0) {
    return '';
  }
  if (names.length === 1) {
    return names[0];
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

function formatApplicationResultsMessage(results: RegistrationApplicationResult[], fallback: string): string {
  const created = results.filter((r) => r.status === 'created');
  const others = results.filter((r) => r.status !== 'created');
  const createdNames = created.map((r) => r.name || r.slug);
  const loginHint =
    'Each organisation reviews independently. After an organisation approves you, sign in and pick that company.';

  if (created.length === 0) {
    return fallback;
  }

  const sent =
    createdNames.length > 0
      ? `Applications sent to ${joinOrgNames(createdNames)}.`
      : 'Your applications have been sent.';

  if (others.length === 0) {
    return `${sent} ${loginHint}`;
  }

  const otherLines = others.map((r) => `• ${plainResultReason(r)}`);

  return `${sent}\n\nCould not complete:\n${otherLines.join('\n')}\n\n${loginHint}`;
}

function submitStageLabel(percent: number): string {
  if (percent >= 100) return 'Server accepted your application';
  if (percent >= 99) return 'Waiting for the server to confirm';
  if (percent > 0) return 'Sending to the server';
  return 'Connecting to the server';
}

function companyLabel(result: RegistrationApplicationResult): string {
  const name = result.name?.trim() ?? '';
  if (name !== '' && name !== result.slug.trim() && !/^[a-z0-9-]+$/.test(name)) {
    return name;
  }
  return 'A selected company';
}

function plainResultReason(result: RegistrationApplicationResult): string {
  const label = companyLabel(result);
  if (result.status === 'already_applied') {
    return `${label} already has an application waiting for this email.`;
  }
  if (result.status === 'already_registered') {
    return `${label} already has an account for this email.`;
  }
  return `${label} could not take this application right now.`;
}

function looksTechnical(text: string): boolean {
  return /https?:\/\/|\/api\/|\bHTTP\b|sql|exception|stack trace|tenant|app\s?key|bootstrap|slug|json|token|registry|database|undefined|null/i.test(
    text,
  );
}

function plainValidationLine(raw: string): string | null {
  let text = raw.trim().replace(/\s+/g, ' ');
  if (text === '' || looksTechnical(text)) return null;
  const fieldMatch = text.match(/^The (.+?) field (.+)$/i);
  if (fieldMatch) {
    const label = fieldMatch[1].replace(/[_.]/g, ' ').replace(/\s+/g, ' ').trim();
    const nice = label.charAt(0).toUpperCase() + label.slice(1);
    text = `${nice} ${fieldMatch[2]}`;
  }
  return text.endsWith('.') ? text : `${text}.`;
}

function validationErrorLines(parsed: unknown): string[] {
  if (!parsed || typeof parsed !== 'object' || !('errors' in parsed)) return [];
  const errObj = (parsed as { errors?: Record<string, string[] | string> }).errors;
  if (!errObj || typeof errObj !== 'object') return [];
  const lines: string[] = [];
  for (const msgs of Object.values(errObj)) {
    if (Array.isArray(msgs)) {
      for (const m of msgs) {
        if (typeof m === 'string' && m.trim() !== '') lines.push(m.trim());
      }
    } else if (typeof msgs === 'string' && msgs.trim() !== '') {
      lines.push(msgs.trim());
    }
  }
  return lines;
}

function serverMessage(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object' || !('message' in parsed)) return '';
  const message = (parsed as { message?: unknown }).message;
  return typeof message === 'string' ? message.trim() : '';
}

/** Plain-language failure copy. Never surfaces system or response wording. */
function registrationFailureCopy(parsed: unknown): { message: string; listItems: string[] } {
  const failed = parseRegistrationApplicationResults(parsed).filter((result) => result.status !== 'created');
  if (failed.length > 0) {
    return {
      message: 'We couldn’t send your application. Please check the points below, then try again.',
      listItems: failed.map(plainResultReason),
    };
  }

  const validation = validationErrorLines(parsed)
    .map(plainValidationLine)
    .filter((line): line is string => line != null);
  if (validation.length > 0) {
    return {
      message: 'A few details need to be updated before we can send your application.',
      listItems: validation,
    };
  }

  return {
    message: 'We couldn’t send your application just now. Please try again in a moment.',
    listItems: [],
  };
}

function networkFailureMessage(error: unknown): string {
  const errMsg = error instanceof Error ? error.message.trim() : String(error).trim();
  if (/timeout/i.test(errMsg)) {
    return 'This is taking longer than usual. Check your connection and try again.';
  }
  return 'We couldn’t connect just now. Check your internet connection and try again.';
}

export function CreateAccountScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState(
    'Your application has been sent. Each organisation will review it independently. After an organisation approves you, sign in and pick that company.',
  );
  /** Master DB company slugs chosen on step 1. */
  const [companySlugs, setCompanySlugs] = useState<string[]>([]);
  const profileSnapshotRef = useRef<Partial<UserProfileSnapshot>>({});
  const registrationUploadsRef = useRef<RegistrationUploads>(emptyRegistrationUploads());
  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    variant?: 'warning' | 'error';
    listItems?: string[];
  } | null>(null);
  /** Increment after API failure so Step 4 can focus the password field again. */
  const [passwordFocusNonce, setPasswordFocusNonce] = useState(0);
  /** True while POST /register-applications is in flight (after Complete on step 4). */
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** Share of the request actually sent (0–99), then 100 only after the server accepts it. */
  const [submitProgress, setSubmitProgress] = useState<number | null>(null);

  const styles = createAccountScreenStyles;
  const stepConfig = STEPS[currentStep - 1];
  const currentStepRef = useRef(currentStep);
  const blockHardwareBackRef = useRef(false);
  currentStepRef.current = currentStep;
  blockHardwareBackRef.current = isSubmitting || showSuccessModal;

  const goBack = () => {
    if (blockHardwareBackRef.current) {
      return;
    }
    if (currentStepRef.current > 1) {
      Keyboard.dismiss();
      const previous = currentStepRef.current - 1;
      currentStepRef.current = previous;
      setCurrentStep(previous);
    } else {
      navigation.goBack();
    }
  };

  /**
   * Android system back (3-button nav and gesture) otherwise pops this screen.
   * Steps 2–4 should move to the previous step, matching the top-left arrow.
   */
  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        if (blockHardwareBackRef.current) {
          return true;
        }
        if (currentStepRef.current > 1) {
          Keyboard.dismiss();
          const previous = currentStepRef.current - 1;
          currentStepRef.current = previous;
          setCurrentStep(previous);
          return true;
        }
        navigation.goBack();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
      return () => subscription.remove();
    }, [navigation]),
  );

  const openRegistrationAlert = useCallback(
    (
      title: string,
      message: string,
      step: number,
      focusPassword: boolean,
      variant: 'warning' | 'error' = 'warning',
      listItems?: string[],
    ) => {
      setBlockingAlert({
        title,
        message,
        variant,
        listItems: listItems && listItems.length > 0 ? listItems : undefined,
      });
      setCurrentStep(step);
      if (focusPassword) {
        setPasswordFocusNonce((n) => n + 1);
      }
    },
    [],
  );

  /** Persists registration to the API immediately when the user finishes step 4 (before showing success). */
  const submitRegistrationAfterFinalStep = useCallback(async () => {
    const snap = profileSnapshotRef.current as UserProfileSnapshot & {
      password?: string;
      password_confirmation?: string;
    };
    const selected: RegistrationCompany[] =
      snap.registrationCompanies?.filter((c) => typeof c.slug === 'string' && c.slug.trim() !== '') ?? [];
    const _pwd = snap.password?.trim();
    const _pc = snap.password_confirmation?.trim();

    if (selected.length === 0) {
      openRegistrationAlert(
        'Company not selected',
        'Choose at least one company on the first step, then try again.',
        1,
        false,
      );
      return;
    }

    if (!_pwd || !_pc) {
      openRegistrationAlert(
        'Registration incomplete',
        'Password was not captured. Update your password on step 4 and complete again.',
        4,
        true,
      );
      return;
    }

    setSubmitProgress(0);
    setIsSubmitting(true);
    try {
      const res = await submitFoundURegistrationApplications(
        { ...snap, password: _pwd, password_confirmation: _pc },
        selected.map((c) => ({ slug: c.slug, appKey: c.appKey })),
        registrationUploadsRef.current,
        (percent) => {
          setSubmitProgress((current) => Math.max(current ?? 0, percent));
        },
      );
      const raw = await res.text();
      const parsed = tryParseApiJson(raw);
      const results = parseRegistrationApplicationResults(parsed);
      const created = results.filter((r) => r.status === 'created');
      const apiMessage = serverMessage(parsed);

      if (created.length === 0) {
        const failure = registrationFailureCopy(parsed);
        openRegistrationAlert('Application not sent', failure.message, 4, true, 'error', failure.listItems);
        return;
      }

      setSuccessMessage(formatApplicationResultsMessage(results, apiMessage || 'Your applications have been sent.'));
      setSubmitProgress(100);
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 400);
      });
      setShowSuccessModal(true);
    } catch (e: unknown) {
      openRegistrationAlert('Application not sent', networkFailureMessage(e), 4, true, 'error');
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  }, [openRegistrationAlert]);

  const goNext = useCallback(
    (stepPatch?: Partial<UserProfileSnapshot>, uploadsPatch?: Partial<RegistrationUploads>) => {
      if (stepPatch) {
        profileSnapshotRef.current = { ...profileSnapshotRef.current, ...stepPatch };
      }
      if (uploadsPatch) {
        registrationUploadsRef.current = mergeRegistrationUploads(
          registrationUploadsRef.current,
          uploadsPatch,
        );
      }
      Keyboard.dismiss();
      setCurrentStep((step) => {
        if (step < TOTAL_STEPS) {
          return step + 1;
        }
        void submitRegistrationAfterFinalStep();
        return step;
      });
    },
    [submitRegistrationAfterFinalStep],
  );

  /** Success modal only appears after the server accepts the registration; clear local snapshot secrets and go to Login. */
  const handleSuccessOk = async () => {
    setShowSuccessModal(false);
    const snap = profileSnapshotRef.current as UserProfileSnapshot & {
      password?: string;
      password_confirmation?: string;
    };

    try {
      const base = await loadAccountProfile();
      const { password: __p, password_confirmation: __c, ...withoutSecrets } = snap;
      const localPhoto = registrationUploadsRef.current.profilePhotoUri?.trim() ?? null;
      await saveAccountProfile({
        ...base,
        ...withoutSecrets,
        profilePhotoLocalUri: localPhoto || null,
      });
    } catch {
      /* still leave the app in a usable state */
    }
    navigation.navigate('Login');
  };

  const renderStep = () => {
    const hostFor = (step: number) =>
      currentStep === step ? styles.wizardStepHost : styles.wizardStepHostHidden;

    return (
      <>
        <View
          style={hostFor(1)}
          pointerEvents={currentStep === 1 ? 'auto' : 'none'}
          accessibilityElementsHidden={currentStep !== 1}
          importantForAccessibility={currentStep === 1 ? 'auto' : 'no-hide-descendants'}
        >
          <Step1PersonalProfile
            active={currentStep === 1}
            onNext={goNext}
            companySlugs={companySlugs}
            onCompanySlugsChange={setCompanySlugs}
            initialProfilePhotoUri={registrationUploadsRef.current.profilePhotoUri ?? null}
          />
        </View>
        <View
          style={hostFor(2)}
          pointerEvents={currentStep === 2 ? 'auto' : 'none'}
          accessibilityElementsHidden={currentStep !== 2}
          importantForAccessibility={currentStep === 2 ? 'auto' : 'no-hide-descendants'}
        >
          <Step2WorkEligibility active={currentStep === 2} onNext={goNext} />
        </View>
        <View
          style={hostFor(3)}
          pointerEvents={currentStep === 3 ? 'auto' : 'none'}
          accessibilityElementsHidden={currentStep !== 3}
          importantForAccessibility={currentStep === 3 ? 'auto' : 'no-hide-descendants'}
        >
          <Step3Qualifications active={currentStep === 3} onNext={goNext} />
        </View>
        <View
          style={hostFor(4)}
          pointerEvents={currentStep === 4 ? 'auto' : 'none'}
          accessibilityElementsHidden={currentStep !== 4}
          importantForAccessibility={currentStep === 4 ? 'auto' : 'no-hide-descendants'}
        >
          <Step4EmploymentDetails
            active={currentStep === 4}
            onNext={goNext}
            companySlugs={companySlugs}
            focusPasswordSignal={passwordFocusNonce}
            isSubmitting={isSubmitting}
            submitProgress={submitProgress}
          />
        </View>
      </>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          <TouchableOpacity
            onPress={goBack}
            disabled={isSubmitting}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={24} color="#0056D2" />
          </TouchableOpacity>
        </View>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          CruLynk
        </Text>
        <View style={styles.topBarSideRight} />
      </View>

      <View style={styles.progressSection}>
        <View style={styles.stepRow}>
          <Text style={styles.stepText}>STEP {stepConfig.step} OF {TOTAL_STEPS}</Text>
          <Text style={styles.stepLabel}>{stepConfig.label}</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: stepConfig.progress }]} />
        </View>
      </View>

      {renderStep()}

      <Modal
        visible={isSubmitting}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => undefined}
      >
        <View style={styles.successModalOverlay}>
          <View style={styles.successModalCard}>
            <Text style={styles.submitProgressPercent}>{Math.round(submitProgress ?? 0)}%</Text>
            <Text style={styles.successModalTitle}>Submitting your applications</Text>
            <Text style={styles.submitProgressStage}>{submitStageLabel(submitProgress ?? 0)}</Text>
            <View style={styles.submitProgressTrack}>
              <View style={[styles.submitProgressFill, { width: `${Math.max(0, Math.min(100, Math.round(submitProgress ?? 0)))}%` }]} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => undefined}>
        <Pressable style={styles.successModalOverlay}>
          <View style={styles.successModalCard}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={44} color="#059669" strokeWidth={3} />
            </View>
            <Text style={styles.successModalTitle}>Application Submitted</Text>
            <ScrollView style={{ maxHeight: 280 }} contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={styles.successModalMessage}>
                {successMessage}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.successModalBtn} onPress={handleSuccessOk} activeOpacity={0.85}>
              <Text style={styles.successModalBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <SweetAlert
        visible={blockingAlert !== null}
        title={blockingAlert?.title ?? ''}
        message={blockingAlert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant={blockingAlert?.variant ?? 'warning'}
        listItems={blockingAlert?.listItems}
        onClose={() => setBlockingAlert(null)}
        onConfirm={() => setBlockingAlert(null)}
      />
    </View>
  );
}
