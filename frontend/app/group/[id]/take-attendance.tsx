import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Calendar, Check, Search, FileText, CheckCheck, XCircle } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { theme } from '../../../src/theme';
import { GroupService } from '../../../src/services/db/GroupService';
import { MemberService } from '../../../src/services/db/MemberService';
import { SessionService } from '../../../src/services/db/SessionService';
import { FieldService } from '../../../src/services/db/FieldService';
import { GroupDTO, MemberDTO, FieldDefDTO } from '../../../src/services/db/types';
import { getMemberDisplayName, getMemberUniqueValue } from '../../../src/utils/memberHelpers';
import { generateId } from '../../../src/utils/idHelpers';
import { format, parseISO } from 'date-fns';
import { useSyncTrigger } from '../../../src/hooks/useSyncTrigger';

type AttStatus = 'present' | 'absent' | 'late';
type FilterMode = 'all' | AttStatus;
const STATUS = [
  { key: 'present' as AttStatus, label: 'Present', short: 'P', color: theme.colors.present, bg: theme.colors.presentLight },
  { key: 'absent' as AttStatus,  label: 'Absent',  short: 'A', color: theme.colors.absent,  bg: theme.colors.absentLight  },
  { key: 'late' as AttStatus,    label: 'Late',    short: 'L', color: theme.colors.late,    bg: theme.colors.lateLight    },
];
const FILTER_CHIPS: { key: FilterMode; label: string; color: string; bg: string }[] = [
  { key: 'all',     label: 'All',     color: theme.colors.primary,      bg: theme.colors.primarySurface },
  { key: 'present', label: 'Present', color: theme.colors.present,      bg: theme.colors.presentLight },
  { key: 'absent',  label: 'Absent',  color: theme.colors.absent,       bg: theme.colors.absentLight },
  { key: 'late',    label: 'Late',    color: theme.colors.late,         bg: theme.colors.lateLight },
];

