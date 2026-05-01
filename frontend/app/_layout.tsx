import { Stack, router, useSegments } from 'expo-router';
import { useEffect, ReactNode } from 'react';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { SecurityProvider, useSecurity } from '../src/auth/SecurityContext';
import LockScreen from '../src/components/LockScreen';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { pushToMongo, pullFromMongo } from '../src/services/syncService';
import GlobalSyncBanner from '../src/components/GlobalSyncBanner';
import Constants from 'expo-constants';
import axios from 'axios';
import { BACKEND_URL } from '../src/config';
import { initDatabase } from '../src/services/db/database';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';

function AuthGate({ children }: { children: ReactNode }) {
  const { mode } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (mode === 'loading') return;
    const inAuth = segments[0] === 'auth';
    if (mode === 'unauthenticated' && !inAuth) {
      router.replace('/auth');
    } else if (mode !== 'unauthenticated' && inAuth) {
      router.replace('/(tabs)/dashboard');
    }
  }, [mode, segments]);

  return <>{children}</>;
}

function SecurityOverlays() {
  const { isLocked, privacyActive, appLockEnabled } = useSecurity();
  const { colors } = useTheme();
  return (
    <>
      {privacyActive && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.primaryDeep, zIndex: 9999 }} />
      )}
      {isLocked && appLockEnabled && <LockScreen />}
    </>
  );
}

function BannerBridge() {
  const { syncStatus, mode } = useAuth();
  if (mode === 'guest' || mode === 'unauthenticated') return null;
  return <GlobalSyncBanner status={syncStatus} />;
}

function SyncManager() {
  const { token, user, setSyncStatus } = useAuth();

  useEffect(() => {
    if (!token || !user) return;
    let active = true;
    setSyncStatus('syncing');
    (async () => {
      try {
        await pushToMongo(token, user.userId);
        await pullFromMongo(token, user.userId);
        if (active) setSyncStatus('synced');
      } catch (e) {
        console.error('Sync failed:', e);
        if (active) setSyncStatus('error');
      }
    })();
    return () => { active = false; };
  }, [token, user, setSyncStatus]);

  return null;
}

function DatabaseInitializer() {
  useEffect(() => {
    initDatabase().catch(console.error);
  }, []);
  return null;
}

function AppShell() {
  const { colors } = useTheme();

  useEffect(() => {
    axios.post(`${BACKEND_URL}/ping`, {
      platform: Platform.OS,
      appVersion: Constants.expoConfig?.version ?? 'unknown',
    }).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SecurityProvider>
          <AuthProvider>
            <DatabaseInitializer />
            <SyncManager />
            <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.primaryDeep }}>
              <StatusBar style="light" backgroundColor={colors.primaryDeep} />
              <BannerBridge />
              <AuthGate>
                <Stack>
                  <Stack.Screen name="auth" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="group/new" options={{ headerShown: false }} />
                  <Stack.Screen name="group/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="group/[id]/fields" options={{ headerShown: false }} />
                  <Stack.Screen name="group/[id]/add-member" options={{ headerShown: false }} />
                  <Stack.Screen name="group/[id]/take-attendance" options={{ headerShown: false }} />
                  <Stack.Screen name="group/[id]/import-csv" options={{ headerShown: false }} />
                  <Stack.Screen name="group/[id]/member/[memberId]" options={{ headerShown: false }} />
                </Stack>
              </AuthGate>
            </SafeAreaView>
          </AuthProvider>
          <SecurityOverlays />
        </SecurityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}
