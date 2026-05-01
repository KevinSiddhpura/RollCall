import { View, Text, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import { CloudOff, RefreshCw, Check } from 'lucide-react-native';
import { theme } from '../theme';

export interface SyncProgress {
  phase: 'push' | 'pull' | 'complete' | 'error';
  message: string;
  groups?: number;
  members?: number;
  sessions?: number;
  records?: number;
  error?: string;
}

interface Props {
  visible: boolean;
  progress: SyncProgress | null;
  onClose: () => void;
}

const DATA_TYPES = [
  { key: 'groups' as const, label: 'Groups', icon: '📁' },
  { key: 'members' as const, label: 'Members', icon: '👤' },
  { key: 'sessions' as const, label: 'Sessions', icon: '📅' },
  { key: 'records' as const, label: 'Records', icon: '📋' },
];

export default function SyncModal({ visible, progress, onClose }: Props) {
  const [dots, setDots] = useState('');
  const timer = useRef<any>(null);

  useEffect(() => {
    if (visible && progress && progress.phase !== 'complete' && progress.phase !== 'error') {
      timer.current = setInterval(() => setDots(p => p.length >= 3 ? '' : p + '.'), 400);
    } else {
      if (timer.current) clearInterval(timer.current);
      setDots('');
    }
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [visible, progress?.phase]);

  const isComplete = progress?.phase === 'complete';
  const isError = progress?.phase === 'error';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header */}
          {isComplete ? (
            <View style={styles.iconCircle}>
              <Check size={28} color="#fff" strokeWidth={3} />
            </View>
          ) : isError ? (
            <View style={[styles.iconCircle, styles.iconError]}>
              <CloudOff size={28} color="#fff" strokeWidth={2.5} />
            </View>
          ) : (
            <RefreshCw size={32} color={theme.colors.primary} style={{ marginBottom: 12 }} />
          )}

          <Text style={styles.title}>
            {isComplete ? 'Sync Complete' : isError ? 'Sync Failed' : 'Syncing Data'}
          </Text>

          {!isComplete && !isError && (
            <Text style={styles.phase}>
              {progress?.phase === 'push' ? 'Uploading local changes' : 'Downloading remote data'}{dots}
            </Text>
          )}

          {isError && progress?.error && (
            <Text style={styles.errorText}>{progress.error}</Text>
          )}

          {/* Data type progress */}
          {progress && !isError && (
            <View style={styles.types}>
              {DATA_TYPES.map(dt => {
                const count = progress[dt.key] ?? 0;
                const done = progress.phase === 'complete' || (progress.phase === 'pull' && count > 0);
                return (
                  <View key={dt.key} style={styles.typeRow}>
                    <Text style={styles.typeIcon}>{dt.icon}</Text>
                    <Text style={styles.typeLabel}>{dt.label}</Text>
                    <Text style={styles.typeCount}>{count}</Text>
                    {done ? (
                      <Check size={14} color={theme.colors.success} strokeWidth={3} />
                    ) : progress.phase === 'push' || progress.phase === 'pull' ? (
                      <ActivityIndicator size="small" color={theme.colors.primary} />
                    ) : (
                      <View style={styles.dot} />
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Complete OK button */}
          {isComplete && (
            <View style={styles.okBtnWrap}>
              <View style={styles.okBtn} onTouchEnd={onClose}>
                <Text style={styles.okBtnText}>Done</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: { width: '100%', maxWidth: 340, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius['3xl'], padding: 32, alignItems: 'center', ...theme.shadows.lg },

  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: theme.colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  iconError: { backgroundColor: theme.colors.danger },

  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginBottom: 4, textAlign: 'center' },
  phase: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24, textAlign: 'center' },
  errorText: { fontSize: 13, color: theme.colors.danger, marginBottom: 16, textAlign: 'center' },

  types: { width: '100%', gap: 10, marginBottom: 24 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.lg },
  typeIcon: { fontSize: 16 },
  typeLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  typeCount: { fontSize: 14, fontWeight: '700', color: theme.colors.textMuted, marginRight: 4 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: theme.colors.borderLight },

  okBtnWrap: { width: '100%' },
  okBtn: { backgroundColor: theme.colors.primary, paddingVertical: 15, borderRadius: theme.borderRadius.lg, alignItems: 'center', ...theme.shadows.primary },
  okBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
