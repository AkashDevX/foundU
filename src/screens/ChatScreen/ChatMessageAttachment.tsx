import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily, spacing } from '../../theme/theme';
import type { MessagingAttachmentMeta } from '../../types/messaging';
import {
  fetchAttachmentAsDataUri,
  openAttachmentWithSystemViewer,
} from '../../services/messagingApi';

type Props = {
  attachment: MessagingAttachmentMeta;
  messageType: string;
  mine: boolean;
  onError?: (message: string) => void;
  onStatus?: (message: string) => void;
};

const previewCache = new Map<number, string>();

function decodeDataUriText(dataUri: string): string {
  const marker = ';base64,';
  const idx = dataUri.indexOf(marker);
  if (idx < 0) return '';
  const b64 = dataUri.slice(idx + marker.length);
  try {
    const atobFn = (globalThis as { atob?: (value: string) => string }).atob;
    if (typeof atobFn === 'function') {
      return atobFn(b64);
    }
  } catch {
    // fall through
  }
  return '';
}

export function ChatAttachmentBubble({ attachment, messageType, mine, onError, onStatus }: Props) {
  const attachmentId = attachment?.id;
  const hasAttachment = typeof attachmentId === 'number';

  const mime = (attachment?.mime || '').toLowerCase();
  const nameLower = (attachment?.name || '').toLowerCase();
  const isImage = hasAttachment && (messageType === 'image' || mime.startsWith('image/'));
  const isPdf = hasAttachment && (mime === 'application/pdf' || nameLower.endsWith('.pdf'));
  const isPlainText = hasAttachment && (mime === 'text/plain' || nameLower.endsWith('.txt'));

  const [previewUri, setPreviewUri] = useState<string | null>(() =>
    hasAttachment ? previewCache.get(attachmentId) ?? null : null,
  );
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [textViewerVisible, setTextViewerVisible] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!hasAttachment || !isImage) return;
    const cached = previewCache.get(attachmentId);
    if (cached) {
      setPreviewUri(cached);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    void (async () => {
      const res = await fetchAttachmentAsDataUri(attachmentId);
      if (cancelled) return;
      setLoadingPreview(false);
      if (!res.ok) return;
      previewCache.set(attachmentId, res.data.uri);
      setPreviewUri(res.data.uri);
    })();
    return () => {
      cancelled = true;
    };
  }, [attachmentId, hasAttachment, isImage]);

  const openAttachment = async () => {
    if (!hasAttachment || opening) return;
    setOpening(true);

    try {
      if (isImage) {
        const cached = previewCache.get(attachmentId) || previewUri;
        if (cached) {
          setViewerUri(cached);
          setViewerVisible(true);
          return;
        }
        const res = await fetchAttachmentAsDataUri(attachmentId);
        if (!res.ok) {
          onError?.(res.message);
          return;
        }
        previewCache.set(attachmentId, res.data.uri);
        setPreviewUri(res.data.uri);
        setViewerUri(res.data.uri);
        setViewerVisible(true);
        return;
      }

      if (isPlainText) {
        const res = await fetchAttachmentAsDataUri(attachmentId);
        if (!res.ok) {
          onError?.(res.message);
          return;
        }
        setTextContent(decodeDataUriText(res.data.uri) || 'Unable to read this text file.');
        setTextViewerVisible(true);
        return;
      }

      const res = await openAttachmentWithSystemViewer(
        attachmentId,
        attachment?.name || `file-${attachmentId}`,
        attachment?.mime,
      );
      if (!res.ok) {
        onError?.(res.message);
        return;
      }
      if (res.data.savedToDownloads) {
        onStatus?.('Saved to Downloads. Open it from your Files or Downloads app.');
      }
    } finally {
      setOpening(false);
    }
  };

  if (!hasAttachment) {
    return null;
  }

  return (
    <View style={[styles.wrap, mine && styles.wrapMine]}>
      <TouchableOpacity
        style={styles.pressable}
        activeOpacity={0.85}
        onPress={() => void openAttachment()}
        accessibilityLabel={isImage ? 'Open image' : isPdf ? 'Open PDF' : 'Open file'}
      >
        {isImage ? (
          <View style={styles.imageFrame}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                {loadingPreview || opening ? (
                  <ActivityIndicator color={mine ? '#FFFFFF' : colors.primary} />
                ) : (
                  <Feather name="image" size={22} color={mine ? '#FFFFFF' : colors.primary} />
                )}
              </View>
            )}
            <View style={styles.imageFooter}>
              <Feather name="maximize-2" size={12} color="#FFFFFF" />
              <Text style={styles.imageFooterText} numberOfLines={1}>
                {attachment.name || 'Photo'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.fileChip, mine && styles.fileChipMine]}>
            {opening ? (
              <ActivityIndicator color={mine ? '#FFFFFF' : colors.primary} size="small" />
            ) : (
              <Feather
                name={isPdf ? 'file' : 'file-text'}
                size={14}
                color={mine ? '#FFFFFF' : colors.primary}
              />
            )}
            <View style={styles.fileMeta}>
              <Text style={[styles.fileText, mine && styles.fileTextMine]} numberOfLines={1}>
                {attachment.name || 'Attachment'}
              </Text>
              <Text style={[styles.fileHint, mine && styles.fileHintMine]}>
                {isPdf ? 'Tap to open' : 'Tap to open'}
              </Text>
            </View>
          </View>
        )}
      </TouchableOpacity>

      {viewerVisible ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setViewerVisible(false)}
        >
          <View style={styles.viewerRoot}>
            <Pressable style={styles.viewerBackdrop} onPress={() => setViewerVisible(false)} />
            <View style={[styles.viewerHeader, { paddingTop: spacing.lg }]}>
              <Text style={styles.viewerTitle} numberOfLines={1}>
                {attachment.name || 'Photo'}
              </Text>
              <TouchableOpacity
                style={styles.viewerClose}
                onPress={() => setViewerVisible(false)}
                accessibilityLabel="Close"
              >
                <Feather name="x" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            {viewerUri ? (
              <Image source={{ uri: viewerUri }} style={styles.viewerImage} resizeMode="contain" />
            ) : (
              <ActivityIndicator color="#FFFFFF" size="large" />
            )}
          </View>
        </Modal>
      ) : null}

      {textViewerVisible ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setTextViewerVisible(false)}
        >
          <View style={styles.textViewerRoot}>
            <View style={styles.textViewerCard}>
              <View style={styles.textViewerHeader}>
                <Text style={styles.textViewerTitle} numberOfLines={1}>
                  {attachment.name || 'Text file'}
                </Text>
                <TouchableOpacity onPress={() => setTextViewerVisible(false)} hitSlop={8}>
                  <Feather name="x" size={20} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.textViewerScroll}>
                <Text style={styles.textViewerBody}>{textContent}</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const { width: SCREEN_W } = Dimensions.get('window');

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  wrapMine: {
    alignSelf: 'flex-end',
  },
  pressable: {
    maxWidth: '100%',
  },
  imageFrame: {
    width: Math.min(220, SCREEN_W * 0.58),
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  imageFooterText: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: '#FFFFFF',
  },
  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,61,122,0.08)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    maxWidth: '100%',
  },
  fileChipMine: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  fileMeta: {
    flexShrink: 1,
  },
  fileText: {
    flexShrink: 1,
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.primary,
  },
  fileTextMine: {
    color: '#FFFFFF',
  },
  fileHint: {
    marginTop: 1,
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: colors.text.secondary,
  },
  fileHintMine: {
    color: 'rgba(255,255,255,0.75)',
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.94)',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  viewerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 12,
  },
  viewerTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#FFFFFF',
  },
  viewerClose: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  viewerImage: {
    width: SCREEN_W,
    height: '78%',
  },
  textViewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  textViewerCard: {
    maxHeight: '78%',
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: spacing.lg,
  },
  textViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.md,
  },
  textViewerTitle: {
    flex: 1,
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: colors.text.primary,
  },
  textViewerScroll: {
    maxHeight: 420,
  },
  textViewerBody: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.primary,
  },
});
