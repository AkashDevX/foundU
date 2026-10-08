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
  NativeModules,
  TurboModuleRegistry,
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
import { isBlank, missingFieldsAlert } from '../validation';
import { TermsAndConditionsModal } from '../TermsAndConditionsModal';
import {
  isIdDocumentImage,
  MAX_ID_DOCUMENT_BYTES,
  normalizeIdDocument,
  type IdDocumentFile,
} from '../../../utils/idDocument';

const profileBlue = '#0056D2';

interface Step4EmploymentDetailsProps {
  onNext: RegistrationWizardNext;
  /** False while another step is showing. The form stays mounted so values are kept. */
  active?: boolean;
  /** Master DB company slugs — used to load each org's terms. */
  companySlugs: string[];
  /** Increment when returning from a failed registration submit so password fields refocus. */
  focusPasswordSignal?: number;
  /** True while registration POST is running after tapping Complete. */
  isSubmitting?: boolean;
  /** Live 0–100 score while the registration POST is running. */
  submitProgress?: number | null;
}

export function Step4EmploymentDetails({
  onNext,
  active = true,
  companySlugs,
  focusPasswordSignal = 0,
  isSubmitting = false,
  submitProgress = null,
}: Step4EmploymentDetailsProps) {
  const { picklists, companies } = useAppBootstrap();
  const transportOptions = picklists.transport_mode ?? [];
  const selectedCompanies = companies.filter((c) => companySlugs.includes(c.slug));

  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [modeOfTransport, setModeOfTransport] = useState('');
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleExpiry, setVehicleExpiry] = useState('');
  const [vehicleInsurance, setVehicleInsurance] = useState<IdDocumentFile | null>(null);
  const [showInsuranceSource, setShowInsuranceSource] = useState(false);
  const insurancePickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTermSlugs, setAcceptedTermSlugs] = useState<string[]>([]);
  const [termsCompanySlug, setTermsCompanySlug] = useState<string | null>(null);
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
    listItems?: string[];
    focusPasswordOnOk?: boolean;
  } | null>(null);

  useEffect(() => {
    if (active) return;
    if (insurancePickerTimerRef.current) {
      clearTimeout(insurancePickerTimerRef.current);
      insurancePickerTimerRef.current = null;
    }
    setShowTransportModal(false);
    setShowInsuranceSource(false);
    setTermsCompanySlug(null);
    setBlockingAlert(null);
  }, [active]);

  useEffect(() => {
    if (!active || focusPasswordSignal <= 0) {
      return;
    }
    const id = setTimeout(() => {
      passwordRef.current?.focus();
    }, 450);
    return () => clearTimeout(id);
  }, [active, focusPasswordSignal]);

  useEffect(() => {
    setAcceptedTermSlugs((prev) => prev.filter((slug) => companySlugs.includes(slug)));
  }, [companySlugs]);

  useEffect(() => () => {
    if (insurancePickerTimerRef.current) clearTimeout(insurancePickerTimerRef.current);
  }, []);

  const isOwnVehicle = modeOfTransport === 'Own vehicle';
  const styles = createAccountScreenStyles;
  const allTermsAccepted =
    selectedCompanies.length > 0 && selectedCompanies.every((c) => acceptedTermSlugs.includes(c.slug));
  const termsCompany = selectedCompanies.find((c) => c.slug === termsCompanySlug) ?? null;

  const step4Complete =
    !isBlank(accountName) &&
    !isBlank(accountNumber) &&
    !isBlank(branchCode) &&
    !isBlank(bankName) &&
    !isBlank(modeOfTransport) &&
    !isBlank(password) &&
    !isBlank(confirmPassword) &&
    allTermsAccepted &&
    (!isOwnVehicle || (!isBlank(vehicleRegistration) && !isBlank(vehicleExpiry)));

  const vehicleExpiryMinDate = startOfToday();
  const vehicleExpiryMaxDate = addYears(vehicleExpiryMinDate, 15);
  const vehicleExpiryDefaultDate = addYears(vehicleExpiryMinDate, 1);

  const rejectInsuranceFile = (message: string) => {
    setBlockingAlert({
      title: 'Vehicle insurance',
      message,
    });
  };

  const acceptInsuranceFile = (
    uri: string,
    name: string,
    mime: string,
    size: number | null | undefined,
    kind: 'image' | 'file',
  ) => {
    if (size != null && size > MAX_ID_DOCUMENT_BYTES) {
      rejectInsuranceFile('Insurance documents must be 15 MB or smaller.');
      return;
    }
    const normalized = normalizeIdDocument(name, mime);
    const image = normalized ? isIdDocumentImage(normalized.mime) : false;
    if (!normalized || (kind === 'image' && !image) || (kind === 'file' && image)) {
      rejectInsuranceFile(kind === 'image' ? 'Use a JPG or PNG.' : 'Use a PDF, DOC, or DOCX.');
      return;
    }
    setVehicleInsurance({ uri, name: normalized.name, mime: normalized.mime });
  };

  const takeInsurancePhoto = () => {
    if (!ImagePicker.launchCamera) {
      rejectInsuranceFile('Camera is unavailable on this build. Upload a file instead.');
      return;
    }
    ImagePicker.launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'back',
        saveToPhotos: false,
        quality: 0.85,
        maxWidth: 2400,
        maxHeight: 2400,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        if (res.didCancel) return;
        if (res.errorCode === 'camera_unavailable') {
          rejectInsuranceFile('This device has no camera available. Upload a file instead.');
          return;
        }
        if (res.errorCode === 'permission') {
          rejectInsuranceFile('Allow camera access to photograph your insurance, or upload a file instead.');
          return;
        }
        const asset = res.assets?.[0];
        if (res.errorCode || !asset?.uri) {
          rejectInsuranceFile('Could not take that photo. Try again, or upload a file.');
          return;
        }
        acceptInsuranceFile(
          asset.uri,
          asset.fileName || 'vehicle-insurance.jpg',
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadInsuranceImage = () => {
    if (!ImagePicker.launchImageLibrary) {
      rejectInsuranceFile('Photo library is unavailable on this build. Take a photo instead.');
      return;
    }
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: 1,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        const asset = res.assets?.[0];
        if (res.didCancel || !asset?.uri) return;
        if (res.errorCode) {
          rejectInsuranceFile('Could not open that photo. Try again.');
          return;
        }
        acceptInsuranceFile(
          asset.uri,
          asset.fileName || 'vehicle-insurance.jpg',
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadInsuranceOfficeFile = async () => {
    try {
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        rejectInsuranceFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }

      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy } = DocumentPicker;
      const [file] = await pick({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      const name = (file.name || 'vehicle-insurance').trim() || 'vehicle-insurance';
      const mime = file.type || '';
      if (file.size != null && file.size > MAX_ID_DOCUMENT_BYTES) {
        rejectInsuranceFile('Insurance documents must be 15 MB or smaller.');
        return;
      }
      const normalized = normalizeIdDocument(name, mime);
      if (!normalized || isIdDocumentImage(normalized.mime)) {
        rejectInsuranceFile('Use a PDF, DOC, or DOCX.');
        return;
      }

      let uri = file.uri;
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: normalized.name }],
        destination: 'cachesDirectory',
      });
      if (local.status === 'success' && local.localUri) {
        uri = local.localUri;
      }
      setVehicleInsurance({ uri, name: normalized.name, mime: normalized.mime });
    } catch (err) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        rejectInsuranceFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      if (err instanceof Error && /null|getConstants|native module/i.test(err.message)) {
        rejectInsuranceFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      rejectInsuranceFile('Could not open that file. Use a PDF, DOC, or DOCX.');
    }
  };

  const chooseInsuranceSource = (kind: 'camera' | 'image' | 'file') => {
    setShowInsuranceSource(false);
    if (insurancePickerTimerRef.current) clearTimeout(insurancePickerTimerRef.current);
    insurancePickerTimerRef.current = setTimeout(() => {
      if (kind === 'camera') takeInsurancePhoto();
      else if (kind === 'image') uploadInsuranceImage();
      else void uploadInsuranceOfficeFile();
    }, 350);
  };

  const handleComplete = useCallback(() => {
    const missing: string[] = [];
    if (isBlank(accountName)) missing.push('Bank account name');
    if (isBlank(accountNumber)) missing.push('Bank account number');
    if (isBlank(branchCode)) missing.push('Branch code');
    if (isBlank(bankName)) missing.push('Bank name');
    if (isBlank(modeOfTransport)) missing.push('Mode of transport');
    if (isOwnVehicle) {
      if (isBlank(vehicleRegistration)) missing.push('Vehicle registration');
      if (isBlank(vehicleExpiry)) missing.push('Vehicle expiry date');
    }
    if (isBlank(password)) missing.push('Password');
    if (isBlank(confirmPassword)) missing.push('Confirm password');
    if (!allTermsAccepted) missing.push('Acceptance of Terms and conditions for each organisation');

    if (missing.length > 0) {
      setBlockingAlert({
        title: 'Complete required fields',
        ...missingFieldsAlert(missing),
      });
      return;
    }
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
        vehicleInsuranceUploaded: isOwnVehicle && vehicleInsurance ? 'Yes' : undefined,
        password: password.trim(),
        password_confirmation: confirmPassword.trim(),
      },
      { vehicleInsurance: isOwnVehicle ? vehicleInsurance : null },
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
    vehicleInsurance,
    isSubmitting,
    isOwnVehicle,
    allTermsAccepted,
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
    <>
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
          <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>
            Account name *
          </Text>
          <Pressable
            style={styles.input}
            onPress={() => accountNameRef.current?.focus()}
          >
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
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>
            Account number *
          </Text>
          <Pressable
            style={styles.input}
            onPress={() => accountNumberRef.current?.focus()}
          >
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
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>
            Branch Code / BSB *
          </Text>
          <Pressable
            style={styles.input}
            onPress={() => branchCoderef.current?.focus()}
          >
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
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>
            Bank name *
          </Text>
          <Pressable
            style={styles.input}
            onPress={() => bankNameRef.current?.focus()}
          >
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

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>
            Mode of Transport *
          </Text>
          <Text style={styles.fieldHint}>
            If own vehicle – Registration and expiry are required
          </Text>
          <TouchableOpacity
            style={[styles.input, { marginTop: spacing.sm }]}
            onPress={() => setShowTransportModal(true)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.inputField,
                !modeOfTransport && { color: '#9CA3AF' },
              ]}
            >
              {modeOfTransport || 'Select mode of transport'}
            </Text>
            <Feather
              name="chevron-down"
              size={20}
              color="#6B7280"
              style={styles.inputIconRight}
            />
          </TouchableOpacity>

          {isOwnVehicle && (
            <View style={[styles.idDocCard, { marginTop: spacing.xl }]}>
              <Text style={styles.idDocCardLabel}>Vehicle Details</Text>
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>
                Registration *
              </Text>
              <Pressable
                style={styles.input}
                onPress={() => vehicleRegistrationRef.current?.focus()}
              >
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
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>
                Expiry *
              </Text>
              <ThemedDatePickerField
                value={vehicleExpiry}
                onChange={setVehicleExpiry}
                minimumDate={vehicleExpiryMinDate}
                maximumDate={vehicleExpiryMaxDate}
                defaultPickerDate={vehicleExpiryDefaultDate}
              />
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>
                Insurance
              </Text>
              <TouchableOpacity
                style={[
                  styles.idDocUploadArea,
                  vehicleInsurance && styles.idDocUploadAreaFilled,
                ]}
                onPress={() => setShowInsuranceSource(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add vehicle insurance document"
              >
                {vehicleInsurance && isIdDocumentImage(vehicleInsurance.mime) ? (
                  <Image
                    source={{ uri: vehicleInsurance.uri }}
                    style={styles.idDocImage}
                    resizeMode="cover"
                  />
                ) : vehicleInsurance ? (
                  <>
                    <Feather name="file-text" size={32} color={profileBlue} />
                    <Text style={styles.idDocUploadText} numberOfLines={2}>
                      {vehicleInsurance.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Feather name="upload" size={32} color="#9CA3AF" />
                    <Text style={styles.idDocUploadText}>
                      Tap to upload insurance document
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {vehicleInsurance ? (
                <TouchableOpacity
                  onPress={() => setVehicleInsurance(null)}
                  activeOpacity={0.7}
                  style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                >
                  <Text style={[styles.idDocAddBtnText, { color: '#EF4444' }]}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          <Modal
            visible={showInsuranceSource}
            transparent
            animationType="fade"
            onRequestClose={() => setShowInsuranceSource(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setShowInsuranceSource(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <Text style={[styles.photoSourceTitle, { marginBottom: spacing.sm }]}>
                    Vehicle insurance
                  </Text>
                  <TouchableOpacity
                    style={styles.modalOption}
                    onPress={() => chooseInsuranceSource('camera')}
                    accessibilityRole="button"
                    accessibilityLabel="Take photo"
                  >
                    <Feather name="camera" size={20} color={profileBlue} />
                    <Text style={styles.modalOptionText}>Take photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalOption}
                    onPress={() => chooseInsuranceSource('image')}
                    accessibilityRole="button"
                    accessibilityLabel="Upload an image"
                  >
                    <Feather name="image" size={20} color={profileBlue} />
                    <Text style={styles.modalOptionText}>Upload an image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalOption}
                    onPress={() => chooseInsuranceSource('file')}
                    accessibilityRole="button"
                    accessibilityLabel="Upload file"
                  >
                    <Feather name="file-text" size={20} color={profileBlue} />
                    <Text style={styles.modalOptionText}>Upload file (PDF, DOC, or DOCX)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalOption, styles.modalOptionLast]}
                    onPress={() => setShowInsuranceSource(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text style={styles.modalOptionText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Modal
            visible={showTransportModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowTransportModal(false)}
          >
            <Pressable
              style={styles.modalOverlay}
              onPress={() => setShowTransportModal(false)}
            >
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {transportOptions.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.modalOption,
                        idx === transportOptions.length - 1
                          ? styles.modalOptionLast
                          : null,
                      ]}
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

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>
            Create account password *
          </Text>
          <Text style={styles.fieldHint}>
            Choose a password you'll use to sign in after approval.
          </Text>
          <Pressable
            style={[styles.input, { marginTop: spacing.sm }]}
            onPress={() => passwordRef.current?.focus()}
          >
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
              onPress={() => setShowPassword(v => !v)}
              activeOpacity={0.7}
              accessibilityLabel={
                showPassword ? 'Hide password' : 'Show password'
              }
            >
              <Feather
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>
            Confirm password *
          </Text>
          <Pressable
            style={styles.input}
            onPress={() => confirmPasswordRef.current?.focus()}
          >
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
              onPress={() => setShowConfirmPassword(v => !v)}
              activeOpacity={0.7}
              accessibilityLabel={
                showConfirmPassword ? 'Hide password' : 'Show password'
              }
            >
              <Feather
                name={showConfirmPassword ? 'eye-off' : 'eye'}
                size={20}
                color="#9CA3AF"
              />
            </TouchableOpacity>
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>
            Terms and conditions *
          </Text>
          <Text style={styles.fieldHint}>
            Open and accept terms for every organisation you selected. Each
            company reviews your application separately.
          </Text>
          {selectedCompanies.length === 0 ? (
            <Text style={[styles.fieldHint, { marginTop: spacing.sm }]}>
              Go back to step 1 and select at least one organisation.
            </Text>
          ) : (
            selectedCompanies.map((org, idx) => {
              const accepted = acceptedTermSlugs.includes(org.slug);
              const isLast = idx === selectedCompanies.length - 1;
              return (
                <TouchableOpacity
                  key={org.slug}
                  style={[
                    styles.termsOrgRow,
                    isLast ? styles.termsOrgRowLast : null,
                  ]}
                  onPress={() => setTermsCompanySlug(org.slug)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`${
                    accepted ? 'Accepted' : 'View'
                  } terms for ${org.name}`}
                >
                  <View
                    style={[
                      styles.termsCheckbox,
                      accepted && styles.termsCheckboxChecked,
                    ]}
                  >
                    {accepted ? (
                      <Feather name="check" size={16} color="#FFFFFF" />
                    ) : null}
                  </View>
                  <Text style={styles.termsOrgName} numberOfLines={2}>
                    {org.name}
                  </Text>
                  <Text style={styles.termsOrgLink}>
                    {accepted ? 'Accepted' : 'View terms'}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}

          <TouchableOpacity
            style={[
              styles.saveBtn,
              (isSubmitting || !step4Complete) && { opacity: 0.65 },
            ]}
            activeOpacity={0.88}
            onPress={handleComplete}
            disabled={isSubmitting}
          >
            <Text style={styles.saveBtnText}>
              {isSubmitting
                ? submitProgress == null
                  ? 'Submitting…'
                  : `Submitting ${Math.round(submitProgress)}%`
                : 'Complete'}
            </Text>
            {!isSubmitting ? (
              <Feather name="check" size={22} color="#FFFFFF" />
            ) : null}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <SweetAlert
        visible={blockingAlert !== null}
        title={blockingAlert?.title ?? ''}
        message={blockingAlert?.message ?? ''}
        listItems={blockingAlert?.listItems}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="warning"
        onClose={dismissAlert}
        onConfirm={dismissAlert}
      />
    </KeyboardAvoidingView>
    <TermsAndConditionsModal
      visible={termsCompanySlug !== null}
      onClose={() => setTermsCompanySlug(null)}
      companySlug={termsCompany?.slug ?? termsCompanySlug}
      companyName={termsCompany?.name ?? null}
      onAccept={() => {
        if (termsCompanySlug) {
          setAcceptedTermSlugs(prev =>
            prev.includes(termsCompanySlug)
              ? prev
              : [...prev, termsCompanySlug],
          );
        }
      }}
    />
    </>
  );
}
