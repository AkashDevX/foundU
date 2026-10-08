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

function dateFromTime24(value: string, fallback: string): Date {
  const source = /^([01]\d|2[0-3]):([0-5]\d)$/.test(value) ? value : fallback;
  const match = source.match(/^(\d{2}):(\d{2})$/);
  const date = new Date();
  const hours = match ? Number(match[1]) : 9;
  const minutes = match ? Number(match[2]) : 0;
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function formatTime24(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

type ThemedTimePickerFieldProps = {
  /** Stored as 24-hour `HH:mm`, or empty when unset. */
  value: string;
  onChange: (hhmm: string) => void;
  placeholder?: string;
  /** Wheel position when `value` is empty. */
  defaultTime?: string;
  accessibilityLabel?: string;
};

/**
 * 24-hour time field. iOS uses a spinner forced to a 24-hour locale.
 * Android opens the system time dialog with `is24Hour`.
 */
export function ThemedTimePickerField({
  value,
  onChange,
  placeholder = 'HH:mm',
  defaultTime = '09:00',
  accessibilityLabel,
}: ThemedTimePickerFieldProps) {
  const styles = createAccountScreenStyles;
  const accent = colors.accent;
  const parsed = useMemo(() => (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : ''), [value]);

  const initialOpenDate = useCallback(
    () => dateFromTime24(parsed, defaultTime),
    [parsed, defaultTime],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => initialOpenDate());

  const openAndroidPicker = () => {
    DateTimePickerAndroid.open({
      mode: 'time',
      value: initialOpenDate(),
      is24Hour: true,
      display: 'spinner',
      positiveButton: { label: 'OK', textColor: accent },
      negativeButton: { label: 'Cancel', textColor: colors.text.secondary },
      onValueChange: (_event, date) => {
        if (date) onChange(formatTime24(date));
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
    onChange(formatTime24(draft));
    setPickerOpen(false);
  };

  const dismissPicker = () => setPickerOpen(false);

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity
        style={styles.input}
        onPress={open}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <Text style={[styles.inputField, !parsed && { color: colors.icon }]}>{parsed || placeholder}</Text>
        <Feather name="clock" size={18} color={colors.text.secondary} style={styles.inputIconRight} />
      </TouchableOpacity>

      {Platform.OS === 'ios' ? (
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={dismissPicker}>
          <Pressable style={styles.modalOverlay} onPress={dismissPicker}>
            <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
              <View style={styles.datePickerModalContent}>
                <Text style={styles.datePickerModalTitle}>Select time (24-hour)</Text>
                <View style={styles.datePickerWheelWrap}>
                  <DateTimePicker
                    value={draft}
                    mode="time"
                    display="spinner"
                    is24Hour
                    locale="en_GB"
                    onValueChange={(_event, selected) => {
                      if (selected) setDraft(selected);
                    }}
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
