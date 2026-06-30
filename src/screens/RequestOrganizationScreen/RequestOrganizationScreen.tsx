import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { createAccountScreenStyles } from '../../styles/styles';
import { useAppBootstrap } from '../../context/AppBootstrapContext';
import { SweetAlert } from '../../components/SweetAlert';
import { missingFieldsAlert } from '../CreateAccountScreen/validation';
import { submitOrganizationRequest } from '../../services/requestOrganizationApi';
import {
  isOrganizationRequestFormComplete,
  validateOrganizationRequestForm,
} from '../../utils/organizationRequestValidation';

const pickerModalStyles = StyleSheet.create({
  card: {
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    zIndex: 1,
  },
  optionRow: {
    width: '100%',
    alignSelf: 'stretch',
  },
  optionText: {
    flexShrink: 1,
    width: '100%',
  },
});

export function RequestOrganizationScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { picklists } = useAppBootstrap();
  const industryOptions = picklists.request_organization_industry ?? [];
  const employeeBandOptions = picklists.request_organization_employee_band ?? [];
  const styles = createAccountScreenStyles;

  /** Keep option lists on-screen with room for safe areas and keyboard */
  const pickerCardMaxHeight = Math.round(
    Math.min(windowHeight * 0.58, windowHeight - insets.top - insets.bottom - 48),
  );
  const pickerScrollMaxHeight = Math.max(180, pickerCardMaxHeight - spacing.lg * 2);

  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [industryOther, setIndustryOther] = useState('');
  const [employeeBand, setEmployeeBand] = useState('');
  const [employeeBandOther, setEmployeeBandOther] = useState('');
  const [showIndustryModal, setShowIndustryModal] = useState(false);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [postcode, setPostcode] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [telephone, setTelephone] = useState('');
  const [successVisible, setSuccessVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    listItems?: string[];
  } | null>(null);
  const [submitErrorAlert, setSubmitErrorAlert] = useState<{ title: string; message: string } | null>(
    null,
  );

  const companyNameRef = useRef<TextInput>(null);
  const industryOtherRef = useRef<TextInput>(null);
  const employeeBandOtherRef = useRef<TextInput>(null);
  const postcodeRef = useRef<TextInput>(null);
  const fullNameRef = useRef<TextInput>(null);
  const companyEmailRef = useRef<TextInput>(null);
  const telephoneRef = useRef<TextInput>(null);

  const formState = useMemo(
    () => ({
      companyName,
      industry,
      industryOther,
      employeeBand,
      employeeBandOther,
      postcode,
      fullName,
      companyEmail,
      telephone,
    }),
    [
      companyName,
      industry,
      industryOther,
      employeeBand,
      employeeBandOther,
      postcode,
      fullName,
      companyEmail,
      telephone,
    ],
  );

  const canSubmit = useMemo(() => isOrganizationRequestFormComplete(formState), [formState]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;

    const validation = validateOrganizationRequestForm(formState);
    if (!validation.ok) {
      setBlockingAlert({
        title: 'Complete required fields',
        ...missingFieldsAlert(validation.missing),
      });
      return;
    }

    setSubmitting(true);
    const result = await submitOrganizationRequest(validation.payload);
    setSubmitting(false);

    if (result.ok) {
      setSuccessVisible(true);
      return;
    }

    setSubmitErrorAlert({
      title: 'Could not submit',
      message: result.message,
    });
  }, [formState, submitting]);

  const handleSuccessDismiss = () => {
    setSuccessVisible(false);
    navigation.goBack();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={24} color="#0056D2" />
          </TouchableOpacity>
        </View>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Request access
        </Text>
        <View style={styles.topBarSideRight} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Register your organisation</Text>
            <Text style={styles.subtitle}>
              If your company is not set up on CruLynk yet, send us a few details and our team will contact you.
            </Text>

            <Text style={[styles.stepText, { marginBottom: spacing.md }]}>COMPANY</Text>

            <Text style={styles.fieldLabel}>Company name</Text>
            <Pressable style={styles.input} onPress={() => companyNameRef.current?.focus()}>
              <TextInput
                ref={companyNameRef}
                style={styles.inputField}
                placeholder="Legal or trading name"
                placeholderTextColor="#9CA3AF"
                value={companyName}
                onChangeText={setCompanyName}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => {
                  if (industry === 'Other') industryOtherRef.current?.focus();
                  else postcodeRef.current?.focus();
                }}
              />
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Industry</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowIndustryModal(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.inputField, !industry && { color: '#9CA3AF' }]}>
                {industry
                  ? industry === 'Other' && industryOther.trim()
                    ? `Other (${industryOther.trim()})`
                    : industry
                  : 'Select industry'}
              </Text>
              <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
            </TouchableOpacity>
            {industry === 'Other' && (
              <>
                <Text style={[styles.fieldHint, { marginTop: spacing.sm }]}>
                  Briefly describe your industry if it is not listed above.
                </Text>
                <Pressable
                  style={[styles.input, { marginTop: spacing.sm }]}
                  onPress={() => industryOtherRef.current?.focus()}
                >
                  <TextInput
                    ref={industryOtherRef}
                    style={styles.inputField}
                    placeholder="Describe your industry"
                    placeholderTextColor="#9CA3AF"
                    value={industryOther}
                    onChangeText={setIndustryOther}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => {
                      if (employeeBand === 'Other') employeeBandOtherRef.current?.focus();
                      else postcodeRef.current?.focus();
                    }}
                  />
                </Pressable>
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Number of employees</Text>
            <Text style={styles.fieldHint}>Approximate headcount for your whole organisation.</Text>
            <TouchableOpacity
              style={[styles.input, { marginTop: spacing.sm }]}
              onPress={() => setShowEmployeeModal(true)}
              activeOpacity={0.8}
            >
              <Text style={[styles.inputField, !employeeBand && { color: '#9CA3AF' }]}>
                {employeeBand
                  ? employeeBand === 'Other' && employeeBandOther.trim()
                    ? `Other (${employeeBandOther.trim()})`
                    : employeeBand
                  : 'Select range'}
              </Text>
              <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
            </TouchableOpacity>
            {employeeBand === 'Other' && (
              <>
                <Text style={[styles.fieldHint, { marginTop: spacing.sm }]}>
                  Enter an approximate number if your size does not fit the ranges above.
                </Text>
                <Pressable
                  style={[styles.input, { marginTop: spacing.sm }]}
                  onPress={() => employeeBandOtherRef.current?.focus()}
                >
                  <TextInput
                    ref={employeeBandOtherRef}
                    style={styles.inputField}
                    placeholder="e.g. 75"
                    placeholderTextColor="#9CA3AF"
                    value={employeeBandOther}
                    onChangeText={setEmployeeBandOther}
                    keyboardType="number-pad"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => postcodeRef.current?.focus()}
                  />
                </Pressable>
              </>
            )}

            <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Company postcode</Text>
            <Pressable style={styles.input} onPress={() => postcodeRef.current?.focus()}>
              <TextInput
                ref={postcodeRef}
                style={styles.inputField}
                placeholder="Postcode"
                placeholderTextColor="#9CA3AF"
                value={postcode}
                onChangeText={setPostcode}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => fullNameRef.current?.focus()}
              />
            </Pressable>

            <Text style={[styles.stepText, { marginTop: spacing.xxl, marginBottom: spacing.md }]}>YOUR DETAILS</Text>

            <Text style={styles.fieldLabel}>Full name</Text>
            <Pressable style={styles.input} onPress={() => fullNameRef.current?.focus()}>
              <TextInput
                ref={fullNameRef}
                style={styles.inputField}
                placeholder="Your name"
                placeholderTextColor="#9CA3AF"
                value={fullName}
                onChangeText={setFullName}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => companyEmailRef.current?.focus()}
              />
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Company email address</Text>
            <Pressable style={styles.input} onPress={() => companyEmailRef.current?.focus()}>
              <TextInput
                ref={companyEmailRef}
                style={styles.inputField}
                placeholder="contact@company.com"
                placeholderTextColor="#9CA3AF"
                value={companyEmail}
                onChangeText={setCompanyEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => telephoneRef.current?.focus()}
              />
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Telephone number</Text>
            <Pressable style={styles.input} onPress={() => telephoneRef.current?.focus()}>
              <TextInput
                ref={telephoneRef}
                style={styles.inputField}
                placeholder="Best number to reach you"
                placeholderTextColor="#9CA3AF"
                value={telephone}
                onChangeText={setTelephone}
                keyboardType="phone-pad"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </Pressable>

            <TouchableOpacity
              style={[styles.saveBtn, (!canSubmit || submitting) && styles.saveBtnDisabled]}
              activeOpacity={0.88}
              onPress={handleSubmit}
              disabled={submitting}
            >
              <Text style={styles.saveBtnText}>{submitting ? 'Submitting…' : 'Submit'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showIndustryModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowIndustryModal(false)} />
          <View style={[styles.modalContent, pickerModalStyles.card, { maxHeight: pickerCardMaxHeight }]}>
            <ScrollView
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={{ maxHeight: pickerScrollMaxHeight }}
              bounces={false}
            >
              {industryOptions.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.modalOption,
                    pickerModalStyles.optionRow,
                    idx === industryOptions.length - 1 ? styles.modalOptionLast : null,
                  ]}
                  onPress={() => {
                    setIndustry(opt.value);
                    if (opt.value !== 'Other') setIndustryOther('');
                    setShowIndustryModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, pickerModalStyles.optionText]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showEmployeeModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowEmployeeModal(false)} />
          <View style={[styles.modalContent, pickerModalStyles.card, { maxHeight: pickerCardMaxHeight }]}>
            <ScrollView
              keyboardShouldPersistTaps="always"
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={{ maxHeight: pickerScrollMaxHeight }}
              bounces={false}
            >
              {employeeBandOptions.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    styles.modalOption,
                    pickerModalStyles.optionRow,
                    idx === employeeBandOptions.length - 1 ? styles.modalOptionLast : null,
                  ]}
                  onPress={() => {
                    setEmployeeBand(opt.value);
                    if (opt.value !== 'Other') setEmployeeBandOther('');
                    setShowEmployeeModal(false);
                  }}
                >
                  <Text style={[styles.modalOptionText, pickerModalStyles.optionText]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={submitting} transparent animationType="fade">
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
            <ActivityIndicator size="large" color={colors.accent} />
            <Text
              style={{
                marginTop: 16,
                fontFamily: fontFamily.semiBold,
                fontSize: 15,
                color: '#374151',
                textAlign: 'center',
              }}
            >
              Sending your request…
            </Text>
          </View>
        </View>
      </Modal>

      <Modal visible={successVisible} transparent animationType="fade">
        <Pressable style={styles.successModalOverlay}>
          <View style={styles.successModalCard}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={44} color="#059669" strokeWidth={3} />
            </View>
            <Text style={styles.successModalTitle}>Thank you</Text>
            <Text style={styles.successModalMessage}>
              We have received your details. The CruLynk team will review your organisation request and be in touch
              shortly.
            </Text>
            <TouchableOpacity style={styles.successModalBtn} onPress={handleSuccessDismiss} activeOpacity={0.85}>
              <Text style={styles.successModalBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <SweetAlert
        visible={blockingAlert !== null}
        title={blockingAlert?.title ?? ''}
        message={blockingAlert?.message ?? ''}
        listItems={blockingAlert?.listItems}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="warning"
        onClose={() => setBlockingAlert(null)}
        onConfirm={() => setBlockingAlert(null)}
      />

      <SweetAlert
        visible={submitErrorAlert !== null}
        title={submitErrorAlert?.title ?? ''}
        message={submitErrorAlert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="error"
        onClose={() => setSubmitErrorAlert(null)}
        onConfirm={() => setSubmitErrorAlert(null)}
      />
    </View>
  );
}
