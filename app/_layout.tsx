import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AmbientBackground } from '@/components/AmbientBackground';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/lib/theme';

export const unstable_settings = {
  initialRouteName: 'index',
};

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: Platform.OS === 'web' ? 'transparent' : colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemeProvider value={navigationTheme}>
            <StatusBar style="dark" />
            <AmbientBackground />
            <Stack
              screenOptions={{
                headerShown: false,
                // Native stack transitions overlap screens, so only web can show the shared ambient layer through.
                contentStyle: { backgroundColor: Platform.OS === 'web' ? 'transparent' : colors.bg },
                animation: Platform.OS === 'web' ? 'none' : 'default',
              }}
            />
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
