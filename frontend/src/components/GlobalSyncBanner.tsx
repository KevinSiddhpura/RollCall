import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useState } from 'react';
import { AlertCircle, CloudOff, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { theme } from '../theme';
import type { SyncStatus } from '../services/syncService';

interface Props {
  status: SyncStatus;
}

export default function GlobalSyncBanner({ status }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || (status !== 'error' && status !== 'offline')) return null;

  const isError = status === 'error';
  const bg = isError ? theme.colors.dangerLight : theme.colors.warningLight;
  const color = isError ? theme.colors.dangerDark : theme.colors.warningDark;
  const Icon = isError ? AlertCircle : CloudOff;
  const msg = isError ? 'Sync failed — tap to retry in Settings' : 'Offline — data is local only';

  return (
    <TouchableOpacity
      style={[styles.banner, { backgroundColor: bg }]}
      onPress={() => router.push('/(tabs)/settings')}
      activeOpacity={0.85}
    >
      <Icon size={13} color={color} strokeWidth={2.5} />
      <Text style={[styles.msg, { color }]} numberOfLines={1}>{msg}</Text>
      <TouchableOpacity
        onPress={e => { e.stopPropagation?.(); setDismissed(true); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <X size={13} color={color} strokeWidth={2.5} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: theme.spacing.md,
    height: 28,
  },
  msg: { flex: 1, fontSize: 11, fontWeight: '700' },
});
