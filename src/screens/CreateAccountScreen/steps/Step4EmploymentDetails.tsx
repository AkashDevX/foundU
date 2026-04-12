import React, { useRef, useState, useCallback } from 'react';
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
  Alert,
  Keyboard,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import type { UserProfileSnapshot } from '../../../types/userProfile';

const TRANSPORT_OPTIONS = ['Own vehicle', 'Public transport', 'Walking', 'Other'];

interface Step4EmploymentDetailsProps {
  onNext: (patch?: Partial<UserProfileSnapshot>) => void;
}

export function Step4EmploymentDetails({ onNext }: Step4EmploymentDetailsProps) {
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
  const vehicleExpiryRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const isOwnVehicle = modeOfTransport === 'Own vehicle';
  const styles = createAccountScreenStyles;

  const pickImage = (onSelect: (uri: string) => void) => {
    if (!ImagePicker.launchImageLibrary) {
      Alert.alert('Image picker not available', 'Please fully rebuild the app.');
      return;
    }
    ImagePicker.launchImageLibrary({ mediaType: 'photo' }, (res) => {
      if (res.didCancel || res.errorCode || !res.assets?.[0]?.uri) return;
      onSelect(res.assets[0].uri);
    });
  };

  const handleComplete = useCallback(() => {
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please re-enter your password and confirmation so they match.');
      return;
    }
    onNext({
      bankAccountName: accountName.trim(),
      bankAccountNumber: accountNumber.trim(),
      bankBranchCode: branchCode.trim(),
      bankName: bankName.trim(),
      modeOfTransport: modeOfTransport || undefined,
      vehicleRegistration: vehicleRegistration.trim() || undefined,
      vehicleExpiry: vehicleExpiry.trim() || undefined,
      vehicleInsuranceUploaded: vehicleInsuranceUri ? 'Yes' : 'No',
    });
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
  ]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => vehicleExpiryRef.current?.focus()}
                />
              </Pressable>
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry</Text>
              <Pressable style={styles.input} onPress={() => vehicleExpiryRef.current?.focus()}>
                <TextInput
                  ref={vehicleExpiryRef}
                  style={styles.inputField}
                  placeholder="MM / DD / YYYY"
                  placeholderTextColor="#9CA3AF"
                  value={vehicleExpiry}
                  onChangeText={setVehicleExpiry}
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
                <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
              </Pressable>
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
                  {TRANSPORT_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === TRANSPORT_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setModeOfTransport(opt);
                        setShowTransportModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt}</Text>
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

          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.88} onPress={handleComplete}>
            <Text style={styles.saveBtnText}>Complete</Text>
            <Feather name="check" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
