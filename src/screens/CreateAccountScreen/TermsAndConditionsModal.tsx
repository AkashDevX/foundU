import React from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { createAccountScreenStyles } from '../../styles/styles';
import { TERMS_DEMO_LAST_UPDATED, TERMS_DEMO_SECTIONS } from './termsDemoContent';

interface TermsAndConditionsModalProps {
  visible: boolean;
  onClose: () => void;
}

export function TermsAndConditionsModal({ visible, onClose }: TermsAndConditionsModalProps) {
  const styles = createAccountScreenStyles;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.termsModalOverlay} onPress={onClose}>
        <TouchableWithoutFeedback>
          <View style={styles.termsModalCard}>
          <View style={styles.termsModalHeader}>
            <View style={styles.termsModalIconWrap}>
              <Feather name="file-text" size={28} color="#0056D2" />
            </View>
            <Text style={styles.termsModalTitle}>Terms and Conditions</Text>
            <Text style={styles.termsModalUpdated}>Last updated: {TERMS_DEMO_LAST_UPDATED}</Text>
          </View>

          <ScrollView
            style={styles.termsModalScroll}
            contentContainerStyle={styles.termsModalScrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={styles.termsModalIntro}>
              Demo content for review purposes. Replace with your organisation’s official legal text
              before production release.
            </Text>
            {TERMS_DEMO_SECTIONS.map((section) => (
              <View key={section.title} style={styles.termsModalSection}>
                <Text style={styles.termsModalSectionTitle}>{section.title}</Text>
                <Text style={styles.termsModalSectionBody}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.termsModalCloseBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.termsModalCloseBtnText}>Close</Text>
          </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </Pressable>
    </Modal>
  );
}
