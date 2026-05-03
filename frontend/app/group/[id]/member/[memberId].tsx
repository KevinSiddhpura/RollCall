import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  Modal, ActivityIndicator, TextInput,
} from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Pencil, Trash2, FileSpreadsheet, FileText, Calendar, TrendingUp, TrendingDown, Minus, CircleCheck, CircleX, Clock, ShieldAlert } from 'lucide-react-native';
import { format, parseISO } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import ExportModal from '../../../../src/components/ExportModal';
import { theme } from '../../../../src/theme';
import { useTheme } from '../../../../src/theme/ThemeContext';
import { pctColor } from '../../../../src/utils/colorHelpers';
import { MemberService } from '../../../../src/services/db/MemberService';
import { FieldService } from '../../../../src/services/db/FieldService';
import { SessionService } from '../../../../src/services/db/SessionService';
import { MemberDTO, FieldDefDTO } from '../../../../src/services/db/types';
import { getMemberDisplayName, getMemberUniqueValue } from '../../../../src/utils/memberHelpers';
import { subscribeToDB, execute } from '../../../../src/services/db/database';
import { fetchGroupExportData, exportGroupCSV, exportGroupPDF } from '../../../../src/utils/exportHelpers';

// ── Status config ──
interface StatusConfig { color: string; bg: string; surface: string; label: string; Icon: any }
const STATUS_MAP: Record<string, StatusConfig> = {
  present: { color: theme.colors.present, bg: theme.colors.presentLight, surface: theme.colors.presentSurface, label: 'Present', Icon: CircleCheck },
  absent: { color: theme.colors.absent, bg: theme.colors.absentLight, surface: theme.colors.absentSurface, label: 'Absent', Icon: CircleX },
  late: { color: theme.colors.late, bg: theme.colors.lateLight, surface: theme.colors.lateSurface, label: 'Late', Icon: Clock },
  excused: { color: theme.colors.excused, bg: theme.colors.excusedLight, surface: theme.colors.excusedSurface, label: 'Excused', Icon: ShieldAlert },
};

// ── Header badge ──
function HeaderBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
      <Text style={[styles.badgeValue, { color }]}>{value}</Text>
      <Text style={styles.badgeLabel}>{label}</Text>
    </View>
  );
}

