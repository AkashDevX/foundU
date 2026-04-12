import React, { useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StatusBar, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { createAccountScreenStyles } from '../../styles/styles';
import type { UserProfileSnapshot } from '../../types/userProfile';
import { loadAccountProfile, saveAccountProfile } from '../../services/accountProfileStorage';
import { Step1PersonalProfile, Step2WorkEligibility, Step3Qualifications, Step4EmploymentDetails } from './steps';

const STEPS = [
  { step: 1, label: 'Personal Profile', progress: '25%' },
  { step: 2, label: 'Work Eligibility', progress: '50%' },
  { step: 3, label: 'Qualifications', progress: '75%' },
  { step: 4, label: 'Employment Details', progress: '100%' },
] as const;

const TOTAL_STEPS = 4;

export function CreateAccountScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState(1);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const profileSnapshotRef = useRef<Partial<UserProfileSnapshot>>({});

  const styles = createAccountScreenStyles;
  const stepConfig = STEPS[currentStep - 1];

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1);
    } else {
      navigation.goBack();
    }
  };

  const goNext = useCallback((stepPatch?: Partial<UserProfileSnapshot>) => {
    if (stepPatch) {
      profileSnapshotRef.current = { ...profileSnapshotRef.current, ...stepPatch };
    }
    setCurrentStep((step) => {
      if (step < TOTAL_STEPS) {
        return step + 1;
      }
      setShowSuccessModal(true);
      return step;
    });
  }, []);

  const handleSuccessOk = async () => {
    setShowSuccessModal(false);
    const base = await loadAccountProfile();
    const merged: UserProfileSnapshot = { ...base, ...profileSnapshotRef.current };
    await saveAccountProfile(merged);
    navigation.navigate('Login');
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1PersonalProfile
            onNext={goNext}
            companyId={companyId}
            onCompanyChange={setCompanyId}
          />
        );
      case 2:
        return <Step2WorkEligibility onNext={goNext} />;
      case 3:
        return <Step3Qualifications onNext={goNext} />;
      case 4:
        return <Step4EmploymentDetails onNext={goNext} />;
      default:
        return (
          <Step1PersonalProfile onNext={goNext} companyId={companyId} onCompanyChange={setCompanyId} />
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
    </View>
  );
}
