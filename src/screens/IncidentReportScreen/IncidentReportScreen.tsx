import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import * as ImagePicker from 'react-native-image-picker';
import { createAccountScreenStyles } from '../../styles/styles';
import { colors, fontFamily, spacing } from '../../theme/theme';
import { SweetAlert } from '../../components/SweetAlert';
import { SignaturePad, type SignatureDrawing } from '../../components/SignaturePad';
import { ThemedDatePickerField, displayDateToIso, formatDateToDisplay } from '../../components/ThemedDatePickerField';
import { appTodayLocalDate } from '../../utils/formatDateTime';
import { ThemedTimePickerField } from '../../components/ThemedTimePickerField';
import {
  CCTV_OPTIONS,
  CONTINUED_OPTIONS,
  EMPLOYMENT_TYPES,
  FIRST_AID_OPTIONS,
  GENDER_OPTIONS,
  INCIDENT_PAGE_TITLES,
  INCIDENT_TYPES,
  INJURED_OPTIONS,
  MEDICAL_OPTIONS,
  OUTCOME_OPTIONS,
  PERSON_TYPES,
  PROCEDURE_OPTIONS,
  PROPERTY_LOST_OPTIONS,
  PROPERTY_OWNER_OPTIONS,
  SHIFT_OPTIONS,
  WEATHER_OPTIONS,
  YES_NO,
  YES_NO_NA,
  YES_NO_UNSURE,
} from '../../config/incidentReporting';
import { fetchIncidentOptions, submitIncidentReport, type IncidentAnswers, type IncidentPhoto } from '../../services/incidentApi';
import { loadAccountProfile } from '../../services/accountProfileStorage';

type Answers = Record<string, string>;
type Option = { value: string; label: string };

function optionsOf(values: readonly string[]): Option[] {
  return values.map((value) => ({ value, label: value === 'other' ? 'Other' : value }));
}

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  const styles = createAccountScreenStyles;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={[styles.fieldHint, { marginBottom: 0 }]}>{hint}</Text> : null}
    </View>
  );
}

