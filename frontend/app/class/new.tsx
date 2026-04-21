import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useSQLiteContext } from '../../src/db/sqlite';
import { useState } from 'react';
import { router } from 'expo-router';
import { ArrowLeft, GraduationCap } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';

export default function NewClassScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [subject, setSubject] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Class name is required.');
      return;
    }
    if (!division.trim()) {
      Alert.alert('Required', 'Division / Section is required.');
      return;
    }
    try {
      await db.runAsync(
        'INSERT INTO classes (name, division, subject) VALUES (?, ?, ?)',
        [name.trim(), division.trim(), subject.trim()]
      );
      router.back();
    } catch {
      Alert.alert('Error', 'Failed to create class.');
    }
  };

  const inputStyle = (field: string) => [
    styles.input,
    focused === field && styles.inputFocused,
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textInverse} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerIcon}>
            <GraduationCap size={20} color={theme.colors.textInverse} strokeWidth={2} />
          </View>
          <View>
            <Text style={styles.headerTitle}>New Class</Text>
            <Text style={styles.headerSub}>Set up a class roster</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.sectionLabel}>CLASS INFO</Text>

          <Text style={styles.label}>Class Name / Grade <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={inputStyle('name')}
            placeholder="e.g. 10th Grade, Class A"
            placeholderTextColor={theme.colors.textPlaceholder}
            value={name}
            onChangeText={setName}
            onFocus={() => setFocused('name')}
            onBlur={() => setFocused(null)}
          />

          <Text style={styles.label}>Division / Section <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={inputStyle('division')}
            placeholder="e.g. A, B, Science"
            placeholderTextColor={theme.colors.textPlaceholder}
            value={division}
            onChangeText={setDivision}
            onFocus={() => setFocused('division')}
            onBlur={() => setFocused(null)}
          />

          <Text style={styles.label}>Subject <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            style={inputStyle('subject')}
            placeholder="e.g. Mathematics, Physics"
            placeholderTextColor={theme.colors.textPlaceholder}
            value={subject}
            onChangeText={setSubject}
            onFocus={() => setFocused('subject')}
            onBlur={() => setFocused(null)}
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
          <GraduationCap size={20} color={theme.colors.textInverse} strokeWidth={2.5} />
          <Text style={styles.saveBtnText}>Create Class</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  headerIcon: {
    width: 40, height: 40, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },

  form: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl },

  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl, ...theme.shadows.sm, marginBottom: theme.spacing.xl,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: theme.spacing.lg,
  },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md },
  required: { color: theme.colors.danger },
  optional: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '400' },

  input: {
    borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: 13,
    fontSize: 15, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt,
  },
  inputFocused: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },

  saveBtn: {
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: theme.spacing.sm, ...theme.shadows.primary,
  },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
});
