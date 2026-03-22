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

const TRANSPORT_OPTIONS = ['Own vehicle', 'Public transport', 'Walking', 'Other'];

interface Step4EmploymentDetailsProps {
  onNext: () => void;
}

export function Step4EmploymentDetails({ onNext }: Step4EmploymentDetailsProps) {
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [modeOfTransport, setModeOfTransport] = useState('');
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [vehicleRegistration, setVehicleRegistration] = useState('');
  const [vehicleExpiry, setVehicleExpiry] = useState('');
  const [vehicleInsuranceUri, setVehicleInsuranceUri] = useState<string | null>(null);

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
          <Text style={styles.title}>Employment details</Text>
          <Text style={styles.subtitle}>
            Provide your bank details for pay and how you'll get to work.
          </Text>

          <Text style={styles.fieldLabel}>Bank Details</Text>
          <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Account name</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="Name on account"
              placeholderTextColor="#9CA3AF"
              value={accountName}
              onChangeText={setAccountName}
              autoCapitalize="words"
            />
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Account number</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="Enter account number"
              placeholderTextColor="#9CA3AF"
              value={accountNumber}
              onChangeText={setAccountNumber}
              keyboardType="number-pad"
            />
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Bank name</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="e.g. Commonwealth Bank"
              placeholderTextColor="#9CA3AF"
              value={bankName}
              onChangeText={setBankName}
              autoCapitalize="words"
            />
          </View>

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
              <View style={styles.input}>
                <TextInput
                  style={styles.inputField}
                  placeholder="Vehicle registration number"
                  placeholderTextColor="#9CA3AF"
                  value={vehicleRegistration}
                  onChangeText={setVehicleRegistration}
                  autoCapitalize="characters"
                />
              </View>
              <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry</Text>
              <View style={styles.input}>
                <TextInput
                  style={styles.inputField}
                  placeholder="MM / DD / YYYY"
                  placeholderTextColor="#9CA3AF"
                  value={vehicleExpiry}
                  onChangeText={setVehicleExpiry}
                />
                <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
              </View>
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

          <TouchableOpacity style={styles.saveBtn} activeOpacity={0.88} onPress={onNext}>
            <Text style={styles.saveBtnText}>Complete</Text>
            <Feather name="check" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
