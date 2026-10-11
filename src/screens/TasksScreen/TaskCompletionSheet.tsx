import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import { SignaturePad, type SignatureDrawing } from '../../components/SignaturePad';
import {
  completeTaskWithEvidence,
  fetchTaskPhoto,
  startTaskWithPhotos,
  type TaskUploadPhoto,
} from '../../services/tasksApi';
import { colors, fontFamily, spacing } from '../../theme/theme';
import type { EmployeeTask, TaskPhotoRef } from '../../types/tasks';

const MAX_PHOTOS = 5;

type PhotoSource = 'library' | 'camera';
type SheetMode = 'start' | 'finish';

type DraftPhoto = TaskUploadPhoto & { id: string };

type TaskEvidenceSheetProps = {
  task: EmployeeTask | null;
  mode: SheetMode;
  onClose: () => void;
  onUpdated: (task: EmployeeTask) => void;
};

export function TaskPhotoStrip({
  taskId,
  photos,
  kind,
  version,
}: {
  taskId: string;
  photos: TaskPhotoRef[];
  kind: 'before' | 'after';
  version?: string | null;
}) {
  if (photos.length === 0) return null;
  return (
    <View style={styles.photoRow}>
      {photos.map((photo) => (
        <TaskPhotoThumb
          key={`${kind}-${photo.index}-${version ?? ''}`}
          taskId={taskId}
          kind={kind}
          index={photo.index}
          version={version}
        />
      ))}
    </View>
  );
}

function TaskPhotoThumb({
  taskId,
  kind,
  index,
  version,
}: {
  taskId: string;
  kind: 'before' | 'after';
  index: number;
  version?: string | null;
}) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setUri(null);
    setFailed(false);
    void fetchTaskPhoto(taskId, kind, index, version).then((next) => {
      if (!active) return;
      if (!next) setFailed(true);
      else setUri(next);
    });
    return () => {
      active = false;
    };
  }, [taskId, kind, index, version]);

  return (
    <View style={styles.savedThumb}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumbImage} resizeMode="cover" />
      ) : (
        <View style={styles.thumbFallback}>
          {failed ? (
            <Feather name="image" size={16} color="#94A3B8" />
          ) : (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>
      )}
    </View>
  );
}

