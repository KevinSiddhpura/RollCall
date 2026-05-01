import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenHeader from '../../../src/components/ScreenHeader';
import { theme } from '../../../src/theme';
import { generateId } from '../../../src/utils/idHelpers';
import { FieldService } from '../../../src/services/db/FieldService';
import { MemberService } from '../../../src/services/db/MemberService';
import { FieldDefDTO, MemberDTO } from '../../../src/services/db/types';
import { useSyncTrigger } from '../../../src/hooks/useSyncTrigger';

export default function AddMemberScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId?: string }>();
  const nId = id || ''; const nMid = memberId || '';
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSyncTrigger();
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<FieldDefDTO[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const isEdit = !!nMid;

  useEffect(() => {
    (async () => {
      try {
        const f = await FieldService.getByGroup(nId); setFields(f);
        if (isEdit) { const m = await MemberService.getById(nMid); if (m) setValues(m.field_values); }
        else { const init: Record<string, string> = {}; f.forEach(fi => { init[fi.id] = ''; }); setValues(init); }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [nId, nMid, isEdit]);

  if (loading) return (
    <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>
  );

  if (!fields.length) return (
    <View style={styles.centered}>
      <Text style={styles.emptyTitle}>No Fields Defined</Text>
      <Text style={styles.emptySub}>Go back and add fields to this group first.</Text>
      <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
        <Text style={styles.btnText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );

  const uniqueField = fields.find(f => f.is_unique);

  const handleSave = async () => {
    if (uniqueField) {
      const val = values[uniqueField.id]?.trim();
      if (!val) { Alert.alert('Required', `"${uniqueField.name}" is required.`); return; }
      const existing = await MemberService.getByGroup(nId);
      if (existing.find((m: MemberDTO) => (!isEdit || m.id !== nMid) && m.field_values[uniqueField.id] === val)) {
        Alert.alert('Duplicate', `A member with ${uniqueField.name}="${val}" already exists.`); return;
      }
    }
    try {
      if (isEdit) await MemberService.update(nMid, values);
      else await MemberService.create({ id: generateId(), group_id: nId, field_values: values });
      triggerSync().catch(() => {}); router.back();
    } catch (e) { Alert.alert('Error', 'Failed to save member.'); }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}>
      <ScreenHeader title={isEdit ? 'Edit Member' : 'Add Member'} subtitle={isEdit ? 'Update member details' : 'Enroll a new member in the group'} />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 48) + 40 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          {fields.map((f, i) => {
            const label = f.is_unique ? `${f.name} *` : f.name;
            return (
              <View key={f.id} style={{ marginBottom: i < fields.length - 1 ? theme.spacing.xl : 0 }}>
                <Text style={styles.label}>{label}</Text>
                <TextInput
                  style={[styles.input, focused === f.id && styles.inputFocused]}
                  placeholder={`Enter ${f.name.toLowerCase()}`}
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={values[f.id] || ''}
                  onChangeText={(val) => setValues(p => ({ ...p, [f.id]: val }))}
                  onFocus={() => setFocused(f.id)}
                  onBlur={() => setFocused(null)}
                  autoFocus={i === 0 && !isEdit}
                  returnKeyType={i === fields.length - 1 ? 'done' : 'next'}
                />
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={styles.btn} onPress={handleSave} activeOpacity={0.85}>
          <Text style={styles.btnText}>{isEdit ? 'Update Member' : 'Add to Group'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.xl },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptySub: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 24, textAlign: 'center' },
  scroll: { padding: theme.spacing.lg },

  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius['3xl'],
    padding: theme.spacing.xl, marginBottom: theme.spacing.xl,
    ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt,
  },
  inputFocused: { borderColor: theme.colors.primary, borderWidth: 2, backgroundColor: theme.colors.surface },

  btn: { backgroundColor: theme.colors.primary, paddingVertical: 17, borderRadius: theme.borderRadius.lg, alignItems: 'center', ...theme.shadows.primary },
  btnText: { color: theme.colors.textInverse, fontSize: 17, fontWeight: '700' },
});
