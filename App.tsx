/**
 * foundU - Workforce-style Login
 * @format
 */

import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AppBootstrapProvider } from './src/context/AppBootstrapContext';
import { AuthSessionProvider, useAuthSession } from './src/context/AuthSessionContext';
import { AppShell } from './src/components/AppShell';
import { LoginScreen } from './src/screens/LoginScreen/LoginScreen';
import { colors } from './src/theme/theme';

const Stack = createNativeStackNavigator();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.primary,
  },
};

/**
 * Keeps NavigationContainer mounted at all times so screens (e.g. Login) are not mounted/unmounted
 * when bootstrap flips loading — avoiding "Rendered more hooks than during the previous render".
 * Login is always visible; organization list loads in the background on the login screen.
 *
 * Non-login screens are lazy-loaded via getComponent so cold start does not evaluate the full
 * main-app module graph (tabs, dashboard GPS, geofence monitor, etc.).
 */
function NavigationRoot() {
  // A returning user with a persisted session starts on the main app; everyone
  // else starts on Login. Session is read before AppShell renders us (see
  // AuthSessionProvider), so this reflects the stored login state at launch.
  const { initialAuthenticated } = useAuthSession();
  return (
    <NavigationContainer theme={navigationTheme}>
      <View style={styles.navShell}>
        <StatusBar barStyle="light-content" backgroundColor="#003D7A" />
        <Stack.Navigator
          initialRouteName={initialAuthenticated ? 'Main' : 'Login'}
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="CreateAccount"
            getComponent={() => require('./src/screens/CreateAccountScreen').CreateAccountScreen}
          />
          <Stack.Screen
            name="RequestOrganization"
            getComponent={() =>
              require('./src/screens/RequestOrganizationScreen').RequestOrganizationScreen
            }
          />
          <Stack.Screen
            name="MyProfile"
            getComponent={() => require('./src/screens/MyProfileScreen').MyProfileScreen}
          />
          <Stack.Screen
            name="Main"
            getComponent={() => require('./src/navigation/MainTabs').MainTabs}
          />
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.primary }}>
      <SafeAreaProvider>
        <AppBootstrapProvider>
          <AuthSessionProvider>
            <AppShell>
              <NavigationRoot />
            </AppShell>
          </AuthSessionProvider>
        </AppBootstrapProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  navShell: { flex: 1 },
});

export default App;
