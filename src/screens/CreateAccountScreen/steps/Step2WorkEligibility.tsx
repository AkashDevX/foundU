import React, { useState } from 'react';
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
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';

const profileBlue = '#0056D2';

type IdDocumentType = "Driver's Licence" | 'Passport' | 'Medicare' | '18+ Card';

type IdDocument = {
  id: string;
  type: IdDocumentType | '';
  imageUri: string | null;
};

const ID_TYPE_OPTIONS: IdDocumentType[] = ["Driver's Licence", 'Passport', 'Medicare', '18+ Card'];

const VISA_OPTIONS = [
  'Australian Citizen',
  'Permanent Resident',
  'Temporary Visa - Working',
  'Temporary Visa - Student',
  'Working Holiday Visa',
  'Other',
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const SHIFT_OPTIONS = ['Morning', 'Afternoon', 'Evening', 'Night', 'Flexible', 'Any'];

interface Step2WorkEligibilityProps {
  onNext: () => void;
}

export function Step2WorkEligibility({ onNext }: Step2WorkEligibilityProps) {
  const [visaStatus, setVisaStatus] = useState('');
  const [hasUnrestrictedWorkRights, setHasUnrestrictedWorkRights] = useState<boolean | null>(null);
  const [visaExpiry, setVisaExpiry] = useState('');
  const [idDocuments, setIdDocuments] = useState<IdDocument[]>([
    { id: '1', type: '', imageUri: null },
    { id: '2', type: '', imageUri: null },
  ]);
  const [activeIdModalDocId, setActiveIdModalDocId] = useState<string | null>(null);
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [daysAvailable, setDaysAvailable] = useState<Set<string>>(new Set());
  const [preferredShift, setPreferredShift] = useState('');
  const [showVisaModal, setShowVisaModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const styles = createAccountScreenStyles;

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
      Alert.alert(
        'Image picker not available',
        'Please fully rebuild the app after installing react-native-image-picker. Stop the app, run "npx react-native run-android" (or run-ios), then try again.',
      );
      return;
    }
    ImagePicker.launchImageLibrary({ mediaType: 'photo' }, (res) => {
      if (res.didCancel || res.errorCode || !res.assets?.[0]?.uri) return;
      updateIdDoc(docId, { imageUri: res.assets[0].uri });
    });
  };

  const validIdCount = idDocuments.filter((d) => d.type && d.imageUri).length;
  const minIdMet = validIdCount >= 2;
  const VALIDATION_ENABLED = false; // TODO: Re-enable for production

  const toggleDay = (day: string) => {
    setDaysAvailable((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  const handleSave = () => {
    if (VALIDATION_ENABLED && !minIdMet) {
      Alert.alert(
        'ID documents required',
        'Please upload at least 2 ID documents (Driver\'s Licence, Passport, Medicare, or 18+ Card) with both type selected and document image uploaded.',
      );
      return;
    }
    onNext();
  };

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
          <Text style={styles.title}>Work eligibility</Text>
          <Text style={styles.subtitle}>
            Tell us about your work rights and identification so we can verify your eligibility.
          </Text>

          <Text style={styles.fieldLabel}>Visa Status</Text>
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
                  {VISA_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === VISA_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setVisaStatus(opt);
                        setShowVisaModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Unrestricted work rights in Australia</Text>
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
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Visa expiry date</Text>
              <View style={styles.input}>
                <TextInput
                  style={styles.inputField}
                  placeholder="MM / DD / YYYY"
                  placeholderTextColor="#9CA3AF"
                  value={visaExpiry}
                  onChangeText={setVisaExpiry}
                />
                <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
              </View>
            </>
          )}

          <Text style={[styles.fieldLabel, styles.idDocSection]}>ID Information</Text>
          <Text style={styles.fieldHint}>Driver's Licence, Passport, Medicare, 18+ Card (Minimum 2 required)</Text>
          {idDocuments.map((doc) => (
            <View key={doc.id} style={styles.idDocCard}>
              <View style={styles.idDocCardHeader}>
                <Text style={styles.idDocCardLabel}>Document {idDocuments.indexOf(doc) + 1}</Text>
                {idDocuments.length > 2 && (
                  <TouchableOpacity style={styles.idDocRemoveBtn} onPress={() => removeIdDocument(doc.id)}>
                    <Feather name="trash-2" size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>ID Type</Text>
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
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document / image</Text>
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
                  {ID_TYPE_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === ID_TYPE_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        if (activeIdModalDocId) {
                          updateIdDoc(activeIdModalDocId, { type: opt });
                          closeIdTypeModal();
                        }
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>Availability</Text>
          <Text style={styles.fieldHint}>Hours per week</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="e.g. 20, 38"
              placeholderTextColor="#9CA3AF"
              value={hoursPerWeek}
              onChangeText={setHoursPerWeek}
              keyboardType="number-pad"
            />
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Days available</Text>
          <View style={styles.daysRow}>
            {DAYS.map((day) => (
              <TouchableOpacity
                key={day}
                style={[styles.dayChip, daysAvailable.has(day) && styles.dayChipActive]}
                onPress={() => toggleDay(day)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayChipText, daysAvailable.has(day) && styles.dayChipTextActive]}>{day}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Preferred shift</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowShiftModal(true)} activeOpacity={0.8}>
            <Text style={[styles.inputField, !preferredShift && { color: '#9CA3AF' }]}>
              {preferredShift || 'Select preferred shift'}
            </Text>
            <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
          </TouchableOpacity>

          <Modal visible={showShiftModal} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setShowShiftModal(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {SHIFT_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === SHIFT_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        setPreferredShift(opt);
                        setShowShiftModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <TouchableOpacity
            style={[styles.saveBtn, VALIDATION_ENABLED && !minIdMet && { opacity: 0.6 }]}
            activeOpacity={0.88}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>Save & Continue</Text>
            <Feather name="arrow-right" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
