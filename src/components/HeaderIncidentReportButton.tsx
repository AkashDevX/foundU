import React, { useCallback, useState } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { openIncidentReportForm } from '../config/incidentReporting';
import { SweetAlert } from './SweetAlert';
import { dashboardStyles } from '../styles/styles';

const SIREN_RED = '#DC2626';

/**
 * Top-bar control that opens the workplace incident JotForm.
 * Place beside logout on every main tab header.
 */
export function HeaderIncidentReportButton() {
  const [errorVisible, setErrorVisible] = useState(false);

  const onPress = useCallback(() => {
    void openIncidentReportForm().catch(() => setErrorVisible(true));
  }, []);

  return (
    <>
      <TouchableOpacity
        style={styles.btn}
        activeOpacity={0.7}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Report an incident"
      >
        <MaterialCommunityIcons name="alarm-light" size={26} color={SIREN_RED} />
      </TouchableOpacity>
      <SweetAlert
        visible={errorVisible}
        title="Could not open form"
        message="Please try again, or ask your manager for the incident report link."
        confirmText="OK"
        cancelText="Cancel"
        hideCancel
        variant="error"
        onConfirm={() => setErrorVisible(false)}
        onClose={() => setErrorVisible(false)}
      />
    </>
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