function nextPhotoId(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function assetsToDrafts(assets: ImagePicker.Asset[] | undefined): DraftPhoto[] {
  return (assets ?? [])
    .filter((asset) => Boolean(asset.uri))
    .map((asset) => ({
      id: nextPhotoId(),
      uri: asset.uri as string,
      name: asset.fileName || 'task-photo.jpg',
      type: asset.type || 'image/jpeg',
    }));
}

const pickerOptions = {
  mediaType: 'photo' as const,
  quality: 0.7 as const,
  maxWidth: 1600,
  maxHeight: 1600,
};

function pickPhotos(source: PhotoSource, limit: number, onPicked: (photos: DraftPhoto[]) => void) {
  const handler = (res: ImagePicker.ImagePickerResponse) => {
    if (res.didCancel) return;
    const next = assetsToDrafts(res.assets).slice(0, limit);
    if (next.length === 0) return;
    onPicked(next);
  };
  if (source === 'camera' && ImagePicker.launchCamera) {
    ImagePicker.launchCamera(pickerOptions, handler);
    return;
  }
  ImagePicker.launchImageLibrary?.({ ...pickerOptions, selectionLimit: limit }, handler);
}

function PhotoDraftGrid({
  photos,
  disabled,
  onChange,
  onReplace,
}: {
  photos: DraftPhoto[];
  disabled: boolean;
  onChange: (photos: DraftPhoto[]) => void;
  onReplace: (id: string) => void;
}) {
  return (
    <View style={styles.photoRow}>
      {photos.map((photo, index) => (
        <View key={photo.id} style={styles.draftThumb}>
          <TouchableOpacity
            style={styles.thumbImage}
            onPress={() => onReplace(photo.id)}
            disabled={disabled}
            accessibilityLabel={`Replace photo ${index + 1}`}
          >
            <Image source={{ uri: photo.uri }} style={styles.thumbImage} resizeMode="cover" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeThumb}
            onPress={() => onChange(photos.filter((item) => item.id !== photo.id))}
            disabled={disabled}
            accessibilityLabel={`Remove photo ${index + 1}`}
          >
            <Feather name="x" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

export function TaskEvidenceSheet({ task, mode, onClose, onUpdated }: TaskEvidenceSheetProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);
  const signatureRef = useRef<SignatureDrawing | null>(null);
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const replaceIdRef = useRef<string | null>(null);
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const starting = mode === 'start';

  useEffect(() => {
    if (!task) return;
    setPhotos([]);
    setError(null);
    setSubmitting(false);
    setSourceOpen(false);
    replaceIdRef.current = null;
    signatureRef.current = null;
  }, [task?.id, mode]);

  useEffect(() => {
    return () => {
      if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    };
  }, []);

  const openAdd = () => {
    if (submitting || photos.length >= MAX_PHOTOS) return;
    replaceIdRef.current = null;
    setSourceOpen(true);
  };

  const openReplace = (id: string) => {
    if (submitting) return;
    replaceIdRef.current = id;
    setSourceOpen(true);
  };

  const chooseSource = (source: PhotoSource) => {
    const replacingId = replaceIdRef.current;
    setSourceOpen(false);
    if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    pickerTimerRef.current = setTimeout(() => {
      if (replacingId) {
        pickPhotos(source, 1, (picked) => {
          const replacement = picked[0];
          if (!replacement) return;
          setPhotos((current) =>
            current.map((photo) => (photo.id === replacingId ? { ...replacement, id: replacingId } : photo)),
          );
          setError(null);
        });
        return;
      }
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) return;
      pickPhotos(source, room, (picked) => {
        setPhotos((current) => [...current, ...picked].slice(0, MAX_PHOTOS));
        setError(null);
      });
    }, 350);
  };

  const submit = async () => {
    if (!task || submitting) return;
    if (photos.length === 0) {
      setError(starting ? 'Add at least one before photo.' : 'Add at least one after photo.');
      return;
    }
    const drawing = signatureRef.current;
    if (!starting && (!drawing || drawing.strokes.length === 0)) {
      setError('Draw your signature after the finished photos.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const uploads = photos.map(({ uri, name, type }) => ({ uri, name, type }));
    const result = starting
      ? await startTaskWithPhotos(task.id, uploads)
      : await completeTaskWithEvidence(task.id, uploads, drawing as SignatureDrawing);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onUpdated(result.task);
  };

  const photoLabel = starting ? 'Before photos' : 'After photos';

  return (
    <Modal visible={task !== null} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: insets.top }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{starting ? 'Start task' : 'Finish task'}</Text>
          <TouchableOpacity onPress={onClose} disabled={submitting} style={styles.closeBtn} accessibilityLabel="Close">
            <Feather name="x" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>

        {task ? (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={[styles.sheetBody, { paddingBottom: insets.bottom + spacing.xxl }]}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.taskTitle}>{task.title}</Text>
            {task.description.trim() !== '' ? (
              <View style={styles.copyBlock}>
                <Text style={styles.sectionLabel}>Instructions</Text>
                <Text style={styles.taskDesc}>{task.description}</Text>
              </View>
            ) : null}
            {task.specialNote.trim() !== '' ? (
              <View style={styles.noteBlock}>
                <Text style={styles.noteLabel}>Special note</Text>
                <Text style={styles.taskDesc}>{task.specialNote}</Text>
              </View>
            ) : null}

            {!starting && task.beforePhotos.length > 0 ? (
              <View>
                <Text style={styles.sectionLabel}>Before</Text>
                <TaskPhotoStrip taskId={task.id} photos={task.beforePhotos} kind="before" version={task.startedAt} />
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>{photoLabel}</Text>
            {photos.length > 0 ? (
              <PhotoDraftGrid
                photos={photos}
                disabled={submitting}
                onChange={setPhotos}
                onReplace={openReplace}
              />
            ) : null}
            {photos.length < MAX_PHOTOS ? (
              <TouchableOpacity
                style={styles.uploadBox}
                onPress={openAdd}
                disabled={submitting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Add ${photoLabel.toLowerCase()}`}
              >
                <Feather name="upload" size={32} color="#9CA3AF" />
                <Text style={styles.uploadBoxText}>Tap to upload</Text>
              </TouchableOpacity>
            ) : null}

            {!starting ? (
              <View style={styles.signatureWrap}>
                <SignaturePad drawingRef={signatureRef} scrollRef={scrollRef} />
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnBusy]}
              onPress={() => void submit()}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitBtnText}>{starting ? 'Start task' : 'Finish task'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        ) : null}

        {sourceOpen ? (
          <Pressable style={styles.sourceOverlay} onPress={() => setSourceOpen(false)}>
            <TouchableWithoutFeedback>
              <View style={styles.sourceCard}>
                <Text style={styles.sourceTitle}>{replaceIdRef.current ? 'Replace photo' : 'Add photo'}</Text>
                <TouchableOpacity
                  style={styles.sourceOption}
                  onPress={() => chooseSource('camera')}
                  accessibilityRole="button"
                  accessibilityLabel="Take photo"
                >
                  <Feather name="camera" size={20} color={colors.accent} />
                  <Text style={styles.sourceOptionText}>Take photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sourceOption}
                  onPress={() => chooseSource('library')}
                  accessibilityRole="button"
                  accessibilityLabel="Choose from gallery"
                >
                  <Feather name="image" size={20} color={colors.accent} />
                  <Text style={styles.sourceOptionText}>Choose from gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sourceOption, styles.sourceOptionLast]}
                  onPress={() => setSourceOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                >
                  <Text style={styles.sourceOptionText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#F8FAFC' },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  sheetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: colors.text.primary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  sheetBody: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  taskTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 18,
    color: colors.text.primary,
  },
  copyBlock: { marginTop: spacing.md },
  noteBlock: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  noteLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#B45309',
  },
  taskDesc: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#64748B',
  },
  uploadBox: {
    height: 120,
    marginTop: spacing.sm,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBoxText: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#6B7280',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  savedThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  draftThumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  removeThumb: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.78)',
  },
  sourceOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.xxl,
    zIndex: 20,
  },
  sourceCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing.lg,
  },
  sourceTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  sourceOption: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  sourceOptionLast: { borderBottomWidth: 0 },
  sourceOptionText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: colors.text.primary,
  },
  signatureWrap: { marginTop: spacing.lg },
  error: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#B91C1C',
  },
  submitBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    minWidth: 132,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  submitBtnBusy: { opacity: 0.8 },
  submitBtnText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
