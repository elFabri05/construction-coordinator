import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuthStore } from './src/store/useAuthStore';

export default function App() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <>
      <StatusBar style="dark" />
      <RootNavigator />
    </>
  );
}
