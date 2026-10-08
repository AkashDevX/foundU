import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  Image,
  Keyboard,
  NativeModules,
  TurboModuleRegistry,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../../components/SweetAlert';
import {
  ThemedDatePickerField,
  addYears,
  startOfToday,
} from '../../../components/ThemedDatePickerField';
import * as ImagePicker from 'react-native-image-picker';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import { useAppBootstrap } from '../../../context/AppBootstrapContext';
import type { UserProfileSnapshot } from '../../../types/userProfile';
import type { RegistrationWizardNext, VisaDocumentUpload } from '../../../types/registrationUploads';
import {
  createEmptyIdDocument,
  idDocumentIssues,
  isDriversLicenceType,
  isIdDocumentImage,
  MAX_ID_DOCUMENT_BYTES,
  normalizeIdDocument,
  summarizeIdDocuments,
  type IdDocumentDraft,
  type IdDocumentFile,
} from '../../../utils/idDocument';
import { isBlank, missingFieldsAlert } from '../validation';
import { EmployeeWeekSchedule } from './EmployeeWeekSchedule';
import {
  createEmptyWeekSchedule,
  summarizeWeekSchedule,
  weekScheduleIsComplete,
  weekScheduleIssues,
  weekScheduleToJson,
  type WeekSchedule,
} from '../../../utils/employeeAvailability';

const profileBlue = '#0056D2';
const MAX_VISA_DOCUMENT_BYTES = 15 * 1024 * 1024;

type VisaDocumentFile = VisaDocumentUpload;

function requiresVisaDocument(status: string): boolean {
  const value = status.trim().toLowerCase();
  if (!value) return false;
  return !value.includes('citizen') && !value.includes('permanent resident');
}

type IdFileSide = 'front' | 'back';

interface Step2WorkEligibilityProps {
  onNext: RegistrationWizardNext;
  /** False while another step is showing. The form stays mounted so values are kept. */
  active?: boolean;
}

