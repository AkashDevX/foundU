import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily } from '../theme/theme';

const { width: SCREEN_W } = Dimensions.get('window');

type SweetAlertVariant = 'success' | 'error' | 'info' | 'warning' | 'danger';

const VARIANT = {
  success: {
    iconWrap: '#DCFCE7',
    iconColor: '#166534',
    confirmBg: '#15803D',
    icon: 'check-circle' as const,
  },
  error: {
    iconWrap: '#FEE2E2',
    iconColor: '#991B1B',
    confirmBg: '#B91C1C',
    icon: 'x-circle' as const,
  },
  info: {
    iconWrap: '#DBEAFE',
    iconColor: colors.primary,
    confirmBg: colors.accent,
    icon: 'info' as const,
  },
  danger: {
    iconWrap: '#FEE2E2',
    iconColor: '#DC2626',
    confirmBg: '#DC2626',
    icon: 'log-out' as const,
  },
  warning: {
    iconWrap: '#FEF3C7',
    iconColor: '#D97706',
    confirmBg: '#EA580C',
    icon: 'alert-circle' as const,
  },
};

export type SweetAlertProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onClose: () => void;
  variant?: SweetAlertVariant;
  /** When true, only the primary button is shown (typical OK / got it alerts). */
  hideCancel?: boolean;
  /** Optional bullet list shown below the message (e.g. missing required fields). */
  listItems?: string[];
};

/**
 * SweetAlert2-style dialog (custom Modal): icon ring, title, message, cancel + confirm.
 */
export function SweetAlert({
  visible,
  title,
  message,
  confirmText,
  cancelText,
  onConfirm,
  onClose,
  variant = 'warning',
  hideCancel = false,
  listItems,
}: SweetAlertProps) {
  const v = VARIANT[variant];
  const hasList = Boolean(listItems && listItems.length > 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {!hideCancel && (
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss dialog" />
        )}
        <View style={[styles.card, hasList && styles.cardWithList]} accessibilityRole="alert">
          <View style={[styles.iconRing, { backgroundColor: v.iconWrap }]}>
            <Feather name={v.icon} size={36} color={v.iconColor} strokeWidth={2.2} />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={[styles.message, hasList && styles.messageWithList]}>{message}</Text>
          {hasList ? (
            <ScrollView
              style={styles.listScroll}
              contentContainerStyle={styles.listScrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              <View style={[styles.listBox, { borderColor: v.iconColor }]}>
                {listItems!.map((item) => (
                  <View key={item} style={styles.listRow}>
                    <View style={[styles.listBullet, { backgroundColor: v.iconColor }]} />
                    <Text style={styles.listItemText}>{item}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
          <View style={styles.actions}>
            {!hideCancel && (
              <TouchableOpacity
                style={styles.btnCancel}
                onPress={onClose}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.btnCancelText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btnConfirm, { backgroundColor: v.confirmBg }, hideCancel && styles.btnConfirmFull]}
              onPress={onConfirm}
              activeOpacity={0.88}
              accessibilityRole="button"
            >
              <Text style={styles.btnConfirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const CARD_MAX = 340;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: Math.min(SCREEN_W - 48, CARD_MAX),
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 28,
    paddingHorizontal: 22,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 16,
  },
  cardWithList: {
    width: Math.min(SCREEN_W - 40, 360),
    maxHeight: '82%',
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
  },
  messageWithList: {
    marginBottom: 14,
    fontSize: 14,
  },
  listScroll: {
    width: '100%',
    maxHeight: 220,
    marginBottom: 18,
  },
  listScrollContent: {
    flexGrow: 1,
  },
  listBox: {
    width: '100%',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  listBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  listItemText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  btnCancel: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnCancelText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#4B5563',
  },
  btnConfirm: {
    width: '100%',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnConfirmFull: {
    marginTop: 4,
  },
  btnConfirmText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
