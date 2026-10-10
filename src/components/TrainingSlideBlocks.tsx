import React, { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { openTrainingBlockFile, safeTrainingHttpUrl, trainingBlockFileUrl } from '../services/trainingApi';
import { TrainingVideoPlayer } from './TrainingVideoPlayer';
import { colors, fontFamily } from '../theme/theme';
import type { TrainingBlock } from '../types/training';
import { TrainingSlideImage } from './TrainingSlideImage';

type Props = {
  blocks: TrainingBlock[];
};

export function TrainingSlideBlocks({ blocks }: Props) {
  if (blocks.length === 0) return null;
  return (
    <View style={styles.list}>
      {blocks.map((block) => (
        <BlockView key={block.id} block={block} />
      ))}
    </View>
  );
}

function BlockView({ block }: { block: TrainingBlock }) {
  if (block.kind === 'photo' && block.has_file) {
    return (
      <View>
        {block.label ? <Text style={styles.caption}>{block.label}</Text> : null}
        <TrainingSlideImage url={trainingBlockFileUrl(block.id)} />
      </View>
    );
  }

  if (block.kind === 'text') {
    return <Text style={styles.body}>{block.body ?? ''}</Text>;
  }

  if (block.kind === 'instruction') {
    return (
      <View style={[styles.callout, styles.instruction]}>
        <Text style={styles.calloutLabel}>Instructions</Text>
        {block.label ? <Text style={styles.calloutTitle}>{block.label}</Text> : null}
        {block.body ? <Text style={styles.body}>{block.body}</Text> : null}
      </View>
    );
  }

  if (block.kind === 'note') {
    return (
      <View style={[styles.callout, styles.note]}>
        <Text style={styles.noteLabel}>Important note</Text>
        {block.label ? <Text style={styles.calloutTitle}>{block.label}</Text> : null}
        {block.body ? <Text style={styles.body}>{block.body}</Text> : null}
      </View>
    );
  }

  if (block.kind === 'link') {
    return <OpenRow block={block} icon="link" title={block.label || block.body || 'Open link'} />;
  }

  if (block.kind === 'pdf') {
    return <OpenRow block={block} icon="file-text" title={block.label || 'Open PDF'} />;
  }

  if (block.kind === 'video') {
    return <TrainingVideoPlayer block={block} />;
  }

  return null;
}

function OpenRow({
  block,
  icon,
  title,
}: {
  block: TrainingBlock;
  icon: string;
  title: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPress = async () => {
    if (busy) return;
    setError(null);
    const url = !block.has_file ? safeTrainingHttpUrl(block.body) : null;
    if (url) {
      try {
        await Linking.openURL(url);
      } catch {
        setError('Could not open this link.');
      }
      return;
    }
    if (!block.has_file) {
      setError('This item does not have a file yet.');
      return;
    }
    setBusy(true);
    const opened = await openTrainingBlockFile(block.id, fileNameFor(block));
    setBusy(false);
    if (!opened.ok) setError(opened.message);
  };

  return (
    <View>
      <Pressable onPress={() => void onPress()} style={styles.fileRow} accessibilityRole="button">
        <Feather name={icon} size={18} color={colors.primary} />
        <Text style={styles.fileTitle}>{title}</Text>
        {busy ? <ActivityIndicator color={colors.primary} /> : <Feather name="external-link" size={16} color={colors.text.secondary} />}
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function fileNameFor(block: TrainingBlock): string {
  const base = (block.label || block.kind).replace(/[\\/:*?"<>|]/g, '_');
  const ext = (block.file_ext || '').toLowerCase();
  if (ext && ['pdf', 'mp4', 'mov', 'webm', 'm4v'].includes(ext)) {
    return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
  }
  if (block.kind === 'pdf') return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  if (block.kind === 'video') return base.toLowerCase().endsWith('.mp4') ? base : `${base}.mp4`;
  return base;
}

const styles = StyleSheet.create({
  list: {
    marginTop: 16,
    gap: 12,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text.primary,
  },
  caption: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 6,
  },
  callout: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  instruction: {
    backgroundColor: '#E8F1FB',
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  note: {
    backgroundColor: '#FFF6E5',
    borderLeftWidth: 4,
    borderLeftColor: '#C2410C',
  },
  calloutLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  noteLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#C2410C',
  },
  calloutTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
  },
  fileTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  error: {
    marginTop: 6,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#B91C1C',
  },
});