function TextField({
  label,
  hint,
  value,
  onChangeText,
  multiline,
  keyboardType,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad';
  placeholder?: string;
}) {
  const styles = createAccountScreenStyles;
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label={label} hint={hint} />
      <View
        style={
          multiline
            ? {
                backgroundColor: colors.inputBg,
                borderRadius: 14,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.md,
                minHeight: 112,
              }
            : styles.input
        }
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          style={
            multiline
              ? {
                  fontFamily: fontFamily.regular,
                  fontSize: 16,
                  color: colors.text.primary,
                  minHeight: 88,
                  textAlignVertical: 'top',
                  padding: 0,
                }
              : styles.inputField
          }
          multiline={multiline}
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

function SiteDropdown({
  sites,
  loading,
  error,
  value,
  onChange,
  onRetry,
}: {
  sites: string[];
  loading: boolean;
  error: string;
  value: string;
  onChange: (value: string) => void;
  onRetry: () => void;
}) {
  const styles = createAccountScreenStyles;
  const [open, setOpen] = useState(false);
  const placeholder = loading
    ? 'Loading sites…'
    : sites.length === 0
      ? 'No work sites available'
      : 'Select a site';

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label="Site *" />
      <TouchableOpacity
        style={styles.input}
        onPress={() => {
          if (!loading && sites.length > 0) setOpen(true);
        }}
        disabled={loading || sites.length === 0}
        accessibilityRole="button"
        accessibilityLabel="Site"
      >
        <Text
          style={{
            flex: 1,
            fontFamily: fontFamily.regular,
            fontSize: 16,
            color: value ? colors.text.primary : '#9CA3AF',
          }}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        {loading ? <ActivityIndicator size="small" color="#DC2626" /> : <Feather name="chevron-down" size={18} color="#6B7280" />}
      </TouchableOpacity>
      {error !== '' ? (
        <TouchableOpacity onPress={onRetry} style={{ marginTop: 8 }}>
          <Text style={{ fontFamily: fontFamily.semiBold, color: '#B91C1C' }}>{error} Tap to try again.</Text>
        </TouchableOpacity>
      ) : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            style={{ maxHeight: '70%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 }}
            onPress={() => undefined}
          >
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 16, color: '#111827', padding: 16 }}>Select a site</Text>
            <ScrollView>
              {sites.map((site) => {
                const active = site === value;
                return (
                  <TouchableOpacity
                    key={site}
                    onPress={() => {
                      onChange(site);
                      setOpen(false);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      backgroundColor: active ? '#FEF2F2' : '#FFFFFF',
                    }}
                  >
                    <Text style={{ flex: 1, fontFamily: active ? fontFamily.semiBold : fontFamily.regular, fontSize: 16, color: '#111827' }}>
                      {site}
                    </Text>
                    {active ? <Feather name="check" size={18} color="#DC2626" /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function RadioField({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label={label} hint={hint} />
      {options.map((option) => {
        const active = value === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                borderWidth: 2,
                borderColor: active ? '#DC2626' : '#9CA3AF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' }} /> : null}
            </View>
            <Text style={{ flex: 1, fontFamily: fontFamily.regular, fontSize: 15, color: colors.text.primary }}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CheckField({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label={label} hint={hint} />
      {options.map((option) => {
        const active = value.includes(option);
        return (
          <TouchableOpacity
            key={option}
            onPress={() => onChange(active ? value.filter((item) => item !== option) : [...value, option])}
            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 4,
                borderWidth: 2,
                borderColor: active ? '#DC2626' : '#9CA3AF',
                backgroundColor: active ? '#DC2626' : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {active ? <Feather name="check" size={14} color="#FFFFFF" /> : null}
            </View>
            <Text style={{ flex: 1, fontFamily: fontFamily.regular, fontSize: 15, color: colors.text.primary }}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function NameFields({
  label,
  first,
  last,
  onFirst,
  onLast,
}: {
  label: string;
  first: string;
  last: string;
  onFirst: (value: string) => void;
  onLast: (value: string) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label={label} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField label="First name" value={first} onChangeText={onFirst} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Last name" value={last} onChangeText={onLast} />
        </View>
      </View>
    </View>
  );
}

function AddressFields({
  label,
  prefix,
  answers,
  setKey,
}: {
  label: string;
  prefix: string;
  answers: Answers;
  setKey: (key: string, value: string) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <FieldLabel label={label} />
      <TextField label="Street address" value={answers[`${prefix}_line1`] ?? ''} onChangeText={(value) => setKey(`${prefix}_line1`, value)} />
      <TextField label="Street address line 2" value={answers[`${prefix}_line2`] ?? ''} onChangeText={(value) => setKey(`${prefix}_line2`, value)} />
      <TextField label="City" value={answers[`${prefix}_city`] ?? ''} onChangeText={(value) => setKey(`${prefix}_city`, value)} />
      <TextField label="State / province" value={answers[`${prefix}_state`] ?? ''} onChangeText={(value) => setKey(`${prefix}_state`, value)} />
      <TextField label="Postal / zip code" value={answers[`${prefix}_postcode`] ?? ''} onChangeText={(value) => setKey(`${prefix}_postcode`, value)} />
    </View>
  );
}

function PhotoPicker({
  label,
  hint,
  photos,
  onChange,
}: {
  label: string;
  hint?: string;
  photos: IncidentPhoto[];
  onChange: (photos: IncidentPhoto[]) => void;
}) {
  const styles = createAccountScreenStyles;
  const add = (source: 'library' | 'camera') => {
    const handler = (res: ImagePicker.ImagePickerResponse) => {
      const next = (res.assets ?? [])
        .filter((asset) => Boolean(asset.uri))
        .map((asset) => ({
          uri: asset.uri as string,
          name: asset.fileName || 'incident.jpg',
          type: asset.type || 'image/jpeg',
        }));
      if (next.length === 0 || res.didCancel) return;
      onChange([...photos, ...next].slice(0, 5));
    };
    if (source === 'camera' && ImagePicker.launchCamera) {
      ImagePicker.launchCamera({ mediaType: 'photo' }, handler);
      return;
    }
    ImagePicker.launchImageLibrary?.({ mediaType: 'photo', selectionLimit: 5 }, handler);
  };

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <FieldLabel label={label} hint={hint} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <TouchableOpacity style={[styles.dayChip, { backgroundColor: colors.accent }]} onPress={() => add('camera')}>
          <Text style={[styles.dayChipText, styles.dayChipTextActive]}>Take photo</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.dayChip} onPress={() => add('library')}>
          <Text style={styles.dayChipText}>Choose photo</Text>
        </TouchableOpacity>
      </View>
      {photos.map((photo) => (
        <View key={photo.uri} style={{ marginBottom: spacing.sm }}>
          <Image source={{ uri: photo.uri }} style={{ width: '100%', height: 140, borderRadius: 12 }} resizeMode="cover" />
          <TouchableOpacity onPress={() => onChange(photos.filter((item) => item.uri !== photo.uri))}>
            <Text style={{ marginTop: 6, fontFamily: fontFamily.semiBold, color: '#B91C1C' }}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function SubmitProgress({ percent }: { percent: number }) {
  const shown = Math.max(0, Math.min(100, Math.round(percent)));
  const stage = shown >= 100 ? 'Submitted' : shown >= 92 ? 'Finishing up' : shown >= 8 ? 'Uploading your report' : 'Preparing your report';

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={{ flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 340, backgroundColor: colors.white, borderRadius: 20, paddingVertical: 28, paddingHorizontal: 24 }}>
          <Text style={{ fontFamily: fontFamily.bold, fontSize: 42, color: '#DC2626', textAlign: 'center' }}>{shown}%</Text>
          <Text style={{ fontFamily: fontFamily.bold, fontSize: 16, color: '#111827', textAlign: 'center', marginTop: 4 }}>
            Submitting incident report
          </Text>
          <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: '#4B5563', textAlign: 'center', marginTop: 6 }}>{stage}</Text>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: '#FEE2E2', marginTop: 20, overflow: 'hidden' }}>
            <View style={{ height: 10, width: `${shown}%`, borderRadius: 5, backgroundColor: '#DC2626' }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function blank(value: string | undefined): boolean {
  return (value ?? '').trim() === '';
}

function pageMissing(step: number, a: Answers, outcomes: string[], signed: boolean): string[] {
  const miss = (key: string, label: string) => (blank(a[key]) ? label : null);
  const listed = (checks: Array<string | null>) => checks.filter((item): item is string => item != null);
  const dateTime = (dateKey: string, timeKey: string, dateLabel: string, timeLabel: string) =>
    listed([
      displayDateToIso(a[dateKey] ?? '') === '' ? dateLabel : null,
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(a[timeKey] ?? '') ? timeLabel : null,
    ]);

  switch (step) {
    case 0:
      return listed([
        miss('site', 'Site'),
        miss('location', 'Location of the incident'),
        ...dateTime('occurred_date', 'occurred_time', 'Date of incident', 'Time of incident'),
        ...dateTime('reported_date', 'reported_time', 'Date incident was reported', 'Time incident was reported'),
        miss('reported_to_first', 'Reported to first name'),
        miss('reported_to_last', 'Reported to last name'),
        miss('witnesses', 'Witnesses'),
        miss('person_type', 'Type of person or party'),
        miss('person_first', 'First name'),
        miss('person_last', 'Last name'),
        miss('addr_line1', 'Street address'),
        miss('employment_type', 'Employment type'),
        miss('phone_area', 'Area code'),
        miss('phone_number', 'Phone number'),
        miss('gender', 'Gender'),
        miss('person_age', 'Approximate age'),
        miss('injured', 'Was the person injured'),
        miss('first_aid', 'Was first aid provided'),
        miss('medical_treatment', 'Was medical treatment required'),
      ]);
    case 2:
      return listed([
        miss('incident_type', 'What type of incident occurred'),
        a.incident_type === 'other' && blank(a.incident_type_other) ? 'Please specify the type of incident' : null,
        miss('property_equipment_damage', 'Was there any property or equipment damage'),
        miss('injury_aggravated', 'Was an existing injury or illness aggravated'),
      ]);
    case 3:
      return listed([
        miss('before_incident', 'What were you doing immediately before the incident'),
        miss('description', 'Description of the incident'),
        miss('personally_experienced', 'What did you personally see, hear, or experience'),
        miss('ongoing_concern', 'Did the incident form part of a previous or ongoing concern'),
      ]);
    case 4:
      return listed([
        outcomes.length === 0 ? 'What was the outcome of the incident' : null,
        miss('impact_description', 'Description of injury, illness, or impact'),
        miss('continued_working', 'Did you continue working after the incident'),
      ]);
    case 6:
      return listed([miss('safety_risk', 'Was there an immediate safety risk')]);
    case 7:
      return listed([
        miss('trained', 'Were you trained to perform the task involved'),
        miss('procedure_followed', 'Was the required procedure being followed'),
      ]);
    case 9:
      return listed([miss('cctv', 'Are there CCTV cameras covering the area')]);
    case 11:
      return listed([miss('weather', 'Weather conditions')]);
    case 12:
      return listed([miss('property_lost', 'Was any personal or company property lost or damaged')]);
    case 13:
      return listed([
        miss('declaration_first', 'First name'),
        miss('declaration_last', 'Last name'),
        displayDateToIso(a.declaration_date ?? '') === '' ? 'Date' : null,
        signed ? null : 'Signature',
      ]);
    default:
      return [];
  }
}

export function IncidentReportScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = createAccountScreenStyles;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    declaration_date: formatDateToDisplay(appTodayLocalDate()),
    phone_area: '+61',
  });
  const [sites, setSites] = useState<string[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState('');
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<IncidentPhoto[]>([]);
  const [propertyPhotos, setPropertyPhotos] = useState<IncidentPhoto[]>([]);
  const signatureRef = useRef<SignatureDrawing | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<number | null>(null);
  const uploadStarted = useRef(false);
  const [alert, setAlert] = useState<{ title: string; message: string; variant: 'success' | 'error'; fields?: string[] } | null>(null);

  const setKey = (key: string, value: string) => setAnswers((current) => ({ ...current, [key]: value }));
  const value = (key: string) => answers[key] ?? '';
  const lastStep = INCIDENT_PAGE_TITLES.length - 1;

  const loadSites = () => {
    setSitesLoading(true);
    setSitesError('');
    void fetchIncidentOptions().then((result) => {
      if (!result.ok) {
        setSites([]);
        setSitesError(result.message);
      } else {
        setSites(result.sites);
        setSitesError(result.sites.length === 0 ? 'No work sites are available.' : '');
      }
      setSitesLoading(false);
    });
  };

  useEffect(() => {
    if (!submitting) return undefined;
    const timer = setInterval(() => {
      setSubmitProgress((current) => {
        if (current == null) return 1;
        const cap = uploadStarted.current ? 97 : 85;
        if (current >= cap) return current;
        return current + 1;
      });
    }, 350);
    return () => clearInterval(timer);
  }, [submitting]);

  useEffect(() => {
    loadSites();
    void loadAccountProfile().then((profile) => {
      const full = (profile.fullLegalName ?? '').trim();
      if (full === '') return;
      const parts = full.split(/\s+/);
      const first = parts.shift() ?? '';
      const last = parts.join(' ');
      setAnswers((current) => ({
        ...current,
        declaration_first: current.declaration_first?.trim() ? current.declaration_first : first,
        declaration_last: current.declaration_last?.trim() ? current.declaration_last : last,
      }));
    });
  }, []);

  const showMissing = (fields: string[]) => {
    const count = fields.length;
    setAlert({
      title: count === 1 ? '1 field still needed' : `${count} fields still needed`,
      message: 'Complete every item below, then continue.',
      variant: 'error',
      fields,
    });
  };

  const goNext = () => {
    const missing = pageMissing(step, answers, outcomes, (signatureRef.current?.strokes.length ?? 0) > 0);
    if (missing.length > 0) {
      showMissing(missing);
      return;
    }
    if (step < lastStep) setStep((current) => current + 1);
  };

  const submit = async () => {
    const missing = pageMissing(step, answers, outcomes, (signatureRef.current?.strokes.length ?? 0) > 0);
    if (missing.length > 0) {
      showMissing(missing);
      return;
    }
    const iso = (key: string) => displayDateToIso(value(key));
    const payload: IncidentAnswers = {
      ...answers,
      occurred_on: iso('occurred_date'),
      reported_on: iso('reported_date'),
      declaration_on: iso('declaration_date'),
      cctv_reviewed_on: value('cctv_reviewed_date') ? iso('cctv_reviewed_date') : '',
      outcomes,
      signature: (signatureRef.current?.strokes.length ?? 0) > 0 ? 'drawn' : '',
      signature_width: signatureRef.current?.width ?? 320,
      signature_height: signatureRef.current?.height ?? 160,
      signature_strokes: signatureRef.current?.strokes ?? [],
      incident_photo_count: photos.length,
      property_photo_count: propertyPhotos.length,
    };
    uploadStarted.current = false;
    setSubmitProgress(1);
    setSubmitting(true);
    const result = await submitIncidentReport(payload, photos, propertyPhotos, (percent) => {
      uploadStarted.current = true;
      setSubmitProgress((current) => Math.max(current ?? 0, percent));
    });
    if (!result.ok) {
      setSubmitting(false);
      setSubmitProgress(null);
      setAlert({ title: 'Could not submit', message: result.message, variant: 'error' });
      return;
    }
    setSubmitProgress(100);
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), 450);
    });
    setSubmitting(false);
    setSubmitProgress(null);
    setAlert({ title: 'Report submitted', message: result.message, variant: 'success' });
  };

  const page = (() => {
    switch (step) {
      case 0:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: 6 }}>INCIDENT DETAILS</Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: '#4B5563', marginBottom: spacing.lg, lineHeight: 20 }}>
              Please complete this form as soon as practicable after an incident, injury, near miss, property damage, or workplace concern.
            </Text>
            <SiteDropdown
              sites={sites}
              loading={sitesLoading}
              error={sitesError}
              value={value('site')}
              onChange={(next) => setKey('site', next)}
              onRetry={loadSites}
            />
            <TextField label="Location of the incident *" value={value('location')} onChangeText={(next) => setKey('location', next)} />
            <View style={{ marginBottom: spacing.lg }}>
              <FieldLabel label="Date of incident *" />
              <ThemedDatePickerField value={value('occurred_date')} onChange={(next) => setKey('occurred_date', next)} maximumDate={appTodayLocalDate()} />
            </View>
            <View style={{ marginBottom: spacing.lg }}>
              <FieldLabel label="Time of incident *" />
              <ThemedTimePickerField value={value('occurred_time')} onChange={(next) => setKey('occurred_time', next)} accessibilityLabel="Time of incident" />
            </View>
            <View style={{ marginBottom: spacing.lg }}>
              <FieldLabel label="Date incident was reported *" />
              <ThemedDatePickerField value={value('reported_date')} onChange={(next) => setKey('reported_date', next)} maximumDate={appTodayLocalDate()} />
            </View>
            <View style={{ marginBottom: spacing.lg }}>
              <FieldLabel label="Time incident was reported *" />
              <ThemedTimePickerField value={value('reported_time')} onChange={(next) => setKey('reported_time', next)} accessibilityLabel="Time incident was reported" />
            </View>
            <NameFields
              label="Reported to *"
              first={value('reported_to_first')}
              last={value('reported_to_last')}
              onFirst={(next) => setKey('reported_to_first', next)}
              onLast={(next) => setKey('reported_to_last', next)}
            />
            <TextField
              label="Witnesses *"
              hint="If there were no witnesses, enter N/A."
              value={value('witnesses')}
              onChangeText={(next) => setKey('witnesses', next)}
            />
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>PERSON INVOLVED</Text>
            <RadioField label="Type of person or party *" options={optionsOf(PERSON_TYPES)} value={value('person_type')} onChange={(next) => setKey('person_type', next)} />
            <NameFields
              label="Name *"
              first={value('person_first')}
              last={value('person_last')}
              onFirst={(next) => setKey('person_first', next)}
              onLast={(next) => setKey('person_last', next)}
            />
            <AddressFields label="Address *" prefix="addr" answers={answers} setKey={setKey} />
            <RadioField label="Employment type *" options={optionsOf(EMPLOYMENT_TYPES)} value={value('employment_type')} onChange={(next) => setKey('employment_type', next)} />
            <FieldLabel label="Phone number *" />
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ width: 120 }}>
                <TextField label="Area code" value={value('phone_area')} onChangeText={(next) => setKey('phone_area', next)} keyboardType="phone-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Phone number" value={value('phone_number')} onChangeText={(next) => setKey('phone_number', next)} keyboardType="phone-pad" />
              </View>
            </View>
            <RadioField label="Gender *" options={optionsOf(GENDER_OPTIONS)} value={value('gender')} onChange={(next) => setKey('gender', next)} />
            <TextField label="Approximate age *" value={value('person_age')} onChangeText={(next) => setKey('person_age', next)} keyboardType="number-pad" />
            <RadioField label="Was the person injured? *" options={optionsOf(INJURED_OPTIONS)} value={value('injured')} onChange={(next) => setKey('injured', next)} />
            <RadioField label="Was first aid provided? *" options={optionsOf(FIRST_AID_OPTIONS)} value={value('first_aid')} onChange={(next) => setKey('first_aid', next)} />
            <RadioField label="Was medical treatment required? *" options={optionsOf(MEDICAL_OPTIONS)} value={value('medical_treatment')} onChange={(next) => setKey('medical_treatment', next)} />
          </>
        );
      case 1:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>
              If the involved person is under 18 years of age
            </Text>
            <RadioField label="Was the person accompanied by an adult?" options={optionsOf(YES_NO)} value={value('accompanied')} onChange={(next) => setKey('accompanied', next)} />
            <NameFields
              label="Name of accompanying adult"
              first={value('adult_first')}
              last={value('adult_last')}
              onFirst={(next) => setKey('adult_first', next)}
              onLast={(next) => setKey('adult_last', next)}
            />
            <TextField label="Relationship to the minor" value={value('adult_relationship')} onChangeText={(next) => setKey('adult_relationship', next)} />
            <AddressFields label="Address of accompanying adult" prefix="adult_addr" answers={answers} setKey={setKey} />
            <TextField label="Contact number" value={value('adult_phone')} onChangeText={(next) => setKey('adult_phone', next)} keyboardType="phone-pad" />
          </>
        );
      case 2:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>TYPE OF INCIDENT</Text>
            <RadioField label="What type of incident occurred? *" options={INCIDENT_TYPES} value={value('incident_type')} onChange={(next) => setKey('incident_type', next)} />
            <TextField label="If others (please specify):" value={value('incident_type_other')} onChangeText={(next) => setKey('incident_type_other', next)} />
            <RadioField label="Was there any property or equipment damage? *" options={optionsOf(YES_NO)} value={value('property_equipment_damage')} onChange={(next) => setKey('property_equipment_damage', next)} />
            <RadioField label="Was an existing injury or illness aggravated? *" options={optionsOf(YES_NO_NA)} value={value('injury_aggravated')} onChange={(next) => setKey('injury_aggravated', next)} />
          </>
        );
      case 3:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>WHAT HAPPENED?</Text>
            <TextField label="What were you doing immediately before the incident? *" value={value('before_incident')} onChangeText={(next) => setKey('before_incident', next)} multiline />
            <TextField label="Description of the incident *" hint="Please describe what happened" value={value('description')} onChangeText={(next) => setKey('description', next)} multiline />
            <TextField label="What did you personally see, hear, or experience? *" value={value('personally_experienced')} onChangeText={(next) => setKey('personally_experienced', next)} multiline />
            <TextField label="Did anyone say or do anything that is relevant to the incident?" value={value('anyone_said')} onChangeText={(next) => setKey('anyone_said', next)} multiline />
            <RadioField label="Did the incident form part of a previous or ongoing concern? *" options={optionsOf(YES_NO_UNSURE)} value={value('ongoing_concern')} onChange={(next) => setKey('ongoing_concern', next)} />
            <TextField label="If yes, please provide details" value={value('ongoing_concern_details')} onChangeText={(next) => setKey('ongoing_concern_details', next)} multiline />
            <TextField label="Escalator, travelator or lift number (if applicable)" value={value('lift_number')} onChangeText={(next) => setKey('lift_number', next)} />
          </>
        );
      case 4:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>EFFECT OF THE INCIDENT</Text>
            <CheckField label="What was the outcome of the incident? *" options={OUTCOME_OPTIONS} value={outcomes} onChange={setOutcomes} />
            <TextField label="If other, please specify" value={value('outcome_other')} onChangeText={(next) => setKey('outcome_other', next)} />
            <TextField
              label="Description of injury, illness, or impact *"
              hint='If there was no physical injury, please state "No obvious physical injury reported."'
              value={value('impact_description')}
              onChangeText={(next) => setKey('impact_description', next)}
              multiline
            />
            <RadioField label="Did you continue working after the incident? *" options={optionsOf(CONTINUED_OPTIONS)} value={value('continued_working')} onChange={(next) => setKey('continued_working', next)} />
            <TextField label="If you stopped working, please provide details" value={value('stopped_details')} onChangeText={(next) => setKey('stopped_details', next)} multiline />
          </>
        );
      case 5:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: 6 }}>WORKPLACE BEHAVIOUR / SUPPORT</Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: '#4B5563', marginBottom: spacing.lg, lineHeight: 20 }}>
              Please complete this section if you selected Workplace behaviour / conflict or Harassment or bullying concern under Type of incident.
            </Text>
            <RadioField label="Do you believe the behaviour is ongoing?" options={optionsOf(YES_NO_UNSURE)} value={value('behaviour_ongoing')} onChange={(next) => setKey('behaviour_ongoing', next)} />
            <RadioField label="Has this concern been reported previously?" options={optionsOf(YES_NO_UNSURE)} value={value('previously_reported')} onChange={(next) => setKey('previously_reported', next)} />
            <TextField label="If previously reported, please provide details" value={value('previous_report_details')} onChangeText={(next) => setKey('previous_report_details', next)} multiline />
            <TextField label="Please provide any additional information about the concern" value={value('behaviour_notes')} onChangeText={(next) => setKey('behaviour_notes', next)} multiline />
          </>
        );
      case 6:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>IMMEDIATE SAFETY INFORMATION</Text>
            <RadioField label="Was there an immediate safety risk? *" options={optionsOf(YES_NO_UNSURE)} value={value('safety_risk')} onChange={(next) => setKey('safety_risk', next)} />
            <TextField label="Please describe the safety risk, if applicable" value={value('safety_risk_details')} onChangeText={(next) => setKey('safety_risk_details', next)} multiline />
            <TextField label="What action did you take immediately after the incident?" value={value('immediate_action')} onChangeText={(next) => setKey('immediate_action', next)} multiline />
          </>
        );
      case 7:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>TRAINING / PROCEDURE</Text>
            <RadioField label="Were you trained to perform the task involved? *" options={optionsOf(YES_NO_NA)} value={value('trained')} onChange={(next) => setKey('trained', next)} />
            <RadioField label="Was the required procedure being followed at the time? *" options={optionsOf(PROCEDURE_OPTIONS)} value={value('procedure_followed')} onChange={(next) => setKey('procedure_followed', next)} />
            <TextField label="Training or procedure comments" value={value('training_comments')} onChangeText={(next) => setKey('training_comments', next)} multiline />
          </>
        );
      case 8:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>SHIFT INFORMATION</Text>
            <RadioField label="Where in the shift did the incident occur?" options={optionsOf(SHIFT_OPTIONS)} value={value('shift_when')} onChange={(next) => setKey('shift_when', next)} />
            <TextField label="Approximate proportion of shift worked before the incident" value={value('shift_proportion')} onChangeText={(next) => setKey('shift_proportion', next)} />
          </>
        );
      case 9:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>ATTACHMENTS / EVIDENCE</Text>
            <PhotoPicker label="Upload supporting photos" hint="Optional. Up to 5 photos." photos={photos} onChange={setPhotos} />
            <RadioField label="Are there CCTV cameras covering the area? *" options={optionsOf(CCTV_OPTIONS)} value={value('cctv')} onChange={(next) => setKey('cctv', next)} />
            <TextField label="If yes, please provide any known CCTV details" value={value('cctv_details')} onChangeText={(next) => setKey('cctv_details', next)} multiline />
            <TextField
              label="Summary of CCTV footage"
              hint="Include relevant events before, during, and after the incident. If applicable, include cleaning, warning signs, barriers, or other observations."
              value={value('cctv_summary')}
              onChangeText={(next) => setKey('cctv_summary', next)}
              multiline
            />
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 16, color: '#111827', marginBottom: spacing.md }}>CCTV footage reviewed by</Text>
            <NameFields
              label="Name"
              first={value('cctv_reviewer_first')}
              last={value('cctv_reviewer_last')}
              onFirst={(next) => setKey('cctv_reviewer_first', next)}
              onLast={(next) => setKey('cctv_reviewer_last', next)}
            />
            <TextField label="Position" value={value('cctv_reviewer_position')} onChangeText={(next) => setKey('cctv_reviewer_position', next)} />
            <View style={{ marginBottom: spacing.lg }}>
              <FieldLabel label="Date" />
              <ThemedDatePickerField value={value('cctv_reviewed_date')} onChange={(next) => setKey('cctv_reviewed_date', next)} maximumDate={appTodayLocalDate()} />
            </View>
          </>
        );
      case 10:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: 6 }}>Medical information (voluntary)</Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: '#4B5563', marginBottom: spacing.lg, lineHeight: 20 }}>
              Complete this section only if the person voluntarily provides the information.
            </Text>
            <RadioField label="Did the person advise of a pre-existing medical condition relevant to the incident?" options={optionsOf(CCTV_OPTIONS)} value={value('preexisting')} onChange={(next) => setKey('preexisting', next)} />
            <TextField label="If yes, please specify:" value={value('preexisting_details')} onChangeText={(next) => setKey('preexisting_details', next)} multiline />
            <RadioField label="Did the person advise they were taking medication relevant to the incident?" options={optionsOf(CCTV_OPTIONS)} value={value('medication')} onChange={(next) => setKey('medication', next)} />
            <TextField label="If yes, please specify:" value={value('medication_details')} onChangeText={(next) => setKey('medication_details', next)} multiline />
          </>
        );
      case 11:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>Weather conditions (if applicable)</Text>
            <RadioField label="What were the weather conditions at the time of the incident? *" options={optionsOf(WEATHER_OPTIONS)} value={value('weather')} onChange={(next) => setKey('weather', next)} />
          </>
        );
      case 12:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>Property loss or damage</Text>
            <RadioField label="Was any personal or company property lost or damaged? *" options={optionsOf(PROPERTY_LOST_OPTIONS)} value={value('property_lost')} onChange={(next) => setKey('property_lost', next)} />
            <RadioField label="Owner of the damaged property" options={optionsOf(PROPERTY_OWNER_OPTIONS)} value={value('property_owner')} onChange={(next) => setKey('property_owner', next)} />
            {value('property_owner') === 'other' ? (
              <TextField label="Please type another option" value={value('property_owner_other')} onChangeText={(next) => setKey('property_owner_other', next)} />
            ) : null}
            <TextField label="Description of damaged property" value={value('property_description')} onChangeText={(next) => setKey('property_description', next)} />
            <TextField label="Nature of the damage" value={value('damage_nature')} onChangeText={(next) => setKey('damage_nature', next)} />
            <TextField label="Estimated value of loss or damage (if known)" value={value('damage_value')} onChangeText={(next) => setKey('damage_value', next)} keyboardType="number-pad" placeholder="e.g. 23" />
            <TextField label="Additional comments" value={value('property_comments')} onChangeText={(next) => setKey('property_comments', next)} multiline />
            <PhotoPicker label="Photos attached" photos={propertyPhotos} onChange={setPropertyPhotos} />
          </>
        );
      default:
        return (
          <>
            <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: '#111827', marginBottom: spacing.md }}>EMPLOYEE DECLARATION</Text>
            <NameFields
              label="Full name *"
              first={value('declaration_first')}
              last={value('declaration_last')}
              onFirst={(next) => setKey('declaration_first', next)}
              onLast={(next) => setKey('declaration_last', next)}
            />
            <SignaturePad drawingRef={signatureRef} scrollRef={scrollRef} />
            <View style={{ marginBottom: spacing.lg }}>
              <FieldLabel label="Date *" />
              <ThemedDatePickerField value={value('declaration_date')} onChange={(next) => setKey('declaration_date', next)} maximumDate={appTodayLocalDate()} />
            </View>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: '#4B5563', lineHeight: 20, marginBottom: spacing.md }}>
              By submitting this form, I confirm that the information provided is true and accurate to the best of my knowledge.
            </Text>
            <Text style={{ fontFamily: fontFamily.regular, fontSize: 14, color: '#4B5563', lineHeight: 20 }}>
              Note: Submission of this form records the incident or concern. It does not determine the outcome or findings of any subsequent review or investigation.
            </Text>
          </>
        );
    }
  })();

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4F6', paddingTop: insets.top }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={[styles.topBar, { backgroundColor: colors.white }]}>
        <View style={styles.topBarSide}>
          <TouchableOpacity
            disabled={submitting}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="arrow-left" size={24} color="#0056D2" />
          </TouchableOpacity>
        </View>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Incident report
        </Text>
        <View style={styles.topBarSideRight} />
      </View>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.white }}>
        <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 13, color: '#DC2626' }}>
          Page {step + 1} of {INCIDENT_PAGE_TITLES.length} · {INCIDENT_PAGE_TITLES[step]}
        </Text>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: '#FEE2E2', marginTop: 8, marginBottom: 8 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: '#DC2626', width: `${((step + 1) / INCIDENT_PAGE_TITLES.length) * 100}%` }} />
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 24 }}
          keyboardShouldPersistTaps="always"
        >
          <View style={{ backgroundColor: colors.white, borderRadius: 16, padding: spacing.lg }}>{page}</View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.md), backgroundColor: colors.white }}>
          {step > 0 ? (
            <TouchableOpacity
              disabled={submitting}
              onPress={() => setStep((current) => current - 1)}
              style={{ flex: 1, height: 52, borderRadius: 26, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center', opacity: submitting ? 0.5 : 1 }}
            >
              <Text style={{ fontFamily: fontFamily.bold, color: '#111827' }}>Back</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => (step === lastStep ? void submit() : goNext())}
            disabled={submitting}
            style={{ flex: 1, height: 52, borderRadius: 26, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' }}
          >
            {submitting ? (
              <Text style={{ fontFamily: fontFamily.bold, color: '#FFFFFF' }}>{submitProgress == null ? 'Submitting' : `${Math.round(submitProgress)}%`}</Text>
            ) : (
              <Text style={{ fontFamily: fontFamily.bold, color: '#FFFFFF' }}>{step === lastStep ? 'Submit' : 'Next'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      {submitProgress != null ? <SubmitProgress percent={submitProgress} /> : null}
      <SweetAlert
        visible={alert !== null}
        title={alert?.title ?? ''}
        message={alert?.message ?? ''}
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant={alert?.variant ?? 'info'}
        listItems={alert?.fields}
        onConfirm={() => {
          const success = alert?.variant === 'success';
          setAlert(null);
          if (success) navigation.goBack();
        }}
        onClose={() => {
          const success = alert?.variant === 'success';
          setAlert(null);
          if (success) navigation.goBack();
        }}
      />
    </View>
  );
}
