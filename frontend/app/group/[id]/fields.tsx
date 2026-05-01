import {
  View, Text, StyleSheet, TouchableOpacity, Alert, TextInput,
  Modal, ActivityIndicator, KeyboardAvoidingView, Switch,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import Animated, { BounceIn } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Trash2, GripVertical, Check, Plus, Star, Eye, EyeOff, X } from 'lucide-react-native';
import ScreenHeader from '../../../src/components/ScreenHeader';
import { theme } from '../../../src/theme';
import { generateId } from '../../../src/utils/idHelpers';
import { FieldService } from '../../../src/services/db/FieldService';
import { GroupService } from '../../../src/services/db/GroupService';
import { FieldDefDTO, GroupDTO } from '../../../src/services/db/types';
import { useSyncTrigger } from '../../../src/hooks/useSyncTrigger';
import { subscribeToDB } from '../../../src/services/db/database';

export default function FieldsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const normalizedId = id || '';
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSyncTrigger();

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupDTO | null>(null);
  const [fields, setFields] = useState<FieldDefDTO[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Add modal
  const [addModal, setAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnique, setNewUnique] = useState(false);
  const [newDisplay, setNewDisplay] = useState(true);

  const fetch = useCallback(async () => {
    const g = await GroupService.getById(normalizedId); setGroup(g);
    const f = await FieldService.getByGroup(normalizedId); setFields(f);
    setLoading(false);
  }, [normalizedId]);

  useEffect(() => { fetch(); return subscribeToDB(fetch); }, [fetch]);

  const openAdd = () => { setNewName(''); setNewUnique(false); setNewDisplay(true); setAddModal(true); };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { Alert.alert('Required', 'Field name is required.'); return; }
    if (fields.some(f => f.name.toLowerCase() === name.toLowerCase())) { Alert.alert('Duplicate', 'Already exists.'); return; }
    try {
      await FieldService.create({ id: generateId(), group_id: normalizedId, name, is_unique: newUnique, is_display: newDisplay, display_order: fields.length });
      setAddModal(false); triggerSync().catch(() => {});
    } catch (e: any) { Alert.alert('Error', 'Failed to create field.'); }
  };

  const handleDelete = (field: FieldDefDTO) => Alert.alert(`Delete "${field.name}"?`, 'Existing member values will be lost.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await FieldService.delete(field.id); triggerSync().catch(() => {}); } catch (e: any) {} } }
  ]);

  const handleToggleUnique = async (f: FieldDefDTO) => { try { await FieldService.setUnique(normalizedId, f.id); triggerSync().catch(() => {}); } catch (e: any) {} };
  const handleToggleDisplay = async (f: FieldDefDTO) => { try { await FieldService.toggleDisplay(f.id, !f.is_display); triggerSync().catch(() => {}); } catch (e: any) {} };

  const handleDragEnd = async ({ data }: { data: FieldDefDTO[] }) => {
    setFields(data);
    try { for (let i = 0; i < data.length; i++) await FieldService.updateOrder(data[i].id, i); triggerSync().catch(() => {}); } catch (e: any) {}
  };

  const startEdit = (f: FieldDefDTO) => { setEditingId(f.id); setEditingName(f.name); };
  const saveEdit = async () => {
    if (editingId && editingName.trim()) { try { await FieldService.rename(editingId, editingName.trim()); setEditingId(null); triggerSync().catch(() => {}); } catch (e: any) {} }
  };

  const renderField = useCallback(({ item, drag, isActive }: RenderItemParams<FieldDefDTO>) => (
    <ScaleDecorator activeScale={0.97}>
      <View style={[styles.card, isActive && styles.cardDragging]}>
        <TouchableOpacity onLongPress={drag} style={styles.dragHandle}>
          <GripVertical size={15} color={theme.colors.textMuted} />
        </TouchableOpacity>

        {editingId === item.id ? (
          <View style={styles.editRow}>
            <TextInput style={styles.editInput} value={editingName} onChangeText={setEditingName} autoFocus onSubmitEditing={saveEdit} />
            <TouchableOpacity onPress={saveEdit}><Check size={18} color={theme.colors.primary} /></TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.fieldInfo} onPress={() => startEdit(item)}>
            <Text style={styles.fieldName}>{item.name}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={() => handleToggleUnique(item)} style={styles.iconBtn}>
          <Star size={15} color={item.is_unique ? theme.colors.primary : theme.colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleToggleDisplay(item)} style={styles.iconBtn}>
          {item.is_display ? <Eye size={15} color={theme.colors.successDark} /> : <EyeOff size={15} color={theme.colors.textMuted} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
          <Trash2 size={15} color={theme.colors.danger} />
        </TouchableOpacity>
      </View>
    </ScaleDecorator>
  ), [editingId, editingName]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>;

  return (
    <View style={styles.root}>
      <ScreenHeader title="Custom Fields" subtitle={group?.name ?? undefined} />

      <DraggableFlatList
        data={fields}
        keyExtractor={item => item.id}
        onDragEnd={handleDragEnd}
        renderItem={renderField}
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No Fields Yet</Text>
            <Text style={styles.emptyText}>Tap the + button to add your first field. Fields define what data you collect for each member.</Text>
          </View>
        }
        activationDistance={10}
      />

      <Animated.View entering={BounceIn.delay(300).duration(450)} style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 12 }]}>
        <TouchableOpacity style={styles.fabTouch} onPress={openAdd} activeOpacity={0.85}>
          <Plus size={26} color="white" strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>

      {/* Add Field Modal */}
      <Modal visible={addModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setAddModal(false)}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Field</Text>
                <TouchableOpacity onPress={() => setAddModal(false)}><X size={22} color={theme.colors.textMuted} /></TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Field Name</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. Name, Roll Number" placeholderTextColor={theme.colors.textPlaceholder} value={newName} onChangeText={setNewName} autoFocus returnKeyType="done" />

              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Star size={18} color={theme.colors.primary} /><Text style={styles.switchLabel}>Unique Identifier</Text>
                </View>
                <Switch value={newUnique} onValueChange={setNewUnique} trackColor={{ true: theme.colors.primary }} />
              </View>
              <Text style={styles.switchHint}>Prevents duplicate values for this field</Text>

              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Eye size={18} color={theme.colors.successDark} /><Text style={styles.switchLabel}>Show in Lists</Text>
                </View>
                <Switch value={newDisplay} onValueChange={setNewDisplay} trackColor={{ true: theme.colors.primary }} />
              </View>
              <Text style={styles.switchHint}>Display this field in member lists</Text>

              <TouchableOpacity style={styles.saveBtn} onPress={handleAdd} activeOpacity={0.85}>
                <Text style={styles.saveBtnText}>Create Field</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 12, marginBottom: 8, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  cardDragging: { ...theme.shadows.lg, opacity: 0.96 },
  dragHandle: { paddingRight: 8, opacity: 0.35 },
  fieldInfo: { flex: 1 },
  fieldName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  badges: { flexDirection: 'row', gap: 6, marginTop: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  iconBtn: { padding: 6 },
  editRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput: { flex: 1, fontSize: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.primary, paddingVertical: 4, color: theme.colors.text },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: theme.spacing.xl },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  fab: { position: 'absolute', right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary, ...theme.shadows.primary },
  fabTouch: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  modalInput: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.borderRadius.lg, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, marginBottom: 20 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  switchInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  switchHint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 16, marginLeft: 28 },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 17, borderRadius: theme.borderRadius.lg, alignItems: 'center', marginTop: 8, ...theme.shadows.primary },
  saveBtnText: { color: theme.colors.textInverse, fontSize: 17, fontWeight: '700' },
});
