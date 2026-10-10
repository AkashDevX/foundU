import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  TouchableWithoutFeedback,
  NativeModules,
  TurboModuleRegistry,
} from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import {
  ThemedDatePickerField,
  addYears,
  displayDateToIso,
  startOfToday,
} from './ThemedDatePickerField';
import { createAccountScreenStyles, myProfileScreenStyles } from '../styles/styles';
import { renewProfileDocument, type RenewalUploadFile } from '../services/documentRenewalApi';
import { isIdDocumentImage, MAX_ID_DOCUMENT_BYTES, normalizeIdDocument } from '../utils/idDocument';
import { renewalStatusLine, type DocumentRenewalItem } from '../utils/documentRenewal';

const profileBlue = '#0056D2';

type Props = {
  items: DocumentRenewalItem[];
  onUpdated: () => void;
};

function startOfTomorrow(): Date {
  const day = startOfToday();
  day.setDate(day.getDate() + 1);
  return day;
}

function RenewalCard({
  item,
  onUpdated,
  onNotice,
}: {
  item: DocumentRenewalItem;
  onUpdated: () => void;
  onNotice: (message: string) => void;
}) {
  const styles = createAccountScreenStyles;
  const mp = myProfileScreenStyles;
  const [file, setFile] = useState<RenewalUploadFile | null>(null);
  const [expiry, setExpiry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const pickerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minDate = startOfTomorrow();
  const maxDate = addYears(startOfToday(), 50);

  const acceptFile = (
    uri: string,
    name: string,
    mime: string,
    size: number | null | undefined,
    kind: 'image' | 'file',
  ) => {
    if (size != null && size > MAX_ID_DOCUMENT_BYTES) {
      setError('Documents must be 15 MB or smaller.');
      return;
    }
    const normalized = normalizeIdDocument(name, mime);
    const image = normalized ? isIdDocumentImage(normalized.mime) : false;
    if (!normalized || (kind === 'image' && !image) || (kind === 'file' && image)) {
      setError(kind === 'image' ? 'Use a JPG or PNG.' : 'Use a PDF, DOC, or DOCX.');
      return;
    }
    setError(null);
    setFile({ uri, name: normalized.name, type: normalized.mime });
  };

  const takePhoto = () => {
    if (!ImagePicker.launchCamera) {
      setError('Camera is unavailable on this build. Upload a file instead.');
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
          setError('This device has no camera available. Upload a file instead.');
          return;
        }
        if (res.errorCode === 'permission') {
          setError('Allow camera access to photograph this document, or upload a file instead.');
          return;
        }
        const asset = res.assets?.[0];
        if (res.errorCode || !asset?.uri) {
          setError('Could not take that photo. Try again, or upload a file.');
          return;
        }
        acceptFile(asset.uri, asset.fileName || 'document.jpg', asset.type || 'image/jpeg', asset.fileSize, 'image');
      },
    );
  };

  const choosePhoto = () => {
    if (!ImagePicker.launchImageLibrary) {
      setError('Photo library is unavailable on this build. Take a photo instead.');
      return;
    }
    ImagePicker.launchImageLibrary(
      { mediaType: 'photo', selectionLimit: 1, assetRepresentationMode: 'compatible' },
      (res) => {
        const asset = res.assets?.[0];
        if (res.didCancel || !asset?.uri) return;
        if (res.errorCode) {
          setError('Could not open that photo. Try again.');
          return;
        }
        acceptFile(asset.uri, asset.fileName || 'document.jpg', asset.type || 'image/jpeg', asset.fileSize, 'image');
      },
    );
  };

  const chooseOfficeFile = async () => {
    try {
      const pickerLinked =
        Boolean(NativeModules.RNDocumentPicker) ||
        TurboModuleRegistry.get('RNDocumentPicker') != null;
      if (!pickerLinked) {
        setError('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      const DocumentPicker = await import('@react-native-documents/picker');
      const { pick, types, keepLocalCopy } = DocumentPicker;
      const [chosen] = await pick({
        allowMultiSelection: false,
        type: [types.pdf, types.doc, types.docx],
      });
      const name = (chosen.name || 'document').trim() || 'document';
      const mime = chosen.type || '';
      if (chosen.size != null && chosen.size > MAX_ID_DOCUMENT_BYTES) {
        setError('Documents must be 15 MB or smaller.');
        return;
      }
      const normalized = normalizeIdDocument(name, mime);
      if (!normalized || isIdDocumentImage(normalized.mime)) {
        setError('Use a PDF, DOC, or DOCX.');
        return;
      }
      let uri = chosen.uri;
      const [local] = await keepLocalCopy({
        files: [{ uri: chosen.uri, fileName: normalized.name }],
        destination: 'cachesDirectory',
      });
      if (local.status === 'success' && local.localUri) {
        uri = local.localUri;
      }
      acceptFile(uri, normalized.name, normalized.mime, chosen.size, 'file');
    } catch (pickError) {
      try {
        const { isErrorWithCode, errorCodes } = await import('@react-native-documents/picker');
        if (isErrorWithCode(pickError) && pickError.code === errorCodes.OPERATION_CANCELED) {
          return;
        }
      } catch {
        setError('File upload is unavailable on this build. Take a photo or upload an image instead.');
        return;
      }
      setError('Could not open that file. Use a PDF, DOC, or DOCX.');
    }
  };

  const chooseSource = (kind: 'camera' | 'image' | 'file') => {
    setChooserOpen(false);
    if (pickerTimerRef.current) clearTimeout(pickerTimerRef.current);
    pickerTimerRef.current = setTimeout(() => {
      if (kind === 'camera') takePhoto();
      else if (kind === 'image') choosePhoto();
      else void chooseOfficeFile();
    }, 250);
  };

  const upload = async () => {
    if (!file) {
      setError('Choose the renewed document first.');
      return;
    }
    const iso = displayDateToIso(expiry);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      setError('Set the new expiry date.');
      return;
    }
    setUploading(true);
    setError(null);
    const result = await renewProfileDocument(item.key, iso, file);
    setUploading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setFile(null);
    setExpiry('');
    onNotice(result.message);
    onUpdated();
  };

  const ready = file != null && expiry.trim() !== '' && !uploading;
  const imagePreview = file != null && isIdDocumentImage(file.type);

  return (
    <View style={mp.renewalItem}>
      <View style={mp.renewalItemHeader}>
        <Feather name="alert-circle" size={18} color={item.status === 'expired' ? '#B91C1C' : '#C2410C'} />
        <Text style={mp.renewalItemTitle}>{item.label}</Text>
      </View>
      <Text style={[mp.renewalItemStatus, item.status === 'expired' && mp.renewalItemStatusExpired]}>
        {renewalStatusLine(item)}
      </Text>
      <Text style={[styles.fieldHint, { marginBottom: 8 }]}>Upload document</Text>
      <TouchableOpacity
        style={[styles.idDocUploadArea, file && styles.idDocUploadAreaFilled]}
        onPress={() => setChooserOpen(true)}
        activeOpacity={0.8}
        disabled={uploading}
      >
        {imagePreview && file ? (
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
      <Text style={[styles.fieldHint, { marginTop: 16 }]}>New expiry date *</Text>
      <ThemedDatePickerField
        value={expiry}
        onChange={setExpiry}
        minimumDate={minDate}
        maximumDate={maxDate}
        defaultPickerDate={addYears(startOfToday(), 1)}
        placeholder="New expiry date"
      />
      <TouchableOpacity
        style={[mp.renewalSubmit, !ready && mp.renewalSubmitDisabled]}
        onPress={() => void upload()}
        activeOpacity={0.8}
        disabled={!ready}
      >
        {uploading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={mp.renewalSubmitText}>Upload renewed document</Text>
        )}
      </TouchableOpacity>
      {error ? <Text style={mp.renewalError}>{error}</Text> : null}

      <Modal visible={chooserOpen} transparent animationType="fade" onRequestClose={() => setChooserOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setChooserOpen(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <Text style={[styles.photoSourceTitle, { marginBottom: 8 }]}>{item.label}</Text>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => chooseSource('camera')}
                accessibilityRole="button"
                accessibilityLabel="Take photo"
              >
                <Feather name="camera" size={20} color={profileBlue} />
                <Text style={styles.modalOptionText}>Take photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => chooseSource('image')}
                accessibilityRole="button"
                accessibilityLabel="Choose from photos"
              >
                <Feather name="image" size={20} color={profileBlue} />
                <Text style={styles.modalOptionText}>Choose from photos</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalOption}
                onPress={() => chooseSource('file')}
                accessibilityRole="button"
                accessibilityLabel="Upload file"
              >
                <Feather name="file-text" size={20} color={profileBlue} />
                <Text style={styles.modalOptionText}>Upload file (PDF, DOC, or DOCX)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOption, styles.modalOptionLast]}
                onPress={() => setChooserOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalOptionText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </Pressable>
      </Modal>
    </View>
  );
}

export function DocumentRenewalSection({ items, onUpdated }: Props) {
  const mp = myProfileScreenStyles;
  const [notice, setNotice] = useState<string | null>(null);
  if (items.length === 0) {
    if (!notice) return null;
    return (
      <View style={mp.renewalCard}>
        <Text style={mp.renewalNotice}>{notice}</Text>
      </View>
    );
  }

  return (
    <View style={mp.renewalCard}>
      <Text style={mp.renewalIntro}>
        A certificate, police check, licence, permit, or other document is within 30 days of expiry, or
        has already expired. Upload the renewed copy and set the new expiry date. You get a reminder
        every day until that is saved.
      </Text>
      {notice ? <Text style={mp.renewalNotice}>{notice}</Text> : null}
      {items.map((item) => (
        <RenewalCard key={item.key} item={item} onUpdated={onUpdated} onNotice={setNotice} />
      ))}
    </View>
  );
}
