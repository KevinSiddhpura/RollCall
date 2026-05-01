import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowLeft, Plus, Users, FolderOpen, ClipboardCheck,
  Pencil, Trash2, Settings2, FileDown, ChevronRight, CalendarDays, X, Check,
  FileSpreadsheet, FileText, GripVertical, Search,
} from 'lucide-react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../src/theme';
import { useTheme } from '../../src/theme/ThemeContext';
import { pctColor } from '../../src/utils/colorHelpers';
import SuccessToast from '../../src/components/SuccessToast';
import { useSyncTrigger } from '../../src/hooks/useSyncTrigger';
import { GroupService } from '../../src/services/db/GroupService';
import { MemberService } from '../../src/services/db/MemberService';
import { SessionService } from '../../src/services/db/SessionService';
import { useGroupDetail } from '../../src/hooks/useGroupDetail';
import { GroupDTO, MemberDTO, AttendanceSessionDTO } from '../../src/services/db/types';
import { getMemberDisplayName, getMemberUniqueValue } from '../../src/utils/memberHelpers';
import MemberCard from '../../src/components/MemberCard';
import CloudSyncButton from '../../src/components/CloudSyncButton';
import ExportModal from '../../src/components/ExportModal';
import { format, parseISO } from 'date-fns';
import { fetchGroupExportData, exportGroupCSV, exportGroupPDF } from '../../src/utils/exportHelpers';

