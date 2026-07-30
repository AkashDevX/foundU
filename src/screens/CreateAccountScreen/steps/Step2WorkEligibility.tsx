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
import { isBlank, missingFieldsAlert } from '../validation';

const profileBlue = '#0056D2';

type IdDocument = {
  id: string;
  type: string;
  imageUri: string | null;
};

const WEEK_SCHEDULE_DAYS = [
  { id: 'Mon', letter: 'Mo' },
  { id: 'Tue', letter: 'Tu' },
  { id: 'Wed', letter: 'We' },
  { id: 'Thu', letter: 'Th' },
  { id: 'Fri', letter: 'Fr' },
  { id: 'Sat', letter: 'Sa' },
  { id: 'Sun', letter: 'Su' },
] as const;

type TimeSlotKey = 'morning' | 'evening';

const TIME_SLOTS: { key: TimeSlotKey; title: string; range: string; icon: 'sun' | 'moon' }[] = [
  { key: 'morning', title: 'Morning', range: '6:00 AM – 11:00 AM', icon: 'sun' },
  { key: 'evening', title: 'Evening', range: '5:00 PM – 10:00 PM', icon: 'moon' },
];

function makeEmptyWeeklySlots(): Record<string, Set<TimeSlotKey>> {
  return Object.fromEntries(WEEK_SCHEDULE_DAYS.map((d) => [d.id, new Set<TimeSlotKey>()]));
}

interface Step2WorkEligibilityProps {
  onNext: RegistrationWizardNext;
}

function summarizeWeeklySlots(weekly: Record<string, Set<TimeSlotKey>>): string {
  const parts: string[] = [];
  for (const d of WEEK_SCHEDULE_DAYS) {
    const set = weekly[d.id];
    if (!set || set.size === 0) continue;
    const slotLabels = [...set].map((k) => (k === 'morning' ? 'Morning' : 'Evening'));
    parts.push(`${d.id}: ${slotLabels.join(', ')}`);
  }
  return parts.length ? parts.join(' · ') : '';
}

function summarizeIdDocs(docs: IdDocument[]): string {
  return docs
    .filter((d) => d.type)
    .map((d) => (d.imageUri ? `${d.type} (uploaded)` : d.type))
    .join(' · ');
}

