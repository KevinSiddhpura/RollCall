import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, ScrollView, FlatList,
} from 'react-native';
import { useSQLiteContext } from '../../src/db/sqlite';
import { useState, useCallback, useMemo } from 'react';
import { useFocusEffect, router } from 'expo-router';
import {
  Plus, Users, GraduationCap, Search, Trash2, X, Check,
  CheckSquare, BookOpen,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';

type ClassItem = {
  id: number; name: string; division: string; subject: string;
  student_count: number; session_count: number; avg_present: number | null;
};

export default function ClassesScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const isSelecting = selectedIds.size > 0;

  const loadClasses = useCallback(async () => {
    const result = await db.getAllAsync<ClassItem>(`
      SELECT c.*,
        (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) as student_count,
        (SELECT COUNT(*) FROM attendance_sessions s WHERE s.class_id = c.id) as session_count,
        (
          SELECT ROUND(CAST(SUM(CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*),0) * 100)
          FROM attendance_records ar
          JOIN attendance_sessions a_s ON ar.session_id = a_s.id
          WHERE a_s.class_id = c.id
        ) as avg_present
      FROM classes c ORDER BY c.created_at DESC
    `);
    setClasses(result);
  }, [db]);

  useFocusEffect(useCallback(() => { loadClasses(); }, [loadClasses]));

  const subjects = useMemo(() => {
    const s = new Set<string>();
    classes.forEach(c => { if (c.subject) s.add(c.subject); });
    return Array.from(s);
  }, [classes]);

  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase())
        || c.division.toLowerCase().includes(searchQuery.toLowerCase())
        || (c.subject || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchSubject = !filterSubject || c.subject === filterSubject;
      return matchSearch && matchSubject;
    });
  }, [classes, searchQuery, filterSubject]);

  const handleLongPress = (id: number) => {
    setSelectedIds(prev => new Set([...prev, id]));
  };

  const handlePress = (item: ClassItem) => {
    if (isSelecting) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      router.push(`/class/${item.id}`);
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    Alert.alert(
      `Delete ${selectedIds.size} Class${selectedIds.size > 1 ? 'es' : ''}`,
      'This will delete all associated students and attendance records. Cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive',
          onPress: async () => {
            const ids = Array.from(selectedIds);
            await Promise.all(ids.map(id => db.runAsync('DELETE FROM classes WHERE id = ?', [id])));
            clearSelection();
            loadClasses();
          },
        },
      ]
    );
  };

  const handleDeleteSingle = (id: number, name: string) => {
    Alert.alert(
      'Delete Class',
      `Delete "${name}"? This removes all students and attendance records.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            await db.runAsync('DELETE FROM classes WHERE id = ?', [id]);
            loadClasses();
          },
        },
      ]
    );
  };

  const getBarColor = (pct: number | null) => {
    if (!pct) return theme.colors.border;
    if (pct >= 75) return theme.colors.present;
    if (pct >= 50) return theme.colors.late;
    return theme.colors.absent;
  };

  const renderItem = ({ item, index }: { item: ClassItem; index: number }) => {
    const isSelected = selectedIds.has(item.id);
    const pct = item.avg_present ?? 0;
    const barColor = getBarColor(item.avg_present);

    return (
      <TouchableOpacity
        style={[styles.classCard, isSelected && styles.classCardSelected]}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item.id)}
        activeOpacity={0.75}
        delayLongPress={300}
      >
        <View style={styles.cardTopRow}>
          {/* Index number */}
          <View style={styles.indexBox}>
            <Text style={styles.indexText}>{index + 1}</Text>
          </View>

          {/* Left: icon or checkbox */}
          <View style={[styles.cardIconBox, isSelected && { backgroundColor: theme.colors.primary }]}>
            {isSelected
              ? <Check size={20} color="#fff" strokeWidth={3} />
              : <GraduationCap size={20} color={theme.colors.primary} strokeWidth={2} />
            }
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.badgeRow}>
              <View style={styles.divBadge}>
                <Text style={styles.divBadgeText}>Div {item.division}</Text>
              </View>
              {item.subject ? (
                <Text style={styles.subjectText} numberOfLines={1}>{item.subject}</Text>
              ) : null}
            </View>
          </View>

          {/* Right: delete (only when not selecting) */}
          {!isSelecting && (
            <TouchableOpacity
              onPress={() => handleDeleteSingle(item.id, item.name)}
              style={styles.deleteBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={16} color={theme.colors.danger} />
            </TouchableOpacity>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.cardStatsRow}>
          <View style={styles.cardStat}>
            <Users size={13} color={theme.colors.textMuted} />
            <Text style={styles.cardStatText}>{item.student_count} students</Text>
          </View>
          <View style={styles.cardStat}>
            <BookOpen size={13} color={theme.colors.textMuted} />
            <Text style={styles.cardStatText}>{item.session_count} sessions</Text>
          </View>
          <Text style={[styles.cardPct, { color: barColor }]}>
            {item.avg_present != null ? `${pct}% present` : 'No data'}
          </Text>
        </View>

        {/* Attendance bar */}
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {isSelecting && (
          <View style={styles.headerTop}>
            <Text style={styles.headerSubtitle}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={clearSelection} style={styles.cancelSelectBtn}>
              <X size={18} color={theme.colors.textInverse} strokeWidth={2.5} />
              <Text style={styles.cancelSelectText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Class count */}
        {!isSelecting && (
          <Text style={styles.classCount}>
            {classes.length} {classes.length === 1 ? 'class' : 'classes'} total
          </Text>
        )}

        {/* Search */}
        <View style={styles.searchBar}>
          <Search size={16} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, division or subject..."
            placeholderTextColor={theme.colors.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Subject filter chips */}
        {subjects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <TouchableOpacity
              style={[styles.filterChip, !filterSubject && styles.filterChipActive]}
              onPress={() => setFilterSubject(null)}
            >
              <Text style={[styles.filterChipText, !filterSubject && styles.filterChipTextActive]}>All</Text>
            </TouchableOpacity>
            {subjects.map(sub => (
              <TouchableOpacity
                key={sub}
                style={[styles.filterChip, filterSubject === sub && styles.filterChipActive]}
                onPress={() => setFilterSubject(prev => prev === sub ? null : sub)}
              >
                <Text style={[styles.filterChipText, filterSubject === sub && styles.filterChipTextActive]}>
                  {sub}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* List */}
      {filteredClasses.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <GraduationCap size={40} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>
            {classes.length === 0 ? 'No classes yet' : 'No matches found'}
          </Text>
          <Text style={styles.emptyText}>
            {classes.length === 0
              ? 'Tap the + button to create your first class.'
              : 'Try a different search or filter.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredClasses}
          keyExtractor={item => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bulk delete bar */}
      {isSelecting && (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
          <TouchableOpacity style={styles.bulkSelectAll} onPress={() => {
            if (selectedIds.size === filteredClasses.length) clearSelection();
            else setSelectedIds(new Set(filteredClasses.map(c => c.id)));
          }}>
            <CheckSquare size={18} color={theme.colors.primary} />
            <Text style={styles.bulkSelectAllText}>
              {selectedIds.size === filteredClasses.length ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.bulkDeleteBtn} onPress={handleBulkDelete}>
            <Trash2 size={18} color={theme.colors.textInverse} />
            <Text style={styles.bulkDeleteText}>Delete ({selectedIds.size})</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* FAB */}
      {!isSelecting && (
        <TouchableOpacity
          style={[styles.fab, { bottom: Math.max(insets.bottom, theme.spacing.md) + theme.spacing.sm }]}
          onPress={() => router.push('/class/new')}
          activeOpacity={0.85}
        >
          <Plus size={26} color={theme.colors.textInverse} strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  header: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
  },
  headerTop: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: theme.spacing.sm,
  },
  headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  classCount: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '500', marginBottom: theme.spacing.sm },

  cancelSelectBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.full,
  },
  cancelSelectText: { fontSize: 14, fontWeight: '600', color: theme.colors.textInverse },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md, height: 42, marginBottom: theme.spacing.xs,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.textInverse },

  filterRow: { flexDirection: 'row', paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xs },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: theme.borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)', marginRight: theme.spacing.sm,
  },
  filterChipActive: { backgroundColor: theme.colors.surface },
  filterChipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  filterChipTextActive: { color: theme.colors.primary },

  listContent: { padding: theme.spacing.xl, paddingBottom: 100 },

  classCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md, marginBottom: theme.spacing.md, ...theme.shadows.sm,
    borderWidth: 2, borderColor: 'transparent',
  },
  classCardSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm },
  indexBox: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center', alignItems: 'center',
    marginRight: theme.spacing.sm,
  },
  indexText: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  cardIconBox: {
    width: 40, height: 40, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md,
  },
  cardContent: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: theme.colors.text, letterSpacing: -0.3, marginBottom: 4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  divBadge: {
    backgroundColor: theme.colors.primaryLight, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: theme.borderRadius.xs,
  },
  divBadgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.primaryDark },
  subjectText: { fontSize: 13, color: theme.colors.textSecondary, fontWeight: '500', flexShrink: 1 },
  deleteBtn: { padding: theme.spacing.xs },

  cardStatsRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  cardStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardStatText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  cardPct: { marginLeft: 'auto' as any, fontSize: 12, fontWeight: '700' },

  progressBg: { height: 4, backgroundColor: theme.colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.xxl, marginTop: -60,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: theme.colors.surface, borderTopWidth: 1,
    borderTopColor: theme.colors.border, paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl, flexDirection: 'row',
    alignItems: 'center', gap: theme.spacing.md, ...theme.shadows.lg,
  },
  bulkSelectAll: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: theme.borderRadius.md,
    paddingVertical: 12, paddingHorizontal: theme.spacing.md, justifyContent: 'center',
  },
  bulkSelectAllText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  bulkDeleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.danger, borderRadius: theme.borderRadius.md,
    paddingVertical: 12, paddingHorizontal: theme.spacing.md, justifyContent: 'center',
    ...theme.shadows.sm,
  },
  bulkDeleteText: { fontSize: 14, fontWeight: '700', color: theme.colors.textInverse },

  fab: {
    position: 'absolute', right: theme.spacing.xl,
    backgroundColor: theme.colors.primary, width: 60, height: 60,
    borderRadius: 30, justifyContent: 'center', alignItems: 'center',
    ...theme.shadows.primary,
  },
});
