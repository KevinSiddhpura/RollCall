import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from '../../../src/db/sqlite';
import { useState, useEffect } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, UserPlus, Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../../src/theme';

export default function AddStudentScreen() {
  const { id, studentId } = useLocalSearchParams<{ id: string; studentId?: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const classId = Number(id);
  const editId = studentId ? Number(studentId) : null;
  const isEditing = !!editId;

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [enrollmentNo, setEnrollmentNo] = useState('');
  const [indexNo, setIndexNo] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEditing);

  useEffect(() => {
    async function init() {
      if (isEditing && editId) {
        const s = await db.getFirstAsync<{
          first_name: string; middle_name: string; last_name: string;
          roll_no: string; enrollment_no: string; index_no: string;
        }>('SELECT * FROM students WHERE id = ?', [editId]);
        if (s) {
          setFirstName(s.first_name);
          setMiddleName(s.middle_name);
          setLastName(s.last_name);
          setRollNo(s.roll_no === '-' ? '' : s.roll_no);
          setEnrollmentNo(s.enrollment_no === '-' ? '' : s.enrollment_no);
          setIndexNo(s.index_no);
        }
        setLoading(false);
      } else {
        const rows = await db.getAllAsync<{ index_no: string }>(
          'SELECT index_no FROM students WHERE class_id = ? AND index_no IS NOT NULL AND index_no != ""',
          [classId]
        );
        const max = rows.reduce((m, r) => Math.max(m, parseInt(r.index_no, 10) || 0), 0);
        setIndexNo(String(max + 1));
      }
    }
    init();
  }, []);

  const checkDuplicate = async (): Promise<boolean> => {
    const roll = rollNo.trim().toUpperCase();
    const enr = enrollmentNo.trim();
    if (!roll && !enr) return false;
    const conditions: string[] = [];
    const params: (string | number)[] = [classId];
    if (roll && roll !== '-') { conditions.push('(roll_no = ? AND roll_no != \'-\')'); params.push(roll); }
    if (enr && enr !== '-') { conditions.push('(enrollment_no = ? AND enrollment_no != \'-\')'); params.push(enr); }
    if (!conditions.length) return false;
    const query = `SELECT COUNT(*) as count FROM students WHERE class_id = ?
      AND (${conditions.join(' OR ')})${isEditing ? ` AND id != ${editId}` : ''}`;
    const result = await db.getFirstAsync<{ count: number }>(query, params);
    return (result?.count ?? 0) > 0;
  };

  const handleSave = async () => {
    if (!firstName.trim()) { Alert.alert('Required', 'First name is required.'); return; }
    if (!lastName.trim()) { Alert.alert('Required', 'Last name is required.'); return; }
    const isDup = await checkDuplicate();
    if (isDup) {
      Alert.alert('Duplicate', 'A student with this roll number or enrollment number already exists.');
      return;
    }
    try {
      const roll = rollNo.trim().toUpperCase() || '-';
      const enr = enrollmentNo.trim() || '-';
      if (isEditing && editId) {
        await db.runAsync(
          `UPDATE students SET first_name=?, middle_name=?, last_name=?, roll_no=?, enrollment_no=?, index_no=? WHERE id=?`,
          [firstName.trim(), middleName.trim(), lastName.trim(), roll, enr, indexNo.trim(), editId]
        );
      } else {
        await db.runAsync(
          `INSERT INTO students (class_id, first_name, middle_name, last_name, roll_no, enrollment_no, index_no) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [classId, firstName.trim(), middleName.trim(), lastName.trim(), roll, enr, indexNo.trim()]
        );
      }
      router.back();
    } catch {
      Alert.alert('Error', `Failed to ${isEditing ? 'update' : 'add'} student.`);
    }
  };

  const bind = (field: string) => ({
    onFocus: () => setFocused(field),
    onBlur: () => setFocused(null),
  });

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textInverse} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Student' : 'Add Student'}</Text>
          <Text style={styles.headerSub}>{isEditing ? 'Update student details' : 'Fill in the student\'s info'}</Text>
        </View>
        <View style={styles.headerIcon}>
          <UserPlus size={18} color={theme.colors.textInverse} strokeWidth={2} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">

        {/* Name section */}
        <Text style={styles.sectionLabel}>Full Name</Text>
        <View style={styles.group}>
          <View style={styles.groupRow}>
            <Text style={styles.fieldLabel}>First <Text style={styles.req}>*</Text></Text>
            <TextInput
              style={[styles.fieldInput, focused === 'firstName' && styles.fieldInputFocused]}
              placeholder="e.g. Rahul"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={firstName}
              onChangeText={setFirstName}
              {...bind('firstName')}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.groupRow}>
            <Text style={styles.fieldLabel}>Middle</Text>
            <TextInput
              style={[styles.fieldInput, focused === 'middleName' && styles.fieldInputFocused]}
              placeholder="e.g. Kumar"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={middleName}
              onChangeText={setMiddleName}
              {...bind('middleName')}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.groupRow}>
            <Text style={styles.fieldLabel}>Last <Text style={styles.req}>*</Text></Text>
            <TextInput
              style={[styles.fieldInput, focused === 'lastName' && styles.fieldInputFocused]}
              placeholder="e.g. Sharma"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={lastName}
              onChangeText={setLastName}
              {...bind('lastName')}
            />
          </View>
        </View>

        {/* Identifiers section */}
        <Text style={styles.sectionLabel}>Identifiers</Text>
        <View style={styles.group}>
          <View style={styles.groupRow}>
            <Text style={styles.fieldLabel}>Roll No</Text>
            <TextInput
              style={[styles.fieldInput, focused === 'rollNo' && styles.fieldInputFocused]}
              placeholder="e.g. 101"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={rollNo}
              onChangeText={t => setRollNo(t.toUpperCase())}
              autoCapitalize="characters"
              {...bind('rollNo')}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.groupRow}>
            <Text style={styles.fieldLabel}>Enrollment</Text>
            <TextInput
              style={[styles.fieldInput, focused === 'enrollmentNo' && styles.fieldInputFocused]}
              placeholder="e.g. EN2024001"
              placeholderTextColor={theme.colors.textPlaceholder}
              value={enrollmentNo}
              onChangeText={setEnrollmentNo}
              {...bind('enrollmentNo')}
            />
          </View>
        </View>
        <Text style={styles.hint}>Roll No and Enrollment No must be unique within this class.</Text>

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveBtn, { marginBottom: Math.max(insets.bottom, theme.spacing.xl) }]}
          onPress={handleSave} activeOpacity={0.85}
        >
          <Check size={20} color={theme.colors.textInverse} strokeWidth={3} />
          <Text style={styles.saveBtnText}>{isEditing ? 'Update Student' : 'Save Student'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.primaryDeep, paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  headerContent: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  headerIcon: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },

  form: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: theme.spacing.sm, marginLeft: 4,
  },

  group: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.sm, ...theme.shadows.xs, overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: theme.spacing.md, minHeight: 50,
  },
  divider: { height: 1, backgroundColor: theme.colors.border, marginLeft: theme.spacing.md },

  fieldLabel: {
    fontSize: 14, fontWeight: '600', color: theme.colors.text,
    width: 88, flexShrink: 0,
  },
  req: { color: theme.colors.danger },
  fieldInput: {
    flex: 1, fontSize: 14, color: theme.colors.text,
    paddingVertical: 14, paddingLeft: 4,
  },
  fieldInputFocused: { color: theme.colors.primary },

  hint: {
    fontSize: 12, color: theme.colors.textMuted, lineHeight: 17,
    marginBottom: theme.spacing.xl, marginLeft: 4,
  },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
    paddingVertical: 15, gap: theme.spacing.sm, marginTop: theme.spacing.sm,
    ...theme.shadows.primary,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
});