export function Step2WorkEligibility({ onNext }: Step2WorkEligibilityProps) {
  const { picklists } = useAppBootstrap();
  const visaOptions = picklists.visa_status ?? [];
  const idTypeOptions = picklists.id_document_type ?? [];

  const [visaStatus, setVisaStatus] = useState('');
  const [hasUnrestrictedWorkRights, setHasUnrestrictedWorkRights] = useState<boolean | null>(null);
  const [visaExpiry, setVisaExpiry] = useState('');
  const [idDocuments, setIdDocuments] = useState<IdDocument[]>([
    { id: '1', type: '', imageUri: null },
    { id: '2', type: '', imageUri: null },
  ]);
  const [activeIdModalDocId, setActiveIdModalDocId] = useState<string | null>(null);
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [weeklySlots, setWeeklySlots] = useState<Record<string, Set<TimeSlotKey>>>(() => makeEmptyWeeklySlots());
  const [showVisaModal, setShowVisaModal] = useState(false);
  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    listItems?: string[];
  } | null>(null);
  const hoursPerWeekRef = useRef<TextInput>(null);

  const styles = createAccountScreenStyles;

  const visaExpiryMinDate = startOfToday();
  const visaExpiryMaxDate = addYears(visaExpiryMinDate, 50);
  const visaExpiryDefaultDate = addYears(visaExpiryMinDate, 2);

  const updateIdDoc = (docId: string, updates: Partial<IdDocument>) => {
    setIdDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, ...updates } : d))
    );
  };

  const addIdDocument = () => {
    setIdDocuments((prev) => [
      ...prev,
      { id: String(Date.now()), type: '', imageUri: null },
    ]);
  };

  const removeIdDocument = (docId: string) => {
    setIdDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      return next.length >= 2 ? next : prev;
    });
  };

  const openIdTypeModal = (docId: string) => setActiveIdModalDocId(docId);
  const closeIdTypeModal = () => setActiveIdModalDocId(null);

  const pickImageForDoc = (docId: string) => {
    if (!ImagePicker.launchImageLibrary) {
      setBlockingAlert({
        title: 'Image picker not available',
        message:
          'Please fully rebuild the app after installing react-native-image-picker. Stop the app, run "npx react-native run-android" (or run-ios), then try again.',
      });
      return;
    }
    ImagePicker.launchImageLibrary({ mediaType: 'photo' }, (res) => {
      if (res.didCancel || res.errorCode || !res.assets?.[0]?.uri) return;
      updateIdDoc(docId, { imageUri: res.assets[0].uri });
    });
  };

  const validIdCount = idDocuments.filter((d) => d.type && d.imageUri).length;
  const minIdMet = validIdCount >= 2;
  const idDocsComplete = idDocuments.every(
    (d) => (isBlank(d.type) && !d.imageUri) || (d.type && d.imageUri),
  );

  const toggleWeeklySlot = (dayId: string, slot: TimeSlotKey) => {
    setWeeklySlots((prev) => {
      const nextSet = new Set(prev[dayId] ?? []);
      if (nextSet.has(slot)) nextSet.delete(slot);
      else nextSet.add(slot);
      return { ...prev, [dayId]: nextSet };
    });
  };

  const selectedSlotCount = WEEK_SCHEDULE_DAYS.reduce(
    (acc, d) => acc + (weeklySlots[d.id]?.size ?? 0),
    0,
  );

  const step2Complete =
    !isBlank(visaStatus) &&
    hasUnrestrictedWorkRights !== null &&
    (hasUnrestrictedWorkRights !== false || !isBlank(visaExpiry)) &&
    minIdMet &&
    idDocsComplete &&
    !isBlank(hoursPerWeek) &&
    selectedSlotCount > 0;

  const handleSave = useCallback(() => {
    const missing: string[] = [];
    if (isBlank(visaStatus)) missing.push('Visa status');
    if (hasUnrestrictedWorkRights === null) {
      missing.push('Unrestricted work rights');
    } else if (hasUnrestrictedWorkRights === false && isBlank(visaExpiry)) {
      missing.push('Visa expiry date');
    }
    if (!minIdMet) {
      missing.push('At least 2 ID documents (type and image each)');
    } else if (!idDocsComplete) {
      missing.push('Complete all ID document fields (type and image)');
    }
    if (isBlank(hoursPerWeek)) missing.push('Hours per week');
    if (selectedSlotCount === 0) missing.push('At least one weekly time block');

    if (missing.length > 0) {
      setBlockingAlert({
        title: 'Complete required fields',
        ...missingFieldsAlert(missing),
      });
      return;
    }
    const weeklyAvailabilityJson = Object.fromEntries(
      WEEK_SCHEDULE_DAYS.map((d) => [d.id, [...(weeklySlots[d.id] ?? [])]]),
    );

    const idDocumentsJson = idDocuments
      .filter((d) => d.type)
      .map((d) => ({
        documentKey: d.id,
        idType: d.type,
        imageUploaded: Boolean(d.imageUri),
      }));

    const idDocumentByKey: Record<string, string> = {};
    for (const d of idDocuments) {
      if (d.type && d.imageUri) {
        idDocumentByKey[d.id] = d.imageUri;
      }
    }

    onNext({
      visaStatus: visaStatus || undefined,
      unrestrictedWorkRights:
        hasUnrestrictedWorkRights === null ? undefined : hasUnrestrictedWorkRights ? 'Yes' : 'No',
      visaExpiry: visaExpiry.trim() || undefined,
      hoursPerWeek: hoursPerWeek.trim() || undefined,
      weeklyAvailabilitySummary: summarizeWeeklySlots(weeklySlots) || undefined,
      weeklyAvailabilityJson,
      idDocumentsSummary: summarizeIdDocs(idDocuments) || undefined,
      idDocumentsJson,
    }, { idDocumentByKey });
  }, [
    minIdMet,
    idDocsComplete,
    onNext,
    visaStatus,
    hasUnrestrictedWorkRights,
    visaExpiry,
    hoursPerWeek,
    weeklySlots,
    idDocuments,
    selectedSlotCount,
  ]);

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
          <Text style={styles.title}>Work eligibility</Text>
          <Text style={styles.subtitle}>
            Tell us about your work rights and identification so we can verify your eligibility.
          </Text>

          <Text style={styles.fieldLabel}>Visa Status *</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowVisaModal(true)} activeOpacity={0.8}>
            <Text style={[styles.inputField, !visaStatus && { color: '#9CA3AF' }]}>
              {visaStatus || 'Select visa status'}
            </Text>
            <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
          </TouchableOpacity>

          <Modal visible={showVisaModal} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setShowVisaModal(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {visaOptions.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.modalOption, idx === visaOptions.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setVisaStatus(opt.value);
                        setShowVisaModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Unrestricted work rights in Australia *</Text>
          <View style={styles.sexRow}>
            <TouchableOpacity
              style={[styles.sexOption, hasUnrestrictedWorkRights === true && styles.sexOptionActive]}
              onPress={() => setHasUnrestrictedWorkRights(true)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sexOptionText, hasUnrestrictedWorkRights === true && styles.sexOptionTextActive]}>
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sexOption, hasUnrestrictedWorkRights === false && styles.sexOptionActive]}
              onPress={() => setHasUnrestrictedWorkRights(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.sexOptionText, hasUnrestrictedWorkRights === false && styles.sexOptionTextActive]}>
                No
              </Text>
            </TouchableOpacity>
          </View>

          {hasUnrestrictedWorkRights === false && (
            <>
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Visa expiry date *</Text>
              <ThemedDatePickerField
                value={visaExpiry}
                onChange={setVisaExpiry}
                minimumDate={visaExpiryMinDate}
                maximumDate={visaExpiryMaxDate}
                defaultPickerDate={visaExpiryDefaultDate}
              />
            </>
          )}

          <Text style={[styles.fieldLabel, styles.idDocSection]}>ID Information *</Text>
          <Text style={styles.fieldHint}>Driver's Licence, Passport, Medicare, 18+ Card (Minimum 2 required)</Text>
          {idDocuments.map((doc) => (
            <View key={doc.id} style={styles.idDocCard}>
              <View style={styles.idDocCardHeader}>
                <Text style={styles.idDocCardLabel}>Document {idDocuments.indexOf(doc) + 1} *</Text>
                {idDocuments.length > 2 && (
                  <TouchableOpacity style={styles.idDocRemoveBtn} onPress={() => removeIdDocument(doc.id)}>
                    <Feather name="trash-2" size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>ID Type *</Text>
              <TouchableOpacity
                style={[styles.input, { marginBottom: spacing.lg }]}
                onPress={() => openIdTypeModal(doc.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.inputField, !doc.type && { color: '#9CA3AF' }]}>
                  {doc.type || 'Select ID type'}
                </Text>
                <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
              </TouchableOpacity>
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document / image *</Text>
              <TouchableOpacity
                style={[styles.idDocUploadArea, doc.imageUri && styles.idDocUploadAreaFilled]}
                onPress={() => pickImageForDoc(doc.id)}
                activeOpacity={0.8}
              >
                {doc.imageUri ? (
                  <Image source={{ uri: doc.imageUri }} style={styles.idDocImage} resizeMode="cover" />
                ) : (
                  <>
                    <Feather name="upload" size={32} color="#9CA3AF" />
                    <Text style={styles.idDocUploadText}>Tap to upload</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.idDocAddBtn} onPress={addIdDocument} activeOpacity={0.7}>
            <Feather name="plus" size={18} color={profileBlue} />
            <Text style={styles.idDocAddBtnText}>Add another ID</Text>
          </TouchableOpacity>
          {!minIdMet && (
            <Text style={[styles.idDocMinHint, { color: '#EF4444' }]}>
              Please upload at least 2 ID documents with type selected
            </Text>
          )}
          {minIdMet && <Text style={styles.idDocMinHint}>{validIdCount} of minimum 2 documents uploaded</Text>}

          <Modal visible={!!activeIdModalDocId} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={closeIdTypeModal}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {idTypeOptions.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.modalOption, idx === idTypeOptions.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        if (activeIdModalDocId) {
                          updateIdDoc(activeIdModalDocId, { type: opt.value });
                          closeIdTypeModal();
                        }
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>Availability</Text>
          <Text style={styles.fieldHint}>Hours per week (target) *</Text>
          <Pressable style={styles.input} onPress={() => hoursPerWeekRef.current?.focus()}>
            <TextInput
              ref={hoursPerWeekRef}
              style={styles.inputField}
              placeholder="e.g. 20, 38"
              placeholderTextColor="#9CA3AF"
              value={hoursPerWeek}
              onChangeText={setHoursPerWeek}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          </Pressable>

          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Weekly schedule *</Text>
          <View style={styles.scheduleCalendarCard}>
            <Text style={styles.scheduleCalendarTitle}>Tap days & time blocks</Text>
            <Text style={styles.scheduleCalendarHint}>
              Build a simple week view: choose morning or evening (or both) for each day you can work.
            </Text>

            <View style={styles.scheduleWeekHeader}>
              {WEEK_SCHEDULE_DAYS.map((d) => (
                <View key={d.id} style={styles.scheduleWeekHeaderCell}>
                  <Text style={styles.scheduleWeekHeaderText}>{d.letter}</Text>
                </View>
              ))}
            </View>

            {TIME_SLOTS.map((slot) => (
              <View key={slot.key} style={styles.scheduleSlotBlock}>
                <View style={styles.scheduleSlotLabelRow}>
                  <Feather
                    name={slot.icon}
                    size={18}
                    color={profileBlue}
                  />
                  <View style={styles.scheduleSlotLabelTextWrap}>
                    <Text style={styles.scheduleSlotTitle}>{slot.title}</Text>
                    <Text style={styles.scheduleSlotTime}>{slot.range}</Text>
                  </View>
                </View>
                <View style={styles.scheduleGridRow}>
                  {WEEK_SCHEDULE_DAYS.map((d) => {
                    const active = weeklySlots[d.id]?.has(slot.key) ?? false;
                    return (
                      <TouchableOpacity
                        key={`${d.id}-${slot.key}`}
                        style={[styles.scheduleCell, active && styles.scheduleCellActive]}
                        onPress={() => toggleWeeklySlot(d.id, slot.key)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={`${d.id} ${slot.title} ${active ? 'selected' : 'not selected'}`}
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.scheduleCellText, active && styles.scheduleCellTextActive]}>
                          {active ? '✓' : '—'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}

            <Text style={styles.scheduleSummary}>
              {selectedSlotCount === 0
                ? 'No time blocks selected yet.'
                : `${selectedSlotCount} time block${selectedSlotCount === 1 ? '' : 's'} selected across the week.`}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, !step2Complete && { opacity: 0.6 }]}
            activeOpacity={0.88}
            onPress={handleSave}
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
