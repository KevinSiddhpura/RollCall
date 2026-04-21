import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform,
  FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSQLiteContext } from '../../../src/db/sqlite';
import { useState, useCallback } from 'react';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { ArrowLeft, Calendar, Check, ChevronDown, Users } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../../src/theme';
import { format, parseISO } from 'date-fns';

type AttStatus = 'present' | 'absent' | 'late';

type StudentItem = {
  id: number;
  first_name: string;
  last_name: string;
  roll_no: string;
  enrollment_no: string;
};

const STATUS_CONFIG: { key: AttStatus; label: string; short: string; color: string; bg: string }[] = [
  { key: 'present', label: 'Present', short: 'P', color: theme.colors.present, bg: theme.colors.presentLight },
  { key: 'absent',  label: 'Absent',  short: 'A', color: theme.colors.absent,  bg: theme.colors.absentLight  },
  { key: 'late',    label: 'Late',    short: 'L', color: theme.colors.late,    bg: theme.colors.lateLight    },
];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TakeAttendanceScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const classId = Number(id);
  const editSessionId = sessionId ? Number(sessionId) : null;
  const isEditing = !!editSessionId;

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [attendance, setAttendance] = useState<Record<number, AttStatus>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [classInfo, setClassInfo] = useState<{ name: string; division: string } | null>(null);

  useFocusEffect(useCallback(() => {
    async function load() {
      const cls = await db.getFirstAsync<{ name: string; division: string }>(
        'SELECT name, division FROM classes WHERE id = ?', [classId]
      );
      setClassInfo(cls);

      const studs = await db.getAllAsync<StudentItem>(
        `SELECT id, first_name, last_name, roll_no, enrollment_no
         FROM students WHERE class_id = ?
         ORDER BY CAST(roll_no AS INTEGER) ASC, first_name ASC`,
        [classId]
      );
      setStudents(studs);

      if (isEditing && editSessionId) {
        const sess = await db.getFirstAsync<{ date: string }>(
          'SELECT date FROM attendance_sessions WHERE id = ?', [editSessionId]
        );
        if (sess) {
          try { setDate(parseISO(sess.date)); } catch { setDate(new Date()); }
        }

        const records = await db.getAllAsync<{ student_id: number; status: string; reason: string }>(
          'SELECT student_id, status, reason FROM attendance_records WHERE session_id = ?',
          [editSessionId]
        );
        const attMap: Record<number, AttStatus> = {};
        const reasonMap: Record<number, string> = {};
        records.forEach(r => {
          // coerce legacy 'excused' → 'absent'
          const s = r.status === 'excused' ? 'absent' : r.status as AttStatus;
          attMap[r.student_id] = s;
          if (r.reason) reasonMap[r.student_id] = r.reason;
        });
        studs.forEach(s => { if (!attMap[s.id]) attMap[s.id] = 'present'; });
        setAttendance(attMap);
        setReasons(reasonMap);
      } else {
        const map: Record<number, AttStatus> = {};
        studs.forEach(s => { map[s.id] = 'present'; });
        setAttendance(map);
        setReasons({});
      }
    }
    if (id) load();
  }, [id, sessionId, db]));

  const setStatus = (studentId: number, status: AttStatus) => {
    setAttendance(prev => ({ ...prev, [studentId]: status }));
    if (status === 'present') {
      setReasons(prev => { const next = { ...prev }; delete next[studentId]; return next; });
    }
  };

  const setReason = (studentId: number, text: string) => {
    setReasons(prev => ({ ...prev, [studentId]: text }));
  };

  const markAll = (status: AttStatus) => {
    const map: Record<number, AttStatus> = {};
    students.forEach(s => { map[s.id] = status; });
    setAttendance(map);
    if (status === 'present') setReasons({});
  };

  const counts = STATUS_CONFIG.map(s => ({
    ...s,
    count: Object.values(attendance).filter(v => v === s.key).length,
  }));

  const handleSave = async () => {
    if (!students.length) {
      Alert.alert('No students', 'Add students to this class before taking attendance.');
      return;
    }
    setIsSaving(true);
    try {
      const dateStr = toDateStr(date);
      const timeStr = format(new Date(), 'hh:mm a');

      if (isEditing && editSessionId) {
        await db.withTransactionAsync(async () => {
          for (const student of students) {
            const status = attendance[student.id] ?? 'absent';
            const reason = reasons[student.id] ?? '';
            const existing = await db.getFirstAsync<{ id: number }>(
              'SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?',
              [editSessionId, student.id]
            );
            if (existing) {
              await db.runAsync(
                'UPDATE attendance_records SET status = ?, reason = ? WHERE session_id = ? AND student_id = ?',
                [status, reason, editSessionId, student.id]
              );
            } else {
              await db.runAsync(
                'INSERT INTO attendance_records (session_id, student_id, status, reason) VALUES (?, ?, ?, ?)',
                [editSessionId, student.id, status, reason]
              );
            }
          }
        });
        Alert.alert('Updated', 'Attendance session updated successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ?',
          [classId, dateStr]
        );
        if (existing) {
          Alert.alert(
            'Session Exists',
            `Attendance for ${format(date, 'MMM d, yyyy')} already exists. Would you like to edit it?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Edit Session', onPress: () => router.replace(`/class/${classId}/take-attendance?sessionId=${existing.id}`) },
            ]
          );
          setIsSaving(false);
          return;
        }
        await db.withTransactionAsync(async () => {
          const session = await db.runAsync(
            'INSERT INTO attendance_sessions (class_id, date, time) VALUES (?, ?, ?)',
            [classId, dateStr, timeStr]
          );
          const sid = session.lastInsertRowId;
          for (const student of students) {
            await db.runAsync(
              'INSERT INTO attendance_records (session_id, student_id, status, reason) VALUES (?, ?, ?, ?)',
              [sid, student.id, attendance[student.id] ?? 'absent', reasons[student.id] ?? '']
            );
          }
        });
        Alert.alert('Saved', 'Attendance recorded successfully.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Failed to save attendance.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Student row ───
  const renderStudent = ({ item, index }: { item: StudentItem; index: number }) => {
    const current = attendance[item.id] ?? 'present';
    const cfg = STATUS_CONFIG.find(s => s.key === current) ?? STATUS_CONFIG[0];
    const needsReason = current === 'absent' || current === 'late';

    const identifier =
      item.roll_no && item.roll_no !== '-'
        ? `Roll ${item.roll_no}`
        : item.enrollment_no && item.enrollment_no !== '-'
        ? `Enr ${item.enrollment_no}`
        : null;

    return (
      <View style={[styles.studentCard, { borderLeftColor: cfg.color }]}>
        {/* Main row */}
        <View style={styles.studentMain}>
          {/* Index bubble */}
          <View style={[styles.indexBubble, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.indexText, { color: cfg.color }]}>#{index + 1}</Text>
          </View>

          {/* Name + identifier · status */}
          <View style={styles.studentInfo}>
            <Text style={styles.studentName} numberOfLines={1}>
              {item.first_name} {item.last_name}
            </Text>
            <View style={styles.studentSubRow}>
              {identifier && (
                <Text style={styles.identifierText}>{identifier}</Text>
              )}
              {identifier && <Text style={styles.subDot}>·</Text>}
              <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Status buttons */}
          <View style={styles.statusGroup}>
            {STATUS_CONFIG.map(s => {
              const active = current === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.statusBtn, { backgroundColor: active ? s.color : s.bg }]}
                  onPress={() => setStatus(item.id, s.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.statusBtnText, { color: active ? '#fff' : s.color }]}>
                    {s.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Reason field */}
        {needsReason && (
          <View style={styles.reasonRow}>
            <TextInput
              style={styles.reasonInput}
              placeholder="Add reason (optional)"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={reasons[item.id] ?? ''}
              onChangeText={text => setReason(item.id, text)}
              returnKeyType="done"
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── Hero Header ─── */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={theme.colors.textInverse} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.heroTitleBlock}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{isEditing ? 'Edit Attendance' : 'Take Attendance'}</Text>
              {isEditing && (
                <View style={styles.editingBadge}>
                  <Text style={styles.editingBadgeText}>EDITING</Text>
                </View>
              )}
            </View>
            {classInfo && (
              <Text style={styles.heroSub}>{classInfo.name} · Div {classInfo.division}</Text>
            )}
          </View>
        </View>

        {/* Date + quick-mark row */}
        <View style={styles.heroControlRow}>
          <TouchableOpacity
            style={styles.datePill}
            onPress={() => !isEditing && setShowDatePicker(true)}
            activeOpacity={isEditing ? 1 : 0.75}
          >
            <Calendar size={14} color={isEditing ? 'rgba(255,255,255,0.5)' : theme.colors.textInverse} />
            <Text style={[styles.datePillText, isEditing && styles.datePillTextDim]}>
              {format(date, 'EEE, MMM d, yyyy')}
            </Text>
            {!isEditing && <ChevronDown size={13} color={theme.colors.textInverse} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => markAll('present')} activeOpacity={0.75}>
            <Text style={[styles.quickBtnText, { color: theme.colors.present }]}>All P</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => markAll('absent')} activeOpacity={0.75}>
            <Text style={[styles.quickBtnText, { color: theme.colors.absent }]}>All A</Text>
          </TouchableOpacity>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          {counts.map((c, i) => (
            <View key={c.key} style={[styles.stripStat, i > 0 && styles.stripStatBorder]}>
              <Text style={[styles.stripCount, { color: c.color }]}>{c.count}</Text>
              <Text style={styles.stripLabel}>{c.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {showDatePicker && !isEditing && (
        <DateTimePicker
          value={date} mode="date" display="default"
          onChange={(_, d) => {
            setShowDatePicker(Platform.OS === 'ios');
            if (d) setDate(d);
          }}
        />
      )}

      {/* ─── Student list ─── */}
      {students.length === 0 ? (
        <View style={styles.emptyState}>
          <Users size={36} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>No students in this class.</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={item => item.id.toString()}
          renderItem={renderStudent}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* ─── Footer ─── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
        <TouchableOpacity
          style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.85}
        >
          {isSaving
            ? <ActivityIndicator color={theme.colors.textInverse} size="small" />
            : <Check size={20} color={theme.colors.textInverse} strokeWidth={2.5} />}
          <Text style={styles.saveBtnText}>
            {isSaving ? 'Saving…' : isEditing ? 'Update Attendance' : 'Save Attendance'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // ── Hero ──
  hero: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  backBtn: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  heroTitleBlock: { flex: 1 },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  heroTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  editingBadge: {
    backgroundColor: theme.colors.warningLight, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: theme.borderRadius.full,
  },
  editingBadgeText: { fontSize: 9, fontWeight: '800', color: theme.colors.warningDark, letterSpacing: 0.5 },

  heroControlRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  datePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.full,
  },
  datePillText: { flex: 1, fontSize: 13, fontWeight: '700', color: theme.colors.textInverse },
  datePillTextDim: { color: 'rgba(255,255,255,0.5)' },
  quickBtn: {
    paddingHorizontal: 13, paddingVertical: 8, borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  quickBtnText: { fontSize: 12, fontWeight: '800' },

  statsStrip: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.borderRadius.lg, overflow: 'hidden',
  },
  stripStat: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  stripStatBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)' },
  stripCount: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  stripLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 1, fontWeight: '600' },

  // ── Student cards ──
  listContent: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: 100,
  },
  studentCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: 5,
    borderLeftWidth: 4,
    overflow: 'hidden',
    ...theme.shadows.xs,
  },
  studentMain: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9, paddingRight: 8, gap: 8,
  },
  indexBubble: {
    marginLeft: 8, minWidth: 28, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: theme.borderRadius.full,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  indexText: { fontSize: 11, fontWeight: '800' },
  studentInfo: { flex: 1 },
  studentName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  studentSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  identifierText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  subDot: { fontSize: 11, color: theme.colors.textMuted },
  statusLabel: { fontSize: 11, fontWeight: '700' },

  statusGroup: { flexDirection: 'row', gap: 5 },
  statusBtn: {
    width: 30, height: 30, borderRadius: theme.borderRadius.sm,
    justifyContent: 'center', alignItems: 'center',
  },
  statusBtnText: { fontSize: 12, fontWeight: '800' },

  // ── Reason ──
  reasonRow: {
    paddingHorizontal: 10, paddingBottom: 9,
  },
  reasonInput: {
    borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 6,
    fontSize: 12, color: theme.colors.text,
    backgroundColor: theme.colors.surfaceAlt,
  },

  // ── Empty ──
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: theme.spacing.md, paddingBottom: 80,
  },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, fontWeight: '500' },

  // ── Footer ──
  footer: {
    backgroundColor: theme.colors.surface, borderTopWidth: 1,
    borderTopColor: theme.colors.border, paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
  },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
    paddingVertical: 14, gap: theme.spacing.sm, ...theme.shadows.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
});
