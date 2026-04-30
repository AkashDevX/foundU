import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  Image,
  Keyboard,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../../components/SweetAlert';
import {
  ThemedDatePickerField,
  addYears,
  startOfToday,
} from '../../../components/ThemedDatePickerField';
import * as ImagePicker from 'react-native-image-picker';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import { useAppBootstrap } from '../../../context/AppBootstrapContext';
import type { UserProfileSnapshot } from '../../../types/userProfile';
import type { RegistrationWizardNext } from '../../../types/registrationUploads';

interface Step4EmploymentDetailsProps {
  onNext: RegistrationWizardNext;
  /** Increment when returning from a failed registration submit so password fields refocus. */
  focusPasswordSignal?: number;
  /** True while registration POST is running after tapping Complete. */
  isSubmitting?: boolean;
}

export function Step4EmploymentDetails({
  onNext,
  focusPasswordSignal = 0,
  isSubmitting = false,
}: Step4EmploymentDetailsProps) {
  const { picklists } = useAppBootstrap();
  const transportOptions = picklists.transport_mode ?? [];

  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [modeOfTransport, setModeOfTransport] = useState('');
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleExpiry, setVehicleExpiry] = useState('');
  const [vehicleInsuranceUri, setVehicleInsuranceUri] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const accountNameRef = useRef<TextInput>(null);
  const accountNumberRef = useRef<TextInput>(null);
  const bankNameRef = useRef<TextInput>(null);
  const branchCoderef = useRef<TextInput>(null);
  const vehicleRegistrationRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    focusPasswordOnOk?: boolean;
  } | null>(null);

  useEffect(() => {
    if (focusPasswordSignal <= 0) {
      return;
    }
    const id = setTimeout(() => {
      passwordRef.current?.focus();
    }, 450);
    return () => clearTimeout(id);
  }, [focusPasswordSignal]);

  const isOwnVehicle = modeOfTransport === 'Own vehicle';
  const styles = createAccountScreenStyles;

  const vehicleExpiryMinDate = startOfToday();
  const vehicleExpiryMaxDate = addYears(vehicleExpiryMinDate, 15);
  const vehicleExpiryDefaultDate = addYears(vehicleExpiryMinDate, 1);

  const pickImage = (onSelect: (uri: string) => void) => {
    if (!ImagePicker.launchImageLibrary) {
      setBlockingAlert({
        title: 'Image picker not available',
        message: 'Please fully rebuild the app.',
      });
      return;
    }
    ImagePicker.launchImageLibrary({ mediaType: 'photo' }, (res) => {
      if (res.didCancel || res.errorCode || !res.assets?.[0]?.uri) return;
      onSelect(res.assets[0].uri);
    });
  };

  const handleComplete = useCallback(() => {
    if (password !== confirmPassword) {
      setBlockingAlert({
        title: 'Passwords do not match',
        message: 'Please re-enter your password and confirmation so they match.',
        focusPasswordOnOk: true,
      });
      return;
    }
    if (isSubmitting) {
      return;
    }
    onNext(
      {
        bankAccountName: accountName.trim(),
        bankAccountNumber: accountNumber.trim(),
        bankBranchCode: branchCode.trim(),
        bankName: bankName.trim(),
        modeOfTransport: modeOfTransport || undefined,
        vehicleRegistration: vehicleRegistration.trim() || undefined,
        vehicleExpiry: vehicleExpiry.trim() || undefined,
        vehicleInsuranceUploaded: vehicleInsuranceUri ? 'Yes' : 'No',
        password: password.trim(),
        password_confirmation: confirmPassword.trim(),
      },
      vehicleInsuranceUri ? { vehicleInsuranceUri } : undefined,
    );
  }, [
    password,
    confirmPassword,
    onNext,
    accountName,
    accountNumber,
    branchCode,
    bankName,
    modeOfTransport,
    vehicleRegistration,
    vehicleExpiry,
    vehicleInsuranceUri,
    isSubmitting,
  ]);

  const dismissAlert = useCallback(() => {
    setBlockingAlert((prev) => {
      if (prev?.focusPasswordOnOk === true) {
        setTimeout(() => passwordRef.current?.focus(), 120);
      }
      return null;
    });
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Employment details</Text>
          <Text style={styles.subtitle}>
            Provide your bank details for pay and how you'll get to work.
          </Text>

          <Text style={styles.fieldLabel}>Bank Details</Text>
          <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Account name</Text>
          <Pressable style={styles.input} onPress={() => accountNameRef.current?.focus()}>
            <TextInput
              ref={accountNameRef}
              style={styles.inputField}
              placeholder="Name on account"
              placeholderTextColor="#9CA3AF"
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => accountNumberRef.current?.focus()}
            />
          </Pressable>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Account number</Text>
          <Pressable style={styles.input} onPress={() => accountNumberRef.current?.focus()}>
            <TextInput
              ref={accountNumberRef}
              style={styles.inputField}
              placeholder="Enter account number"
              placeholderTextColor="#9CA3AF"
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="number-pad"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => branchCoderef.current?.focus()}
            />
          </Pressable>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Branch Code</Text>
          <Pressable style={styles.input} onPress={() => branchCoderef.current?.focus()}>
            <TextInput
              ref={branchCoderef}
              style={styles.inputField}
              placeholder="Enter branch code"
              placeholderTextColor="#9CA3AF"
              value={branchCode}
              onChangeText={setBranchCode}
              keyboardType="number-pad"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => bankNameRef.current?.focus()}
            />
          </Pressable>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Bank name</Text>
          <Pressable style={styles.input} onPress={() => bankNameRef.current?.focus()}>
            <TextInput
              ref={bankNameRef}
              style={styles.inputField}
              placeholder="e.g. Commonwealth Bank"
              placeholderTextColor="#9CA3AF"
              value={bankName}
              onChangeText={setBankName}
              autoCapitalize="words"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                if (isOwnVehicle) {
                  vehicleRegistrationRef.current?.focus();
                } else {
                  passwordRef.current?.focus();
                }
              }}
            />
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>Mode of Transport</Text>
          <Text style={styles.fieldHint}>If own vehicle – Registration, Expiry, Insurance required</Text>
          <TouchableOpacity
            style={[styles.input, { marginTop: spacing.sm }]}
            onPress={() => setShowTransportModal(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.inputField, !modeOfTransport && { color: '#9CA3AF' }]}>
              {modeOfTransport || 'Select mode of transport'}
            </Text>
            <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
          </TouchableOpacity>

          {isOwnVehicle && (
            <View style={[styles.idDocCard, { marginTop: spacing.xl }]}>
              <Text style={styles.idDocCardLabel}>Vehicle Details</Text>
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Registration</Text>
              <Pressable style={styles.input} onPress={() => vehicleRegistrationRef.current?.focus()}>
                <TextInput
                  ref={vehicleRegistrationRef}
                  style={styles.inputField}
                  placeholder="Vehicle registration number"
                  placeholderTextColor="#9CA3AF"
                  value={vehicleRegistration}
                  onChangeText={setVehicleRegistration}
                  autoCapitalize="characters"
                  returnKeyType="done"
                  blurOnSubmit={false}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </Pressable>
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry</Text>
              <ThemedDatePickerField
                value={vehicleExpiry}
                onChange={setVehicleExpiry}
                minimumDate={vehicleExpiryMinDate}
                maximumDate={vehicleExpiryMaxDate}
                defaultPickerDate={vehicleExpiryDefaultDate}
              />
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Insurance</Text>
              <TouchableOpacity
                style={[styles.idDocUploadArea, vehicleInsuranceUri && styles.idDocUploadAreaFilled]}
                onPress={() => pickImage(setVehicleInsuranceUri)}
                activeOpacity={0.8}
              >
                {vehicleInsuranceUri ? (
                  <Image source={{ uri: vehicleInsuranceUri }} style={styles.idDocImage} resizeMode="cover" />
                ) : (
                  <>
                    <Feather name="upload" size={32} color="#9CA3AF" />
                    <Text style={styles.idDocUploadText}>Tap to upload insurance document</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <Modal visible={showTransportModal} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setShowTransportModal(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {transportOptions.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.modalOption, idx === transportOptions.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setModeOfTransport(opt.value);
                        setShowTransportModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>Create account password</Text>
          <Text style={styles.fieldHint}>Choose a password you'll use to sign in after approval.</Text>
          <Pressable style={[styles.input, { marginTop: spacing.sm }]} onPress={() => passwordRef.current?.focus()}>
            <TextInput
              ref={passwordRef}
              style={[styles.inputField, styles.inputFieldPassword]}
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            />
            <TouchableOpacity
              style={styles.passwordEyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              activeOpacity={0.7}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Confirm password</Text>
          <Pressable style={styles.input} onPress={() => confirmPasswordRef.current?.focus()}>
            <TextInput
              ref={confirmPasswordRef}
              style={[styles.inputField, styles.inputFieldPassword]}
              placeholder="••••••••"
              placeholderTextColor="#9CA3AF"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
            <TouchableOpacity
              style={styles.passwordEyeBtn}
              onPress={() => setShowConfirmPassword((v) => !v)}
              activeOpacity={0.7}
              accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
            >
              <Feather name={showConfirmPassword ? 'eye-off' : 'eye'} size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </Pressable>

          <TouchableOpacity
            style={[styles.saveBtn, isSubmitting && { opacity: 0.65 }]}
            activeOpacity={0.88}
            onPress={handleComplete}
            disabled={isSubmitting}
          >
            <Text style={styles.saveBtnText}>{isSubmitting ? 'Submitting…' : 'Complete'}</Text>
            {!isSubmitting ? <Feather name="check" size={22} color="#FFFFFF" /> : null}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <SweetAlert
        visible={blockingAlert !== null}
        title={blockingAlert?.title ?? ''}
        message={blockingAlert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="warning"
        onClose={dismissAlert}
        onConfirm={dismissAlert}
      />
    </KeyboardAvoidingView>
  );
}
