import React, { useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { colors, fontFamily, spacing } from '../../theme/theme';

type Props = {
  content: string;
  version: number;
  lastUpdatedOn: string | null;
  accepting: boolean;
  error?: string | null;
  onAccept: () => void;
};

function parseSections(content: string): Array<{ title: string; body: string }> {
  const chunks = content
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  const sections: Array<{ title: string; body: string }> = [];
  for (const chunk of chunks) {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0];
    if (/^\d+\.\s+/.test(first)) {
      sections.push({
        title: first.replace(/^\d+\.\s+/, ''),
        body: lines.slice(1).join(' ').trim() || first,
      });
    } else if (sections.length > 0) {
      sections[sections.length - 1].body = `${sections[sections.length - 1].body} ${chunk}`.trim();
    } else {
      sections.push({ title: 'Overview', body: chunk });
    }
  }
  return sections;
}

export function MessagingPolicyCard({
  content,
  version,
  lastUpdatedOn,
  accepting,
  error,
  onAccept,
}: Props) {
  const sections = useMemo(() => parseSections(content), [content]);

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>CruLynk Messaging</Text>
      <Text style={styles.title}>Messaging Terms of Use</Text>
      <Text style={styles.lede}>
        Review these standards before using chat. Separate from the Privacy Policy.
      </Text>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>Version {version}</Text>
        {lastUpdatedOn ? <Text style={styles.metaText}>· Effective {lastUpdatedOn}</Text> : null}
      </View>

      <View style={styles.sections}>
        {sections.map((section, index) => (
          <View key={`${section.title}-${index}`} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {index + 1}. {section.title}
            </Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.acceptBtn, accepting && styles.acceptBtnDisabled]}
        onPress={onAccept}
        disabled={accepting}
        activeOpacity={0.88}
      >
        {accepting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.acceptText}>Accept and continue</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#DCE5F0',
    gap: spacing.md,
  },
  kicker: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text.primary,
    letterSpacing: -0.3,
    marginTop: -4,
  },
  lede: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
    marginTop: -4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  metaText: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: '#64748B',
  },
  sections: {
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  section: {
    gap: 4,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  sectionTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: colors.text.primary,
  },
  sectionBody: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  errorBanner: {
    backgroundColor: 'rgba(185,28,28,0.08)',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#B91C1C',
  },
  acceptBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  acceptBtnDisabled: { opacity: 0.7 },
  acceptText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
});