type Tab = 'roster' | 'sessions';
function formatDate(d: string) { try { return format(parseISO(d), 'EEE, MMM d, yyyy'); } catch { return d; } }

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('roster');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [bulkExporting, setBulkExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportPrompt, setExportPrompt] = useState<{ def: string; cb: (n: string) => void } | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showSearch, setShowSearch] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null);
  const [successLabel, setSuccessLabel] = useState<string | null>(null);
  const isSelecting = selectedMemberIds.size > 0;

  const { triggerSync, syncStatus, deleteGroupRemote, deleteMemberRemote, deleteSessionRemote } = useSyncTrigger();
  const { group, breadcrumb, subGroups, fields, members, sessions, memberPcts, loading } = useGroupDetail(id || '');

  const toggleMemberSelect = (mid: string) => setSelectedMemberIds(p => { const n = new Set(p); n.has(mid) ? n.delete(mid) : n.add(mid); return n; });

  const handleSubGroupDragEnd = ({ data }: { data: GroupDTO[] }) => {
    data.forEach((g, i) => { GroupService.updateOrder(g.id, i); });
    triggerSync().catch(() => {});
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={theme.colors.primary} /></View>;
  if (!group) return <View style={styles.center}><Text style={{ color: theme.colors.textMuted }}>Group not found.</Text></View>;

  const isLeaf = group.node_type === 'leaf';
  const totalSessions = sessions.length;
  const avgPct = (() => {
    if (!members.length || !totalSessions) return 0;
    let presentTotal = 0; sessions.forEach(s => { presentTotal += (s.presentCount || 0); });
    return Math.round((presentTotal / (members.length * totalSessions)) * 100);
  })();

  const sortedMembers = (() => {
    const uniqueField = fields.find(f => f.is_unique);
    const arr = [...members];
    if (uniqueField) {
      const fid = uniqueField.id;
      arr.sort((a, b) => { const va = a.field_values[fid] ?? ''; const vb = b.field_values[fid] ?? ''; return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); });
    }
    return arr;
  })();

  const filteredMembers = rosterSearch.trim() === '' ? sortedMembers : sortedMembers.filter(m => {
    const s = rosterSearch.toLowerCase();
    return getMemberDisplayName(fields, m).toLowerCase().includes(s) || getMemberUniqueValue(fields, m).toLowerCase().includes(s);
  });

  const sortedSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));

  const handleBulkDelete = () => Alert.alert('Delete Selected?', `Remove ${selectedMemberIds.size} members?`, [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
      setDeletingLabel('Deleting…');
      try { for (const mid of selectedMemberIds) { await MemberService.delete(mid); await deleteMemberRemote(mid); } setSelectedMemberIds(new Set()); setSuccessLabel('Members deleted'); triggerSync().catch(() => {}); }
      catch (e) { Alert.alert('Delete failed'); } finally { setDeletingLabel(null); }
    }}]);

  const openEdit = () => { setEditName(group.name); setEditModalVisible(true); };
  const saveEdit = async () => { if (!editName.trim()) return Alert.alert('Required', 'Name is required.'); await GroupService.rename(group.id, editName.trim()); setEditModalVisible(false); triggerSync().catch(() => {}); };

  const deleteSubGroup = (g: GroupDTO) => Alert.alert(`Delete "${g.name}"?`, 'All nested data will be removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
    setDeletingLabel('Deleting…');
    try { await deleteGroupRemote(g.id); await GroupService.delete(g.id); setSuccessLabel(`${g.name} deleted`); triggerSync().catch(() => {}); }
    catch (e) { Alert.alert('Delete failed'); } finally { setDeletingLabel(null); }
  }}]);

  const deleteSession = (s: AttendanceSessionDTO) => Alert.alert('Delete Session?', 'This removes all attendance records for this date.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
    setDeletingLabel('Deleting…');
    try { await SessionService.delete(s.id); await deleteSessionRemote(s.id); setSuccessLabel('Session deleted'); triggerSync().catch(() => {}); }
    catch (e) { Alert.alert('Delete failed'); } finally { setDeletingLabel(null); }
  }}]);

  const deleteMember = (m: MemberDTO) => Alert.alert(`Delete ${getMemberDisplayName(fields, m)}?`, 'History will be lost.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => {
    setDeletingLabel('Deleting…');
    try { await MemberService.delete(m.id); await deleteMemberRemote(m.id); setSuccessLabel('Member deleted'); triggerSync().catch(() => {}); }
    catch (e) { Alert.alert('Delete failed'); } finally { setDeletingLabel(null); }
  }}]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primaryDark]} style={[styles.hero, { paddingTop: insets.top + 4 }]}>
        <View style={styles.heroRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.heroTitle}>
            <Text style={styles.heroName} numberOfLines={1}>{group.name}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bc}>
              <TouchableOpacity onPress={() => router.replace('/groups' as any)}><Text style={styles.bcText}>Groups</Text></TouchableOpacity>
              {breadcrumb.map((b, i) => <View key={b.id} style={styles.bcItem}><ChevronRight size={11} color="rgba(255,255,255,0.35)" /><Text style={[styles.bcText, i === breadcrumb.length - 1 && styles.bcActive]}>{b.name}</Text></View>)}
            </ScrollView>
          </View>
          <TouchableOpacity style={styles.heroBtn} onPress={openEdit}><Pencil size={15} color="#fff" /></TouchableOpacity>
          <CloudSyncButton status={syncStatus} onPress={triggerSync} />
        </View>

        {isLeaf && (
          <View style={styles.stats}>
            {[{ l: 'Members', v: members.length }, { l: 'Sessions', v: totalSessions }, { l: 'Avg. Attendance', v: totalSessions > 0 ? `${avgPct}%` : '–', c: totalSessions > 0 ? pctColor(avgPct, colors) : undefined }].map((s, i) => (
              <View key={i} style={styles.stat}><Text style={styles.statL}>{s.l}</Text><Text style={[styles.statV, s.c ? { color: s.c } : null]}>{s.v}</Text></View>
            ))}
          </View>
        )}
      </LinearGradient>

      {!isLeaf ? (
        <DraggableFlatList data={subGroups} keyExtractor={item => item.id} onDragEnd={handleSubGroupDragEnd}
          renderItem={({ item, drag, isActive }: RenderItemParams<GroupDTO>) => (
            <ScaleDecorator activeScale={0.97}>
              <TouchableOpacity style={[styles.card, isActive && styles.cardDragging]} onPress={() => router.push(`/group/${item.id}` as any)} onLongPress={drag} activeOpacity={0.7} delayLongPress={200}>
                <View style={styles.cardRow}>
                  <View style={styles.dragHandle}><GripVertical size={16} color={theme.colors.textMuted} /></View>
                  <View style={[styles.cardIcon, { backgroundColor: item.node_type === 'leaf' ? theme.colors.primarySurface : theme.colors.successLight }]}>
                    {item.node_type === 'leaf' ? <Users size={18} color={theme.colors.primary} /> : <FolderOpen size={18} color={theme.colors.successDark} />}
                  </View>
                  <View style={styles.cardBody}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.cardSub}>{item.node_type === 'leaf' ? `${item.memberCount || 0} members · ${item.sessionCount || 0} sessions` : `${item.childCount || 0} groups · ${item.memberCount || 0} members`}</Text>
                  </View>
                  <TouchableOpacity onPress={() => deleteSubGroup(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><Trash2 size={16} color={theme.colors.danger} /></TouchableOpacity>
                  <ChevronRight size={18} color={theme.colors.textMuted} />
                </View>
              </TouchableOpacity>
            </ScaleDecorator>
          )}
          contentContainerStyle={[styles.list, { paddingBottom: 160 }]}
          ListEmptyComponent={<View style={styles.empty}><FolderOpen size={48} color={theme.colors.border} /><Text style={styles.emptyTitle}>Empty Container</Text><Text style={styles.emptyText}>Add nested groups to organize your hierarchy.</Text></View>}
        />
      ) : (
        <>
          <View style={styles.tabBar}>
            {(['roster', 'sessions'] as Tab[]).map(t => (
              <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
                {t === 'roster' ? <Users size={16} color={tab === t ? theme.colors.primary : theme.colors.textMuted} /> : <CalendarDays size={16} color={tab === t ? theme.colors.primary : theme.colors.textMuted} />}
                <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === 'roster' ? 'Roster' : 'Sessions'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab === 'roster' ? (
            <View style={{ flex: 1 }}>
              <View style={styles.sortBar}>
                <Text style={styles.sortCount}>{filteredMembers.length} Members</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={styles.sortBtn} onPress={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}><Text style={styles.sortBtnText}>{sortDir === 'asc' ? 'A-Z' : 'Z-A'}</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.sortBtn, showSearch && { backgroundColor: theme.colors.primary }]} onPress={() => setShowSearch(!showSearch)}><Search size={13} color={showSearch ? '#fff' : theme.colors.primary} /></TouchableOpacity>
                </View>
              </View>
              {showSearch && (
                <View style={styles.searchBar}>
                  <Search size={14} color={theme.colors.textMuted} />
                  <TextInput style={styles.searchInput} placeholder="Search by name or ID…" value={rosterSearch} onChangeText={setRosterSearch} autoFocus />
                  {rosterSearch !== '' && <TouchableOpacity onPress={() => setRosterSearch('')}><X size={14} color={theme.colors.textMuted} /></TouchableOpacity>}
                </View>
              )}
              <FlatList data={filteredMembers} keyExtractor={item => item.id}
                contentContainerStyle={[styles.list, { paddingBottom: 160 }]}
                renderItem={({ item, index }) => (
                  <MemberCard member={item} fields={fields} index={index} pct={memberPcts.get(item.id) ?? null}
                    isSelecting={isSelecting} isSelected={selectedMemberIds.has(item.id)}
                    onLongPress={() => toggleMemberSelect(item.id)}
                    onPress={() => isSelecting ? toggleMemberSelect(item.id) : router.push(`/group/${id}/member/${item.id}` as any)}
                    onEdit={() => router.push({ pathname: `/group/${id}/add-member`, params: { memberId: item.id } } as any)}
                    onDelete={() => deleteMember(item)} />
                )}
                ListEmptyComponent={<View style={styles.empty}><Users size={48} color={theme.colors.border} /><Text style={styles.emptyTitle}>No Members</Text><Text style={styles.emptyText}>Add your first member or import from CSV.</Text></View>}
                removeClippedSubviews
              />
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <FlatList data={sortedSessions} keyExtractor={item => item.id}
                contentContainerStyle={[styles.list, { paddingBottom: 160 }]}
                renderItem={({ item }) => {
                  const pct = (item.totalCount && item.totalCount > 0) ? Math.round(((item.presentCount || 0) / item.totalCount) * 100) : 0;
                  return (
                    <View style={styles.sessionCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sessionDate}>{formatDate(item.date)}</Text>
                        {item.notes ? <Text style={styles.sessionNotes} numberOfLines={1}>{item.notes}</Text> : null}
                        <View style={styles.pills}>
                          {[{ k: 'P', c: (item.presentCount || 0) - (item.lateOnlyCount || 0), clr: theme.colors.present, bg: theme.colors.presentLight },
                            { k: 'A', c: item.absentCount || 0, clr: theme.colors.absent, bg: theme.colors.absentLight },
                            { k: 'L', c: item.lateOnlyCount || 0, clr: theme.colors.late, bg: theme.colors.lateLight }].map(p => p.c > 0 ? (
                            <View key={p.k} style={[styles.pill, { backgroundColor: p.bg }]}><Text style={[styles.pillText, { color: p.clr }]}>{p.k} {p.c}</Text></View>
                          ) : null)}
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 8 }}>
                        <Text style={[styles.pct, { color: pctColor(pct, colors) }]}>{pct}%</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push({ pathname: `/group/${id}/take-attendance`, params: { sessionId: item.id } } as any)}><Pencil size={13} color={theme.colors.primary} /></TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.colors.dangerLight }]} onPress={() => deleteSession(item)}><Trash2 size={13} color={theme.colors.danger} /></TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={<View style={styles.empty}><ClipboardCheck size={48} color={theme.colors.border} /><Text style={styles.emptyTitle}>No Sessions</Text><Text style={styles.emptyText}>Record your first attendance.</Text></View>}
                removeClippedSubviews
              />
            </View>
          )}
        </>
      )}

      {!isSelecting ? (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push(isLeaf ? `/group/${id}/take-attendance` : `/group/new?parentId=${id}` as any)}>
            {isLeaf ? <ClipboardCheck size={20} color="#fff" /> : <Plus size={20} color="#fff" />}
            <Text style={styles.primaryBtnText}>{isLeaf ? 'Take Attendance' : 'New Sub-Group'}</Text>
          </TouchableOpacity>
          {isLeaf && (
            <View style={styles.secondaryRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/group/${id}/add-member` as any)}><Plus size={16} color={theme.colors.primary} /><Text style={styles.secondaryBtnText}>Add Member</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/group/${id}/fields` as any)}><Settings2 size={16} color={theme.colors.primary} /><Text style={styles.secondaryBtnText}>Fields</Text></TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.push(`/group/${id}/import-csv` as any)}><FileDown size={16} color={theme.colors.primary} /><Text style={styles.secondaryBtnText}>Import</Text></TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.bulkCancel} onPress={() => setSelectedMemberIds(new Set())}><X size={16} color={theme.colors.textSecondary} /><Text style={{ fontWeight: '600', color: theme.colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: theme.colors.dangerLight }]} onPress={handleBulkDelete}><Trash2 size={16} color={theme.colors.danger} /><Text style={[styles.bulkBtnText, { color: theme.colors.danger }]}>Delete ({selectedMemberIds.size})</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: theme.colors.primarySurface }]} onPress={async () => { if (bulkExporting) return; const d = await fetchGroupExportData(group.id, null, null); const fd = { ...d, members: d.members.filter(m => selectedMemberIds.has(m.id)) }; setExportPrompt({ def: group.name, cb: async (n) => { setBulkExporting('csv'); try { await exportGroupCSV(fd, n); setSelectedMemberIds(new Set()); } catch (e: any) { Alert.alert('Export failed'); } finally { setBulkExporting(null); } } }); }}><FileSpreadsheet size={16} color={theme.colors.primary} /><Text style={[styles.bulkBtnText, { color: theme.colors.primary }]}>CSV</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: theme.colors.primarySurface }]} onPress={async () => { if (bulkExporting) return; const d = await fetchGroupExportData(group.id, null, null); const fd = { ...d, members: d.members.filter(m => selectedMemberIds.has(m.id)) }; setExportPrompt({ def: group.name, cb: async (n) => { setBulkExporting('pdf'); try { await exportGroupPDF(fd, n); setSelectedMemberIds(new Set()); } catch (e: any) { Alert.alert('Export failed'); } finally { setBulkExporting(null); } } }); }}><FileText size={16} color={theme.colors.primary} /><Text style={[styles.bulkBtnText, { color: theme.colors.primary }]}>PDF</Text></TouchableOpacity>
        </View>
      )}

      <Modal visible={editModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior="padding" style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setEditModalVisible(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Group Name</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholder="Group Name" autoFocus />
            <TouchableOpacity style={styles.modalSave} onPress={saveEdit}><Check size={18} color="#fff" /><Text style={{ fontWeight: '700', color: '#fff', fontSize: 16 }}>Save Changes</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 14, alignItems: 'center' }} onPress={() => setEditModalVisible(false)}><Text style={{ fontWeight: '600', color: theme.colors.textSecondary }}>Cancel</Text></TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal transparent visible={!!deletingLabel}><View style={styles.deletingBg}><View style={styles.deletingCard}><ActivityIndicator color={theme.colors.primary} /><Text style={{ fontWeight: '700', color: theme.colors.text }}>{deletingLabel}</Text></View></View></Modal>
      <ExportModal visible={!!exportPrompt} defaultName={exportPrompt?.def ?? ''} onExport={(n) => { exportPrompt?.cb(n); setExportPrompt(null); }} onClose={() => setExportPrompt(null)} />
      <SuccessToast visible={!!successLabel} message={successLabel ?? ''} onHide={() => setSuccessLabel(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 4 },
  heroTitle: { flex: 1 },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  bc: { flexDirection: 'row', marginTop: 3 },
  bcItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bcText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)' },
  bcActive: { color: '#fff' },
  heroBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: theme.borderRadius.lg, marginTop: theme.spacing.lg, padding: 12 },
  stat: { flex: 1, alignItems: 'center' },
  statL: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: 2 },
  statV: { fontSize: 16, fontWeight: '800', color: '#fff' },

  tabBar: { flexDirection: 'row', margin: theme.spacing.md, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: 4, ...theme.shadows.xs },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.borderRadius.md },
  tabActive: { backgroundColor: theme.colors.primarySurface },
  tabText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  tabTextActive: { color: theme.colors.primary },

  sortBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.md, paddingVertical: 8 },
  sortCount: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: theme.colors.primarySurface, borderRadius: theme.borderRadius.full },
  sortBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.md, paddingVertical: 8, backgroundColor: theme.colors.surfaceAlt },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 0 },

  list: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: 160 },

  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: 8, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  cardDragging: { ...theme.shadows.lg, opacity: 0.96 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dragHandle: { opacity: 0.35 },
  cardIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  cardSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: 8, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  sessionDate: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginBottom: 3 },
  sessionNotes: { fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic', marginBottom: 6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full },
  pillText: { fontSize: 11, fontWeight: '700' },
  pct: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  actionBtn: { width: 30, height: 30, borderRadius: 8, backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center' },

  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: 48, paddingBottom: 80 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, paddingTop: theme.spacing.md, paddingHorizontal: theme.spacing.md, borderTopWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...theme.shadows.lg },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg, paddingVertical: 14, marginBottom: 10, ...theme.shadows.primary },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryRow: { flexDirection: 'row', gap: 8 },
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.primarySurface, borderRadius: theme.borderRadius.md, paddingVertical: 11 },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },

  bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...theme.shadows.lg },
  bulkCancel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 10, borderRadius: theme.borderRadius.md },
  bulkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: theme.borderRadius.md, paddingVertical: 12 },
  bulkBtnText: { fontSize: 13, fontWeight: '700' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: theme.spacing.xl, paddingTop: 8, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  modalInput: { borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: theme.borderRadius.md, paddingHorizontal: 16, paddingVertical: 13, fontSize: 15, color: theme.colors.text, marginBottom: 16 },
  modalSave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg, paddingVertical: 14, marginBottom: 8, ...theme.shadows.primary },

  deletingBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  deletingCard: { backgroundColor: theme.colors.surface, padding: 28, borderRadius: theme.borderRadius.xl, alignItems: 'center', gap: 12, ...theme.shadows.lg },
});
