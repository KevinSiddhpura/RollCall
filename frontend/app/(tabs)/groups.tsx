import {
  View, Text, StyleSheet, TouchableOpacity, Alert, TextInput,
  FlatList, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown, BounceIn, FadeIn } from 'react-native-reanimated';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Plus, Users, FolderOpen, Search, Trash2, X, ChevronRight, CalendarDays, GripVertical, Grid3X3 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../src/theme';
import { useTheme } from '../../src/theme/ThemeContext';
import SuccessToast from '../../src/components/SuccessToast';
import { GroupService } from '../../src/services/db/GroupService';
import { useRootGroups } from '../../src/hooks/useGroups';
import { GroupDTO } from '../../src/services/db/types';
import { useSyncTrigger } from '../../src/hooks/useSyncTrigger';
import { queryOne, subscribeToDB } from '../../src/services/db/database';
import { useAuth } from '../../src/auth/AuthContext';

const STATS = [
  { key: 'groups', icon: Grid3X3, label: 'Groups', color: 'rgba(255,255,255,0.7)' },
  { key: 'members', icon: Users, label: 'Members', color: 'rgba(255,255,255,0.7)' },
  { key: 'sessions', icon: CalendarDays, label: 'Sessions', color: 'rgba(255,255,255,0.7)' },
] as const;

