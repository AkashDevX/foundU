import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from 'react-native-vector-icons/Feather';
import { ThemedTimePickerField } from '../../../components/ThemedTimePickerField';
import { colors, fontFamily, spacing } from '../../../theme/theme';
import { createAccountScreenStyles } from '../../../styles/styles';
import {
  SCHEDULE_DAYS,
  isOvernightPeriod,
  isValidTime24,
  newPeriodId,
  type ScheduleDayKey,
  type WeekSchedule,
} from '../../../utils/employeeAvailability';

const profileBlue = '#0056D2';

type EmployeeWeekScheduleProps = {
  value: WeekSchedule;
  onChange: (next: WeekSchedule) => void;
};

export function EmployeeWeekSchedule({ value, onChange }: EmployeeWeekScheduleProps) {
  const styles = createAccountScreenStyles;

  const updateDay = (day: ScheduleDayKey, patch: Partial<WeekSchedule[ScheduleDayKey]>) => {
    const current = value[day];
    onChange({ ...value, [day]: { ...current, ...patch } });
  };

  const setStatus = (day: ScheduleDayKey, status: 'available' | 'unavailable') => {
    const current = value[day];
    const periods =
      status === 'available' && current.periods.length === 0
        ? [{ id: newPeriodId(), start: '', end: '' }]
        : current.periods;
    updateDay(day, { status, periods });
  };

  const setPeriodTime = (day: ScheduleDayKey, periodId: string, field: 'start' | 'end', time: string) => {
    updateDay(day, {
      periods: value[day].periods.map((period) =>
        period.id === periodId ? { ...period, [field]: time } : period,
      ),
    });
  };

  const addPeriod = (day: ScheduleDayKey) => {
    updateDay(day, {
      periods: [...value[day].periods, { id: newPeriodId(), start: '', end: '' }],
    });
  };

  const removePeriod = (day: ScheduleDayKey, periodId: string) => {
    const next = value[day].periods.filter((period) => period.id !== periodId);
    updateDay(day, {
      periods: next.length > 0 ? next : [{ id: newPeriodId(), start: '', end: '' }],
    });
  };

  return (
    <View>
      {SCHEDULE_DAYS.map((day) => {
        const entry = value[day.key];
        const available = entry.status === 'available';
        return (
          <View key={day.key} style={local.dayCard}>
            <Text style={local.dayTitle}>{day.label}</Text>
            <View style={styles.sexRow}>
              <TouchableOpacity
                style={[styles.sexOption, available && styles.sexOptionActive]}
                onPress={() => setStatus(day.key, 'available')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: available }}
              >
                <Text style={[styles.sexOptionText, available && styles.sexOptionTextActive]} numberOfLines={1}>
                  Available
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sexOption, !available && styles.sexOptionActive]}
                onPress={() => setStatus(day.key, 'unavailable')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: !available }}
              >
                <Text style={[styles.sexOptionText, !available && styles.sexOptionTextActive]} numberOfLines={1}>
                  Not available
                </Text>
              </TouchableOpacity>
            </View>

            {available ? (
              <View style={local.periods}>
                {entry.periods.map((period, index) => {
                  const overnight =
                    isValidTime24(period.start) &&
                    isValidTime24(period.end) &&
                    isOvernightPeriod(period.start, period.end);
                  return (
                    <View key={period.id} style={index > 0 ? local.periodBlock : undefined}>
                      <View style={local.periodRow}>
                        <View style={local.timeCol}>
                          <Text style={local.timeLabel}>Start</Text>
                          <ThemedTimePickerField
                            value={period.start}
                            onChange={(time) => setPeriodTime(day.key, period.id, 'start', time)}
                            defaultTime="09:00"
                            accessibilityLabel={`${day.label} period ${index + 1} start time`}
                          />
                        </View>
                        <View style={local.timeCol}>
                          <Text style={local.timeLabel}>End</Text>
                          <ThemedTimePickerField
                            value={period.end}
                            onChange={(time) => setPeriodTime(day.key, period.id, 'end', time)}
                            defaultTime="17:00"
                            accessibilityLabel={`${day.label} period ${index + 1} end time`}
                          />
                        </View>
                        {entry.periods.length > 1 ? (
                          <TouchableOpacity
                            style={local.removeBtn}
                            onPress={() => removePeriod(day.key, period.id)}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${day.label} period ${index + 1}`}
                          >
                            <Feather name="trash-2" size={18} color="#EF4444" />
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {overnight ? (
                        <Text style={local.overnight}>Overnight — this availability ends the next day.</Text>
                      ) : null}
                    </View>
                  );
                })}
                <TouchableOpacity
                  style={local.addBtn}
                  onPress={() => addPeriod(day.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={16} color={profileBlue} />
                  <Text style={styles.idDocAddBtnText}>Add another period</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={local.unavailable}>Not available this day.</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const local = StyleSheet.create({
  dayCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  dayTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: colors.text.primary,
    marginBottom: spacing.md,
  },
  periods: { marginTop: spacing.lg },
  periodBlock: { marginTop: spacing.lg },
  periodRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  timeCol: { flex: 1 },
  timeLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: spacing.xs,
  },
  removeBtn: {
    width: 40,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overnight: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: profileBlue,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  unavailable: {
    marginTop: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: colors.text.secondary,
  },
});
