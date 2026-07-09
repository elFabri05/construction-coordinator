import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/useAuthStore';
import { useSubmissionsStore } from './src/store/useSubmissionsStore';

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateQueue = useSubmissionsStore((s) => s.hydrateQueue);

  useEffect(() => {
    void hydrate();
    // Restore any submissions queued offline in a previous session.
    void hydrateQueue();
  }, [hydrate, hydrateQueue]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
