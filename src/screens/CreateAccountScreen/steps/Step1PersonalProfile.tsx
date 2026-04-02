import React, { useRef, useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Feather from 'react-native-vector-icons/Feather';
import { spacing, colors, fontFamily } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import { CompanyPicker } from '../../../components/CompanyPicker';
import { searchAddressSuggestions, type AddressSuggestion } from '../../../services/nominatim';

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'De Facto', 'Separated'];

const defaultDobDate = () => new Date(1990, 0, 1);

function formatDobDisplay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm} / ${dd} / ${yyyy}`;
}

interface Step1PersonalProfileProps {
  onNext: () => void;
  companyId: string | null;
  onCompanyChange: (companyId: string) => void;
}

export function Step1PersonalProfile({ onNext, companyId, onCompanyChange }: Step1PersonalProfileProps) {
  const [fullLegalName, setFullLegalName] = useState('');
  const [dobDate, setDobDate] = useState<Date | null>(null);
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [draftDob, setDraftDob] = useState(defaultDobDate);
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [maritalStatus, setMaritalStatus] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [showMaritalModal, setShowMaritalModal] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [addressSearchLoading, setAddressSearchLoading] = useState(false);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addressPickingRef = useRef(false);
  const addressRef = useRef<TextInput>(null);
  const emergencyNameRef = useRef<TextInput>(null);
  const emergencyPhoneRef = useRef<TextInput>(null);
  const emergencyRelationshipRef = useRef<TextInput>(null);

  const styles = createAccountScreenStyles;
  const dobMinimum = new Date(1900, 0, 1);
  const dobMaximum = new Date();

  const openDobPicker = () => {
    setDraftDob(dobDate ?? defaultDobDate());
    setShowDobPicker(true);
  };

  const onAndroidDobChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDobPicker(false);
    if (event.type === 'dismissed') return;
    if (selectedDate) setDobDate(selectedDate);
  };

  const onIosDobChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (selectedDate) setDraftDob(selectedDate);
  };

  const confirmIosDob = () => {
    setDobDate(draftDob);
    setShowDobPicker(false);
  };

  const dismissIosDobPicker = () => {
    setShowDobPicker(false);
  };

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Complete your profile</Text>
          <Text style={styles.subtitle}>
            Let's start with the basics to set up your digital employee ID.
          </Text>

          <View style={styles.photoSection}>
            <View style={styles.photoWrapper}>
              <View style={styles.photoCircle} />
              <TouchableOpacity style={styles.photoAddBtn} activeOpacity={0.8}>
                <Feather name="plus" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.uploadLabel}>Upload Photo</Text>
          </View>

          <View style={styles.step1CompanyPickerWrap}>
            <CompanyPicker variant="createAccount" value={companyId} onChange={onCompanyChange} />
          </View>

          <Text style={styles.fieldLabel}>Full Legal Name</Text>
          <View style={styles.input}>
            <TextInput
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
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Date of Birth</Text>
          <TouchableOpacity style={styles.input} onPress={openDobPicker} activeOpacity={0.8}>
            <Text style={[styles.inputField, !dobDate && { color: '#9CA3AF' }]}>
              {dobDate ? formatDobDisplay(dobDate) : 'MM / DD / YYYY'}
            </Text>
            <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
          </TouchableOpacity>

          {Platform.OS === 'android' && showDobPicker ? (
            <DateTimePicker
              value={dobDate ?? defaultDobDate()}
              mode="date"
              display="default"
              onChange={onAndroidDobChange}
              maximumDate={dobMaximum}
              minimumDate={dobMinimum}
            />
          ) : null}

          <Modal visible={Platform.OS === 'ios' && showDobPicker} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={dismissIosDobPicker}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <DateTimePicker
                    value={draftDob}
                    mode="date"
                    display="spinner"
                    onChange={onIosDobChange}
                    maximumDate={dobMaximum}
                    minimumDate={dobMinimum}
                    themeVariant="light"
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      gap: spacing.xl,
                      marginTop: spacing.md,
                      paddingTop: spacing.lg,
                      borderTopWidth: 1,
                      borderTopColor: '#E5E7EB',
                    }}
                  >
                    <TouchableOpacity onPress={dismissIosDobPicker} hitSlop={12}>
                      <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.text.secondary }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmIosDob} hitSlop={12}>
                      <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 16, color: '#0056D2' }}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Sex</Text>
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

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Marital Status</Text>
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
                  {MARITAL_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === MARITAL_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setMaritalStatus(opt);
                        setShowMaritalModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Address</Text>
          <Text style={styles.addressSuggestHint}>
            Start typing — matching addresses are suggested (OpenStreetMap).
          </Text>
          <View style={styles.addressSuggestWrap}>
            <View style={[styles.input, styles.inputMultiline]}>
              <TextInput
                ref={addressRef}
                style={[styles.inputField, styles.inputFieldMultiline]}
                placeholder="Street address, suburb, state, postcode"
                placeholderTextColor="#9CA3AF"
                value={address}
                onChangeText={onAddressChangeText}
                onBlur={onAddressBlur}
                multiline
                numberOfLines={3}
                returnKeyType="next"
                blurOnSubmit
                onSubmitEditing={() => emergencyNameRef.current?.focus()}
                autoCorrect={false}
              />
            </View>
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
                    keyboardShouldPersistTaps="handled"
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
          <Text style={styles.fieldHint}>Name</Text>
          <View style={styles.input}>
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
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Phone</Text>
          <View style={styles.input}>
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
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Relationship</Text>
          <View style={styles.input}>
            <TextInput
              ref={emergencyRelationshipRef}
              style={styles.inputField}
              placeholder="e.g. Spouse, Parent, Sibling"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactRelationship}
              onChangeText={setEmergencyContactRelationship}
              returnKeyType="done"
              onSubmitEditing={onNext}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.88} onPress={onNext}>
            <Text style={styles.saveBtnText}>Save & Continue</Text>
            <Feather name="arrow-right" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
