import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { useState, useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, FileDown, Check, ChevronRight, ChevronDown, Star, Eye } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Papa from 'papaparse';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../../src/theme';
import { FieldService } from '../../../src/services/db/FieldService';
import { MemberService } from '../../../src/services/db/MemberService';
import { SessionService } from '../../../src/services/db/SessionService';
import { GroupService } from '../../../src/services/db/GroupService';
import { GroupDTO, MemberDTO } from '../../../src/services/db/types';
import { useSyncTrigger } from '../../../src/hooks/useSyncTrigger';
import { execute, queryAll, getDbUserId } from '../../../src/services/db/database';
import { generateId } from '../../../src/utils/idHelpers';

const DATE_COL_REGEX = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
function normalizeDate(col: string): string { const n = col.replace(/\//g, '-'); const p = n.split('-'); if (p.length !== 3) return col; return `${p[0].padStart(4, '0')}-${p[1].padStart(2, '0')}-${p[2].padStart(2, '0')}`; }

type Step = 'pick' | 'select' | 'rename' | 'unique' | 'display' | 'confirm';

interface ColInfo { original: string; renamed: string; selected: boolean; isDate: boolean; }
interface ImportProgress { phase: string; totalRows: number; processedRows: number; membersAdded: number; membersMatched: number; recordsAdded: number; fieldsCreated: number; sessionsCreated: number; }

export default function ImportCsvScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const nId = id || '';
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSyncTrigger();

  const [step, setStep] = useState<Step>('pick');
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<GroupDTO | null>(null);
  const [cols, setCols] = useState<ColInfo[]>([]);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [uniqueColOriginal, setUniqueColOriginal] = useState('');
  const [displayCols, setDisplayCols] = useState<string[]>([]);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [datesExpanded, setDatesExpanded] = useState(false);

  useEffect(() => { (async () => { try { setGroup(await GroupService.getById(nId)); } catch (err) { console.error(err); } finally { setLoading(false); } })(); }, [nId]);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['text/csv', 'text/comma-separated-values', 'application/csv'], copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.length) return;
      const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
      Papa.parse(content, { header: true, skipEmptyLines: true, complete: (parsed) => {
        if (!parsed.data?.length) { Alert.alert('Empty', 'No data found in this CSV.'); return; }
        const headers: string[] = parsed.meta.fields ?? [];
        setCols(headers.map(h => ({ original: h, renamed: h, selected: true, isDate: DATE_COL_REGEX.test(h) })));
        setCsvData(parsed.data as any[]);
        setStep('select');
      }, error: (err: any) => Alert.alert('Parse Error', err.message) });
    } catch { Alert.alert('Error', 'Could not read file.'); }
  };

  const handleImport = async () => {
    const selectedCols = cols.filter(c => c.selected && !c.isDate);
    const selectedDateCols = cols.filter(c => c.selected && c.isDate);
    const totalRows = csvData.length;

    setProgress({ phase: 'Creating fields…', totalRows, processedRows: 0, membersAdded: 0, membersMatched: 0, recordsAdded: 0, fieldsCreated: 0, sessionsCreated: 0 });
    await new Promise(r => setTimeout(r, 30));

    try {
      const userId = getDbUserId();

      // Phase 1: Batch create fields
      const existingFields = await FieldService.getByGroup(nId);
      const fieldMap: Record<string, string> = {};
      let fc = 0;
      const newFieldBatch: { id: string; group_id: string; name: string; is_unique: boolean; is_display: boolean; display_order: number }[] = [];
      for (const col of selectedCols) {
        const field = existingFields.find(f => f.name === col.renamed);
        if (!field) {
          const fid = generateId();
          newFieldBatch.push({ id: fid, group_id: nId, name: col.renamed, is_unique: col.original === uniqueColOriginal, is_display: displayCols.includes(col.original), display_order: 0 });
          fieldMap[col.original] = fid;
          fc++;
        } else { fieldMap[col.original] = field.id; }
      }
      // Batch insert all new fields
      for (const f of newFieldBatch) await FieldService.create(f);
      setProgress(p => p ? { ...p, fieldsCreated: fc, phase: 'Importing members…' } : null);

      // Phase 2: Import members — skip DB round-trip for newly created members
      const existingMembers = await MemberService.getByGroup(nId);
      const uniqueField = (await FieldService.getByGroup(nId)).find(f => f.is_unique);
      let ma = 0, mm = 0;
      const memberCache = new Map<string, MemberDTO>();
      const BATCH_SIZE = 25;

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const uniqueVal = uniqueField ? String(row[uniqueColOriginal] || '').trim() : null;
        let member = uniqueVal ? existingMembers.find((m: MemberDTO) => m.field_values[uniqueField!.id] === uniqueVal) || null : null;

        if (member) { mm++; }
        else {
          const fv: Record<string, string> = {};
          for (const col of selectedCols) { const fid = fieldMap[col.original]; if (fid) fv[fid] = String(row[col.original] || '').trim(); }
          const mid = generateId();
          await MemberService.create({ id: mid, group_id: nId, field_values: fv });
          // Build member object directly instead of fetching back
          member = { id: mid, group_id: nId, field_values: fv } as MemberDTO;
          ma++;
        }
        if (member) memberCache.set(member.id, member);

        if (i % BATCH_SIZE === 0 || i === csvData.length - 1) {
          setProgress(p => p ? { ...p, processedRows: i + 1, membersAdded: ma, membersMatched: mm } : null);
          if (i < csvData.length - 1) await new Promise(r => setTimeout(r, 0));
        }
      }

      // Phase 3: Import records — batch inserts, no getById round-trips
      setProgress(p => p ? { ...p, phase: 'Importing attendance records…' } : null);

      const allSessions = await SessionService.getByGroup(nId);
      const sessionIndex = new Map<string, { id: string }>();
      for (const s of allSessions) sessionIndex.set(s.date, s);
      const existingRecordKeys = new Set<string>();
      if (allSessions.length > 0) {
        const ph = allSessions.map(() => '?').join(',');
        const fetched = await queryAll<{ session_id: string; member_id: string }>(`SELECT session_id, member_id FROM records WHERE session_id IN (${ph})`, allSessions.map(s => s.id));
        for (const r of fetched) existingRecordKeys.add(`${r.session_id}|${r.member_id}`);
      }

      let ra = 0, sc = 0;
      const statusMap: Record<string, string> = { P: 'present', A: 'absent', L: 'late', E: 'excused' };
      const recordBatch: any[] = [];

      const flushRecords = async () => {
        if (!recordBatch.length) return;
        const placeholders = recordBatch.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
        const params: any[] = [];
        for (const r of recordBatch) params.push(r.id, r.session_id, r.member_id, r.status, r.reason, r.user_id);
        await execute(`INSERT INTO records (id, session_id, member_id, status, reason, user_id) VALUES ${placeholders}`, params);
        recordBatch.length = 0;
      };

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        const uniqueVal = uniqueField ? String(row[uniqueColOriginal] || '').trim() : null;
        let member: MemberDTO | undefined;
        if (uniqueVal) {
          for (const [, m] of memberCache) { if (m.field_values[uniqueField!.id] === uniqueVal) { member = m; break; } }
          if (!member) member = existingMembers.find((m: MemberDTO) => m.field_values[uniqueField!.id] === uniqueVal);
        }
        if (!member) { continue; }

        for (const dateCol of selectedDateCols) {
          const cell = String(row[dateCol.original] || '').trim();
          if (!cell || cell === '-') continue;
          const status = statusMap[cell[0].toUpperCase()];
          if (!status) continue;

          const isoDate = normalizeDate(dateCol.original);
          let session = sessionIndex.get(isoDate);
          if (!session) {
            const sid = generateId();
            await execute('INSERT INTO sessions (id, group_id, date, time, notes, created_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [sid, nId, isoDate, '00:00', '', new Date().toISOString(), userId]);
            session = { id: sid };
            sessionIndex.set(isoDate, session);
            sc++;
          }

          const rk = `${session.id}|${member.id}`;
          if (!existingRecordKeys.has(rk)) {
            const reasonMatch = cell.match(/\(([^)]+)\)/);
            recordBatch.push({ id: generateId(), session_id: session.id, member_id: member.id, status, reason: reasonMatch ? reasonMatch[1].trim() : '', user_id: userId });
            existingRecordKeys.add(rk);
            ra++;
            if (recordBatch.length >= 50) await flushRecords();
          }
        }

        if (i % BATCH_SIZE === 0 || i === csvData.length - 1) {
          setProgress(p => p ? { ...p, recordsAdded: ra, sessionsCreated: sc } : null);
          if (i < csvData.length - 1) await new Promise(r => setTimeout(r, 0));
        }
      }
      await flushRecords(); // flush remaining records

      const final: ImportProgress = { phase: 'Complete!', totalRows, processedRows: csvData.length, membersAdded: ma, membersMatched: mm, recordsAdded: ra, fieldsCreated: fc, sessionsCreated: sc };
      setProgress(final);
    } catch (e: any) {
      Alert.alert('Import Failed', e.message || 'An error occurred.');
      setProgress(null);
    }
  };

  const handleFinish = () => {
    setProgress(null);
    triggerSync().catch(() => {});
    router.back();
  };

  const selectedCols = cols.filter(c => c.selected && !c.isDate);

  if (loading) return <View style={styles.centered}><ActivityIndicator color={theme.colors.primary} /></View>;
  if (!group) return null;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primaryDark]} style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><ArrowLeft size={22} color="#fff" /></TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>{group.name}</Text>
          <Text style={styles.headerSub}>CSV Import · Step {step === 'pick' ? 1 : step === 'select' ? 2 : step === 'rename' ? 3 : step === 'unique' ? 4 : step === 'display' ? 5 : 6} of 6</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll}>
        {step === 'pick' && (
          <TouchableOpacity style={styles.pickBox} onPress={handlePickFile} activeOpacity={0.7}>
            <FileDown size={48} color={theme.colors.primary} />
            <Text style={styles.pickText}>Choose CSV File</Text>
            <Text style={styles.pickSub}>Select a .csv file to import members and attendance</Text>
          </TouchableOpacity>
        )}

        {step === 'select' && (
          <View style={styles.card}>
            <Text style={styles.stepTitle}>Select Columns</Text>
            <Text style={styles.stepSub}>Choose which columns to import.</Text>

            {/* Regular columns */}
            <Text style={styles.sectionLabel}>Fields</Text>
            {cols.filter(c => !c.isDate).map(c => (
              <TouchableOpacity key={c.original} style={styles.row} onPress={() => setCols(p => p.map(x => x.original === c.original ? { ...x, selected: !x.selected } : x))}>
                <View style={[styles.chk, c.selected && styles.chkActive]}>{c.selected && <Check size={12} color="#fff" />}</View>
                <Text style={styles.rowText}>{c.original}</Text>
              </TouchableOpacity>
            ))}
            {cols.filter(c => !c.isDate).length === 0 && <Text style={styles.emptyHint}>No field columns detected.</Text>}

            {/* Date columns — collapsible */}
            {cols.some(c => c.isDate) && (
              <>
                <TouchableOpacity style={styles.dropdownHeader} onPress={() => setDatesExpanded(!datesExpanded)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ChevronDown size={16} color={theme.colors.textMuted} style={{ transform: [{ rotate: datesExpanded ? '0deg' : '-90deg' }] }} />
                    <Text style={styles.sectionLabel}>Date Columns</Text>
                    <View style={styles.dateCount}><Text style={styles.dateCountText}>{cols.filter(c => c.isDate).length}</Text></View>
                  </View>
                </TouchableOpacity>
                {datesExpanded && cols.filter(c => c.isDate).map(c => (
                  <TouchableOpacity key={c.original} style={styles.row} onPress={() => setCols(p => p.map(x => x.original === c.original ? { ...x, selected: !x.selected } : x))}>
                    <View style={[styles.chk, c.selected && styles.chkActive]}>{c.selected && <Check size={12} color="#fff" />}</View>
                    <Text style={styles.rowText}>{c.original}</Text>
                    <View style={styles.dateTag}><Text style={styles.dateTagText}>DATE</Text></View>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('rename')}><Text style={styles.nextBtnText}>Next</Text><ChevronRight size={20} color="#fff" /></TouchableOpacity>
          </View>
        )}

        {step === 'rename' && (
          <View style={styles.card}>
            <Text style={styles.stepTitle}>Rename Fields</Text>
            <Text style={styles.stepSub}>Customize field names (optional).</Text>
            {cols.filter(c => c.selected && !c.isDate).map(c => (
              <View key={c.original} style={styles.renameBox}>
                <Text style={styles.origLabel}>{c.original}</Text>
                <TextInput style={styles.renameInput} value={c.renamed} onChangeText={v => setCols(p => p.map(x => x.original === c.original ? { ...x, renamed: v } : x))} />
              </View>
            ))}
            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('unique')}><Text style={styles.nextBtnText}>Next</Text><ChevronRight size={20} color="#fff" /></TouchableOpacity>
          </View>
        )}

        {step === 'unique' && (
          <View style={styles.card}>
            <Text style={styles.stepTitle}>Unique Identifier</Text>
            <Text style={styles.stepSub}>Select the column used to match existing members (e.g., ID, Email).</Text>
            {selectedCols.map(c => (
              <TouchableOpacity key={c.original} style={[styles.selRow, uniqueColOriginal === c.original && styles.selRowActive]} onPress={() => setUniqueColOriginal(c.original)}>
                <Star size={16} color={uniqueColOriginal === c.original ? theme.colors.primary : theme.colors.textMuted} />
                <Text style={styles.rowText}>{c.renamed}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep('display')}><Text style={styles.nextBtnText}>Next</Text><ChevronRight size={20} color="#fff" /></TouchableOpacity>
          </View>
        )}

        {step === 'display' && (
          <View style={styles.card}>
            <Text style={styles.stepTitle}>Display Fields</Text>
            <Text style={styles.stepSub}>Select fields to show in member lists.</Text>
            {selectedCols.map(c => {
              const isDisp = displayCols.includes(c.original);
              return (
                <TouchableOpacity key={c.original} style={[styles.selRow, isDisp && styles.selRowActive]} onPress={() => setDisplayCols(p => isDisp ? p.filter(x => x !== c.original) : [...p, c.original])}>
                  <Eye size={16} color={isDisp ? theme.colors.primary : theme.colors.textMuted} />
                  <Text style={styles.rowText}>{c.renamed}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.importBtn} onPress={handleImport}><Text style={styles.importBtnText}>Start Import</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Progress Modal */}
      <Modal visible={!!progress} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle}>Importing Data</Text>

            {progress?.phase === 'Complete!' ? (
              <>
                <View style={styles.completeIcon}><Check size={32} color="#fff" strokeWidth={3} /></View>
                <Text style={styles.completeTitle}>Import Complete</Text>
                <View style={styles.summaryGrid}>
                  {[
                    { l: 'Fields created', v: progress.fieldsCreated },
                    { l: 'Members added', v: progress.membersAdded },
                    { l: 'Members matched', v: progress.membersMatched },
                    { l: 'Sessions created', v: progress.sessionsCreated },
                    { l: 'Records imported', v: progress.recordsAdded },
                  ].map(s => (
                    <View key={s.l} style={styles.summaryRow}><Text style={styles.summaryLabel}>{s.l}</Text><Text style={styles.summaryValue}>{s.v}</Text></View>
                  ))}
                </View>
                <TouchableOpacity style={styles.finishBtn} onPress={handleFinish}><Text style={styles.finishBtnText}>Done</Text></TouchableOpacity>
              </>
            ) : (
              <>
                <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 16 }} />
                <Text style={styles.phaseText}>{progress?.phase}</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress ? (progress.processedRows / Math.max(progress.totalRows, 1)) * 100 : 0}%` }]} />
                </View>
                <Text style={styles.progressCount}>{progress?.processedRows ?? 0} of {progress?.totalRows ?? 0} rows</Text>
                <View style={styles.liveStats}>
                  <Text style={styles.liveStat}>Members: {progress?.membersAdded ?? 0} new, {progress?.membersMatched ?? 0} matched</Text>
                  <Text style={styles.liveStat}>Records: {progress?.recordsAdded ?? 0}</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.md },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 1 },
  scroll: { padding: theme.spacing.lg },

  pickBox: { padding: 48, alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius['3xl'], borderStyle: 'dashed', borderWidth: 2, borderColor: theme.colors.border, ...theme.shadows.sm },
  pickText: { fontSize: 18, fontWeight: '700', color: theme.colors.primary, marginTop: 16 },
  pickSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 6, textAlign: 'center' },

  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius['3xl'], padding: theme.spacing.xl, ...theme.shadows.sm },
  stepTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  stepSub: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 20 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  chk: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.border, alignItems: 'center', justifyContent: 'center' },
  chkActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  rowText: { fontSize: 15, color: theme.colors.text, flex: 1 },
  tag: { backgroundColor: theme.colors.primarySurface, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 10, fontWeight: '800', color: theme.colors.primary },
  dateTag: { backgroundColor: theme.colors.warningLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  dateTagText: { fontSize: 10, fontWeight: '800', color: theme.colors.warningDark },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, marginTop: 20, borderTopWidth: 1, borderTopColor: theme.colors.borderLight, marginBottom: 8 },
  dateHint: { fontSize: 11, color: theme.colors.textMuted },
  dateCount: { backgroundColor: theme.colors.warningLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  dateCountText: { fontSize: 11, fontWeight: '700', color: theme.colors.warningDark },
  emptyHint: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic', paddingVertical: 8 },

  renameBox: { marginBottom: 16 },
  origLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6 },
  renameInput: { backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.md, padding: 12, borderWidth: 1, borderColor: theme.colors.border, fontSize: 15, color: theme.colors.text },

  selRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.colors.border, marginBottom: 10 },
  selRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },

  nextBtn: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: theme.borderRadius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, ...theme.shadows.primary },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  importBtn: { backgroundColor: theme.colors.successDark, padding: 16, borderRadius: theme.borderRadius.lg, alignItems: 'center', marginTop: 24, ...theme.shadows.primary },
  importBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Progress modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  progressCard: { width: '100%', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius['3xl'], padding: 32, alignItems: 'center', ...theme.shadows.lg },
  progressTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text, marginBottom: 20 },
  phaseText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 16 },
  progressBar: { width: '100%', height: 6, backgroundColor: theme.colors.borderLight, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  progressFill: { height: 6, backgroundColor: theme.colors.primary, borderRadius: 3 },
  progressCount: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 20 },
  liveStats: { width: '100%', gap: 6 },
  liveStat: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center' },

  // Complete state
  completeIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  completeTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 20 },
  summaryGrid: { width: '100%', gap: 8, marginBottom: 24 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  summaryLabel: { fontSize: 14, color: theme.colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  finishBtn: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: theme.borderRadius.lg, width: '100%', alignItems: 'center', ...theme.shadows.primary },
  finishBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
