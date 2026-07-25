import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
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
  ActivityIndicator,
  Image,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import { SweetAlert } from '../../../components/SweetAlert';
import { CompanyPicker } from '../../../components/CompanyPicker';
import { useAppBootstrap } from '../../../context/AppBootstrapContext';
import type { UserProfileSnapshot } from '../../../types/userProfile';
import type { RegistrationWizardNext } from '../../../types/registrationUploads';
import { searchAddressSuggestions, type AddressSuggestion } from '../../../services/nominatim';
import {
  ThemedDatePickerField,
  formatDateToDisplay,
  parseDisplayDateToDate,
} from '../../../components/ThemedDatePickerField';
import { isBlank, missingFieldsAlert } from '../validation';

interface Step1PersonalProfileProps {
  onNext: RegistrationWizardNext;
  /** Master DB company slug from GET /api/v1/bootstrap. */
  companySlug: string | null;
  onCompanySlugChange: (slug: string) => void;
  /** Restored when returning from a later step (registration upload ref). */
  initialProfilePhotoUri?: string | null;
}

export function Step1PersonalProfile({
  onNext,
  companySlug,
  onCompanySlugChange,
  initialProfilePhotoUri = null,
}: Step1PersonalProfileProps) {
  const { companies, picklists, loading: bootstrapLoading } = useAppBootstrap();
  const orgListLoading = bootstrapLoading && companies.length === 0;
  const maritalOptions = picklists.marital_status ?? [];
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fullLegalName, setFullLegalName] = useState('');
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [maritalStatus, setMaritalStatus] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [showMaritalModal, setShowMaritalModal] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    listItems?: string[];
  } | null>(null);
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(() => initialProfilePhotoUri ?? null);

  useEffect(() => {
    setProfilePhotoUri(initialProfilePhotoUri ?? null);
  }, [initialProfilePhotoUri]);

  const dobDefaultForPicker = useMemo(() => new Date(1990, 0, 1), []);

  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressPickingRef = useRef(false);
  const emailRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const fullLegalNameRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const emergencyNameRef = useRef<TextInput>(null);
  const emergencyPhoneRef = useRef<TextInput>(null);
  const emergencyRelationshipRef = useRef<TextInput>(null);

  const styles = createAccountScreenStyles;
  const dobMinimum = new Date(1900, 0, 1);
  const dobMaximum = new Date();

  const pickProfilePhoto = useCallback(() => {
    if (!ImagePicker.launchImageLibrary) {
      setBlockingAlert({
        title: 'Image picker not available',
        message: 'Please fully rebuild the app after installing react-native-image-picker.',
      });
      return;
    }
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: 1,
      },
      (res) => {
        if (res.didCancel || res.errorCode || !res.assets?.[0]?.uri) {
          return;
        }
        setProfilePhotoUri(res.assets[0].uri);
      },
    );
  }, []);

  const submitStep1 = useCallback(() => {
    const missing: string[] = [];
    if (!companySlug) missing.push('Company');
    if (!profilePhotoUri) missing.push('Profile photo');
    if (isBlank(email)) missing.push('Email address');
    if (isBlank(phone)) missing.push('Phone number');
    if (isBlank(fullLegalName)) missing.push('Full legal name');
    if (!dobDate) missing.push('Date of birth');
    if (!sex) missing.push('Sex');
    if (isBlank(maritalStatus)) missing.push('Marital status');
    if (isBlank(address)) missing.push('Address');
    if (isBlank(emergencyContactName)) missing.push('Emergency contact name');
    if (isBlank(emergencyContactPhone)) missing.push('Emergency contact phone');
    if (isBlank(emergencyContactRelationship)) missing.push('Emergency contact relationship');

    if (missing.length > 0) {
      setBlockingAlert({
        title: 'Complete required fields',
        ...missingFieldsAlert(missing),
      });
      return;
    }

    const org = companies.find((c) => c.slug === companySlug);
    if (!org) {
      setBlockingAlert({
        title: 'Select company',
        message: 'Organization list is still loading or unavailable.',
      });
      return;
    }
    onNext(
      {
        companySlug,
        registrationCompanySlug: companySlug,
        registrationCompanyAppKey: org.appKey ?? undefined,
        companyName: org.name,
        email: email.trim(),
        phone: phone.trim(),
        fullLegalName: fullLegalName.trim(),
        dateOfBirth: dobDate ? formatDateToDisplay(dobDate) : undefined,
        sex: sex ?? undefined,
        maritalStatus: maritalStatus.trim() || undefined,
        address: address.trim(),
        emergencyContactName: emergencyContactName.trim(),
        emergencyContactPhone: emergencyContactPhone.trim(),
        emergencyContactRelationship: emergencyContactRelationship.trim(),
      },
      profilePhotoUri ? { profilePhotoUri } : undefined,
    );
  }, [
    onNext,
    companySlug,
    companies,
    email,
    phone,
    fullLegalName,
    dobDate,
    sex,
    maritalStatus,
    address,
    emergencyContactName,
    emergencyContactPhone,
    emergencyContactRelationship,
    profilePhotoUri,
  ]);

  useEffect(() => {
    return () => {
      if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    };
  }, []);

  const applyAddressSuggestion = useCallback((item: AddressSuggestion) => {
    addressPickingRef.current = true;
    setAddress(item.displayName);
    setAddressSuggestions([]);
    setAddressSearchLoading(false);
    if (addressDebounceRef.current) {
      clearTimeout(addressDebounceRef.current);
      addressDebounceRef.current = null;
    }
    requestAnimationFrame(() => {
      addressPickingRef.current = false;
    });
  }, []);

  const onAddressChangeText = useCallback((text: string) => {
    setAddress(text);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);

    const trimmed = text.trim();
    if (trimmed.length < 3) {
      setAddressSuggestions([]);
      setAddressSearchLoading(false);
      return;
    }

    addressDebounceRef.current = setTimeout(() => {
      setAddressSearchLoading(true);
      setAddressSuggestions([]);
      searchAddressSuggestions(text)
        .then((results) => {
          setAddressSuggestions(results);
        })
        .catch(() => {
          setAddressSuggestions([]);
        })
        .finally(() => {
          setAddressSearchLoading(false);
        });
    }, 500);
  }, []);

  const onAddressBlur = useCallback(() => {
    setTimeout(() => {
      if (!addressPickingRef.current) {
        setAddressSuggestions([]);
      }
    }, 200);
  }, []);

  const step1Complete =
    Boolean(companySlug) &&
    Boolean(profilePhotoUri) &&
    !isBlank(email) &&
    !isBlank(phone) &&
    !isBlank(fullLegalName) &&
    Boolean(dobDate) &&
    Boolean(sex) &&
    !isBlank(maritalStatus) &&
    !isBlank(address) &&
    !isBlank(emergencyContactName) &&
    !isBlank(emergencyContactPhone) &&
    !isBlank(emergencyContactRelationship);

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
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>
            Let's start with the basics to set up your digital employee ID.
          </Text>

          <View style={styles.photoSection}>
            <View style={styles.photoWrapper}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={pickProfilePhoto}
                accessibilityRole="button"
                accessibilityLabel={profilePhotoUri ? 'Change profile photo' : 'Add profile photo'}
              >
                <View style={styles.photoCircle}>
                  {profilePhotoUri ? (
                    <Image
                      source={{ uri: profilePhotoUri }}
                      style={styles.photoCircleImage}
                      resizeMode="cover"
                    />
                  ) : null}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoAddBtn}
                activeOpacity={0.85}
                onPress={pickProfilePhoto}
                accessibilityLabel="Choose photo from library"
              >
                <Feather name={profilePhotoUri ? 'edit-2' : 'plus'} size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.uploadLabel}>
              {profilePhotoUri ? 'Photo added — tap to change' : 'Upload Photo *'}
            </Text>
          </View>

          <View style={styles.step1CompanyPickerWrap}>
            <CompanyPicker
              variant="createAccount"
              companies={companies}
              listingLoading={orgListLoading}
              value={companySlug}
              onChange={onCompanySlugChange}
            />
          </View>

          <Text style={styles.fieldLabel}>Email address *</Text>
          <Pressable style={styles.input} onPress={() => emailRef.current?.focus()}>
            <TextInput
              ref={emailRef}
              style={styles.inputField}
              placeholder="user@email.com"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => phoneRef.current?.focus()}
            />
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Phone number *</Text>
          <Pressable style={styles.input} onPress={() => phoneRef.current?.focus()}>
            <TextInput
              ref={phoneRef}
              style={styles.inputField}
              placeholder="Mobile or contact number"
              placeholderTextColor="#9CA3AF"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => fullLegalNameRef.current?.focus()}
            />
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Full Legal Name *</Text>
          <Pressable style={styles.input} onPress={() => fullLegalNameRef.current?.focus()}>
            <TextInput
              ref={fullLegalNameRef}
              style={styles.inputField}
              placeholder="e.g. Alex Rivera"
              placeholderTextColor="#9CA3AF"
              value={fullLegalName}
              onChangeText={setFullLegalName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => addressRef.current?.focus()}
            />
          </Pressable>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Date of Birth *</Text>
          <ThemedDatePickerField
            value={dobDate ? formatDateToDisplay(dobDate) : ''}
            onChange={(s) => {
              const d = parseDisplayDateToDate(s);
              if (d) {
                setDobDate(d);
              }
            }}
            minimumDate={dobMinimum}
            maximumDate={dobMaximum}
            defaultPickerDate={dobDefaultForPicker}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Sex *</Text>
          <View style={styles.sexRow}>
            <TouchableOpacity
              style={[styles.sexOption, sex === 'male' && styles.sexOptionActive]}
              onPress={() => setSex('male')}
              activeOpacity={0.7}
            >
              <Text style={[styles.sexOptionText, sex === 'male' && styles.sexOptionTextActive]}>Male</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sexOption, sex === 'female' && styles.sexOptionActive]}
              onPress={() => setSex('female')}
              activeOpacity={0.7}
            >
              <Text style={[styles.sexOptionText, sex === 'female' && styles.sexOptionTextActive]}>Female</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Marital Status *</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowMaritalModal(true)} activeOpacity={0.8}>
            <Text style={[styles.inputField, !maritalStatus && { color: '#9CA3AF' }]}>
              {maritalStatus || 'Select marital status'}
            </Text>
            <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
          </TouchableOpacity>
          <Modal visible={showMaritalModal} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setShowMaritalModal(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {maritalOptions.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.modalOption, idx === maritalOptions.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setMaritalStatus(opt.value);
                        setShowMaritalModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Address *</Text>
          <Text style={styles.addressSuggestHint}>
            Start typing — matching addresses are suggested (OpenStreetMap).
          </Text>
          <View style={styles.addressSuggestWrap}>
            <Pressable
              style={[styles.input, styles.inputMultiline]}
              onPress={() => addressRef.current?.focus()}
            >
              <TextInput
                ref={addressRef}
                style={[styles.inputField, styles.inputFieldMultiline]}
                placeholder="Street address, suburb, state, postcode"
                placeholderTextColor="#9CA3AF"
                value={address}
                onChangeText={onAddressChangeText}
                onBlur={onAddressBlur}
                multiline={false}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => emergencyNameRef.current?.focus()}
                autoCorrect={false}
              />
            </Pressable>
            {(addressSearchLoading || addressSuggestions.length > 0) && (
              <View style={styles.addressSuggestDropdown} pointerEvents="box-none">
                {addressSearchLoading && addressSuggestions.length === 0 ? (
                  <View style={styles.addressSuggestLoadingRow}>
                    <ActivityIndicator size="small" color="#0056D2" />
                    <Text style={styles.addressSuggestLoadingText}>Searching addresses…</Text>
                  </View>
                ) : (
                  <ScrollView
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="always"
                    style={styles.addressSuggestScroll}
                    showsVerticalScrollIndicator
                  >
                    {addressSuggestions.map((item, idx) => (
                      <TouchableOpacity
                        key={`${item.placeId}-${idx}`}
                        style={[
                          styles.addressSuggestRow,
                          idx === addressSuggestions.length - 1 ? styles.addressSuggestRowLast : null,
                        ]}
                        activeOpacity={0.7}
                        onPress={() => applyAddressSuggestion(item)}
                      >
                        <Text style={styles.addressSuggestText}>{item.displayName}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>Emergency Contact</Text>
          <Text style={styles.fieldHint}>Name *</Text>
          <Pressable style={styles.input} onPress={() => emergencyNameRef.current?.focus()}>
            <TextInput
              ref={emergencyNameRef}
              style={styles.inputField}
              placeholder="Full name"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactName}
              onChangeText={setEmergencyContactName}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emergencyPhoneRef.current?.focus()}
            />
          </Pressable>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Phone *</Text>
          <Pressable style={styles.input} onPress={() => emergencyPhoneRef.current?.focus()}>
            <TextInput
              ref={emergencyPhoneRef}
              style={styles.inputField}
              placeholder="Phone number"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactPhone}
              onChangeText={setEmergencyContactPhone}
              keyboardType="phone-pad"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => emergencyRelationshipRef.current?.focus()}
            />
          </Pressable>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Relationship *</Text>
          <Pressable style={styles.input} onPress={() => emergencyRelationshipRef.current?.focus()}>
            <TextInput
              ref={emergencyRelationshipRef}
              style={styles.inputField}
              placeholder="e.g. Spouse, Parent, Sibling"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactRelationship}
              onChangeText={setEmergencyContactRelationship}
              returnKeyType="done"
              onSubmitEditing={submitStep1}
            />
          </Pressable>

          <TouchableOpacity
            style={[styles.saveBtn, !step1Complete && { opacity: 0.6 }]}
            activeOpacity={0.88}
            onPress={submitStep1}
          >
            <Text style={styles.saveBtnText}>Save & Continue</Text>
            <Feather name="arrow-right" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>

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
    </>
  );
}
