import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../components/SweetAlert';
import { createAccountScreenStyles } from '../../styles/styles';
import type { UserProfileSnapshot } from '../../types/userProfile';
import {
  emptyRegistrationUploads,
  mergeRegistrationUploads,
  type RegistrationUploads,
} from '../../types/registrationUploads';
import { loadAccountProfile, saveAccountProfile } from '../../services/accountProfileStorage';
import { API_BASE_URL } from '../../config/api';
import { fontFamily as themeFontFamily } from '../../theme/theme';
import { submitFoundURegistration } from '../../services/registerAccountApi';
import { Step1PersonalProfile, Step2WorkEligibility, Step3Qualifications, Step4EmploymentDetails } from './steps';

const STEPS = [
  { step: 1, label: 'Personal Profile', progress: '25%' },
  { step: 2, label: 'Work Eligibility', progress: '50%' },
  { step: 3, label: 'Qualifications', progress: '75%' },
  { step: 4, label: 'Employment Details', progress: '100%' },
] as const;

const TOTAL_STEPS = 4;

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
  /** Master DB company slug (matches X-Company-Slug). */
  const [companySlug, setCompanySlug] = useState<string | null>(null);
  const profileSnapshotRef = useRef<Partial<UserProfileSnapshot>>({});
  const registrationUploadsRef = useRef<RegistrationUploads>(emptyRegistrationUploads());
  const [blockingAlert, setBlockingAlert] = useState<{ title: string; message: string } | null>(null);
  /** Increment after API failure so Step 4 can focus the password field again. */
  const [passwordFocusNonce, setPasswordFocusNonce] = useState(0);
  /** True while POST /register is in flight (after Complete on step 4). */
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
    const slug = snap.registrationCompanySlug ?? snap.companySlug ?? null;
    const _pwd = snap.password?.trim();
    const _pc = snap.password_confirmation?.trim();

    if (!slug) {
      openRegistrationAlert(
        'Company not selected',
        'Pick an organization on step 1 (loaded from the server). Pull to refresh bootstrap or check API /bootstrap.',
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
      const res = await submitFoundURegistration(
        { ...snap, password: _pwd, password_confirmation: _pc },
        slug,
        registrationUploadsRef.current,
      );
      const raw = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* plain text body */
      }

      if (!res.ok) {
        const msg = formatRegistrationApiError(parsed, raw);
        openRegistrationAlert('Could not submit application', `${msg}\n\nAPI: ${API_BASE_URL}`, 4, true);
        return;
      }

      setShowSuccessModal(true);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      openRegistrationAlert(
        'Network error',
        `${errMsg}\n\nAPI: ${API_BASE_URL}\nSlug: ${slug}\n\nTips:\n• Run: php artisan serve (same port as api.ts)\n• Android emulator uses 10.0.2.2 → your PC\n• Physical device: set DEV_API_HOST_OVERRIDE in src/config/api.ts + serve --host=0.0.0.0`,
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
      await saveAccountProfile({ ...base, ...withoutSecrets });
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
            companySlug={companySlug}
            onCompanySlugChange={setCompanySlug}
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
            focusPasswordSignal={passwordFocusNonce}
            isSubmitting={isSubmitting}
          />
        );
      default:
        return (
          <Step1PersonalProfile
            onNext={goNext}
            companySlug={companySlug}
            onCompanySlugChange={setCompanySlug}
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
          Workforce
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
              Submitting your application…
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
            <Text style={styles.successModalMessage}>
              Your application has been sent to the management. Please be patient while we review it. You will be notified once your profile is approved.
            </Text>
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
