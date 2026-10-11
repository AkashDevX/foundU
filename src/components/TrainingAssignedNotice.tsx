import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily } from '../theme/theme';

const { width: SCREEN_W } = Dimensions.get('window');

type Props = {
  visible: boolean;
  moduleTitle: string;
  dueLabel: string;
  extraCount?: number;
  onOpen: () => void;
  onClose: () => void;
};

export function TrainingAssignedNotice({
  visible,
  moduleTitle,
  dueLabel,
  extraCount = 0,
  onOpen,
  onClose,
}: Props) {
  const title = moduleTitle.trim() || 'Training';
  const due = dueLabel.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.header}>
            <View style={styles.iconRing}>
              <Feather name="book-open" size={26} color="#FFFFFF" />
            </View>
            <Text style={styles.kicker}>Training assigned</Text>
            <Text style={styles.lead}>Please complete this module.</Text>
          </View>
          <View style={styles.body}>
            <Text style={styles.moduleTitle}>{title}</Text>
            {due ? (
              <View style={styles.dueChip}>
                <Feather name="calendar" size={16} color="#8A6A2F" />
                <View style={styles.dueCopy}>
                  <Text style={styles.dueLabel}>Due date</Text>
                  <Text style={styles.dueValue}>{due}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.noDue}>Complete it as soon as possible.</Text>
            )}
            {extraCount > 0 ? (
              <Text style={styles.extra}>
                {extraCount === 1 ? '1 more module was also assigned.' : `${extraCount} more modules were also assigned.`}
              </Text>
            ) : null}
            <TouchableOpacity style={styles.openBtn} activeOpacity={0.88} onPress={onOpen}>
              <Text style={styles.openBtnText}>Open training</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.laterBtn} activeOpacity={0.85} onPress={onClose}>
              <Text style={styles.laterBtnText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 24, 48, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: Math.min(SCREEN_W - 48, 360),
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#002855',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 16,
  },
  header: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 22,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#C4A35A',
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: {
    marginTop: 14,
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  lead: {
    marginTop: 4,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.84)',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    alignItems: 'center',
  },
  moduleTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
    textAlign: 'center',
  },
  dueChip: {
    marginTop: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FBF7EF',
    borderWidth: 1,
    borderColor: '#C4A35A',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dueCopy: { flex: 1 },
  dueLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: '#8A6A2F',
  },
  dueValue: {
    marginTop: 2,
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#1C1915',
  },
  noDue: {
    marginTop: 12,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#5C5346',
    textAlign: 'center',
  },
  extra: {
    marginTop: 12,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  openBtn: {
    marginTop: 18,
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openBtnText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
  laterBtn: {
    marginTop: 8,
    width: '100%',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.primary,
  },
});
