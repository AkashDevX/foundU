import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { BootstrapCompany } from '../types/bootstrap';
import { colors, spacing, fontFamily } from '../theme/theme';
import { loginScreenStyles } from '../styles/loginScreenStyles';

type CompanyPickerVariant = 'login' | 'createAccount';

export interface CompanyPickerProps {
  variant: CompanyPickerVariant;
  /** Companies from GET /api/v1/bootstrap (master DB). */
  companies: BootstrapCompany[];
  listingLoading?: boolean;
  value: string | null;
  /** Selected company {@link BootstrapCompany.slug}. */
  onChange: (slug: string) => void;
}

function getCreateAccountStyles() {
  return require('../styles/styles').createAccountScreenStyles;
}

export function CompanyPicker({
  variant,
  companies,
  listingLoading,
  value,
  onChange,
}: CompanyPickerProps) {
  const [open, setOpen] = useState(false);

  const label = variant === 'login' ? 'COMPANY / ORGANIZATION' : 'Company or organization *';

  const selectedName = useMemo(() => {
    if (!value) return null;
    return companies.find((c) => c.slug === value)?.name ?? null;
  }, [value, companies]);

  const loginStyles = loginScreenStyles;
  const caStyles = variant === 'createAccount' ? getCreateAccountStyles() : null;
  const modalStyles = caStyles ?? pickerModalStyles;

  return (
    <>
      {variant === 'login' ? (
        <Text style={loginStyles.label}>{label}</Text>
      ) : (
        <>
          <Text style={caStyles!.fieldLabel}>{label}</Text>
          <Text style={[caStyles!.fieldHint, { marginBottom: spacing.sm }]}>
            Choose who you are joining. Your application and sign-in are scoped to this organization.
          </Text>
        </>
      )}

      <TouchableOpacity
        style={variant === 'login' ? loginStyles.input : caStyles!.input}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Opens a list to choose your employer or organization"
      >
        <Feather
          name="briefcase"
          size={20}
          color="#9CA3AF"
          style={variant === 'login' ? loginStyles.inputIcon : pickerStyles.iconLeft}
        />
        <Text
          style={[
            variant === 'login' ? loginStyles.inputField : caStyles!.inputField,
            !selectedName && pickerStyles.placeholder,
          ]}
          numberOfLines={1}
        >
          {listingLoading
            ? 'Loading organizations…'
            : selectedName ?? (companies.length === 0 ? 'No organizations available' : 'Select your company')}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <Pressable style={modalStyles.modalOverlay} onPress={() => setOpen(false)}>
          <TouchableWithoutFeedback>
            <View style={modalStyles.modalContent}>
              {listingLoading ? (
                <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                  <ActivityIndicator color="#0056D2" />
                  <Text style={[modalStyles.modalOptionText, { marginTop: spacing.md }]}>Loading…</Text>
                </View>
              ) : companies.length === 0 ? (
                <View style={{ paddingVertical: spacing.xl, paddingHorizontal: spacing.lg }}>
                  <Text style={[modalStyles.modalOptionText, { textAlign: 'center' }]}>
                    No organizations available. Check your connection and try again from the sign-in screen.
                  </Text>
                </View>
              ) : (
                companies.map((c, idx) => (
                  <TouchableOpacity
                    key={c.slug}
                    style={[modalStyles.modalOption, idx === companies.length - 1 ? modalStyles.modalOptionLast : null]}
                    onPress={() => {
                      onChange(c.slug);
                      setOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={modalStyles.modalOptionText}>{c.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      </Modal>
    </>
  );
}

const pickerStyles = StyleSheet.create({
  iconLeft: { marginRight: spacing.md },
  placeholder: { color: '#9CA3AF' },
});

const pickerModalStyles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xxxl },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.lg },
  modalOption: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalOptionLast: { borderBottomWidth: 0 },
  modalOptionText: { fontFamily: fontFamily.regular, fontSize: 16, color: colors.text.primary },
});
