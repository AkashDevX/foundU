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
  ScrollView,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import type { BootstrapCompany } from '../types/bootstrap';
import { colors, spacing, fontFamily } from '../theme/theme';
import { loginScreenStyles } from '../styles/loginScreenStyles';

type LoginPickerProps = {
  variant: 'login';
  companies: BootstrapCompany[];
  listingLoading?: boolean;
  value: string | null;
  onChange: (slug: string) => void;
};

type CreateAccountPickerProps = {
  variant: 'createAccount';
  companies: BootstrapCompany[];
  listingLoading?: boolean;
  values: string[];
  onChange: (slugs: string[]) => void;
};

export type CompanyPickerProps = LoginPickerProps | CreateAccountPickerProps;

function getCreateAccountStyles() {
  return require('../styles/styles').createAccountScreenStyles;
}

export function CompanyPicker(props: CompanyPickerProps) {
  const { variant, companies, listingLoading } = props;
  const [open, setOpen] = useState(false);

  const isCreateAccount = variant === 'createAccount';
  const selectedSlugs = isCreateAccount ? props.values : props.value ? [props.value] : [];

  const label = isCreateAccount ? 'Companies or organizations *' : 'COMPANY / ORGANIZATION';

  const selectedCompanies = useMemo(
    () => companies.filter((c) => selectedSlugs.includes(c.slug)),
    [companies, selectedSlugs],
  );

  const fieldLabel = useMemo(() => {
    if (listingLoading) {
      return 'Loading organizations…';
    }
    if (companies.length === 0) {
      return 'No organizations available';
    }
    if (selectedCompanies.length === 0) {
      return isCreateAccount ? 'Select companies' : 'Select your company';
    }
    if (selectedCompanies.length === 1) {
      return selectedCompanies[0].name;
    }
    if (selectedCompanies.length === 2) {
      return `${selectedCompanies[0].name}, ${selectedCompanies[1].name}`;
    }
    return `${selectedCompanies.length} organizations selected`;
  }, [listingLoading, companies.length, selectedCompanies, isCreateAccount]);

  const loginStyles = loginScreenStyles;
  const caStyles = isCreateAccount ? getCreateAccountStyles() : null;
  const modalStyles = caStyles ?? pickerModalStyles;

  const toggleSlug = (slug: string) => {
    if (!isCreateAccount) {
      props.onChange(slug);
      setOpen(false);
      return;
    }
    const next = selectedSlugs.includes(slug)
      ? selectedSlugs.filter((s) => s !== slug)
      : [...selectedSlugs, slug];
    props.onChange(next);
  };

  const removeSlug = (slug: string) => {
    if (!isCreateAccount) {
      return;
    }
    props.onChange(selectedSlugs.filter((s) => s !== slug));
  };

  return (
    <>
      {isCreateAccount ? (
        <>
          <Text style={caStyles!.fieldLabel}>{label}</Text>
          {/* <Text style={[caStyles!.fieldHint, { marginBottom: spacing.sm }]}>
            Select every organisation you want to join. Each company reviews your application
            independently.
          </Text> */}
        </>
      ) : (
        <Text style={loginStyles.label}>{label}</Text>
      )}

      <TouchableOpacity
        style={isCreateAccount ? caStyles!.input : loginStyles.input}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={
          isCreateAccount
            ? 'Opens a list to choose one or more employers or organizations'
            : 'Opens a list to choose your employer or organization'
        }
      >
        <Feather
          name="briefcase"
          size={20}
          color="#9CA3AF"
          style={isCreateAccount ? pickerStyles.iconLeft : loginStyles.inputIcon}
        />
        <Text
          style={[
            isCreateAccount ? caStyles!.inputField : loginStyles.inputField,
            selectedCompanies.length === 0 && pickerStyles.placeholder,
          ]}
          numberOfLines={1}
        >
          {fieldLabel}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>

      {isCreateAccount && selectedCompanies.length > 0 ? (
        <View style={caStyles!.companyChipRow}>
          {selectedCompanies.map((c) => (
            <View key={c.slug} style={caStyles!.companyChip}>
              <Text style={caStyles!.companyChipText} numberOfLines={1}>
                {c.name}
              </Text>
              <TouchableOpacity
                onPress={() => removeSlug(c.slug)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${c.name}`}
              >
                <Feather name="x" size={14} color="#374151" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
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
                    No organizations available. Check your connection and try again from the sign-in
                    screen.
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView style={pickerStyles.modalList} keyboardShouldPersistTaps="handled">
                    {companies.map((c, idx) => {
                      const selected = selectedSlugs.includes(c.slug);
                      const isLast = idx === companies.length - 1 && !isCreateAccount;
                      return (
                        <TouchableOpacity
                          key={c.slug}
                          style={[
                            modalStyles.modalOption,
                            isLast ? modalStyles.modalOptionLast : null,
                            selected && isCreateAccount ? pickerStyles.optionSelected : null,
                          ]}
                          onPress={() => toggleSlug(c.slug)}
                          activeOpacity={0.7}
                          accessibilityRole={isCreateAccount ? 'checkbox' : 'button'}
                          accessibilityState={isCreateAccount ? { checked: selected } : undefined}
                        >
                          <Text style={modalStyles.modalOptionText}>{c.name}</Text>
                          {isCreateAccount ? (
                            <Feather
                              name={selected ? 'check-square' : 'square'}
                              size={20}
                              color={selected ? '#0056D2' : '#9CA3AF'}
                            />
                          ) : null}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  {isCreateAccount ? (
                    <TouchableOpacity
                      style={caStyles!.companyPickerDoneBtn}
                      onPress={() => setOpen(false)}
                      activeOpacity={0.85}
                    >
                      <Text style={caStyles!.companyPickerDoneBtnText}>Done</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
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
  modalList: { maxHeight: 360 },
  optionSelected: { backgroundColor: '#EFF6FF' },
});

const pickerModalStyles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xxxl },
  modalContent: { backgroundColor: colors.white, borderRadius: 16, padding: spacing.lg },
  modalOption: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  modalOptionLast: { borderBottomWidth: 0 },
  modalOptionText: { fontFamily: fontFamily.regular, fontSize: 16, color: colors.text.primary, flex: 1 },
});
