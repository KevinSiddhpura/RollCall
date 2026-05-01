import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { FolderOpen, Users } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '../../src/theme';
import { generateId } from '../../src/utils/idHelpers';
import ScreenHeader from '../../src/components/ScreenHeader';
import { GroupService } from '../../src/services/db/GroupService';
import { useSyncTrigger } from '../../src/hooks/useSyncTrigger';

export default function NewGroupScreen() {
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSyncTrigger();
  const { parentId } = useLocalSearchParams<{ parentId?: string }>();
  const normalizedParentId = Array.isArray(parentId) ? parentId[0] : parentId;

  const [name, setName] = useState('');
  const [nodeType, setNodeType] = useState<'container' | 'leaf'>('container');
  const [forcedNodeType, setForcedNodeType] = useState<'container' | 'leaf' | null>(null);
  const [maxOrder, setMaxOrder] = useState(-1);
  const [focused, setFocused] = useState(false);
  const title = parentId ? 'New Sub-Group' : 'New Group';

  useEffect(() => {
    (async () => {
      try {
        const siblings = await GroupService.getChildren(normalizedParentId ?? '');
        if (siblings.length > 0) {
          setForcedNodeType(siblings[0].node_type);
          setNodeType(siblings[0].node_type);
          setMaxOrder(Math.max(...siblings.map(g => g.display_order ?? 0)));
        }
      } catch (err) { console.error('group/new fetch error:', err); }
    })();
  }, [normalizedParentId]);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Required', 'Group name is required.'); return; }
    try {
      await GroupService.create({ id: generateId(), name: name.trim(), parent_id: normalizedParentId ?? '', node_type: nodeType, display_order: maxOrder + 1 });
      triggerSync().catch(() => {});
      router.back();
    } catch (e) { Alert.alert('Error', 'Failed to create group.'); }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}>
      <ScreenHeader title={title} subtitle="Set up a group for attendance" />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 32) }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* Name Input */}
        <Animated.View entering={FadeInDown.delay(60).duration(350)} style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Group Name</Text>
          <TextInput
            style={[styles.input, focused && styles.inputFocused]}
            placeholder="e.g. Class 12 Sci A"
            placeholderTextColor={theme.colors.textPlaceholder}
            value={name} onChangeText={setName}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            autoFocus
            returnKeyType="done"
          />
        </Animated.View>

        {/* Type Selector */}
        <Animated.View entering={FadeInDown.delay(140).duration(350)} style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Group Type</Text>
          {forcedNodeType && (
            <Animated.View entering={FadeIn} style={styles.forcedHint}>
              <Text style={styles.forcedHintText}>Type locked — siblings must match.</Text>
            </Animated.View>
          )}

          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[styles.segment, nodeType === 'container' && styles.segmentActive]}
              onPress={() => { if (!forcedNodeType || forcedNodeType !== 'leaf') setNodeType('container'); }}
              disabled={forcedNodeType === 'leaf'}
              activeOpacity={0.7}
            >
              <View style={[styles.segmentIcon, nodeType === 'container' && styles.segmentIconActive]}>
                <FolderOpen size={20} color={nodeType === 'container' ? '#fff' : theme.colors.primary} strokeWidth={2} />
              </View>
              <Text style={[styles.segmentText, nodeType === 'container' && styles.segmentTextActive]}>Container</Text>
              <Text style={styles.segmentDesc}>Contains sub-groups</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segment, nodeType === 'leaf' && styles.segmentActive]}
              onPress={() => { if (!forcedNodeType || forcedNodeType !== 'container') setNodeType('leaf'); }}
              disabled={forcedNodeType === 'container'}
              activeOpacity={0.7}
            >
              <View style={[styles.segmentIcon, nodeType === 'leaf' && styles.segmentIconActive]}>
                <Users size={20} color={nodeType === 'leaf' ? '#fff' : theme.colors.primary} strokeWidth={2} />
              </View>
              <Text style={[styles.segmentText, nodeType === 'leaf' && styles.segmentTextActive]}>Leaf</Text>
              <Text style={styles.segmentDesc}>Contains members</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Save */}
        <Animated.View entering={FadeInDown.delay(220).duration(350)}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <Text style={styles.saveBtnText}>Create Group</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  scroll: { padding: theme.spacing.xl },

  fieldGroup: { marginBottom: theme.spacing.xl },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 12, letterSpacing: -0.2 },

  input: {
    borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg, paddingHorizontal: 18, paddingVertical: 15,
    fontSize: 16, color: theme.colors.text, backgroundColor: theme.colors.surface,
  },
  inputFocused: { borderColor: theme.colors.primary, borderWidth: 2 },

  forcedHint: {
    backgroundColor: theme.colors.primarySurface,
    borderRadius: theme.borderRadius.md, padding: 10, paddingHorizontal: 14, marginBottom: 12,
  },
  forcedHintText: { fontSize: 12, color: theme.colors.primary, fontWeight: '600' },

  segmentedRow: { flexDirection: 'row', gap: 10 },
  segment: {
    flex: 1, alignItems: 'center', paddingVertical: 20,
    borderRadius: theme.borderRadius.xl, borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  segmentActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },
  segmentIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primarySurface, marginBottom: 8,
  },
  segmentIconActive: { backgroundColor: theme.colors.primary },
  segmentText: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 2 },
  segmentTextActive: { color: theme.colors.primary },
  segmentDesc: { fontSize: 11, color: theme.colors.textMuted },

  saveBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 17, borderRadius: theme.borderRadius.lg,
    alignItems: 'center', marginTop: 8,
    ...theme.shadows.primary,
  },
  saveBtnText: { color: theme.colors.textInverse, fontSize: 17, fontWeight: '700' },
});
