import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  Modal,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import Feather from 'react-native-vector-icons/Feather';
import { colors, fontFamily } from '../theme/theme';
import { createAccountScreenStyles } from '../styles/styles';

export function formatDateToDisplay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm} / ${dd} / ${yyyy}`;
}

export function parseDisplayDateToDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{2}) \/ (\d{2}) \/ (\d{4})$/);
  if (!m) {
    return null;
  }
  const month = Number.parseInt(m[1], 10) - 1;
  const day = Number.parseInt(m[2], 10);
  const year = Number.parseInt(m[3], 10);
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
    return null;
  }
  return d;
}

/** Converts picker display `MM / DD / YYYY` to ISO `YYYY-MM-DD` for API storage. */
export function displayDateToIso(display: string): string {
  const trimmed = display.trim();
  if (trimmed === '') return '';
  const d = parseDisplayDateToDate(trimmed);
  if (!d) return trimmed;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function clampDate(d: Date, minimumDate?: Date, maximumDate?: Date): Date {
  let x = d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date();
  if (minimumDate && x < minimumDate) {
    x = new Date(minimumDate);
  }
  if (maximumDate && x > maximumDate) {
    x = new Date(maximumDate);
  }
  return x;
}

type ThemedDatePickerFieldProps = {
  /** Stored as `MM / DD / YYYY` or empty when unset. */
  value: string;
  onChange: (formatted: string) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Opening value when `value` is empty (e.g. DOB default vs expiry +1 year). */
  defaultPickerDate?: Date;
  placeholder?: string;
};

/**
 * iOS: custom modal + wheel picker (native control renders inline).
 * Android: imperative {@link DateTimePickerAndroid.open} only — the JSX DateTimePicker mounts no UI and opens the
 * system dialog; nesting it inside our Modal stacks two dialogs (blank sheet over the real picker).
 */
export function ThemedDatePickerField({
  value,
  onChange,
  minimumDate,
  maximumDate,
  defaultPickerDate,
  placeholder = 'MM / DD / YYYY',
}: ThemedDatePickerFieldProps) {
  const styles = createAccountScreenStyles;
  const accent = colors.accent;

  const parsedValue = useMemo(() => parseDisplayDateToDate(value), [value]);

  const initialOpenDate = useCallback((): Date => {
    const base = parsedValue ?? defaultPickerDate ?? minimumDate ?? new Date();
    return clampDate(base, minimumDate, maximumDate);
  }, [parsedValue, defaultPickerDate, minimumDate, maximumDate]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => initialOpenDate());

  const openAndroidPicker = () => {
    const next = initialOpenDate();
    DateTimePickerAndroid.open({
      mode: 'date',
      value: next,
      display: 'calendar',
      design: 'default',
      minimumDate,
      maximumDate,
      positiveButton: { label: 'OK', textColor: accent },
      negativeButton: { label: 'Cancel', textColor: colors.text.secondary },
      onValueChange: (_event, date) => {
        const clamped = clampDate(date, minimumDate, maximumDate);
        onChange(formatDateToDisplay(clamped));
      },
      onDismiss: () => {},
    });
  };

  const open = () => {
    const next = initialOpenDate();
    setDraft(next);
    if (Platform.OS === 'android') {
      openAndroidPicker();
      return;
    }
    setPickerOpen(true);
  };

  const confirmPicker = () => {
    onChange(formatDateToDisplay(clampDate(draft, minimumDate, maximumDate)));
    setPickerOpen(false);
  };

  const dismissPicker = () => setPickerOpen(false);

  const displayText = parsedValue ? formatDateToDisplay(parsedValue) : '';

  return (
    <View>
      <TouchableOpacity style={styles.input} onPress={open} activeOpacity={0.8} accessibilityRole="button">
        <Text style={[styles.inputField, !displayText && { color: colors.icon }]}>
          {displayText || placeholder}
        </Text>
        <Feather name="calendar" size={20} color={colors.text.secondary} style={styles.inputIconRight} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={dismissPicker}
        >
          <Pressable style={styles.modalOverlay} onPress={dismissPicker}>
            <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
              <View style={styles.datePickerModalContent}>
                <Text style={styles.datePickerModalTitle}>Select date</Text>
                <View style={styles.datePickerWheelWrap}>
                  <DateTimePicker
                    value={draft}
                    mode="date"
                    display="spinner"
                    onValueChange={(_event, selected) => {
                      setDraft(clampDate(selected, minimumDate, maximumDate));
                    }}
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                    themeVariant="light"
                    accentColor={accent}
                    textColor={colors.text.primary}
                  />
                </View>
                <View style={styles.datePickerFooter}>
                  <TouchableOpacity onPress={dismissPicker} hitSlop={12}>
                    <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 16, color: colors.text.secondary }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={confirmPicker} hitSlop={12}>
                    <Text style={{ fontFamily: fontFamily.semiBold, fontSize: 16, color: accent }}>Done</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

/** Today at local midnight — suitable for minimumDate on future-only expiries. */
export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addYears(base: Date, years: number): Date {
  const d = new Date(base);
  d.setFullYear(d.getFullYear() + years);
  return d;
}
