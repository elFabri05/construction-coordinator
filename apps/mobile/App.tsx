import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/useAuthStore';
import { useSubmissionsStore } from './src/store/useSubmissionsStore';
import { connectSocket, disconnectSocket } from './src/realtime/socketClient';
import {
  listenForNotificationTaps,
  refreshPushTokenIfGranted,
} from './src/notifications/pushNotifications';

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateQueue = useSubmissionsStore((s) => s.hydrateQueue);
  const authStatus = useAuthStore((s) => s.status);

  useEffect(() => {
    void hydrate();
    // Restore any submissions queued offline in a previous session.
    void hydrateQueue();
    return listenForNotificationTaps();
  }, [hydrate, hydrateQueue]);

  // Socket follows the session: connect on login/restore, drop on logout.
  // Re-register the push token on each authenticated start (token rotation).
  useEffect(() => {
    if (authStatus === 'authenticated') {
      connectSocket();
      void refreshPushTokenIfGranted();
    } else if (authStatus === 'unauthenticated') {
      disconnectSocket();
    }
  }, [authStatus]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
