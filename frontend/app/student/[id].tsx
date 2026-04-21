import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from '../../src/db/sqlite';
import { useState, useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import {
  ArrowLeft, Pencil, Trash2, FileSpreadsheet,
  Calendar, Clock,
} from 'lucide-react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { format, parseISO } from 'date-fns';

type StudentDetails = {
  id: number; class_id: number; first_name: string; middle_name: string; last_name: string;
  roll_no: string; enrollment_no: string; index_no: string; class_name: string; division: string;
};
type AttLog = { id: number; date: string; time: string; status: 'present' | 'absent' | 'late' | 'excused'; reason?: string };

const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  present: { color: theme.colors.present, bg: theme.colors.presentLight, label: 'P' },
  absent:  { color: theme.colors.absent,  bg: theme.colors.absentLight,  label: 'A' },
  late:    { color: theme.colors.late,    bg: theme.colors.lateLight,    label: 'L' },
  excused: { color: theme.colors.excused, bg: theme.colors.excusedLight, label: 'E' },
};

function formatDate(d: string) {
  try { return format(parseISO(d), 'EEE, MMM d, yyyy'); } catch { return d; }
}

export default function StudentDetailsScreen() {
  const { id } = useLocalSearchParams();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [student, setStudent] = useState<StudentDetails | null>(null);
  const [logs, setLogs] = useState<AttLog[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    async function load() {
      setLoading(true);
      try {
        const s = await db.getFirstAsync<StudentDetails>(`
          SELECT s.*, c.name as class_name, c.division
          FROM students s JOIN classes c ON s.class_id = c.id
          WHERE s.id = ?
        `, [Number(id)]);
        setStudent(s ?? null);
        if (s) {
          const l = await db.getAllAsync<AttLog>(`
            SELECT ar.id, a_s.date, a_s.time, ar.status, ar.reason
            FROM attendance_records ar
            JOIN attendance_sessions a_s ON ar.session_id = a_s.id
            WHERE ar.student_id = ?
            ORDER BY a_s.date DESC, a_s.time DESC
          `, [Number(id)]);
          setLogs(l);
        }
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id, db]));

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!student) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: theme.colors.textMuted }}>Student not found.</Text>
      </View>
    );
  }

  const present = logs.filter(l => l.status === 'present' || l.status === 'late').length;
  const absent  = logs.filter(l => l.status === 'absent').length;
  const total = logs.length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const pctColor = pct >= 75 ? theme.colors.present : pct >= 50 ? theme.colors.late : theme.colors.absent;

  const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ');
  const initials = `${student.first_name[0] ?? ''}${student.last_name[0] ?? ''}`.toUpperCase();

  const handleEdit = () => {
    router.push(`/class/${student.class_id}/add-student?studentId=${student.id}`);
  };

  const handleDelete = () => {
    Alert.alert('Delete Student', `Remove "${fullName}" and all their attendance records?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await db.runAsync('DELETE FROM students WHERE id = ?', [student.id]);
          router.back();
        },
      },
    ]);
  };

  const handleExport = async () => {
    if (!logs.length) { Alert.alert('No data', 'This student has no attendance records.'); return; }
    try {
      const rows = logs.map(l => `"${formatDate(l.date)}","${l.time}","${l.status}","${l.reason ?? ''}"`).join('\n');
      const csv = `"Date","Time","Status","Reason"\n${rows}`;
      const fileName = `${student.first_name} ${student.last_name} - Attendance - ${format(new Date(), 'MMM d yyyy')}.csv`;
      const file = new File(Paths.document, fileName);
      file.write(csv);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
      else Alert.alert('Error', 'Sharing not available on this device.');
    } catch {
      Alert.alert('Error', 'Failed to export CSV.');
    }
  };

  const renderLog = ({ item }: { item: AttLog }) => {
    const s = STATUS_STYLE[item.status] ?? STATUS_STYLE.absent;
    return (
      <View style={styles.logRow}>
        <View style={[styles.logStatusBar, { backgroundColor: s.color }]} />
        <View style={styles.logContent}>
          <Text style={styles.logDate}>{formatDate(item.date)}</Text>
          <View style={styles.logTimeRow}>
            <Clock size={10} color={theme.colors.textMuted} />
            <Text style={styles.logTime}>{item.time}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusBadgeText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        {/* Nav row */}
        <View style={styles.heroNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={theme.colors.textInverse} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.heroTitleBlock}>
            <Text style={styles.heroName} numberOfLines={1}>{fullName}</Text>
            <Text style={styles.heroClass}>{student.class_name} · Div {student.division}</Text>
          </View>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{initials}</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          {[
            { label: 'Sessions', value: total },
            { label: 'Present', value: present, color: theme.colors.present },
            { label: 'Absent', value: absent, color: theme.colors.absent },
            { label: 'Rate', value: total > 0 ? `${pct}%` : '–', color: pctColor },
          ].map((s, i) => (
            <View key={s.label} style={[styles.stripStat, i > 0 && styles.stripBorder]}>
              <Text style={[styles.stripValue, s.color ? { color: s.color } : null]}>{s.value}</Text>
              <Text style={styles.stripLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Attendance Log */}
      <View style={styles.logHeader}>
        <Calendar size={14} color={theme.colors.textSecondary} />
        <Text style={styles.logHeaderText}>Attendance Log</Text>
        <View style={styles.logCountBadge}>
          <Text style={styles.logCountText}>{logs.length}</Text>
        </View>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyState}>
          <Calendar size={32} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>No attendance records yet.</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={item => item.id.toString()}
          renderItem={renderLog}
          contentContainerStyle={styles.logList}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bottom action bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.primarySurface }]} onPress={handleEdit} activeOpacity={0.75}>
          <Pencil size={17} color={theme.colors.primary} strokeWidth={2} />
          <Text style={[styles.actionBtnText, { color: theme.colors.primary }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.successLight }]} onPress={handleExport} activeOpacity={0.75}>
          <FileSpreadsheet size={17} color={theme.colors.successDark} strokeWidth={2} />
          <Text style={[styles.actionBtnText, { color: theme.colors.successDark }]}>Export CSV</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.dangerLight }]} onPress={handleDelete} activeOpacity={0.75}>
          <Trash2 size={17} color={theme.colors.dangerDark} strokeWidth={2} />
          <Text style={[styles.actionBtnText, { color: theme.colors.dangerDark }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  hero: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  heroNav: {
    flexDirection: 'row', alignItems: 'center',
    gap: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  heroTitleBlock: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.3 },
  heroClass: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  heroAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  heroAvatarText: { fontSize: 14, fontWeight: '800', color: theme.colors.textInverse },

  statsStrip: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.borderRadius.lg, overflow: 'hidden',
  },
  stripStat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  stripBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)' },
  stripValue: { fontSize: 18, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.5 },
  stripLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 1, fontWeight: '600' },

  logHeader: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl, paddingVertical: 10,
    backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  logHeaderText: { fontSize: 14, fontWeight: '700', color: theme.colors.text, flex: 1 },
  logCountBadge: {
    backgroundColor: theme.colors.primarySurface, paddingHorizontal: 9, paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
  },
  logCountText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },

  logList: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: 100 },
  logRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
    marginBottom: 5, overflow: 'hidden', ...theme.shadows.xs,
  },
  logStatusBar: { width: 4, alignSelf: 'stretch' },
  logContent: { flex: 1, paddingVertical: 10, paddingHorizontal: theme.spacing.md, flexDirection: 'row', alignItems: 'center' },
  logDate: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  logTimeRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  logTime: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '500' },
  statusBadge: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '800' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface, borderTopWidth: 1, borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md, paddingHorizontal: theme.spacing.md, ...theme.shadows.lg,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: theme.borderRadius.md,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: theme.spacing.md, paddingBottom: 80,
  },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, fontWeight: '500' },
});