export default function TakeAttendanceScreen() {
  const { id, sessionId } = useLocalSearchParams<{ id: string; sessionId?: string }>();
  const normalizedId = id || '';
  const normalizedSessionId = sessionId || '';
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSyncTrigger();
  const isEditing = !!normalizedSessionId;

  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupDTO | null>(null);
  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [fields, setFields] = useState<FieldDefDTO[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttStatus>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [sessionNotes, setSessionNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  useEffect(() => {
    (async () => {
      try {
        const [g, m, f] = await Promise.all([GroupService.getById(normalizedId), MemberService.getByGroup(normalizedId), FieldService.getByGroup(normalizedId)]);
        setGroup(g); setFields(f);
        const uniqueField = f.find(fi => fi.is_unique);
        if (uniqueField) m.sort((a, b) => (a.field_values[uniqueField.id] || '').localeCompare(b.field_values[uniqueField.id] || ''));
        setMembers(m);

        if (isEditing) {
          const session = await SessionService.getById(normalizedSessionId);
          if (session) {
            const parsed = parseISO(session.date);
            if (!isNaN(parsed.getTime())) {
              if (session.time) { const [h, min, s] = session.time.split(':').map(Number); parsed.setHours(h || 0, min || 0, s || 0); }
              setDate(parsed);
            }
            setSessionNotes(session.notes || '');
            if (session.notes) setShowNotes(true);
            const records = await SessionService.getRecordsBySession(normalizedSessionId);
            const attMap: Record<string, AttStatus> = {};
            const reasonMap: Record<string, string> = {};
            m.forEach(member => { const rec = records.find(r => r.member_id === member.id); attMap[member.id] = (rec?.status as AttStatus) || 'present'; if (rec?.reason) reasonMap[member.id] = rec.reason; });
            setAttendance(attMap); setReasons(reasonMap);
          }
        } else {
          const map: Record<string, AttStatus> = {};
          m.forEach(member => { map[member.id] = 'present'; });
          setAttendance(map);
        }
      } catch (err) { Alert.alert('Error', 'Failed to load attendance data.'); }
      finally { setLoading(false); }
    })();
  }, [normalizedId, normalizedSessionId, isEditing]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const sd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const st = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
      const records = members.map(m => ({ id: generateId(), session_id: '', member_id: m.id, status: attendance[m.id] || 'present', reason: reasons[m.id] || '' }));
      if (isEditing) {
        await SessionService.updateWithRecords(normalizedSessionId, { date: sd, notes: sessionNotes }, records.map(r => ({ ...r, session_id: normalizedSessionId })));
      } else {
        const sid = generateId();
        await SessionService.createWithRecords({ id: sid, group_id: normalizedId, date: sd, time: st, notes: sessionNotes }, records.map(r => ({ ...r, session_id: sid })));
      }
      triggerSync().catch(() => {}); router.back();
    } catch (e) { Alert.alert('Error', 'Failed to save.'); }
    finally { setIsSaving(false); }
  };

  const setStatus = (mid: string, s: AttStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAttendance(p => ({ ...p, [mid]: s }));
    if (s === 'present') setReasons(p => { const n = { ...p }; delete n[mid]; return n; });
  };

  const markAll = (s: AttStatus) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAttendance(p => {
      const n = { ...p };
      filteredMembers.forEach(m => { n[m.id] = s; });
      return n;
    });
    if (s === 'present') setReasons({});
  };

  const filteredMembers = useMemo(() => members.filter(m => {
    const q = searchQuery.toLowerCase();
    const ms = !q || getMemberDisplayName(fields, m).toLowerCase().includes(q) || getMemberUniqueValue(fields, m).toLowerCase().includes(q);
    const mf = filterMode === 'all' || (attendance[m.id] || 'present') === filterMode;
    return ms && mf;
  }), [members, fields, searchQuery, filterMode, attendance]);

  const counts = useMemo(() => {
    let p = 0, a = 0, l = 0;
    Object.values(attendance).forEach(s => { if (s === 'present') p++; else if (s === 'absent') a++; else l++; });
    return { present: p, absent: a, late: l, total: members.length };
  }, [attendance, members]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primaryDark]} style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => {
            const hasChanges = Object.values(attendance).some(s => s !== 'present') || Object.keys(reasons).length > 0;
            if (hasChanges) Alert.alert('Discard Changes?', 'Unsaved changes will be lost.', [{ text: 'Keep Editing', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: () => router.back() }]);
            else router.back();
          }} style={styles.backBtn}><ArrowLeft size={22} color="#fff" /></TouchableOpacity>
          <View style={styles.headerTitle}>
            <Text style={styles.titleText}>{isEditing ? 'Edit Attendance' : 'Take Attendance'}</Text>
            <Text style={styles.titleSub}>{group?.name}</Text>
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
            {isSaving ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Check size={22} color={theme.colors.primary} strokeWidth={2.5} />}
          </TouchableOpacity>
        </View>

        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Calendar size={15} color="#fff" /><Text style={styles.dateText}>{format(date, 'EEE, MMM d, yyyy')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.notesChip, showNotes && styles.notesChipActive]} onPress={() => setShowNotes(!showNotes)}>
            <FileText size={13} color={showNotes ? theme.colors.primary : 'rgba(255,255,255,0.7)'} />
            <Text style={[styles.notesChipText, showNotes && { color: theme.colors.primary }]}>{showNotes ? 'Notes' : 'Add Notes'}</Text>
          </TouchableOpacity>
        </View>

        {showNotes && (
          <TextInput style={styles.notesInput} placeholder="Session notes…" placeholderTextColor="rgba(255,255,255,0.4)" value={sessionNotes} onChangeText={setSessionNotes} multiline />
        )}

        <View style={styles.countsRow}>
          {STATUS.map(s => (
            <View key={s.key} style={[styles.countPill, { backgroundColor: s.bg }]}>
              <Text style={[styles.countText, { color: s.color }]}>{s.short}: {counts[s.key]}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Search + Quick Actions */}
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Search size={15} color={theme.colors.textMuted} />
          <TextInput style={styles.searchInput} placeholder="Search members…" placeholderTextColor={theme.colors.textPlaceholder} value={searchQuery} onChangeText={setSearchQuery} />
          {searchQuery !== '' && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 15, color: theme.colors.textMuted, fontWeight: '600' }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => markAll('present')} activeOpacity={0.7}>
            <CheckCheck size={14} color={theme.colors.present} />
            <Text style={styles.quickBtnText}>All Present</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickBtn} onPress={() => markAll('absent')} activeOpacity={0.7}>
            <XCircle size={14} color={theme.colors.absent} />
            <Text style={styles.quickBtnText}>All Absent</Text>
          </TouchableOpacity>
        </View>

        {/* Filter chips */}
        <Animated.View entering={FadeIn.duration(200)} style={styles.filterRow}>
          {FILTER_CHIPS.map(chip => {
            const active = filterMode === chip.key;
            const chipCount = chip.key === 'all' ? counts.total : counts[chip.key];
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, active && { backgroundColor: chip.bg, borderColor: chip.color }]}
                onPress={() => setFilterMode(chip.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, active && { color: chip.color }]}>{chip.label}</Text>
                <View style={[styles.filterCount, active && { backgroundColor: chip.color + '22' }]}>
                  <Text style={[styles.filterCountText, active && { color: chip.color }]}>{chipCount}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </View>

      <FlatList
        data={filteredMembers}
        keyExtractor={m => m.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 40 }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>{members.length === 0 ? 'No members in this group.' : 'No members match.'}</Text></View>}
        renderItem={({ item: m, index }) => {
          const status = attendance[m.id] || 'present';
          const reason = reasons[m.id] || '';
          const statusDef = STATUS.find(s => s.key === status)!;
          return (
            <Animated.View entering={FadeInDown.delay(index * 30).duration(260).springify()}>
              <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: statusDef.color }]}>
                <View style={styles.cardTop}>
                  <View style={styles.cardIndex}><Text style={styles.cardIndexText}>{index + 1}</Text></View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>{getMemberDisplayName(fields, m)}</Text>
                    <Text style={styles.memberMeta} numberOfLines={1}>{getMemberUniqueValue(fields, m)}</Text>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  {STATUS.map(s => {
                    const active = status === s.key;
                    return (
                      <TouchableOpacity
                        key={s.key}
                        onPress={() => setStatus(m.id, s.key)}
                        style={[styles.statusBtn, active && { backgroundColor: s.color, borderColor: s.color }]}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.statusBtnLabel, active && { color: '#fff' }]}>{s.short}</Text>
                        <Text style={[styles.statusBtnText, active && { color: '#fff' }]}>{s.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {status !== 'present' && (
                  <TextInput
                    style={styles.reasonInput}
                    placeholder={`Reason for ${status === 'absent' ? 'absence' : 'lateness'}…`}
                    placeholderTextColor={theme.colors.textPlaceholder}
                    value={reason}
                    onChangeText={(val) => setReasons(p => ({ ...p, [m.id]: val }))}
                  />
                )}
              </View>
            </Animated.View>
          );
        }}
        removeClippedSubviews
      />

      {showDatePicker && <DateTimePicker value={date} mode="date" display="default" onChange={(_, d) => { setShowDatePicker(false); if (d) setDate(d); }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },

  header: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  backBtn: { padding: 2 },
  headerTitle: { flex: 1 },
  titleText: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  titleSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  saveBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  dateText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  notesChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  notesChipActive: { backgroundColor: '#fff' },
  notesChipText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  notesInput: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, fontSize: 14, color: '#fff', marginBottom: 10, maxHeight: 80 },
  countsRow: { flexDirection: 'row', gap: 8 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  countText: { fontSize: 12, fontWeight: '700' },

  // Toolbar (search + quick actions + filters)
  toolbar: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 14, paddingVertical: 10,
    ...theme.shadows.xs, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 0 },

  // Quick actions
  quickActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quickBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: theme.borderRadius.md,
    borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  quickBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },

  // Filter chips
  filterRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  filterChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 8, borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  filterChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  filterCount: {
    minWidth: 20, height: 18, borderRadius: 9,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountText: { fontSize: 10, fontWeight: '800', color: theme.colors.textMuted },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },

  // Member card
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 14, paddingLeft: 12,
    marginHorizontal: theme.spacing.md,
    marginBottom: 8,
    ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardIndex: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIndexText: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  cardInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  memberMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },

  // Status buttons
  statusRow: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    height: 36, borderRadius: 10,
    borderWidth: 1.5, borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceAlt,
  },
  statusBtnLabel: { fontSize: 13, fontWeight: '800', color: theme.colors.textMuted },
  statusBtnText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, display: 'none' },

  // Reason input
  reasonInput: {
    marginTop: 10, backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, color: theme.colors.text,
    borderWidth: 1, borderColor: theme.colors.border,
  },
});
