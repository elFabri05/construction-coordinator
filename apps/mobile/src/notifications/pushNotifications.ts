import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import type { PushNotificationData } from '@construct/shared';
import { api } from '../api/client';
import { navigateFromNotification } from '../navigation/RootNavigator';

const PROMPTED_KEY = 'cc.pushPermissionPrompted';

// Foreground notifications: show a banner but skip the sound — the realtime
// socket already updates the UI live, the banner is just a nudge.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function registerTokenWithBackend(): Promise<void> {
  if (!Device.isDevice || (Platform.OS !== 'ios' && Platform.OS !== 'android')) {
    return; // simulators/web can't receive Expo pushes
  }
  const { data } = await Notifications.getExpoPushTokenAsync();
  await api.post('/users/me/device-tokens', {
    expoPushToken: data,
    platform: Platform.OS,
  });
}

/**
 * Contextual permission priming: called the first time the user opens a
 * project (NOT on app launch — asking before the app has shown any value
 * tanks opt-in rates). Asks exactly once; if granted, registers the token.
 */
export async function maybeAskForPushPermissions(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(PROMPTED_KEY)) {
      return;
    }
    await AsyncStorage.setItem(PROMPTED_KEY, '1');

    const current = await Notifications.getPermissionsAsync();
    const status = current.granted
      ? current
      : await Notifications.requestPermissionsAsync();
    if (status.granted) {
      await registerTokenWithBackend();
    }
  } catch {
    // Push is a nice-to-have — never let it break a screen.
  }
}

/**
 * Called on every authenticated app start: if permission was already granted
 * earlier, (re-)register the token — covers token rotation and reinstalls.
 * Never prompts.
 */
export async function refreshPushTokenIfGranted(): Promise<void> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (granted) {
      await registerTokenWithBackend();
    }
  } catch {
    // Same: silent best-effort.
  }
}

/**
 * Deep-link on notification tap. Returns the unsubscribe function.
 * Also handles the cold-start case (app launched by tapping a notification).
 */
export function listenForNotificationTaps(): () => void {
  const handle = (response: Notifications.NotificationResponse) => {
    const data = response.notification.request.content.data as
      | Partial<PushNotificationData>
      | undefined;
    if (data?.type && data.projectId) {
      navigateFromNotification(data as PushNotificationData);
    }
  };

  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  // Cold start: the tap that launched the app.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) {
      handle(response);
    }
  });
  return () => sub.remove();
}
