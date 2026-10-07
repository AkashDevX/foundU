import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Modal,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
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
import { API_BASE_URL } from '../../config/api';
import { tryParseApiJson } from '../../utils/parseApiJson';
import { fontFamily as themeFontFamily } from '../../theme/theme';
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

  const otherLines = others.map((r) => {
    const label = r.name || r.slug;
    if (r.status === 'already_applied') {
      return `• ${label} — already has a pending application for this email.`;
    }
    if (r.status === 'already_registered') {
      return `• ${label} — an account with this email already exists.`;
    }
    return `• ${label} — ${r.message?.trim() || 'could not accept this application.'}`;
  });

  return `${sent}\n\nCould not complete:\n${otherLines.join('\n')}\n\n${loginHint}`;
}

function formatRegistrationApiError(parsed: unknown, raw: string): string {
  if (parsed && typeof parsed === 'object' && 'errors' in parsed) {
    const errObj = (parsed as { errors?: Record<string, string[] | string> }).errors;
    if (errObj && typeof errObj === 'object') {
      const lines: string[] = [];
      for (const msgs of Object.values(errObj)) {
        if (Array.isArray(msgs)) {
          for (const m of msgs) {
            if (typeof m === 'string' && m.trim() !== '') {
              lines.push(m);
            }
          }
        } else if (typeof msgs === 'string' && msgs.trim() !== '') {
          lines.push(msgs);
        }
      }
      if (lines.length > 0) {
        return lines.join('\n');
      }
    }
  }
  if (parsed && typeof parsed === 'object' && 'message' in parsed) {
    const m = (parsed as { message?: unknown }).message;
    if (typeof m === 'string' && m.trim() !== '') {
      return m;
    }
  }
  const t = raw.trim();
  return t !== '' ? t.slice(0, 800) : 'Something went wrong. Please try again.';
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
  const [blockingAlert, setBlockingAlert] = useState<{ title: string; message: string } | null>(null);
  /** Increment after API failure so Step 4 can focus the password field again. */
  const [passwordFocusNonce, setPasswordFocusNonce] = useState(0);
  /** True while POST /register-applications is in flight (after Complete on step 4). */
  const [isSubmitting, setIsSubmitting] = useState(false);

  const styles = createAccountScreenStyles;
  const stepConfig = STEPS[currentStep - 1];

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    } else {
      navigation.goBack();
    }
  };

  const openRegistrationAlert = useCallback(
    (title: string, message: string, step: number, focusPassword: boolean) => {
      setBlockingAlert({ title, message });
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
        'Pick at least one organization on step 1 (loaded from the server). Pull to refresh bootstrap or check API /bootstrap.',
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

    setIsSubmitting(true);
    try {
      const res = await submitFoundURegistrationApplications(
        { ...snap, password: _pwd, password_confirmation: _pc },
        selected.map((c) => ({ slug: c.slug, appKey: c.appKey })),
        registrationUploadsRef.current,
      );
      const raw = await res.text();
      const parsed = tryParseApiJson(raw);
      const results = parseRegistrationApplicationResults(parsed);
      const created = results.filter((r) => r.status === 'created');
      const apiMessage =
        parsed && typeof parsed === 'object' && 'message' in parsed && typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : '';

      if (!res.ok && created.length === 0) {
        const msg = formatRegistrationApiError(parsed, raw);
        openRegistrationAlert('Could not submit application', `${msg}\n\nAPI: ${API_BASE_URL}`, 4, true);
        return;
      }

      setSuccessMessage(formatApplicationResultsMessage(results, apiMessage || 'Your applications have been sent.'));
      setShowSuccessModal(true);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const slugs = selected.map((c) => c.slug).join(', ');
      openRegistrationAlert(
        'Network error',
        `${errMsg}\n\nAPI: ${API_BASE_URL}\nOrgs: ${slugs}\n\nTips:\n• Run: php artisan serve (same port as api.ts)\n• Android emulator uses 10.0.2.2 → your PC\n• Physical device: set DEV_API_HOST_OVERRIDE in src/config/api.ts + serve --host=0.0.0.0`,
        4,
        true,
      );
    } finally {
      setIsSubmitting(false);
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
    switch (currentStep) {
      case 1:
        return (
          <Step1PersonalProfile
            onNext={goNext}
            companySlugs={companySlugs}
            onCompanySlugsChange={setCompanySlugs}
            initialProfilePhotoUri={registrationUploadsRef.current.profilePhotoUri ?? null}
          />
        );
      case 2:
        return <Step2WorkEligibility onNext={goNext} />;
      case 3:
        return <Step3Qualifications onNext={goNext} />;
      case 4:
        return (
          <Step4EmploymentDetails
            onNext={goNext}
            companySlugs={companySlugs}
            focusPasswordSignal={passwordFocusNonce}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return (
          <Step1PersonalProfile
            onNext={goNext}
            companySlugs={companySlugs}
            onCompanySlugsChange={setCompanySlugs}
            initialProfilePhotoUri={registrationUploadsRef.current.profilePhotoUri ?? null}
          />
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          <TouchableOpacity
            onPress={goBack}
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

      <Modal visible={isSubmitting} transparent animationType="fade">
        <View
          style={[
            styles.successModalOverlay,
            { backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
          ]}
        >
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              paddingVertical: 28,
              paddingHorizontal: 32,
              alignItems: 'center',
              maxWidth: 280,
            }}
          >
            <ActivityIndicator size="large" color="#0056D2" />
            <Text
              style={{
                marginTop: 16,
                fontFamily: themeFontFamily.semiBold,
                fontSize: 15,
                color: '#374151',
                textAlign: 'center',
              }}
            >
              Submitting your applications…
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade">
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
        variant="warning"
        onClose={() => setBlockingAlert(null)}
        onConfirm={() => setBlockingAlert(null)}
      />
    </View>
  );
}
