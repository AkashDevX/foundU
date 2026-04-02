import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { COMPANIES } from '../constants/companies';
import { spacing } from '../theme/theme';
import { createAccountScreenStyles, loginScreenStyles } from '../styles/styles';

type CompanyPickerVariant = 'login' | 'createAccount';

export interface CompanyPickerProps {
  variant: CompanyPickerVariant;
  value: string | null;
  onChange: (companyId: string) => void;
}

export function CompanyPicker({ variant, value, onChange }: CompanyPickerProps) {
  const [open, setOpen] = useState(false);

  const label = variant === 'login' ? 'COMPANY / ORGANIZATION' : 'Company or organization';

  const selectedName = useMemo(() => {
    if (!value) return null;
    return COMPANIES.find((c) => c.id === value)?.name ?? null;
  }, [value]);

  const loginStyles = loginScreenStyles;
  const caStyles = createAccountScreenStyles;

  return (
    <>
      {variant === 'login' ? (
        <Text style={loginStyles.label}>{label}</Text>
      ) : (
        <>
          <Text style={caStyles.fieldLabel}>{label}</Text>
          <Text style={[caStyles.fieldHint, { marginBottom: spacing.sm }]}>
            Choose who you are joining. Your application and sign-in are scoped to this organization.
          </Text>
        </>
      )}

      <TouchableOpacity
        style={variant === 'login' ? loginStyles.input : caStyles.input}
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
            variant === 'login' ? loginStyles.inputField : caStyles.inputField,
            !selectedName && pickerStyles.placeholder,
          ]}
          numberOfLines={1}
        >
          {selectedName ?? 'Select your company'}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade">
        <Pressable style={caStyles.modalOverlay} onPress={() => setOpen(false)}>
          <TouchableWithoutFeedback>
            <View style={caStyles.modalContent}>
              {COMPANIES.map((c, idx) => (
                <TouchableOpacity
                  key={c.id}
                  style={[caStyles.modalOption, idx === COMPANIES.length - 1 ? caStyles.modalOptionLast : null]}
                  onPress={() => {
                    onChange(c.id);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={caStyles.modalOptionText}>{c.name}</Text>
                </TouchableOpacity>
              ))}
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