export default function GroupsScreen() {
  const insets = useSafeAreaInsets();
  const { mode } = useAuth();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null);
  const [successLabel, setSuccessLabel] = useState<string | null>(null);
  const [totalStats, setTotalStats] = useState({ members: 0, sessions: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const { groups, loading } = useRootGroups();
  const { deleteGroupRemote, triggerSync } = useSyncTrigger();

  const fetchStats = useCallback(async () => {
    const mCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM members');
    const sCount = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sessions');
    setTotalStats({ members: mCount?.count || 0, sessions: sCount?.count || 0 });
  }, []);

  useEffect(() => { fetchStats(); return subscribeToDB(fetchStats); }, [fetchStats]);
  useFocusEffect(useCallback(() => { fetchStats(); }, [fetchStats]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
  }, [fetchStats]);

  const isSearching = search.trim().length > 0;
  const filteredGroups = isSearching
    ? groups.filter(g => g.name.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;

  const handleDelete = (g: GroupDTO) => {
    const gid = g.id;
    const groupName = g.name;
    const performDelete = async (cloud: boolean) => {
      setDeletingLabel(cloud ? 'Deleting from Cloud & Device…' : 'Deleting from Device…');
      try {
        if (cloud) await deleteGroupRemote(gid);
        await GroupService.delete(gid);
        setSuccessLabel(`${groupName} deleted ${cloud ? 'everywhere' : 'locally'}`);
        triggerSync().catch(() => {});
      } catch (e: any) { Alert.alert('Delete failed', e.message || 'Could not complete deletion.'); }
      finally { setDeletingLabel(null); }
    };
    if (mode === 'authenticated') {
      Alert.alert(`Delete "${groupName}"?`, 'Choose how you want to delete.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Device Only', style: 'default', onPress: () => performDelete(false) },
        { text: 'Cloud & Device', style: 'destructive', onPress: () => performDelete(true) },
      ]);
    } else {
      Alert.alert(`Delete "${groupName}"?`, 'All sub-groups, members, and records on this device will be deleted.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => performDelete(false) },
      ]);
    }
  };

  const handleDragEnd = ({ data }: { data: GroupDTO[] }) => {
    data.forEach((g, i) => { GroupService.updateOrder(g.id, i); });
    triggerSync().catch(() => {});
  };

  const renderCard = useCallback((item: GroupDTO) => {
    const isLeaf = item.node_type === 'leaf';
    const memberCount = item.memberCount || 0;
    const childCount = item.childCount || 0;
    const sessionCount = item.sessionCount || 0;
    return (
      <>
        <View style={[styles.cardIcon, { backgroundColor: isLeaf ? theme.colors.primarySurface : theme.colors.successLight }]}>
          {isLeaf ? <Users size={20} color={theme.colors.primary} strokeWidth={2} /> : <FolderOpen size={20} color={theme.colors.successDark} strokeWidth={2} />}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <View style={styles.cardMetaRow}>{isLeaf ? (
            <>
              <Users size={11} color={theme.colors.textMuted} /><Text style={styles.cardMeta}>{memberCount} members</Text>
              <View style={styles.metaDot} />
              <CalendarDays size={11} color={theme.colors.textMuted} /><Text style={styles.cardMeta}>{sessionCount} sessions</Text>
            </>
          ) : (
            <>
              <Grid3X3 size={11} color={theme.colors.textMuted} /><Text style={styles.cardMeta}>{childCount} groups</Text>
              <View style={styles.metaDot} />
              <Users size={11} color={theme.colors.textMuted} /><Text style={styles.cardMeta}>{memberCount} members</Text>
            </>
          )}</View>
        </View>
      </>
    );
  }, []);

  const renderDraggableItem = useCallback(({ item, drag, isActive }: RenderItemParams<GroupDTO>) => (
    <ScaleDecorator activeScale={0.97}>
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardDragging]}
        onPress={() => router.push(`/group/${item.id}`)}
        onLongPress={drag}
        activeOpacity={0.75}
        delayLongPress={200}
      >
        <View style={styles.cardRow}>
          <TouchableOpacity onLongPress={drag} style={styles.dragHandle} delayLongPress={0}>
            <GripVertical size={16} color={theme.colors.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          {renderCard(item)}
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
            <Trash2 size={16} color={theme.colors.danger} />
          </TouchableOpacity>
          <ChevronRight size={18} color={theme.colors.textMuted} />
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  ), [renderCard]);

  const renderSearchItem = useCallback(({ item, index }: { item: GroupDTO; index: number }) => (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(280).springify()}>
      <TouchableOpacity style={styles.card} onPress={() => router.push(`/group/${item.id}`)} activeOpacity={0.75}>
        <View style={styles.cardRow}>
          {renderCard(item)}
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}>
            <Trash2 size={16} color={theme.colors.danger} />
          </TouchableOpacity>
          <ChevronRight size={18} color={theme.colors.textMuted} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  ), [renderCard]);

  const dragHint = !isSearching && groups.length > 1 ? (
    <View style={styles.dragHint}>
      <GripVertical size={11} color="rgba(255,255,255,0.4)" />
      <Text style={styles.dragHintText}>Hold and drag to reorder</Text>
    </View>
  ) : null;

  const statValues = {
    groups: groups.length,
    members: totalStats.members,
    sessions: totalStats.sessions,
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primaryDark]} style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.headerTitle}>Groups</Text>

        <View style={styles.statsRow}>
          {STATS.map(({ key, icon: Icon, label }) => (
            <View key={key} style={styles.statPill}>
              <Icon size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.statValue}>{statValues[key]}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.searchBar}>
          <Search size={16} color={search ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)'} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search groups…"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClear} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={15} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          )}
        </View>

        {dragHint}
      </LinearGradient>

      {loading ? (
        <View style={styles.skeletonContainer}>
          {[1, 2, 3, 4, 5].map(i => (
            <Animated.View key={i} entering={FadeIn.delay(i * 60).withInitialValues({ opacity: 0.5 })} style={styles.skeletonCard}>
              <View style={styles.skelIcon} />
              <View style={styles.skelBody}>
                <View style={styles.skelLine1} />
                <View style={styles.skelLine2} />
              </View>
            </Animated.View>
          ))}
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={styles.emptyCard}>
            <View style={styles.emptyIcons}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.primarySurface }]}><FolderOpen size={26} color={theme.colors.primary} /></View>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.successLight }]}><Users size={22} color={theme.colors.successDark} /></View>
              <View style={[styles.emptyIcon, { backgroundColor: theme.colors.warningLight }]}><CalendarDays size={22} color={theme.colors.warningDark} /></View>
            </View>
            <Text style={styles.emptyTitle}>Welcome to RollCall</Text>
            <Text style={styles.emptyText}>Create a <Text style={styles.emptyBold}>Container</Text> to organize by department, or a <Text style={styles.emptyBold}>Leaf</Text> group to start tracking attendance.</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/group/new')} activeOpacity={0.85}>
              <Plus size={18} color="white" strokeWidth={2.5} /><Text style={styles.emptyBtnText}>Create First Group</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      ) : filteredGroups.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Search size={40} color={theme.colors.border} />
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptyText}>Try a different search term.</Text>
        </View>
      ) : isSearching ? (
        <FlatList
          data={filteredGroups}
          keyExtractor={item => item.id}
          renderItem={renderSearchItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
        />
      ) : (
        <DraggableFlatList
          data={groups}
          onDragEnd={handleDragEnd}
          keyExtractor={item => item.id}
          renderItem={renderDraggableItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          activationDistance={12}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          removeClippedSubviews
        />
      )}

      <Animated.View entering={BounceIn.delay(300).duration(450)} style={[styles.fab, { bottom: Math.max(insets.bottom, 16) + 12 }]}>
        <TouchableOpacity style={styles.fabTouch} onPress={() => router.push('/group/new')} activeOpacity={0.85}>
          <Plus size={26} color="white" strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={!!deletingLabel} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={styles.deletingBg}>
          <View style={styles.deletingCard}>
            <ActivityIndicator color={theme.colors.primary} size="small" />
            <Text style={styles.deletingTitle}>Deleting…</Text>
            <Text style={styles.deletingSub} numberOfLines={1}>{deletingLabel}</Text>
          </View>
        </View>
      </Modal>
      <SuccessToast visible={!!successLabel} message={successLabel ?? ''} onHide={() => setSuccessLabel(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md },
  headerTitle: { ...theme.typography.h1, color: theme.colors.textInverse, marginBottom: theme.spacing.sm },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: theme.spacing.md },
  statPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  statValue: { fontSize: 15, fontWeight: '800', color: theme.colors.textInverse, minWidth: 18 },
  statLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },

  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 14, height: 42 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.textInverse, paddingVertical: 0 },
  searchClear: { padding: 4 },
  dragHint: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', marginTop: 8 },
  dragHintText: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '500' },

  // List
  list: { padding: theme.spacing.md, paddingBottom: 110 },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: theme.spacing.sm, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  cardDragging: { ...theme.shadows.lg, opacity: 0.96, transform: [{ scale: 1.02 }] },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dragHandle: { paddingRight: 4, paddingVertical: 4, opacity: 0.35 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 2 },
  cardBody: { flex: 1 },
  cardName: { ...theme.typography.bodyMed, color: theme.colors.text },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardMeta: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '500' },
  metaDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: theme.colors.textMuted },
  deleteBtn: { padding: 6 },

  // Skeletons
  skeletonContainer: { padding: theme.spacing.md, paddingTop: 12 },
  skeletonCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: theme.spacing.sm, gap: 12 },
  skelIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: theme.colors.borderLight },
  skelBody: { flex: 1, gap: 6 },
  skelLine1: { height: 14, borderRadius: 7, backgroundColor: theme.colors.borderLight, width: '60%' },
  skelLine2: { height: 10, borderRadius: 5, backgroundColor: theme.colors.borderLight, width: '40%' },

  // Empty
  emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xl, marginTop: -30 },
  emptyCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius['3xl'], padding: theme.spacing.xl, alignItems: 'center', width: '100%', ...theme.shadows.md, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  emptyIcons: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: theme.spacing.xl },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginBottom: 6, textAlign: 'center' },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: theme.spacing.xl },
  emptyBold: { fontWeight: '700', color: theme.colors.primary },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: theme.borderRadius.lg, ...theme.shadows.primary },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.textInverse },

  // FAB
  fab: { position: 'absolute', right: 24, width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.primary, ...theme.shadows.primary },
  fabTouch: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Deleting modal
  deletingBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xl },
  deletingCard: { width: '100%', maxWidth: 320, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, paddingVertical: 28, paddingHorizontal: theme.spacing.xl, alignItems: 'center', gap: 8, ...theme.shadows.lg },
  deletingTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  deletingSub: { fontSize: 13, color: theme.colors.textMuted },
});
