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

const LICENCE_OPTIONS = ['RSA (Responsible Service of Alcohol)', 'Forklift Licence', 'First Aid', 'White Card', 'Other'];
const INSURANCE_OPTIONS = ['Public Liability', 'Professional Indemnity', 'Workers Compensation', 'Other'];

type DocWithExpiry = {
  id: string;
  imageUri: string | null;
  expiry: string;
};

type LicenceItem = {
  id: string;
  type: string;
  imageUri: string | null;
  expiry: string;
};

type InsuranceItem = {
  id: string;
  type: string;
  imageUri: string | null;
  expiry: string;
};

interface Step3QualificationsProps {
  onNext: () => void;
}

export function Step3Qualifications({ onNext }: Step3QualificationsProps) {
  const [policeCheck, setPoliceCheck] = useState<DocWithExpiry>({ id: 'pc', imageUri: null, expiry: '' });
  const [fitToWork, setFitToWork] = useState<DocWithExpiry>({ id: 'ftw', imageUri: null, expiry: '' });
  const [licences, setLicences] = useState<LicenceItem[]>([]);
  const [insurances, setInsurances] = useState<InsuranceItem[]>([]);
  const [showLicenceModal, setShowLicenceModal] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [activeLicenceId, setActiveLicenceId] = useState<string | null>(null);
  const [activeInsuranceId, setActiveInsuranceId] = useState<string | null>(null);

  const styles = createAccountScreenStyles;

  const pickImage = (onSelect: (uri: string) => void) => {
    if (!ImagePicker.launchImageLibrary) {
      Alert.alert(
        'Image picker not available',
        'Please fully rebuild the app after installing react-native-image-picker.',
      );
      return;
    }
    ImagePicker.launchImageLibrary({ mediaType: 'photo' }, (res) => {
      if (res.didCancel || res.errorCode || !res.assets?.[0]?.uri) return;
      onSelect(res.assets[0].uri);
    });
  };

  const addLicence = () => {
    const id = String(Date.now());
    setLicences((prev) => [...prev, { id, type: '', imageUri: null, expiry: '' }]);
    setActiveLicenceId(id);
    setShowLicenceModal(true);
  };

  const addInsurance = () => {
    const id = String(Date.now());
    setInsurances((prev) => [...prev, { id, type: '', imageUri: null, expiry: '' }]);
    setActiveInsuranceId(id);
    setShowInsuranceModal(true);
  };

  const updateLicence = (id: string, updates: Partial<LicenceItem>) => {
    setLicences((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const updateInsurance = (id: string, updates: Partial<InsuranceItem>) => {
    setInsurances((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const removeLicence = (id: string) => setLicences((prev) => prev.filter((l) => l.id !== id));
  const removeInsurance = (id: string) => setInsurances((prev) => prev.filter((i) => i.id !== id));

  const renderDocCard = (
    title: string,
    doc: DocWithExpiry,
    setDoc: (d: DocWithExpiry) => void,
    required?: boolean,
  ) => (
    <View key={doc.id} style={styles.idDocCard}>
      <Text style={styles.idDocCardLabel}>{title}{required ? ' *' : ''}</Text>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, doc.imageUri && styles.idDocUploadAreaFilled]}
        onPress={() => pickImage((uri) => setDoc({ ...doc, imageUri: uri }))}
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
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry date</Text>
      <View style={styles.input}>
        <TextInput
          style={styles.inputField}
          placeholder="MM / DD / YYYY"
          placeholderTextColor="#9CA3AF"
          value={doc.expiry}
          onChangeText={(expiry) => setDoc({ ...doc, expiry })}
        />
        <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
      </View>
    </View>
  );

  const renderLicenceCard = (item: LicenceItem) => (
    <View key={item.id} style={styles.idDocCard}>
      <View style={styles.idDocCardHeader}>
        <Text style={styles.idDocCardLabel}>Licence / Permit</Text>
        <TouchableOpacity style={styles.idDocRemoveBtn} onPress={() => removeLicence(item.id)}>
          <Feather name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Type</Text>
      <TouchableOpacity
        style={[styles.input, { marginBottom: spacing.lg }]}
        onPress={() => {
          setActiveLicenceId(item.id);
          setShowLicenceModal(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.inputField, !item.type && { color: '#9CA3AF' }]}>
          {item.type || 'Select type'}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, item.imageUri && styles.idDocUploadAreaFilled]}
        onPress={() => pickImage((uri) => updateLicence(item.id, { imageUri: uri }))}
        activeOpacity={0.8}
      >
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.idDocImage} resizeMode="cover" />
        ) : (
          <>
            <Feather name="upload" size={32} color="#9CA3AF" />
            <Text style={styles.idDocUploadText}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry date</Text>
      <View style={styles.input}>
        <TextInput
          style={styles.inputField}
          placeholder="MM / DD / YYYY"
          placeholderTextColor="#9CA3AF"
          value={item.expiry}
          onChangeText={(expiry) => updateLicence(item.id, { expiry })}
        />
        <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
      </View>
    </View>
  );

  const renderInsuranceCard = (item: InsuranceItem) => (
    <View key={item.id} style={styles.idDocCard}>
      <View style={styles.idDocCardHeader}>
        <Text style={styles.idDocCardLabel}>Insurance</Text>
        <TouchableOpacity style={styles.idDocRemoveBtn} onPress={() => removeInsurance(item.id)}>
          <Feather name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Type</Text>
      <TouchableOpacity
        style={[styles.input, { marginBottom: spacing.lg }]}
        onPress={() => {
          setActiveInsuranceId(item.id);
          setShowInsuranceModal(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.inputField, !item.type && { color: '#9CA3AF' }]}>
          {item.type || 'Select type'}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, item.imageUri && styles.idDocUploadAreaFilled]}
        onPress={() => pickImage((uri) => updateInsurance(item.id, { imageUri: uri }))}
        activeOpacity={0.8}
      >
        {item.imageUri ? (
          <Image source={{ uri: item.imageUri }} style={styles.idDocImage} resizeMode="cover" />
        ) : (
          <>
            <Feather name="upload" size={32} color="#9CA3AF" />
            <Text style={styles.idDocUploadText}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry date</Text>
      <View style={styles.input}>
        <TextInput
          style={styles.inputField}
          placeholder="MM / DD / YYYY"
          placeholderTextColor="#9CA3AF"
          value={item.expiry}
          onChangeText={(expiry) => updateInsurance(item.id, { expiry })}
        />
        <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
      </View>
    </View>
  );

  const VALIDATION_ENABLED = false; // TODO: Re-enable for production

  const handleSave = () => {
    if (VALIDATION_ENABLED && (!policeCheck.imageUri || !fitToWork.imageUri)) {
      Alert.alert(
        'Required documents',
        'Please upload both Police Check and Fit to Work Certificate.',
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
          <Text style={styles.title}>Qualifications</Text>
          <Text style={styles.subtitle}>
            Upload your licences, permits, certificates and compliance documents.
          </Text>

          {renderDocCard('Police Check', policeCheck, setPoliceCheck, true)}
          {renderDocCard('Fit to Work Certificate', fitToWork, setFitToWork, true)}

          <Text style={[styles.fieldLabel, styles.idDocSection]}>Licences & Permits</Text>
          <Text style={styles.fieldHint}>Add any relevant licences (e.g. RSA, Forklift, First Aid)</Text>
          {licences.map(renderLicenceCard)}
          <TouchableOpacity style={styles.idDocAddBtn} onPress={addLicence} activeOpacity={0.7}>
            <Feather name="plus" size={18} color={profileBlue} />
            <Text style={styles.idDocAddBtnText}>Add licence or permit</Text>
          </TouchableOpacity>

          <Text style={[styles.fieldLabel, styles.idDocSection]}>Insurances</Text>
          <Text style={styles.fieldHint}>Add any required insurance documents</Text>
          {insurances.map(renderInsuranceCard)}
          <TouchableOpacity style={styles.idDocAddBtn} onPress={addInsurance} activeOpacity={0.7}>
            <Feather name="plus" size={18} color={profileBlue} />
            <Text style={styles.idDocAddBtnText}>Add insurance</Text>
          </TouchableOpacity>

          <Modal visible={showLicenceModal} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setShowLicenceModal(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {LICENCE_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === LICENCE_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        if (activeLicenceId) updateLicence(activeLicenceId, { type: opt });
                        setShowLicenceModal(false);
                      }}
                    >
                      <Text style={styles.modalOptionText}>{opt}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableWithoutFeedback>
            </Pressable>
          </Modal>

          <Modal visible={showInsuranceModal} transparent animationType="fade">
            <Pressable style={styles.modalOverlay} onPress={() => setShowInsuranceModal(false)}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  {INSURANCE_OPTIONS.map((opt, idx) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.modalOption, idx === INSURANCE_OPTIONS.length - 1 ? styles.modalOptionLast : null]}
                      onPress={() => {
                        if (activeInsuranceId) updateInsurance(activeInsuranceId, { type: opt });
                        setShowInsuranceModal(false);
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
            style={[styles.saveBtn, VALIDATION_ENABLED && (!policeCheck.imageUri || !fitToWork.imageUri) && { opacity: 0.6 }]}
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