function IdDocumentFileField({
  label,
  file,
  onPress,
  onRemove,
}: {
  label: string;
  file: IdDocumentFile | null;
  onPress: () => void;
  onRemove: () => void;
}) {
  const styles = createAccountScreenStyles;
  return (
    <View style={styles.idDocSlot}>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>{label} *</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, file && styles.idDocUploadAreaFilled]}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Add ${label}`}
      >
        {file && isIdDocumentImage(file.mime) ? (
          <Image source={{ uri: file.uri }} style={styles.idDocImage} resizeMode="cover" />
        ) : file ? (
          <>
            <Feather name="file-text" size={32} color={profileBlue} />
            <Text style={styles.idDocUploadText} numberOfLines={2}>
              {file.name}
            </Text>
          </>
        ) : (
          <>
            <Feather name="upload" size={32} color="#9CA3AF" />
            <Text style={styles.idDocUploadText}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      {file ? (
        <TouchableOpacity
          onPress={onRemove}
          activeOpacity={0.7}
          style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
        >
          <Text style={[styles.idDocAddBtnText, { color: '#EF4444' }]}>Remove</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Step2WorkEligibility({ onNext, active = true }: Step2WorkEligibilityProps) {
  const { picklists } = useAppBootstrap();
  const visaOptions = picklists.visa_status ?? [];
  const idTypeOptions = picklists.id_document_type ?? [];

  const [visaStatus, setVisaStatus] = useState('');
  const [visaDocument, setVisaDocument] = useState<VisaDocumentFile | null>(null);
  const [hasUnrestrictedWorkRights, setHasUnrestrictedWorkRights] = useState<boolean | null>(null);
  const [visaExpiry, setVisaExpiry] = useState('');
  const [idDocuments, setIdDocuments] = useState<IdDocumentDraft[]>([
    createEmptyIdDocument('1'),
    createEmptyIdDocument('2'),
  ]);
  const [activeIdModalDocId, setActiveIdModalDocId] = useState<string | null>(null);
  const [idSourceTarget, setIdSourceTarget] = useState<{ docId: string; side: IdFileSide } | null>(null);
  const idPickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [weekSchedule, setWeekSchedule] = useState<WeekSchedule>(() => createEmptyWeekSchedule());
  const [showVisaModal, setShowVisaModal] = useState(false);
  const [showVisaSource, setShowVisaSource] = useState(false);
  const visaPickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    listItems?: string[];
  } | null>(null);
  const hoursPerWeekRef = useRef<TextInput>(null);

  useEffect(() => () => {
    if (idPickerTimerRef.current) clearTimeout(idPickerTimerRef.current);
    if (visaPickerTimerRef.current) clearTimeout(visaPickerTimerRef.current);
  }, []);

  useEffect(() => {
    if (active) return;
    if (idPickerTimerRef.current) {
      clearTimeout(idPickerTimerRef.current);
      idPickerTimerRef.current = null;
    }
    if (visaPickerTimerRef.current) {
      clearTimeout(visaPickerTimerRef.current);
      visaPickerTimerRef.current = null;
    }
    setActiveIdModalDocId(null);
    setIdSourceTarget(null);
    setShowVisaModal(false);
    setShowVisaSource(false);
    setBlockingAlert(null);
  }, [active]);

  const styles = createAccountScreenStyles;

  const visaExpiryMinDate = startOfToday();
  const visaExpiryMaxDate = addYears(visaExpiryMinDate, 50);
  const visaExpiryDefaultDate = addYears(visaExpiryMinDate, 2);

  const updateIdDoc = (docId: string, updates: Partial<IdDocumentDraft>) => {
    setIdDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, ...updates } : d))
    );
  };

  const addIdDocument = () => {
    setIdDocuments((prev) => [...prev, createEmptyIdDocument(String(Date.now()))]);
  };

  const removeIdDocument = (docId: string) => {
    setIdDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      return next.length >= 2 ? next : prev;
    });
  };

  const openIdTypeModal = (docId: string) => setActiveIdModalDocId(docId);
  const closeIdTypeModal = () => setActiveIdModalDocId(null);

  const rejectVisaFile = (message: string) => {
    setBlockingAlert({
      title: 'Visa document',
      message,
    });
  };

  const acceptVisaDocument = (
    uri: string,
    name: string,
    mime: string,
    size: number | null | undefined,
    kind: 'image' | 'file',
  ) => {
    if (size != null && size > MAX_VISA_DOCUMENT_BYTES) {
      rejectVisaFile('Visa documents must be 15 MB or smaller.');
      return;
    }
    const normalized = normalizeIdDocument(name, mime);
    const image = normalized ? isIdDocumentImage(normalized.mime) : false;
    if (!normalized || (kind === 'image' && !image) || (kind === 'file' && image)) {
      rejectVisaFile(kind === 'image' ? 'Use a JPG or PNG.' : 'Use a PDF, DOC, or DOCX.');
      return;
    }
    setVisaDocument({ uri, name: normalized.name, mime: normalized.mime });
  };

  const takeVisaPhoto = () => {
    if (!ImagePicker.launchCamera) {
      rejectVisaFile('Camera is unavailable on this build. Upload a file instead.');
      return;
    }
    ImagePicker.launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'back',
        saveToPhotos: false,
        quality: 0.85,
        maxWidth: 2400,
        maxHeight: 2400,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        if (res.didCancel) return;
        if (res.errorCode === 'camera_unavailable') {
          rejectVisaFile('This device has no camera available. Upload a file instead.');
          return;
        }
        if (res.errorCode === 'permission') {
          rejectVisaFile('Allow camera access to photograph your visa, or upload a file instead.');
          return;
        }
        const asset = res.assets?.[0];
        if (res.errorCode || !asset?.uri) {
          rejectVisaFile('Could not take that photo. Try again, or upload a file.');
          return;
        }
        acceptVisaDocument(
          asset.uri,
          asset.fileName || 'visa.jpg',
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadVisaImage = () => {
    if (!ImagePicker.launchImageLibrary) {
      rejectVisaFile('Photo library is unavailable on this build. Take a photo instead.');
      return;
    }
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: 1,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        const asset = res.assets?.[0];
        if (res.didCancel || !asset?.uri) return;
        if (res.errorCode) {
          rejectVisaFile('Could not open that photo. Try again.');
          return;
        }
        acceptVisaDocument(
          asset.uri,
          asset.fileName || 'visa.jpg',
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadVisaOfficeFile = async () => {
    try {
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        rejectVisaFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }

      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy } = DocumentPicker;
      const [file] = await pick({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      const name = (file.name || 'visa').trim() || 'visa';
      const mime = file.type || '';
      if (file.size != null && file.size > MAX_VISA_DOCUMENT_BYTES) {
        rejectVisaFile('Visa documents must be 15 MB or smaller.');
        return;
      }
      const normalized = normalizeIdDocument(name, mime);
      if (!normalized || isIdDocumentImage(normalized.mime)) {
        rejectVisaFile('Use a PDF, DOC, or DOCX.');
        return;
      }

      let uri = file.uri;
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: normalized.name }],
        destination: 'cachesDirectory',
      });
      if (local.status === 'success' && local.localUri) {
        uri = local.localUri;
      }
      setVisaDocument({ uri, name: normalized.name, mime: normalized.mime });
    } catch (err) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        // Picker is not linked.
      }
      if (err instanceof Error && /null|getConstants|native module/i.test(err.message)) {
        rejectVisaFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      rejectVisaFile('Could not open that file. Use a PDF, DOC, or DOCX.');
    }
  };

  const chooseVisaSource = (kind: 'camera' | 'image' | 'file') => {
    setShowVisaSource(false);
    if (visaPickerTimerRef.current) clearTimeout(visaPickerTimerRef.current);
    visaPickerTimerRef.current = setTimeout(() => {
      if (kind === 'camera') takeVisaPhoto();
      else if (kind === 'image') uploadVisaImage();
      else void uploadVisaOfficeFile();
    }, 350);
  };

  const rejectIdFile = (message: string) => {
    setBlockingAlert({
      title: 'ID document',
      message,
    });
  };

  const acceptIdFile = (
    docId: string,
    side: IdFileSide,
    uri: string,
    name: string,
    mime: string,
    size: number | null | undefined,
    kind: 'image' | 'file',
  ) => {
    if (size != null && size > MAX_ID_DOCUMENT_BYTES) {
      rejectIdFile('ID documents must be 15 MB or smaller.');
      return;
    }
    const normalized = normalizeIdDocument(name, mime);
    const image = normalized ? isIdDocumentImage(normalized.mime) : false;
    if (!normalized || (kind === 'image' && !image) || (kind === 'file' && image)) {
      rejectIdFile(kind === 'image' ? 'Use a JPG or PNG.' : 'Use a PDF, DOC, or DOCX.');
      return;
    }
    const nextFile: IdDocumentFile = { uri, name: normalized.name, mime: normalized.mime };
    updateIdDoc(docId, side === 'back' ? { backFile: nextFile } : { file: nextFile });
  };

  const takeIdPhoto = (docId: string, side: IdFileSide) => {
    if (!ImagePicker.launchCamera) {
      rejectIdFile('Camera is unavailable on this build. Upload a file instead.');
      return;
    }
    ImagePicker.launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'back',
        saveToPhotos: false,
        quality: 0.85,
        maxWidth: 2400,
        maxHeight: 2400,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        if (res.didCancel) return;
        if (res.errorCode === 'camera_unavailable') {
          rejectIdFile('This device has no camera available. Upload a file instead.');
          return;
        }
        if (res.errorCode === 'permission') {
          rejectIdFile('Allow camera access to photograph your ID, or upload a file instead.');
          return;
        }
        const asset = res.assets?.[0];
        if (res.errorCode || !asset?.uri) {
          rejectIdFile('Could not take that photo. Try again, or upload a file.');
          return;
        }
        acceptIdFile(
          docId,
          side,
          asset.uri,
          asset.fileName || `id-${side}.jpg`,
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadIdImage = (docId: string, side: IdFileSide) => {
    if (!ImagePicker.launchImageLibrary) {
      rejectIdFile('Photo library is unavailable on this build. Take a photo instead.');
      return;
    }
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: 1,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        const asset = res.assets?.[0];
        if (res.didCancel || !asset?.uri) return;
        if (res.errorCode) {
          rejectIdFile('Could not open that photo. Try again.');
          return;
        }
        acceptIdFile(
          docId,
          side,
          asset.uri,
          asset.fileName || `id-${side}.jpg`,
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadIdOfficeFile = async (docId: string, side: IdFileSide) => {
    try {
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        rejectIdFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }

      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy } = DocumentPicker;
      const [file] = await pick({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      const name = (file.name || 'id-document').trim() || 'id-document';
      const mime = file.type || '';
      if (file.size != null && file.size > MAX_ID_DOCUMENT_BYTES) {
        rejectIdFile('ID documents must be 15 MB or smaller.');
        return;
      }
      const normalized = normalizeIdDocument(name, mime);
      if (!normalized || isIdDocumentImage(normalized.mime)) {
        rejectIdFile('Use a PDF, DOC, or DOCX.');
        return;
      }

      let uri = file.uri;
      const [local] = await keepLocalCopy({
        files: [{ uri: file.uri, fileName: normalized.name }],
        destination: 'cachesDirectory',
      });
      if (local.status === 'success' && local.localUri) {
        uri = local.localUri;
      }
      updateIdDoc(docId, side === 'back'
        ? { backFile: { uri, name: normalized.name, mime: normalized.mime } }
        : { file: { uri, name: normalized.name, mime: normalized.mime } });
    } catch (err) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        // Picker is not linked.
      }
      if (err instanceof Error && /null|getConstants|native module/i.test(err.message)) {
        rejectIdFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      rejectIdFile('Could not open that file. Use a PDF, DOC, or DOCX.');
    }
  };

  const chooseIdSource = (kind: 'camera' | 'image' | 'file') => {
    const target = idSourceTarget;
    if (!target) return;
    setIdSourceTarget(null);
    if (idPickerTimerRef.current) clearTimeout(idPickerTimerRef.current);
    idPickerTimerRef.current = setTimeout(() => {
      if (kind === 'camera') takeIdPhoto(target.docId, target.side);
      else if (kind === 'image') uploadIdImage(target.docId, target.side);
      else void uploadIdOfficeFile(target.docId, target.side);
    }, 350);
  };

  const idIssues = idDocumentIssues(idDocuments);

  const scheduleIssues = weekScheduleIssues(weekSchedule);
  const scheduleComplete = weekScheduleIsComplete(weekSchedule);

  const needsVisaDocument = requiresVisaDocument(visaStatus);
  const needsVisaExpiry = hasUnrestrictedWorkRights === false;
  const visaDocumentMissing = needsVisaDocument && !visaDocument;

  const step2Complete =
    !visaDocumentMissing &&
    !isBlank(visaStatus) &&
    hasUnrestrictedWorkRights !== null &&
    (!needsVisaExpiry || !isBlank(visaExpiry)) &&
    idIssues.length === 0 &&
    !isBlank(hoursPerWeek) &&
    scheduleComplete;

  const handleSave = useCallback(() => {
    const missing: string[] = [];
    if (isBlank(visaStatus)) missing.push('your visa or residency status');
    if (visaDocumentMissing) missing.push('your visa document');
    if (hasUnrestrictedWorkRights === null) {
      missing.push('whether you have unrestricted work rights in Australia');
    } else if (needsVisaExpiry && isBlank(visaExpiry)) {
      missing.push('your visa expiry date');
    }
    missing.push(...idIssues);
    if (isBlank(hoursPerWeek)) missing.push('how many hours you would like to work per week');
    missing.push(...scheduleIssues);

    if (missing.length > 0) {
      setBlockingAlert({
        title: 'Complete required fields',
        ...missingFieldsAlert(missing),
      });
      return;
    }
    const weeklyAvailabilityJson = weekScheduleToJson(weekSchedule);

    const idDocumentsJson = idDocuments
      .filter((d) => d.type)
      .map((d) => ({
        documentKey: d.id,
        idType: d.type,
        imageUploaded: Boolean(d.file),
        ...(isDriversLicenceType(d.type) ? { backImageUploaded: Boolean(d.backFile) } : {}),
      }));

    const idDocumentByKey: Record<string, IdDocumentFile> = {};
    const idDocumentBackByKey: Record<string, IdDocumentFile> = {};
    for (const d of idDocuments) {
      if (d.type && d.file) {
        idDocumentByKey[d.id] = d.file;
      }
      if (d.type && isDriversLicenceType(d.type) && d.backFile) {
        idDocumentBackByKey[d.id] = d.backFile;
      }
    }

    onNext({
      visaStatus: visaStatus || undefined,
      unrestrictedWorkRights:
        hasUnrestrictedWorkRights === null ? undefined : hasUnrestrictedWorkRights ? 'Yes' : 'No',
      visaExpiry: needsVisaExpiry ? visaExpiry.trim() || undefined : undefined,
      visaDocumentUploaded: needsVisaDocument && visaDocument ? 'Yes' : undefined,
      hoursPerWeek: hoursPerWeek.trim() || undefined,
      weeklyAvailabilitySummary: summarizeWeekSchedule(weekSchedule) || undefined,
      weeklyAvailabilityJson,
      idDocumentsSummary: summarizeIdDocuments(idDocuments) || undefined,
      idDocumentsJson,
    }, {
      idDocumentByKey,
      idDocumentBackByKey,
      visaDocument: needsVisaDocument && visaDocument ? visaDocument : null,
    });
  }, [
    idIssues,
    onNext,
    visaStatus,
    visaDocument,
    visaDocumentMissing,
    hasUnrestrictedWorkRights,
    visaExpiry,
    needsVisaDocument,
    needsVisaExpiry,
    hoursPerWeek,
    weekSchedule,
    idDocuments,
    scheduleIssues,
  ]);

  return (
    <>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Text style={styles.title}>Work eligibility</Text>
            <Text style={styles.subtitle}>
              Confirm your right to work in Australia.
            </Text>

            <Text style={styles.fieldLabel}>What is your visa or residency status? *</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowVisaModal(true)}
              activeOpacity={0.8}
            >
              <Text
                style={[styles.inputField, !visaStatus && { color: '#9CA3AF' }]}
              >
                {visaStatus || 'Select visa status'}
              </Text>
              <Feather
                name="chevron-down"
                size={20}
                color="#6B7280"
                style={styles.inputIconRight}
              />
            </TouchableOpacity>

            <Modal
              visible={showVisaModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowVisaModal(false)}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setShowVisaModal(false)}
              >
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    {visaOptions.map((opt, idx) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.modalOption,
                          idx === visaOptions.length - 1
                            ? styles.modalOptionLast
                            : null,
                        ]}
                        onPress={() => {
                          setVisaStatus(opt.value);
                          if (!requiresVisaDocument(opt.value)) {
                            setVisaDocument(null);
                          }
                          setShowVisaModal(false);
                        }}
                      >
                        <Text style={styles.modalOptionText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableWithoutFeedback>
              </Pressable>
            </Modal>

            {needsVisaDocument && (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.fieldLabel}>Upload your visa *</Text>
                <TouchableOpacity
                  style={[
                    styles.idDocUploadArea,
                    visaDocument && styles.idDocUploadAreaFilled,
                  ]}
                  onPress={() => setShowVisaSource(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Upload your visa"
                >
                  {visaDocument && isIdDocumentImage(visaDocument.mime) ? (
                    <Image
                      source={{ uri: visaDocument.uri }}
                      style={styles.idDocImage}
                      resizeMode="cover"
                    />
                  ) : visaDocument ? (
                    <>
                      <Feather name="file-text" size={32} color={profileBlue} />
                      <Text style={styles.idDocUploadText} numberOfLines={2}>
                        {visaDocument.name}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Feather name="upload" size={32} color="#9CA3AF" />
                      <Text style={styles.idDocUploadText}>Tap to upload</Text>
                    </>
                  )}
                </TouchableOpacity>
                {visaDocument ? (
                  <TouchableOpacity
                    onPress={() => setVisaDocument(null)}
                    activeOpacity={0.7}
                    style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                  >
                    <Text style={[styles.idDocAddBtnText, { color: '#EF4444' }]}>Remove visa document</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            <Modal
              visible={showVisaSource}
              transparent
              animationType="fade"
              onRequestClose={() => setShowVisaSource(false)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowVisaSource(false)}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    <Text style={[styles.photoSourceTitle, { marginBottom: spacing.sm }]}>Add visa document</Text>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseVisaSource('camera')}
                      accessibilityRole="button"
                      accessibilityLabel="Take photo"
                    >
                      <Feather name="camera" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Take photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseVisaSource('image')}
                      accessibilityRole="button"
                      accessibilityLabel="Upload an image"
                    >
                      <Feather name="image" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Upload an image</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseVisaSource('file')}
                      accessibilityRole="button"
                      accessibilityLabel="Upload file"
                    >
                      <Feather name="file-text" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Upload file (PDF, DOC, or DOCX)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalOption, styles.modalOptionLast]}
                      onPress={() => setShowVisaSource(false)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Text style={styles.modalOptionText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </Pressable>
            </Modal>

            <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>
              Do you have unrestricted work rights in Australia? *
            </Text>
            <View style={styles.sexRow}>
              <TouchableOpacity
                style={[
                  styles.sexOption,
                  hasUnrestrictedWorkRights === true && styles.sexOptionActive,
                ]}
                onPress={() => {
                  setHasUnrestrictedWorkRights(true);
                  setVisaExpiry('');
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sexOptionText,
                    hasUnrestrictedWorkRights === true &&
                      styles.sexOptionTextActive,
                  ]}
                >
                  Yes
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.sexOption,
                  hasUnrestrictedWorkRights === false && styles.sexOptionActive,
                ]}
                onPress={() => setHasUnrestrictedWorkRights(false)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.sexOptionText,
                    hasUnrestrictedWorkRights === false &&
                      styles.sexOptionTextActive,
                  ]}
                >
                  No
                </Text>
              </TouchableOpacity>
            </View>

            {needsVisaExpiry && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>
                  When does your visa expire? *
                </Text>
                <ThemedDatePickerField
                  value={visaExpiry}
                  onChange={setVisaExpiry}
                  minimumDate={visaExpiryMinDate}
                  maximumDate={visaExpiryMaxDate}
                  defaultPickerDate={visaExpiryDefaultDate}
                />
              </>
            )}

            <Text style={[styles.fieldLabel, styles.idDocSection]}>
              ID Information *
            </Text>
            <Text style={styles.fieldHint}>Please upload the following information.</Text>
            {idDocuments.map((doc, index) => {
              const licence = isDriversLicenceType(doc.type);
              return (
              <View key={doc.id} style={styles.idDocCard}>
                <View style={styles.idDocCardHeader}>
                  <Text style={styles.idDocCardLabel}>
                    Document {index + 1} *
                  </Text>
                  {idDocuments.length > 2 && (
                    <TouchableOpacity
                      style={styles.idDocRemoveBtn}
                      onPress={() => removeIdDocument(doc.id)}
                    >
                      <Feather name="trash-2" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>
                  ID Type *
                </Text>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => openIdTypeModal(doc.id)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.inputField,
                      !doc.type && { color: '#9CA3AF' },
                    ]}
                  >
                    {doc.type || 'Select ID type'}
                  </Text>
                  <Feather
                    name="chevron-down"
                    size={20}
                    color="#6B7280"
                    style={styles.inputIconRight}
                  />
                </TouchableOpacity>
                <IdDocumentFileField
                  label={licence ? 'Front' : 'Document'}
                  file={doc.file}
                  onPress={() => setIdSourceTarget({ docId: doc.id, side: 'front' })}
                  onRemove={() => updateIdDoc(doc.id, { file: null })}
                />
                {licence ? (
                  <IdDocumentFileField
                    label="Back"
                    file={doc.backFile}
                    onPress={() => setIdSourceTarget({ docId: doc.id, side: 'back' })}
                    onRemove={() => updateIdDoc(doc.id, { backFile: null })}
                  />
                ) : null}
              </View>
              );
            })}
            <TouchableOpacity
              style={styles.idDocAddBtn}
              onPress={addIdDocument}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={18} color={profileBlue} />
              <Text style={styles.idDocAddBtnText}>Add another ID</Text>
            </TouchableOpacity>

            <Modal
              visible={!!activeIdModalDocId}
              transparent
              animationType="fade"
              onRequestClose={closeIdTypeModal}
            >
              <Pressable style={styles.modalOverlay} onPress={closeIdTypeModal}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    {idTypeOptions.map((opt, idx) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.modalOption,
                          idx === idTypeOptions.length - 1
                            ? styles.modalOptionLast
                            : null,
                        ]}
                        onPress={() => {
                          if (activeIdModalDocId) {
                            updateIdDoc(activeIdModalDocId, {
                              type: opt.value,
                            });
                            closeIdTypeModal();
                          }
                        }}
                      >
                        <Text style={styles.modalOptionText}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableWithoutFeedback>
              </Pressable>
            </Modal>

            <Modal
              visible={idSourceTarget !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setIdSourceTarget(null)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setIdSourceTarget(null)}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    <Text style={[styles.photoSourceTitle, { marginBottom: spacing.sm }]}>Add ID document</Text>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseIdSource('camera')}
                      accessibilityRole="button"
                      accessibilityLabel="Take photo"
                    >
                      <Feather name="camera" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Take photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseIdSource('image')}
                      accessibilityRole="button"
                      accessibilityLabel="Upload an image"
                    >
                      <Feather name="image" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Upload an image</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseIdSource('file')}
                      accessibilityRole="button"
                      accessibilityLabel="Upload file"
                    >
                      <Feather name="file-text" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Upload file (PDF, DOC, or DOCX)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalOption, styles.modalOptionLast]}
                      onPress={() => setIdSourceTarget(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Text style={styles.modalOptionText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </Pressable>
            </Modal>

            <Text style={[styles.fieldLabel, { marginTop: spacing.xxl }]}>
              Availability
            </Text>
            <Text style={styles.idDocCardLabel}>
              How many hours would you like to work per week? *
            </Text>
            <Pressable
              style={styles.input}
              onPress={() => hoursPerWeekRef.current?.focus()}
            >
              <TextInput
                ref={hoursPerWeekRef}
                style={styles.inputField}
                placeholder="e.g. 20, 38"
                placeholderTextColor="#9CA3AF"
                value={hoursPerWeek}
                onChangeText={setHoursPerWeek}
                keyboardType="number-pad"
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
              />
            </Pressable>

            <Text style={[styles.idDocCardLabel, { marginTop: spacing.lg }]}>
              What is your preferred weekly availability? *
            </Text>
            <EmployeeWeekSchedule
              value={weekSchedule}
              onChange={setWeekSchedule}
            />

            <TouchableOpacity
              style={[styles.saveBtn, !step2Complete && { opacity: 0.6 }]}
              activeOpacity={0.88}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>Save & Continue</Text>
              <Feather name="arrow-right" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <SweetAlert
        visible={blockingAlert !== null}
        title={blockingAlert?.title ?? ''}
        message={blockingAlert?.message ?? ''}
        listItems={blockingAlert?.listItems}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="warning"
        onClose={() => setBlockingAlert(null)}
        onConfirm={() => setBlockingAlert(null)}
      />
    </>
  );
}
