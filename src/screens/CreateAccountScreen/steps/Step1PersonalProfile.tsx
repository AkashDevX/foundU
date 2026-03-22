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
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';

const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed', 'De Facto', 'Separated'];

interface Step1PersonalProfileProps {
  onNext: () => void;
}

export function Step1PersonalProfile({ onNext }: Step1PersonalProfileProps) {
  const [fullLegalName, setFullLegalName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [maritalStatus, setMaritalStatus] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [showMaritalModal, setShowMaritalModal] = useState(false);

  const styles = createAccountScreenStyles;

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
            />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Date of Birth</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="MM / DD / YYYY"
              placeholderTextColor="#9CA3AF"
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
            />
            <Feather name="calendar" size={20} color="#6B7280" style={styles.inputIconRight} />
          </View>

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
          <View style={[styles.input, styles.inputMultiline]}>
            <TextInput
              style={[styles.inputField, styles.inputFieldMultiline]}
              placeholder="Street address, suburb, state, postcode"
              placeholderTextColor="#9CA3AF"
              value={address}
              onChangeText={setAddress}
              multiline
              numberOfLines={3}
            />
          </View>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>Emergency Contact</Text>
          <Text style={styles.fieldHint}>Name</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="Full name"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactName}
              onChangeText={setEmergencyContactName}
            />
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Phone</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="Phone number"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactPhone}
              onChangeText={setEmergencyContactPhone}
              keyboardType="phone-pad"
            />
          </View>
          <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Relationship</Text>
          <View style={styles.input}>
            <TextInput
              style={styles.inputField}
              placeholder="e.g. Spouse, Parent, Sibling"
              placeholderTextColor="#9CA3AF"
              value={emergencyContactRelationship}
              onChangeText={setEmergencyContactRelationship}
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
