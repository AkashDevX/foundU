import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';

export const REPORT_REASON_OPTIONS = [
  {
    key: 'harassment',
    label: 'Harassment or bullying',
    hint: 'Threats, insults, or targeting someone',
    icon: 'alert-octagon' as const,
  },
  {
    key: 'inappropriate',
    label: 'Inappropriate content',
    hint: 'Sexual, graphic, or offensive material',
    icon: 'eye-off' as const,
  },
  {
    key: 'spam',
    label: 'Spam or scam',
    hint: 'Unwanted promo, phishing, or fraud',
    icon: 'mail' as const,
  },
  {
    key: 'threats',
    label: 'Threats or violence',
    hint: 'Dangerous or intimidating behaviour',
    icon: 'shield-off' as const,
  },
  {
    key: 'other',
    label: 'Something else',
    hint: 'Tell us what happened',
    icon: 'edit-3' as const,
  },
] as const;

export type ReportReasonKey = (typeof REPORT_REASON_OPTIONS)[number]['key'];

type Props = {
  title: string;
  subtitle: string;
  submitting?: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onSubmit: (reason: string) => void;
};

export function ReportReasonSheetBody({
  title,
  subtitle,
  submitting = false,
  errorMessage = null,
  onCancel,
  onSubmit,
}: Props) {
  const [selected, setSelected] = useState<ReportReasonKey | null>(null);
  const [details, setDetails] = useState('');

  const canSubmit = useMemo(() => {
    if (!selected || submitting) return false;
    if (selected === 'other') return details.trim().length >= 3;
    return true;
  }, [selected, details, submitting]);

  const buildReason = () => {
    const option = REPORT_REASON_OPTIONS.find((o) => o.key === selected);
    const label = option?.label || 'Report';
    const extra = details.trim();
    if (selected === 'other') return extra;
    return extra ? `${label}: ${extra}` : label;
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Feather name="flag" size={18} color="#B91C1C" />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
      </View>

      {errorMessage ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={16} color="#B91C1C" />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {REPORT_REASON_OPTIONS.map((option) => {
          const active = selected === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.option, active && styles.optionActive]}
              activeOpacity={0.85}
              onPress={() => setSelected(option.key)}
              disabled={submitting}
            >
              <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                <Feather
                  name={option.icon}
                  size={16}
                  color={active ? '#B91C1C' : colors.primary}
                />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                  {option.label}
                </Text>
                <Text style={styles.optionHint}>{option.hint}</Text>
              </View>
              <View style={[styles.radio, active && styles.radioActive]}>
                {active ? <View style={styles.radioDot} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}

        {selected ? (
          <View style={styles.detailsBox}>
            <Text style={styles.detailsLabel}>
              {selected === 'other' ? 'Describe the issue' : 'Extra details (optional)'}
            </Text>
            <TextInput
              style={styles.detailsInput}
              value={details}
              onChangeText={setDetails}
              placeholder={
                selected === 'other'
                  ? 'Please explain what happened…'
                  : 'Add context for your organisation admin…'
              }
              placeholderTextColor="#94A3B8"
              multiline
              editable={!submitting}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={onCancel}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={() => onSubmit(buildReason())}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitText}>Submit report</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(185,28,28,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(185,28,28,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.22)',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: '#991B1B',
  },
  list: { maxHeight: 360 },
  listContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  optionActive: {
    backgroundColor: 'rgba(185,28,28,0.06)',
    borderColor: 'rgba(185,28,28,0.28)',
  },
  optionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(0,61,122,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: 'rgba(185,28,28,0.12)',
  },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text.primary,
  },
  optionTitleActive: { color: '#991B1B' },
  optionHint: {
    marginTop: 2,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: '#B91C1C' },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#B91C1C',
  },
  detailsBox: {
    marginTop: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailsLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detailsInput: {
    minHeight: 84,
    maxHeight: 120,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: colors.text.primary,
    textAlignVertical: 'top',
    padding: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#EEF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.secondary,
  },
  submitBtn: {
    flex: 1.3,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#B91C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
