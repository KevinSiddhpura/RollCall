import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  Modal, ActivityIndicator,
} from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pencil, Trash2, FileSpreadsheet, FileText } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import ExportModal from '../../../../src/components/ExportModal';
import { theme } from '../../../../src/theme';
import { useTheme } from '../../../../src/theme/ThemeContext';
import { pctColor } from '../../../../src/utils/colorHelpers';
import { MemberService } from '../../../../src/services/db/MemberService';
import { FieldService } from '../../../../src/services/db/FieldService';
import { SessionService } from '../../../../src/services/db/SessionService';
import { MemberDTO, FieldDefDTO } from '../../../../src/services/db/types';
import { getMemberDisplayName, getMemberUniqueValue } from '../../../../src/utils/memberHelpers';
import { subscribeToDB } from '../../../../src/services/db/database';
import { fetchGroupExportData, exportGroupCSV, exportGroupPDF } from '../../../../src/utils/exportHelpers';

const STATUS = {
  present: { color: theme.colors.present, bg: theme.colors.presentLight, l: 'P' },
  absent:  { color: theme.colors.absent,  bg: theme.colors.absentLight,  l: 'A' },
  late:    { color: theme.colors.late,    bg: theme.colors.lateLight,    l: 'L' },
  excused: { color: theme.colors.excused, bg: theme.colors.excusedLight, l: 'E' },
} as any;

export default function MemberDetailScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const nId = id || ''; const nMid = memberId || '';
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberDTO | null>(null);
  const [fields, setFields] = useState<FieldDefDTO[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [exportModal, setExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPrompt, setExportPrompt] = useState<{ def: string; cb: (n: string) => void } | null>(null);

  const fetch = useCallback(async () => {
    if (!nMid) return;
    try { const [m, f, l] = await Promise.all([MemberService.getById(nMid), FieldService.getByGroup(nId), SessionService.getRecordsByMember(nMid)]); setMember(m); setFields(f); setLogs(l); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [nId, nMid]);

  useEffect(() => { fetch(); return subscribeToDB(fetch); }, [fetch]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>;
  if (!member) return <View style={styles.centered}><Text style={{ color: theme.colors.textMuted }}>Member not found.</Text></View>;

  const total = logs.length;
  const present = logs.filter((l: any) => l.status === 'present' || l.status === 'late').length;
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const displayName = getMemberDisplayName(fields, member);
  const uniqueVal = getMemberUniqueValue(fields, member);
  const initials = displayName.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase();

  const handleDelete = () => Alert.alert('Delete Member', `Remove "${displayName}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await MemberService.delete(nMid); router.back(); } catch (e) { Alert.alert('Error'); } } }]);

  const doExport = async (type: 'csv' | 'pdf') => {
    try { setExporting(true); const d = await fetchGroupExportData(nId, null, null); d.members = d.members.filter((m: any) => m.id === nMid); d.records = d.records.filter((r: any) => r.member_id === nMid);
      setExportModal(false);
      setExportPrompt({ def: displayName, cb: async (name) => { if (type === 'csv') await exportGroupCSV(d, name); else await exportGroupPDF(d, name); setExporting(false); } }); }
    catch (e) { Alert.alert('Error', 'Export failed'); setExporting(false); }
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primaryDark]} style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft size={22} color="#fff" /></TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setExportModal(true)} style={styles.headerAction}><FileSpreadsheet size={18} color="#fff" /></TouchableOpacity>
            <TouchableOpacity onPress={() => router.push({ pathname: `/group/${nId}/add-member`, params: { memberId: nMid } } as any)} style={styles.headerAction}><Pencil size={18} color="#fff" /></TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.headerAction}><Trash2 size={18} color="#fff" /></TouchableOpacity>
          </View>
        </View>

        <View style={styles.profile}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.profileInfo}>
            <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.uniqueText} numberOfLines={1}>{uniqueVal}</Text>
          </View>
          <View style={[styles.pctBox, { backgroundColor: pctColor(pct, colors) + '18' }]}>
            <Text style={[styles.pctValue, { color: pctColor(pct, colors) }]}>{pct}%</Text>
            <Text style={styles.pctLabel}>Attendance</Text>
          </View>
        </View>
      </LinearGradient>

      <FlatList
        data={logs}
        keyExtractor={(l: any) => l.id}
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: 60 }}
        ListHeaderComponent={
          <View style={styles.fieldsCard}>
            <Text style={styles.sectionTitle}>Details</Text>
            {fields.map(f => (
              <View key={f.id} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{f.name}</Text>
                <Text style={styles.fieldValue}>{member.field_values[f.id] || '—'}</Text>
              </View>
            ))}
          </View>
        }
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyText}>No attendance records yet.</Text></View>}
        renderItem={({ item: l }: any) => {
          const s = STATUS[l.status] || STATUS.present;
          return (
            <View style={styles.logCard}>
              <View style={[styles.logBar, { backgroundColor: s.color }]} />
              <View style={styles.logInfo}>
                <Text style={styles.logDate}>{format(parseISO(l.date), 'EEE, MMM d, yyyy')}</Text>
                {l.reason ? <Text style={styles.logReason}>"{l.reason}"</Text> : null}
              </View>
              <View style={[styles.logBadge, { backgroundColor: s.bg }]}>
                <Text style={[styles.logBadgeText, { color: s.color }]}>{s.l}</Text>
              </View>
            </View>
          );
        }}
      />

      <ExportModal visible={!!exportPrompt} defaultName={exportPrompt?.def ?? ''} onExport={(n) => { exportPrompt?.cb(n); setExportPrompt(null); }} onClose={() => setExportPrompt(null)} />
      <Modal visible={exportModal} transparent animationType="slide">
        <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={() => setExportModal(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Export History</Text>
            <Text style={styles.modalSub}>{displayName}'s attendance records</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => doExport('csv')} disabled={exporting}>
              <FileSpreadsheet size={20} color={theme.colors.primary} /><Text style={styles.modalBtnText}>Export as CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtn} onPress={() => doExport('pdf')} disabled={exporting}>
              <FileText size={20} color={theme.colors.primary} /><Text style={styles.modalBtnText}>Export as PDF</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },

  header: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.lg },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  backBtn: { padding: 4 },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  headerAction: { padding: 4 },

  profile: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  profileInfo: { flex: 1 },
  nameText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  uniqueText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  pctBox: { alignItems: 'center', borderRadius: 14, padding: 10, minWidth: 80 },
  pctValue: { fontSize: 20, fontWeight: '800' },
  pctLabel: { fontSize: 9, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', marginTop: 1 },

  fieldsCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: theme.spacing.lg, marginBottom: theme.spacing.md, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  fieldLabel: { fontSize: 14, color: theme.colors.textMuted },
  fieldValue: { fontSize: 14, fontWeight: '600', color: theme.colors.text },

  empty: { alignItems: 'center', paddingVertical: 32 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted },

  logCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: 6, ...theme.shadows.sm, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  logBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  logInfo: { flex: 1, marginLeft: 8 },
  logDate: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  logReason: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  logBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  logBadgeText: { fontSize: 14, fontWeight: '800' },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  modalSub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 24 },
  modalBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  modalBtnText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
});
