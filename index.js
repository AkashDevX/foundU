/**
 * @format
 */

import 'react-native-gesture-handler';
import { AppRegistry } from 'react-native';
import { enableScreens } from 'react-native-screens';
import App from './App';
import { name as appName } from './app.json';

enableScreens(true);

// Required for FCM when the app is backgrounded/killed. Soft-fail if the
// native Firebase modules are not yet linked (e.g. JS reload before rebuild).
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {
    getMessaging,
    setBackgroundMessageHandler,
  } = require('@react-native-firebase/messaging');
  setBackgroundMessageHandler(getMessaging(), async () => {});
} catch (e) {
  console.warn('[chatPush] FCM background handler not registered:', e?.message || e);
}

AppRegistry.registerComponent(appName, () => App);
