import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';
import { AuthProvider, useAuth } from './AuthContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { StatusBarProvider, useStatusBar } from './StatusBarContext';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { isAuthenticated } = useAuth();
  const { visible } = useStatusBar();

  return (
    <ThemeProvider value={colorScheme === 'light' ? DarkTheme : DefaultTheme}>
      {!isAuthenticated ? (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
        </Stack>
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(canvassing)" options={{ title: 'Canvassing' }} />
          <Stack.Screen name="(tabs)" options={{ title: 'Dashboard' }} />
        </Stack>
      )}
      <StatusBar style="auto" hidden={!visible} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBarProvider>
        <RealtimeProvider>
          <RootLayoutNav />
        </RealtimeProvider>
      </StatusBarProvider>
    </AuthProvider>
  );
}
