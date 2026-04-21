import { Stack } from 'expo-router';
import { SQLiteProvider } from '../src/db/sqlite';
import { migrateDbIfNeeded } from '../src/db/schema';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../src/theme';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider
        databaseName="attendance.db"
        onInit={migrateDbIfNeeded}
        useSuspense
      >
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.primaryDeep }}>
          <StatusBar style="light" backgroundColor={theme.colors.primaryDeep} />
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="class/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="class/[id]/take-attendance" options={{ headerShown: false }} />
            <Stack.Screen name="class/[id]/add-student" options={{ headerShown: false }} />
            <Stack.Screen name="class/new" options={{ headerShown: false }} />
            <Stack.Screen name="student/[id]" options={{ headerShown: false }} />
          </Stack>
        </SafeAreaView>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