// ── Log item ──
function LogItem({ item, index, onPress }: { item: any; index: number; onPress: () => void }) {
  const s = STATUS_MAP[item.status] || STATUS_MAP.present;
  const Icon = s.Icon;
  return (
    <Animated.View entering={FadeInDown.delay(index * 40 + 100).springify().duration(350)}>
      <TouchableOpacity style={styles.logCard} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.logIconBox, { backgroundColor: s.surface }]}>
          <Icon size={18} color={s.color} strokeWidth={2} />
        </View>
        <View style={styles.logBody}>
          <Text style={styles.logDate}>{format(parseISO(item.date), 'EEEE, MMM d, yyyy')}</Text>
          {item.reason ? <Text style={styles.logReason}>"{item.reason}"</Text> : null}
        </View>
        <View style={[styles.logPill, { backgroundColor: s.bg }]}>
          <Text style={[styles.logPillText, { color: s.color }]}>{s.label}</Text>
        </View>
        <Pencil size={14} color={theme.colors.textMuted} strokeWidth={2} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── Main ──

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
  const [editingLog, setEditingLog] = useState<any>(null);
  const [editReason, setEditReason] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetch = useCallback(async () => {
    if (!nMid) return;
    try {
      const [m, f, l] = await Promise.all([
        MemberService.getById(nMid),
        FieldService.getByGroup(nId),
        SessionService.getRecordsByMember(nMid),
      ]);
      setMember(m); setFields(f); setLogs(l);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [nId, nMid]);

  useEffect(() => { fetch(); return subscribeToDB(fetch); }, [fetch]);

  // ── Computed ──
  const stats = useMemo(() => {
    const total = logs.length;
    const presentCount = logs.filter((l: any) => l.status === 'present').length;
    const absentCount = logs.filter((l: any) => l.status === 'absent').length;
    const lateCount = logs.filter((l: any) => l.status === 'late').length;
    const excusedCount = logs.filter((l: any) => l.status === 'excused').length;
    const attended = presentCount + lateCount;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    const trend = logs.length >= 2
      ? (() => {
        const mid = Math.floor(logs.length / 2);
        const first = logs.slice(0, mid).filter((l: any) => l.status === 'present' || l.status === 'late').length;
        const second = logs.slice(mid).filter((l: any) => l.status === 'present' || l.status === 'late').length;
        const fPct = mid > 0 ? first / mid : 0;
        const sPct = (logs.length - mid) > 0 ? second / (logs.length - mid) : 0;
        return sPct - fPct;
      })()
      : 0;
    return { total, presentCount, absentCount, lateCount, excusedCount, attended, pct, trend };
  }, [logs]);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} size="large" /></View>;
  if (!member) return <View style={styles.centered}><Calendar size={40} color={theme.colors.textMuted} /><Text style={{ color: theme.colors.textMuted, marginTop: 12 }}>Member not found.</Text></View>;

  const displayName = getMemberDisplayName(fields, member);
  const uniqueVal = getMemberUniqueValue(fields, member);
  const initials = displayName.split(' ').map((w: string) => w[0] || '').slice(0, 2).join('').toUpperCase();
  const accentColor = pctColor(stats.pct, colors);

  const handleDelete = () => Alert.alert(
    'Delete Member',
    `Permanently remove "${displayName}" and all their attendance records?`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await MemberService.delete(nMid); router.back(); }
          catch { Alert.alert('Error', 'Could not delete member.'); }
        }
      },
    ],
  );

  const doExport = async (type: 'csv' | 'pdf') => {
    try {
      setExporting(true);
      const d = await fetchGroupExportData(nId, null, null);
      d.members = d.members.filter((m: any) => m.id === nMid);
      d.records = d.records.filter((r: any) => r.member_id === nMid);
      setExportModal(false);
      setExportPrompt({
        def: displayName,
        cb: async (name) => {
          if (type === 'csv') await exportGroupCSV(d, name);
          else await exportGroupPDF(d, name);
          setExporting(false);
        },
      });
    } catch { Alert.alert('Error', 'Export failed'); setExporting(false); }
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    setSavingEdit(true);
    try {
      await execute(
        'UPDATE records SET status = ?, reason = ? WHERE id = ?',
        [editingLog.status, editReason.trim(), editingLog.id]
      );
      setEditingLog(null);
      setEditReason('');
      fetch();
    } catch { Alert.alert('Error', 'Could not update record.'); }
    finally { setSavingEdit(false); }
  };

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <LinearGradient colors={[colors.primaryDeep, colors.primaryDark, colors.primary]} style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Animated.View entering={FadeInDown.duration(300)} style={styles.navRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <ArrowLeft size={22} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.navActions}>
            <TouchableOpacity onPress={() => setExportModal(true)} style={styles.navBtn}>
              <FileSpreadsheet size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push({ pathname: `/group/${nId}/add-member`, params: { memberId: nMid } } as any)} style={styles.navBtn}>
              <Pencil size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.navBtn}>
              <Trash2 size={18} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(100).springify().duration(400)} style={styles.profileSection}>
          <View style={styles.avatar}>
            <LinearGradient colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.1)']} style={StyleSheet.absoluteFill} />
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.uniqueText} numberOfLines={1}>{uniqueVal}</Text>
          </View>
          <View style={[styles.rateRing, { borderColor: accentColor }]}>
            <Text style={[styles.rateValue, { color: accentColor }]}>{stats.pct}%</Text>
            <Text style={styles.rateSub}>rate</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).springify().duration(400)} style={styles.badgesRow}>
          <HeaderBadge label="Total" value={stats.total} color="#fff" />
          <HeaderBadge label="Present" value={stats.presentCount} color={colors.success} />
          <HeaderBadge label="Absent" value={stats.absentCount} color={colors.danger} />
        </Animated.View>
      </LinearGradient>

      {/* ── Content ── */}
      <FlatList
        data={logs}
        keyExtractor={(l: any) => l.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md }}>
            <Animated.View entering={FadeInDown.delay(300).springify().duration(400)} style={styles.detailsCard}>
              <Text style={styles.sectionTitle}>Member Details</Text>
              {fields.map((f, i) => (
                <Animated.View key={f.id} entering={FadeInDown.delay(320 + i * 30).springify().duration(300)} style={[
                  styles.fieldRow,
                  i < fields.length - 1 && styles.fieldRowBorder,
                ]}>
                  <Text style={styles.fieldLabel}>{f.name}</Text>
                  <Text style={styles.fieldValue} numberOfLines={2}>
                    {member.field_values[f.id] || '—'}
                  </Text>
                </Animated.View>
              ))}
            </Animated.View>

            {logs.length > 0 && (
              <Text style={styles.logSectionTitle}>
                Attendance Log <Text style={{ color: colors.textMuted, fontWeight: '500' }}>· {logs.length} records</Text>
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <Animated.View entering={FadeIn.duration(400)} style={styles.empty}>
            <Calendar size={44} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={styles.emptyTitle}>No attendance yet</Text>
            <Text style={styles.emptySub}>Records will appear here once attendance is taken</Text>
          </Animated.View>
        }
        renderItem={({ item, index }) => (
          <LogItem
            item={item}
            index={index}
            onPress={() => {
              setEditingLog({ ...item });
              setEditReason(item.reason || '');
            }}
          />
        )}
        showsVerticalScrollIndicator={false}
      />

      <ExportModal visible={!!exportPrompt} defaultName={exportPrompt?.def ?? ''} onExport={(n) => { exportPrompt?.cb(n); setExportPrompt(null); }} onClose={() => setExportPrompt(null)} />

      {/* Edit record modal */}
      <Modal visible={!!editingLog} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => !savingEdit && setEditingLog(null)}>
          <Animated.View entering={FadeInDown.springify().duration(300)} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Edit Record</Text>
            <Text style={styles.sheetSub}>
              {editingLog ? format(parseISO(editingLog.date), 'EEEE, MMM d, yyyy') : ''}
            </Text>

            {/* Status picker */}
            <View style={styles.editStatusRow}>
              {(['present', 'absent', 'late'] as const).map(status => {
                const cfg = STATUS_MAP[status];
                const isCurrent = editingLog?.status === status;
                const isSelected = editingLog?.status === status;
                return (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.editStatusBtn,
                      isSelected && { backgroundColor: cfg.surface, borderColor: cfg.color },
                      isCurrent && { opacity: 0.5 },
                    ]}
                    onPress={() => {
                      if (isCurrent) return;
                      setEditingLog((prev: any) => ({ ...prev, status }));
                      if (status === 'present') setEditReason('');
                    }}
                    disabled={isCurrent}
                    activeOpacity={0.7}
                  >
                    <cfg.Icon size={18} color={isSelected ? cfg.color : theme.colors.textMuted} strokeWidth={2} />
                    <Text style={[styles.editStatusLabel, isSelected && { color: cfg.color, fontWeight: '700' }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Reason field — shown for absent/late */}
            {editingLog?.status !== 'present' && (
              <View style={styles.editReasonBox}>
                <Text style={styles.editReasonLabel}>Reason (optional)</Text>
                <TextInput
                  style={styles.editReasonInput}
                  value={editReason}
                  onChangeText={setEditReason}
                  placeholder="e.g. Sick, Travel, etc."
                  placeholderTextColor={theme.colors.textPlaceholder}
                  multiline
                  maxLength={200}
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.saveBtn, savingEdit && { opacity: 0.6 }]}
              onPress={handleSaveEdit}
              disabled={savingEdit}
              activeOpacity={0.85}
            >
              <Text style={styles.saveBtnText}>
                {savingEdit ? 'Saving…' : 'Save Change'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={exportModal} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setExportModal(false)}>
          <Animated.View entering={FadeInDown.springify().duration(350)} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Export Records</Text>
            <Text style={styles.sheetSub}>{displayName}'s attendance history</Text>
            <TouchableOpacity style={styles.sheetBtn} onPress={() => doExport('csv')} disabled={exporting}>
              <FileSpreadsheet size={20} color={colors.primary} />
              <Text style={styles.sheetBtnText}>Export as CSV</Text>
            </TouchableOpacity>
            <View style={styles.sheetDivider} />
            <TouchableOpacity style={styles.sheetBtn} onPress={() => doExport('pdf')} disabled={exporting}>
              <FileText size={20} color={colors.primary} />
              <Text style={styles.sheetBtnText}>Export as PDF</Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ──
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background, gap: 8 },

  // Header
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 28 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  navActions: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },

  // Profile
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  profileInfo: { flex: 1 },
  nameText: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  uniqueText: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 3, fontWeight: '500' },
  rateRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  rateValue: { fontSize: 18, fontWeight: '800' },
  rateSub: { fontSize: 9, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Badges in header
  badgesRow: { flexDirection: 'row', gap: 8, paddingTop: 20 },
  badge: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 2 },
  badgeValue: { fontSize: 20, fontWeight: '800' },
  badgeLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Trend
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 4 },
  trendText: { fontSize: 13, fontWeight: '600' },

  // Details
  detailsCard: { backgroundColor: theme.colors.surface, marginHorizontal: theme.spacing.md, borderRadius: theme.borderRadius.xl, padding: theme.spacing.lg, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, gap: 12 },
  fieldRowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  fieldLabel: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '500', flex: 1 },
  fieldValue: { fontSize: 14, fontWeight: '600', color: theme.colors.text, textAlign: 'right', flex: 2 },

  // Log list
  listContent: { paddingBottom: 80, paddingTop: theme.spacing.md },
  logSectionTitle: { fontSize: 12, fontWeight: '800', color: theme.colors.text, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.lg, paddingBottom: 4 },

  // Log item
  logCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: theme.spacing.md, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: 14, gap: 12, ...theme.shadows.xs, borderWidth: 1, borderColor: 'rgba(0,0,0,0.03)' },
  logIconBox: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  logBody: { flex: 1 },
  logDate: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  logReason: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 3 },
  logPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: theme.borderRadius.full },
  logPillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Empty state
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textMuted },
  emptySub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 18 },

  // Modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, gap: 4 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  sheetSub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 20 },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  sheetBtnText: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  sheetDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.06)' },

  // Edit modal
  editStatusRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  editStatusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: theme.borderRadius.lg, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
  editStatusLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted },
  editReasonBox: { marginBottom: 20 },
  editReasonLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  editReasonInput: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, minHeight: 72, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 15, borderRadius: theme.borderRadius.lg, alignItems: 'center', ...theme.shadows.primary },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
