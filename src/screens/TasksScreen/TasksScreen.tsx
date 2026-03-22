import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dashboardStyles } from '../../styles/styles';

export function TasksScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[{ flex: 1, backgroundColor: '#F5F6F8', paddingTop: insets.top, paddingHorizontal: 28, paddingBottom: 100 }]}>
      <Text style={[dashboardStyles.userName, { marginTop: 24 }]}>Tasks</Text>
      <Text style={dashboardStyles.greetingText}>Your tasks will appear here.</Text>
    </View>
  );
}
