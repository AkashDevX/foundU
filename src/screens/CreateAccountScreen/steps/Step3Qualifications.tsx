import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  NativeModules,
  TurboModuleRegistry,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { SweetAlert } from '../../../components/SweetAlert';
import {
  ThemedDatePickerField,
  addYears,
  displayDateToIso,
  startOfToday,
} from '../../../components/ThemedDatePickerField';
import * as ImagePicker from 'react-native-image-picker';
import { spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import { useAppBootstrap } from '../../../context/AppBootstrapContext';
import type { UserProfileSnapshot } from '../../../types/userProfile';
import type { RegistrationWizardNext } from '../../../types/registrationUploads';
import {
  isIdDocumentImage,
  MAX_ID_DOCUMENT_BYTES,
  normalizeIdDocument,
  type IdDocumentFile,
} from '../../../utils/idDocument';
import {
  MAX_RESUME_DOCUMENT_BYTES,
  normalizeResumeDocument,
  type ResumeDocumentUpload,
} from '../../../utils/resumeDocument';
import { isBlank, missingFieldsAlert } from '../validation';

const profileBlue = '#0056D2';

type DocWithExpiry = {
  id: string;
  file: IdDocumentFile | null;
  expiry: string;
};

type TypedDocumentItem = {
  id: string;
  type: string;
  typeOther: string;
  file: IdDocumentFile | null;
  expiry: string;
};

type ComplianceTarget =
  | { kind: 'police' }
  | { kind: 'fit' }
  | { kind: 'licence'; id: string }
  | { kind: 'insurance'; id: string };

type LicenceItem = TypedDocumentItem;
type InsuranceItem = TypedDocumentItem;

function isOtherDocumentType(type: string): boolean {
  return type.trim().toLowerCase() === 'other';
}

function documentSummaryLabel(item: TypedDocumentItem): string {
  if (isOtherDocumentType(item.type)) {
    return item.typeOther.trim() || item.type;
  }
  return item.type;
}

function missingSpecifiedDocumentType(item: TypedDocumentItem): boolean {
  return isOtherDocumentType(item.type) && isBlank(item.typeOther);
}

function uploadedWithoutExpiry(doc: DocWithExpiry): boolean {
  return doc.file != null && isBlank(doc.expiry);
}

function incompleteDocumentGaps(item: TypedDocumentItem): string[] {
  const gaps: string[] = [];
  if (isBlank(item.type)) {
    gaps.push('type');
  } else if (missingSpecifiedDocumentType(item)) {
    gaps.push('document type');
  }
  if (!item.file) gaps.push('document');
  if (isBlank(item.expiry)) gaps.push('expiry');
  return gaps;
}

interface Step3QualificationsProps {
  onNext: RegistrationWizardNext;
  /** False while another step is showing. The form stays mounted so values are kept. */
  active?: boolean;
}

export function Step3Qualifications({ onNext, active = true }: Step3QualificationsProps) {
  const { picklists } = useAppBootstrap();
  const licenceOptions = picklists.licence_type ?? [];
  const insuranceOptions = picklists.insurance_type ?? [];

  const [resume, setResume] = useState<ResumeDocumentUpload | null>(null);
  const [policeCheck, setPoliceCheck] = useState<DocWithExpiry>({ id: 'pc', file: null, expiry: '' });
  const [fitToWork, setFitToWork] = useState<DocWithExpiry>({ id: 'ftw', file: null, expiry: '' });
  const [licences, setLicences] = useState<LicenceItem[]>([]);
  const [insurances, setInsurances] = useState<InsuranceItem[]>([]);
  const [showLicenceModal, setShowLicenceModal] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [activeLicenceId, setActiveLicenceId] = useState<string | null>(null);
  const [activeInsuranceId, setActiveInsuranceId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<ComplianceTarget | null>(null);
  const uploadPickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blockingAlert, setBlockingAlert] = useState<{
    title: string;
    message: string;
    listItems?: string[];
  } | null>(null);
  const licenceSpecifyRefs = useRef<Record<string, TextInput | null>>({});
  const insuranceSpecifyRefs = useRef<Record<string, TextInput | null>>({});
  const licenceOtherFocusId = useRef<string | null>(null);
  const insuranceOtherFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (active) return;
    if (uploadPickerTimerRef.current) {
      clearTimeout(uploadPickerTimerRef.current);
      uploadPickerTimerRef.current = null;
    }
    setShowLicenceModal(false);
    setShowInsuranceModal(false);
    setActiveLicenceId(null);
    setActiveInsuranceId(null);
    setUploadTarget(null);
    setBlockingAlert(null);
  }, [active]);

  const styles = createAccountScreenStyles;

  const expiryMinDate = startOfToday();
  const expiryMaxDate = addYears(expiryMinDate, 50);
  const expiryDefaultDate = addYears(expiryMinDate, 1);

  const rejectResume = (message: string) => {
    setBlockingAlert({
      title: 'Resume / CV',
      message,
    });
  };

  const pickResume = async () => {
    try {
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        rejectResume('Document picker is unavailable on this build. Rebuild the app, then try again.');
        return;
      }

      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy } = DocumentPicker;
      const [file] = await pick({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      const name = (file.name || 'resume').trim() || 'resume';
      const mime = file.type || '';
      if (file.hasRequestedType === false) {
        rejectResume('Use a PDF, DOC, or DOCX resume.');
        return;
      }
      if (file.size != null && file.size > MAX_RESUME_DOCUMENT_BYTES) {
        rejectResume('Resumes must be 15 MB or smaller.');
        return;
      }
      const normalized = normalizeResumeDocument(name, mime);
      if (!normalized) {
        rejectResume('Use a PDF, DOC, or DOCX resume.');
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
      setResume({ uri, name: normalized.name, mime: normalized.mime });
    } catch (err) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        rejectResume('Document picker is unavailable on this build. Rebuild the app, then try again.');
        return;
      }
      if (err instanceof Error && /null|getConstants|native module/i.test(err.message)) {
        rejectResume('Document picker is unavailable on this build. Rebuild the app, then try again.');
        return;
      }
      rejectResume('Could not open that file. Use a PDF, DOC, or DOCX.');
    }
  };

  const addLicence = () => {
    const id = String(Date.now());
    setLicences((prev) => [...prev, { id, type: '', typeOther: '', file: null, expiry: '' }]);
    setActiveLicenceId(id);
    setShowLicenceModal(true);
  };

  const addInsurance = () => {
    const id = String(Date.now());
    setInsurances((prev) => [...prev, { id, type: '', typeOther: '', file: null, expiry: '' }]);
    setActiveInsuranceId(id);
    setShowInsuranceModal(true);
  };

  const updateLicence = (id: string, updates: Partial<LicenceItem>) => {
    setLicences((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const updateInsurance = (id: string, updates: Partial<InsuranceItem>) => {
    setInsurances((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  useEffect(() => () => {
    if (uploadPickerTimerRef.current) clearTimeout(uploadPickerTimerRef.current);
  }, []);

  const rejectComplianceFile = (message: string) => {
    setBlockingAlert({ title: 'Document', message });
  };

  const storeComplianceFile = (target: ComplianceTarget, file: IdDocumentFile) => {
    if (target.kind === 'police') {
      setPoliceCheck((prev) => ({ ...prev, file }));
      return;
    }
    if (target.kind === 'fit') {
      setFitToWork((prev) => ({ ...prev, file }));
      return;
    }
    if (target.kind === 'licence') {
      updateLicence(target.id, { file });
      return;
    }
    updateInsurance(target.id, { file });
  };

  const acceptComplianceFile = (
    target: ComplianceTarget,
    uri: string,
    name: string,
    mime: string,
    size: number | null | undefined,
    kind: 'image' | 'file',
  ) => {
    if (size != null && size > MAX_ID_DOCUMENT_BYTES) {
      rejectComplianceFile('Documents must be 15 MB or smaller.');
      return;
    }
    const normalized = normalizeIdDocument(name, mime);
    const image = normalized ? isIdDocumentImage(normalized.mime) : false;
    if (!normalized || (kind === 'image' && !image) || (kind === 'file' && image)) {
      rejectComplianceFile(kind === 'image' ? 'Use a JPG or PNG.' : 'Use a PDF, DOC, or DOCX.');
      return;
    }
    storeComplianceFile(target, { uri, name: normalized.name, mime: normalized.mime });
  };

  const takeCompliancePhoto = (target: ComplianceTarget) => {
    if (!ImagePicker.launchCamera) {
      rejectComplianceFile('Camera is unavailable on this build. Upload a file instead.');
      return;
    }
    ImagePicker.launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'back',
        saveToPhotos: false,
        maxWidth: 2400,
        maxHeight: 2400,
        assetRepresentationMode: 'compatible',
      },
      (res) => {
        if (res.didCancel) return;
        if (res.errorCode === 'camera_unavailable') {
          rejectComplianceFile('This device has no camera available. Upload a file instead.');
          return;
        }
        if (res.errorCode === 'permission') {
          rejectComplianceFile('Allow camera access to photograph this document, or upload a file instead.');
          return;
        }
        const asset = res.assets?.[0];
        if (res.errorCode || !asset?.uri) {
          rejectComplianceFile('Could not take that photo. Try again, or upload a file.');
          return;
        }
        acceptComplianceFile(
          target,
          asset.uri,
          asset.fileName || 'document.jpg',
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadComplianceImage = (target: ComplianceTarget) => {
    if (!ImagePicker.launchImageLibrary) {
      rejectComplianceFile('Photo library is unavailable on this build. Take a photo instead.');
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
          rejectComplianceFile('Could not open that photo. Try again.');
          return;
        }
        acceptComplianceFile(
          target,
          asset.uri,
          asset.fileName || 'document.jpg',
          asset.type || 'image/jpeg',
          asset.fileSize,
          'image',
        );
      },
    );
  };

  const uploadComplianceOfficeFile = async (target: ComplianceTarget) => {
    try {
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        rejectComplianceFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }

      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy } = DocumentPicker;
      const [file] = await pick({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      const name = (file.name || 'document').trim() || 'document';
      const mime = file.type || '';
      if (file.size != null && file.size > MAX_ID_DOCUMENT_BYTES) {
        rejectComplianceFile('Documents must be 15 MB or smaller.');
        return;
      }
      const normalized = normalizeIdDocument(name, mime);
      if (!normalized || isIdDocumentImage(normalized.mime)) {
        rejectComplianceFile('Use a PDF, DOC, or DOCX.');
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
      storeComplianceFile(target, { uri, name: normalized.name, mime: normalized.mime });
    } catch (err) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        rejectComplianceFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      if (err instanceof Error && /null|getConstants|native module/i.test(err.message)) {
        rejectComplianceFile('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      rejectComplianceFile('Could not open that file. Use a PDF, DOC, or DOCX.');
    }
  };

  const chooseComplianceSource = (kind: 'camera' | 'image' | 'file') => {
    const target = uploadTarget;
    if (!target) return;
    setUploadTarget(null);
    if (uploadPickerTimerRef.current) clearTimeout(uploadPickerTimerRef.current);
    uploadPickerTimerRef.current = setTimeout(() => {
      if (kind === 'camera') takeCompliancePhoto(target);
      else if (kind === 'image') uploadComplianceImage(target);
      else void uploadComplianceOfficeFile(target);
    }, 350);
  };

  const removeLicence = (id: string) => setLicences((prev) => prev.filter((l) => l.id !== id));
  const removeInsurance = (id: string) => setInsurances((prev) => prev.filter((i) => i.id !== id));

  const isLicenceComplete = (l: LicenceItem) => incompleteDocumentGaps(l).length === 0;
  const isInsuranceComplete = (i: InsuranceItem) => incompleteDocumentGaps(i).length === 0;

  useEffect(() => {
    const id = licenceOtherFocusId.current;
    if (!id) return;
    const item = licences.find((l) => l.id === id);
    if (!item || !isOtherDocumentType(item.type)) return;
    licenceOtherFocusId.current = null;
    const handle = requestAnimationFrame(() => {
      licenceSpecifyRefs.current[id]?.focus();
    });
    return () => cancelAnimationFrame(handle);
  }, [licences]);

  useEffect(() => {
    const id = insuranceOtherFocusId.current;
    if (!id) return;
    const item = insurances.find((row) => row.id === id);
    if (!item || !isOtherDocumentType(item.type)) return;
    insuranceOtherFocusId.current = null;
    const handle = requestAnimationFrame(() => {
      insuranceSpecifyRefs.current[id]?.focus();
    });
    return () => cancelAnimationFrame(handle);
  }, [insurances]);

  const specifiedDocumentTypesComplete =
    licences.every((item) => !missingSpecifiedDocumentType(item)) &&
    insurances.every((item) => !missingSpecifiedDocumentType(item));
  const uploadedDocumentsHaveExpiry =
    !uploadedWithoutExpiry(policeCheck) && !uploadedWithoutExpiry(fitToWork);
  const step3Complete =
    specifiedDocumentTypesComplete &&
    uploadedDocumentsHaveExpiry &&
    licences.every(isLicenceComplete) &&
    insurances.every(isInsuranceComplete);

  const renderDocCard = (
    title: string,
    doc: DocWithExpiry,
    target: ComplianceTarget,
    required?: boolean,
  ) => (
    <View key={doc.id} style={styles.idDocCard}>
      <Text style={styles.idDocCardLabel}>{title}{required ? ' *' : ''}</Text>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, doc.file && styles.idDocUploadAreaFilled]}
        onPress={() => setUploadTarget(target)}
        activeOpacity={0.8}
      >
        {doc.file && isIdDocumentImage(doc.file.mime) ? (
          <Image source={{ uri: doc.file.uri }} style={styles.idDocImage} resizeMode="cover" />
        ) : doc.file ? (
          <>
            <Feather name="file-text" size={32} color={profileBlue} />
            <Text style={styles.idDocUploadText} numberOfLines={2}>
              {doc.file.name}
            </Text>
          </>
        ) : (
          <>
            <Feather name="upload" size={32} color="#9CA3AF" />
            <Text style={styles.idDocUploadText}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>
        Expiry date{doc.file ? ' *' : ''}
      </Text>
      <ThemedDatePickerField
        value={doc.expiry}
        onChange={(expiry) => {
          if (target.kind === 'police') setPoliceCheck((prev) => ({ ...prev, expiry }));
          else setFitToWork((prev) => ({ ...prev, expiry }));
        }}
        minimumDate={expiryMinDate}
        maximumDate={expiryMaxDate}
        defaultPickerDate={expiryDefaultDate}
      />
    </View>
  );

  const renderSpecifyField = (
    item: TypedDocumentItem,
    refs: { current: Record<string, TextInput | null> },
    onChange: (value: string) => void,
  ) => (
    <>
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Please specify document type *</Text>
      <Pressable
        style={[styles.input, { marginBottom: spacing.lg }]}
        onPress={() => refs.current[item.id]?.focus()}
      >
        <TextInput
          ref={(node) => {
            refs.current[item.id] = node;
          }}
          style={styles.inputField}
          placeholder="Document type"
          placeholderTextColor="#9CA3AF"
          value={item.typeOther}
          onChangeText={onChange}
          returnKeyType="done"
        />
      </Pressable>
    </>
  );

  const renderLicenceCard = (item: LicenceItem) => (
    <View key={item.id} style={styles.idDocCard}>
      <View style={styles.idDocCardHeader}>
        <Text style={styles.idDocCardLabel}>Licence / Permit *</Text>
        <TouchableOpacity style={styles.idDocRemoveBtn} onPress={() => removeLicence(item.id)}>
          <Feather name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Type *</Text>
      <TouchableOpacity
        style={[styles.input, { marginBottom: isOtherDocumentType(item.type) ? 0 : spacing.lg }]}
        onPress={() => {
          setActiveLicenceId(item.id);
          setShowLicenceModal(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.inputField, !item.type && { color: '#9CA3AF' }]}>
          {item.type || 'Select type'}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
      </TouchableOpacity>
      {isOtherDocumentType(item.type) ? renderSpecifyField(item, licenceSpecifyRefs, (typeOther) => updateLicence(item.id, { typeOther })) : null}
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document *</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, item.file && styles.idDocUploadAreaFilled]}
        onPress={() => setUploadTarget({ kind: 'licence', id: item.id })}
        activeOpacity={0.8}
      >
        {item.file && isIdDocumentImage(item.file.mime) ? (
          <Image source={{ uri: item.file.uri }} style={styles.idDocImage} resizeMode="cover" />
        ) : item.file ? (
          <>
            <Feather name="file-text" size={32} color={profileBlue} />
            <Text style={styles.idDocUploadText} numberOfLines={2}>
              {item.file.name}
            </Text>
          </>
        ) : (
          <>
            <Feather name="upload" size={32} color="#9CA3AF" />
            <Text style={styles.idDocUploadText}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry date *</Text>
      <ThemedDatePickerField
        value={item.expiry}
        onChange={(expiry) => updateLicence(item.id, { expiry })}
        minimumDate={expiryMinDate}
        maximumDate={expiryMaxDate}
        defaultPickerDate={expiryDefaultDate}
      />
    </View>
  );

  const renderInsuranceCard = (item: InsuranceItem) => (
    <View key={item.id} style={styles.idDocCard}>
      <View style={styles.idDocCardHeader}>
        <Text style={styles.idDocCardLabel}>Insurance *</Text>
        <TouchableOpacity style={styles.idDocRemoveBtn} onPress={() => removeInsurance(item.id)}>
          <Feather name="trash-2" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Type *</Text>
      <TouchableOpacity
        style={[styles.input, { marginBottom: isOtherDocumentType(item.type) ? 0 : spacing.lg }]}
        onPress={() => {
          setActiveInsuranceId(item.id);
          setShowInsuranceModal(true);
        }}
        activeOpacity={0.8}
      >
        <Text style={[styles.inputField, !item.type && { color: '#9CA3AF' }]}>
          {item.type || 'Select type'}
        </Text>
        <Feather name="chevron-down" size={20} color="#6B7280" style={styles.inputIconRight} />
      </TouchableOpacity>
      {isOtherDocumentType(item.type) ? renderSpecifyField(item, insuranceSpecifyRefs, (typeOther) => updateInsurance(item.id, { typeOther })) : null}
      <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>Upload document *</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, item.file && styles.idDocUploadAreaFilled]}
        onPress={() => setUploadTarget({ kind: 'insurance', id: item.id })}
        activeOpacity={0.8}
      >
        {item.file && isIdDocumentImage(item.file.mime) ? (
          <Image source={{ uri: item.file.uri }} style={styles.idDocImage} resizeMode="cover" />
        ) : item.file ? (
          <>
            <Feather name="file-text" size={32} color={profileBlue} />
            <Text style={styles.idDocUploadText} numberOfLines={2}>
              {item.file.name}
            </Text>
          </>
        ) : (
          <>
            <Feather name="upload" size={32} color="#9CA3AF" />
            <Text style={styles.idDocUploadText}>Tap to upload</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={[styles.fieldHint, { marginTop: spacing.lg }]}>Expiry date *</Text>
      <ThemedDatePickerField
        value={item.expiry}
        onChange={(expiry) => updateInsurance(item.id, { expiry })}
        minimumDate={expiryMinDate}
        maximumDate={expiryMaxDate}
        defaultPickerDate={expiryDefaultDate}
      />
    </View>
  );

  const handleSave = useCallback(() => {
    const missing: string[] = [];
    const missingSpecifiedType: string[] = [];

    licences.forEach((l, idx) => {
      if (missingSpecifiedDocumentType(l)) {
        missingSpecifiedType.push(`Licence ${idx + 1} document type`);
      }
      const gaps = incompleteDocumentGaps(l);
      if (gaps.length > 0) {
        missing.push(`Licence ${idx + 1} (${gaps.join(', ')})`);
      }
    });
    insurances.forEach((ins, idx) => {
      if (missingSpecifiedDocumentType(ins)) {
        missingSpecifiedType.push(`Insurance ${idx + 1} document type`);
      }
      const gaps = incompleteDocumentGaps(ins);
      if (gaps.length > 0) {
        missing.push(`Insurance ${idx + 1} (${gaps.join(', ')})`);
      }
    });

    const missingUploadedExpiry: string[] = [];
    if (uploadedWithoutExpiry(policeCheck)) {
      missingUploadedExpiry.push('the police check expiry date');
    }
    if (uploadedWithoutExpiry(fitToWork)) {
      missingUploadedExpiry.push('the fit to work certificate expiry date');
    }

    const requiredNow = [...missingSpecifiedType, ...missing, ...missingUploadedExpiry];
    if (requiredNow.length > 0) {
      setBlockingAlert({
        title: 'Complete required fields',
        ...missingFieldsAlert(requiredNow),
      });
      return;
    }
    const toDocumentJson = (item: TypedDocumentItem) => {
      const iso = displayDateToIso(item.expiry);
      const specified = item.typeOther.trim();
      return {
        id: item.id,
        type: item.type,
        documentType: item.type,
        ...(isOtherDocumentType(item.type) && specified ? { documentTypeOther: specified } : {}),
        expiry: iso,
        expiry_date: iso,
        imageUploaded: Boolean(item.file),
      };
    };
    const licLine = licences
      .filter((l) => l.type)
      .map((l) => {
        const iso = displayDateToIso(l.expiry);
        return `${documentSummaryLabel(l)}${iso ? ` (exp. ${iso})` : ''}`;
      })
      .join(' · ');
    const insLine = insurances
      .filter((i) => i.type)
      .map((i) => {
        const iso = displayDateToIso(i.expiry);
        return `${documentSummaryLabel(i)}${iso ? ` (exp. ${iso})` : ''}`;
      })
      .join(' · ');
    const licencesJson = licences.filter((l) => l.type).map(toDocumentJson);
    const insurancesJson = insurances.filter((i) => i.type).map(toDocumentJson);

    const licenceById: Record<string, IdDocumentFile> = {};
    for (const l of licences) {
      if (l.type && l.file) {
        licenceById[l.id] = l.file;
      }
    }
    const insuranceById: Record<string, IdDocumentFile> = {};
    for (const ins of insurances) {
      if (ins.type && ins.file) {
        insuranceById[ins.id] = ins.file;
      }
    }

    onNext({
      ...(resume ? { resumeUploaded: 'Yes' } : {}),
      policeCheckExpiry: displayDateToIso(policeCheck.expiry) || undefined,
      policeCheckUploaded: policeCheck.file ? 'Yes' : undefined,
      fitToWorkExpiry: displayDateToIso(fitToWork.expiry) || undefined,
      fitToWorkUploaded: fitToWork.file ? 'Yes' : undefined,
      licencesSummary: licLine || undefined,
      insurancesSummary: insLine || undefined,
      licencesJson,
      insurancesJson,
    }, {
      ...(resume ? { resume } : {}),
      policeCheck: policeCheck.file ?? undefined,
      fitToWork: fitToWork.file ?? undefined,
      licenceById,
      insuranceById,
    });
  }, [resume, policeCheck, fitToWork, licences, insurances, onNext]);

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
            <Text style={styles.title}>Qualifications</Text>
            <Text style={styles.subtitle}>
              Upload your resume and any relevant licenses, permits, certificates, and
              compliance documents.
            </Text>

            <View style={styles.idDocCard}>
              <Text style={styles.idDocCardLabel}>Resume / CV</Text>
              <Text style={[styles.fieldHint, { marginBottom: spacing.sm }]}>
                PDF, DOC, or DOCX. Up to 15 MB.
              </Text>
              <TouchableOpacity
                style={[
                  styles.idDocUploadArea,
                  resume && styles.idDocUploadAreaFilled,
                ]}
                onPress={() => {
                  void pickResume();
                }}
                activeOpacity={0.8}
              >
                {resume ? (
                  <>
                    <Feather name="file-text" size={32} color={profileBlue} />
                    <Text style={styles.idDocUploadText} numberOfLines={2}>
                      {resume.name}
                    </Text>
                  </>
                ) : (
                  <>
                    <Feather name="upload" size={32} color="#9CA3AF" />
                    <Text style={styles.idDocUploadText}>
                      Tap to upload PDF, DOC, or DOCX
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {resume ? (
                <TouchableOpacity
                  onPress={() => setResume(null)}
                  activeOpacity={0.7}
                  style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
                >
                  <Text style={[styles.idDocAddBtnText, { color: '#EF4444' }]}>
                    Remove resume
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {renderDocCard('Police Check', policeCheck, { kind: 'police' })}
            {renderDocCard('Fit to Work Certificate', fitToWork, { kind: 'fit' })}

            <Text style={[styles.fieldLabel, styles.idDocSection]}>
              Licences & Permits
            </Text>
            <Text style={styles.fieldHint}>
              Add any relevant licences (e.g. RSA, Forklift, First Aid)
            </Text>
            {licences.map(renderLicenceCard)}
            <TouchableOpacity
              style={styles.idDocAddBtn}
              onPress={addLicence}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={18} color={profileBlue} />
              <Text style={styles.idDocAddBtnText}>Add licence or permit</Text>
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, styles.idDocSection]}>
              Insurances
            </Text>
            <Text style={styles.fieldHint}>
              Add any required insurance documents
            </Text>
            {insurances.map(renderInsuranceCard)}
            <TouchableOpacity
              style={styles.idDocAddBtn}
              onPress={addInsurance}
              activeOpacity={0.7}
            >
              <Feather name="plus" size={18} color={profileBlue} />
              <Text style={styles.idDocAddBtnText}>Add insurance</Text>
            </TouchableOpacity>

            <Modal
              visible={showLicenceModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowLicenceModal(false)}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setShowLicenceModal(false)}
              >
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    {licenceOptions.map((opt, idx) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.modalOption,
                          idx === licenceOptions.length - 1
                            ? styles.modalOptionLast
                            : null,
                        ]}
                        onPress={() => {
                          if (activeLicenceId) {
                            updateLicence(activeLicenceId, {
                              type: opt.value,
                              ...(isOtherDocumentType(opt.value) ? {} : { typeOther: '' }),
                            });
                            if (isOtherDocumentType(opt.value)) {
                              licenceOtherFocusId.current = activeLicenceId;
                            }
                          }
                          setShowLicenceModal(false);
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
              visible={showInsuranceModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowInsuranceModal(false)}
            >
              <Pressable
                style={styles.modalOverlay}
                onPress={() => setShowInsuranceModal(false)}
              >
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    {insuranceOptions.map((opt, idx) => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.modalOption,
                          idx === insuranceOptions.length - 1
                            ? styles.modalOptionLast
                            : null,
                        ]}
                        onPress={() => {
                          if (activeInsuranceId) {
                            updateInsurance(activeInsuranceId, {
                              type: opt.value,
                              ...(isOtherDocumentType(opt.value) ? {} : { typeOther: '' }),
                            });
                            if (isOtherDocumentType(opt.value)) {
                              insuranceOtherFocusId.current = activeInsuranceId;
                            }
                          }
                          setShowInsuranceModal(false);
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
              visible={uploadTarget !== null}
              transparent
              animationType="fade"
              onRequestClose={() => setUploadTarget(null)}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setUploadTarget(null)}>
                <TouchableWithoutFeedback>
                  <View style={styles.modalContent}>
                    <Text style={[styles.photoSourceTitle, { marginBottom: spacing.sm }]}>
                      {uploadTarget?.kind === 'police'
                        ? 'Police Check'
                        : uploadTarget?.kind === 'fit'
                          ? 'Fit to Work Certificate'
                          : uploadTarget?.kind === 'licence'
                            ? 'Licence / Permit'
                            : 'Insurance'}
                    </Text>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseComplianceSource('camera')}
                      accessibilityRole="button"
                      accessibilityLabel="Take photo"
                    >
                      <Feather name="camera" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Take photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseComplianceSource('image')}
                      accessibilityRole="button"
                      accessibilityLabel="Upload an image"
                    >
                      <Feather name="image" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Upload an image</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalOption}
                      onPress={() => chooseComplianceSource('file')}
                      accessibilityRole="button"
                      accessibilityLabel="Upload file"
                    >
                      <Feather name="file-text" size={20} color={profileBlue} />
                      <Text style={styles.modalOptionText}>Upload file (PDF, DOC, or DOCX)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalOption, styles.modalOptionLast]}
                      onPress={() => setUploadTarget(null)}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Text style={styles.modalOptionText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </Pressable>
            </Modal>

            <TouchableOpacity
              style={[styles.saveBtn, !step3Complete && { opacity: 0.6 }]}
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
