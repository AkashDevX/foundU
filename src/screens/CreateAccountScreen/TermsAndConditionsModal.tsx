import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { createAccountScreenStyles } from '../../styles/styles';
import {
  fetchTermsAndConditions,
  type TermsAndConditionsPayload,
  type TermsSection,
} from '../../services/termsApi';

interface TermsAndConditionsModalProps {
  visible: boolean;
  onClose: () => void;
  /** Selected org slug from step 1 — loads that tenant's published terms only. */
  companySlug: string | null;
  /** Optional display name for the selected company. */
  companyName?: string | null;
}

export function TermsAndConditionsModal({
  visible,
  onClose,
  companySlug,
  companyName = null,
}: TermsAndConditionsModalProps) {
  const styles = createAccountScreenStyles;
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<TermsAndConditionsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setPayload(null);

    const slug = companySlug?.trim() ?? '';
    if (!slug) {
      setLoadError('Select a company on step 1 to view that organisation’s terms.');
      setLoading(false);
      return;
    }

    fetchTermsAndConditions(slug)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPayload(null);
        setLoadError(
          err instanceof Error && err.message.trim() !== ''
            ? err.message
            : 'Could not load terms for this organisation.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, companySlug]);

  const sections: TermsSection[] = payload?.sections ?? [];
  const displayCompanyName = payload?.companyName ?? companyName ?? null;

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
              {displayCompanyName ? (
                <Text style={styles.termsModalUpdated}>{displayCompanyName}</Text>
              ) : null}
              {payload?.lastUpdated ? (
                <Text style={styles.termsModalUpdated}>Last updated: {payload.lastUpdated}</Text>
              ) : null}
            </View>

            <ScrollView
              style={styles.termsModalScroll}
              contentContainerStyle={styles.termsModalScrollContent}
              showsVerticalScrollIndicator
            >
              {loading ? (
                <View style={{ paddingVertical: 28, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#0056D2" />
                  <Text style={[styles.termsModalSectionBody, { marginTop: 12, textAlign: 'center' }]}>
                    Loading terms for this organisation…
                  </Text>
                </View>
              ) : loadError ? (
                <Text style={styles.termsModalIntro}>{loadError}</Text>
              ) : (
                sections.map((section, idx) => (
                  <View key={`${section.title}-${idx}`} style={styles.termsModalSection}>
                    <Text style={styles.termsModalSectionTitle}>{section.title}</Text>
                    <Text style={styles.termsModalSectionBody}>{section.body}</Text>
                  </View>
                ))
              )}
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
