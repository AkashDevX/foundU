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
import { AppBootstrapProvider, useAppBootstrap } from './src/context/AppBootstrapContext';
import { FullScreenLoader } from './src/components/FullScreenLoader';
import { LoginScreen } from './src/screens/LoginScreen/LoginScreen';
import { CreateAccountScreen } from './src/screens/CreateAccountScreen';
import { RequestOrganizationScreen } from './src/screens/RequestOrganizationScreen';
import { MyProfileScreen } from './src/screens/MyProfileScreen';
import { MainTabs } from './src/navigation/MainTabs';
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
 * FullScreenLoader overlays until bootstrap completes.
 */
function NavigationRoot() {
  const { loading } = useAppBootstrap();

  return (
    <NavigationContainer theme={navigationTheme}>
      <View style={styles.navShell}>
        <StatusBar barStyle="light-content" backgroundColor="#003D7A" />
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
          <Stack.Screen name="RequestOrganization" component={RequestOrganizationScreen} />
          <Stack.Screen name="MyProfile" component={MyProfileScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
        </Stack.Navigator>
        {loading ? (
          <View style={styles.bootstrapOverlay} pointerEvents="auto">
            <FullScreenLoader variant="brand" message="Loading workforce data…" />
          </View>
        ) : null}
      </View>
    </NavigationContainer>
  );
}

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.primary }}>
      <SafeAreaProvider>
        <AppBootstrapProvider>
          <NavigationRoot />
        </AppBootstrapProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  navShell: { flex: 1 },
  bootstrapOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10000,
    elevation: 10000,
  },
});

export default App;
