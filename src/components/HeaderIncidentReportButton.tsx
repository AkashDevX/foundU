import React, { useCallback } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { dashboardStyles } from '../styles/styles';

const SIREN_RED = '#DC2626';

/**
 * Top-bar control that opens the in-app incident report.
 * Place beside logout on every main tab header.
 */
export function HeaderIncidentReportButton() {
  const navigation = useNavigation<any>();

  const onPress = useCallback(() => {
    navigation.navigate('IncidentReport');
  }, [navigation]);

  return (
    <TouchableOpacity
      style={styles.btn}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Report an incident"
    >
      <MaterialCommunityIcons name="alarm-light" size={26} color={SIREN_RED} />
    </TouchableOpacity>
  );
}

/** Incident report + logout/help cluster for main tab headers. */
export function MainTabHeaderRight({ children }: { children: React.ReactNode }) {
  return (
    <View style={dashboardStyles.headerRightActions}>
      <HeaderIncidentReportButton />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(220,38,38,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.18)',
  },
});
