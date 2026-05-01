import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView,
  ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useCallback, useEffect } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import {
  User, LogOut, Shield, BarChart3, FileSpreadsheet, FileText,
  Calendar, ChevronDown, ChevronRight, Users, LogIn, UserPlus, X,
  CloudOff, Cloud, RefreshCw, AlertCircle, Search, FolderOpen,
  Lock, Timer, Trash2, KeyRound,
} from 'lucide-react-native';
import { useSecurity, LockTimeout } from '../../src/auth/SecurityContext';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../src/theme';

import { useAuth } from '../../src/auth/AuthContext';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

import type { SyncStatus, SyncProgress } from '../../src/services/syncService';
import { syncData } from '../../src/services/syncService';
import { GroupDTO } from '../../src/services/db/types';
import { GroupService } from '../../src/services/db/GroupService';
import { MemberService } from '../../src/services/db/MemberService';
import { SessionService } from '../../src/services/db/SessionService';
import { fetchGroupExportData, exportGroupCSV, exportGroupPDF, exportMultiplePDF, GroupExportData } from '../../src/utils/exportHelpers';
import { clearAllData, subscribeToDB, queryOne } from '../../src/services/db/database';
import SuccessToast from '../../src/components/SuccessToast';
import PinModal from '../../src/components/PinModal';
import ExportModal from '../../src/components/ExportModal';
import SyncModal from '../../src/components/SyncModal';

function SyncBadge({ status }: { status: SyncStatus }) {
  const map: Record<SyncStatus, { label: string; color: string; Icon: any }> = {
    idle: { label: 'Not synced', color: theme.colors.textMuted, Icon: Cloud },
    syncing: { label: 'Syncing…', color: theme.colors.primary, Icon: RefreshCw },
    synced: { label: 'Synced', color: theme.colors.successDark, Icon: Cloud },
    error: { label: 'Sync failed', color: theme.colors.danger, Icon: AlertCircle },
    offline: { label: 'Offline — local only', color: theme.colors.warningDark, Icon: CloudOff },
  };
  const { label, color, Icon: Ic } = map[status] ?? map.idle;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
      <Ic size={11} color={color} strokeWidth={2.5} />
      <Text style={{ fontSize: 11, fontWeight: '600', color }}>{label}</Text>
    </View>
  );
}

type DateFilterKey = 'all' | 'this_month' | 'last_month' | 'custom';
type ReportSection = 'closed' | 'open';
type UpgradeTab = 'signup' | 'signin';

function getDateRange(filter: DateFilterKey, from: Date, to: Date) {
  const now = new Date();
  if (filter === 'this_month') return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
  if (filter === 'last_month') { const lm = subMonths(now, 1); return { from: format(startOfMonth(lm), 'yyyy-MM-dd'), to: format(endOfMonth(lm), 'yyyy-MM-dd') }; }
  if (filter === 'custom') return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
  return { from: null, to: null };
}

type TreeItem = { group: GroupDTO; depth: number; memberCount: number; sessionCount: number; leafIds: string[] };
const DATE_FILTERS: { key: DateFilterKey; label: string }[] = [
  { key: 'all', label: 'All Time' }, { key: 'this_month', label: 'This Month' }, { key: 'last_month', label: 'Last Month' }, { key: 'custom', label: 'Custom' },
];

export default function SettingsScreen() {
  const { mode, user, token, signOut, upgradeFromGuest, syncStatus, setSyncStatus, changePassword, deleteAccount, deleteAllData } = useAuth();
  const { appLockEnabled, lockTimeoutMin, hasPin, setAppLock, setLockTimeout, setPin } = useSecurity();
  const insets = useSafeAreaInsets();

  const [reportSection, setReportSection] = useState<ReportSection>('closed');
  const [dateFilter, setDateFilter] = useState<DateFilterKey>('all');
  const [customFrom, setCustomFrom] = useState(() => startOfMonth(new Date()));
  const [customTo, setCustomTo] = useState(() => new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [bulkExporting, setBulkExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportPrompt, setExportPrompt] = useState<{ def: string; cb: (n: string) => void } | null>(null);
  const [syncModal, setSyncModal] = useState<SyncProgress | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reportSearch, setReportSearch] = useState('');
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [treeData, setTreeData] = useState<TreeItem[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  const [upgradeModal, setUpgradeModal] = useState(false);
  const [upgradeTab, setUpgradeTab] = useState<UpgradeTab>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  const [changePwModal, setChangePwModal] = useState(false);
  const [cpCurrent, setCpCurrent] = useState('');
  const [cpNew, setCpNew] = useState('');
  const [cpConfirm, setCpConfirm] = useState('');
  const [cpLoading, setCpLoading] = useState(false);
  const [cpError, setCpError] = useState('');
  const [deletingLabel, setDeletingLabel] = useState<string | null>(null);
  const [successLabel, setSuccessLabel] = useState<string | null>(null);

  const [pinSetupModal, setPinSetupModal] = useState(false);
  const [pinSetupStep, setPinSetupStep] = useState<'set' | 'confirm'>('set');
  const [tempPin, setTempPin] = useState('');
  const [pinSetupError, setPinSetupError] = useState('');

  const isGuest = mode === 'guest';
  const isSelecting = selectedIds.size > 0;

  const loadTree = useCallback(async () => {
    setIsLoadingTree(true);
    try {
      const allGroups = await GroupService.getAll();
      const { from, to } = getDateRange(dateFilter, customFrom, customTo);
      const getLeafIdsRecursive = async (gId: string): Promise<string[]> => {
        const grp = allGroups.find(x => x.id === gId);
        if (!grp) return [];
        if (grp.node_type === 'leaf') return [gId];
        const children = allGroups.filter(x => x.parent_id === gId);
        const ids: string[] = [];
        for (const c of children) ids.push(...(await getLeafIdsRecursive(c.id)));
        return ids;
      };
      const getAggStats = async (leafIds: string[]) => {
        let mc = 0, sc = 0;
        for (const lid of leafIds) {
          mc += (await MemberService.getByGroup(lid)).length;
          sc += (await SessionService.getByGroup(lid, from || undefined, to || undefined)).length;
        }
        return { memberCount: mc, sessionCount: sc };
      };
      const buildTree = async (parentId: string, depth: number): Promise<TreeItem[]> => {
        const children = allGroups.filter(g => g.parent_id === parentId);
        const result: TreeItem[] = [];
        for (const g of children) {
          const leafIds = await getLeafIdsRecursive(g.id);
          const stats = await getAggStats(leafIds);
          result.push({ group: g, depth, ...stats, leafIds });
          if (g.node_type === 'container' && expandedGroupIds.has(g.id)) result.push(...(await buildTree(g.id, depth + 1)));
        }
        return result;
      };
      setTreeData(await buildTree('', 0));
    } catch (e) { console.error('tree load fail:', e); }
    finally { setIsLoadingTree(false); }
  }, [dateFilter, customFrom, customTo, expandedGroupIds]);

  useEffect(() => { if (reportSection === 'open') loadTree(); }, [reportSection, loadTree]);
  useFocusEffect(useCallback(() => { if (reportSection === 'open') loadTree(); }, [reportSection, loadTree]));
  useEffect(() => subscribeToDB(() => { if (reportSection === 'open') loadTree(); }), [reportSection, loadTree]);

  const toggleExpand = (gId: string) => setExpandedGroupIds(p => { const n = new Set(p); n.has(gId) ? n.delete(gId) : n.add(gId); return n; });

  const handleExportCSV = async (gId: string) => {
    if (exportingId) return;
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    const data = await fetchGroupExportData(gId, from, to);
    setExportPrompt({ def: data.group.name, cb: async (name) => { setExportingId(gId); try { await exportGroupCSV(data, name); } catch (e: any) { Alert.alert('No data', e.message ?? 'Failed.'); } finally { setExportingId(null); } } });
  };
  const handleExportPDF = async (gId: string) => {
    if (exportingId) return;
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    const data = await fetchGroupExportData(gId, from, to);
    setExportPrompt({ def: data.group.name, cb: async (name) => { setExportingId(gId); try { await exportGroupPDF(data, name); } catch (e: any) { Alert.alert('No data', e.message ?? 'Failed.'); } finally { setExportingId(null); } } });
  };
  const handleBulkPDF = async () => {
    setBulkExporting('pdf');
    try {
      const { from, to } = getDateRange(dateFilter, customFrom, customTo);
      const list: GroupExportData[] = [];
      for (const gId of selectedIds) list.push(await fetchGroupExportData(gId, from, to));
      setExportPrompt({ def: '', cb: async (name) => { await exportMultiplePDF(list, name); setSelectedIds(new Set()); } });
    } catch (e: any) { Alert.alert('Error', e.message ?? 'Failed.'); }
    finally { setBulkExporting(null); }
  };
  const handleUpgrade = async () => {
    if (upgradeTab === 'signup') {
      if (!email.trim() || !password) { Alert.alert('Required', 'Email and password required.'); return; }
      if (password !== confirmPw) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
      if (password.length < 6) { Alert.alert('Too short', 'Min 6 characters.'); return; }
    } else { if (!email.trim() || !password) { Alert.alert('Required', 'Email and password required.'); return; } }
    setUpgradeLoading(true);
    try { await upgradeFromGuest(email, password, upgradeTab === 'signup' ? 'signup' : 'signin'); setUpgradeModal(false); setSuccessLabel(upgradeTab === 'signup' ? 'Account created!' : 'Signed in!'); }
    catch (e: any) { Alert.alert('Error', e.message ?? 'Unknown error.'); }
    finally { setUpgradeLoading(false); }
  };
  const handleChangePassword = async () => {
    setCpError('');
    if (!cpCurrent || !cpNew || !cpConfirm) { setCpError('All fields required.'); return; }
    if (cpNew !== cpConfirm) { setCpError('New passwords do not match.'); return; }
    if (cpNew.length < 6) { setCpError('Min 6 characters.'); return; }
    setCpLoading(true);
    try { await changePassword(cpCurrent, cpNew); setCpCurrent(''); setCpNew(''); setCpConfirm(''); setChangePwModal(false); setSuccessLabel('Password changed.'); }
    catch (e: any) { setCpError(e.message ?? 'Failed.'); }
    finally { setCpLoading(false); }
  };
  const handleSync = async () => {
    if (!token || !user) return;
    setSyncStatus('syncing');
    setSyncModal({ phase: 'push', message: 'Starting sync…' });
    try {
      await syncData(token, user.userId, (p) => setSyncModal(p));
      const [gc, mc, sc, rc] = await Promise.all([
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM groups'),
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM members'),
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sessions'),
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM records'),
      ]);
      setSyncModal({ phase: 'complete', message: 'Sync complete', groups: gc?.count ?? 0, members: mc?.count ?? 0, sessions: sc?.count ?? 0, records: rc?.count ?? 0 });
      setSyncStatus('synced');
    } catch (e: any) {
      setSyncModal({ phase: 'error', message: 'Sync failed', error: e?.message ?? 'Check connection.' });
      setSyncStatus('error');
    }
  };
  const handlePinSetup = (pin: string) => {
    if (pinSetupStep === 'set') { setTempPin(pin); setPinSetupStep('confirm'); setPinSetupError(''); }
    else if (pin === tempPin) { setPin(pin); setPinSetupModal(false); setPinSetupStep('set'); setTempPin(''); setSuccessLabel('PIN set.'); }
    else { setPinSetupError('PINs do not match.'); setPinSetupStep('set'); setTempPin(''); }
  };

  const filterLabel = dateFilter === 'all' ? 'All time' : dateFilter === 'this_month' ? 'This month' : dateFilter === 'last_month' ? 'Last month' : `${format(customFrom, 'MMM d')} – ${format(customTo, 'MMM d, yyyy')}`;

  const filteredTree = reportSearch.trim() ? treeData.filter(i => i.group.name.toLowerCase().includes(reportSearch.trim().toLowerCase())) : treeData;

  return (
    <View style={styles.root}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primaryDark]} style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSub}>Account · Reports · Security</Text>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + (isSelecting ? 80 : 0) }}>
        {/* Reports & Export */}
        <Animated.View entering={FadeInDown.delay(100).duration(300).springify()}>
          <TouchableOpacity style={styles.reportToggle} onPress={() => setReportSection(s => s === 'open' ? 'closed' : 'open')} activeOpacity={0.7}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySurface }]}><BarChart3 size={18} color={theme.colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={styles.reportToggleTitle}>Reports & Export</Text><Text style={styles.reportToggleSub}>Export attendance data</Text></View>
            <ChevronDown size={18} color={theme.colors.textMuted} style={{ transform: [{ rotate: reportSection === 'open' ? '180deg' : '0deg' }] }} />
          </TouchableOpacity>
          {reportSection === 'open' && (
            <View style={styles.reportBody}>
              <View style={styles.filterRow}>{DATE_FILTERS.map(f => (
                <TouchableOpacity key={f.key} style={[styles.filterChip, dateFilter === f.key && styles.filterChipActive]} onPress={() => setDateFilter(f.key)} activeOpacity={0.7}>
                  <Text style={[styles.filterChipText, dateFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}</View>
              {dateFilter === 'custom' && (
                <View style={styles.dateRow}>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowFromPicker(true)}><Calendar size={13} color={theme.colors.primary} /><Text style={styles.dateBtnText}>{format(customFrom, 'MMM d, yyyy')}</Text></TouchableOpacity>
                  <Text style={{ color: theme.colors.textMuted }}>→</Text>
                  <TouchableOpacity style={styles.dateBtn} onPress={() => setShowToPicker(true)}><Calendar size={13} color={theme.colors.primary} /><Text style={styles.dateBtnText}>{format(customTo, 'MMM d, yyyy')}</Text></TouchableOpacity>
                </View>
              )}
              {showFromPicker && <DateTimePicker value={customFrom} mode="date" display="default" onChange={(_, d) => { setShowFromPicker(Platform.OS === 'ios'); if (d) setCustomFrom(d); }} />}
              {showToPicker && <DateTimePicker value={customTo} mode="date" display="default" onChange={(_, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) setCustomTo(d); }} />}
              <View style={styles.reportSearch}>
                <Search size={14} color={theme.colors.textMuted} />
                <TextInput style={styles.reportSearchInput} placeholder="Search groups…" placeholderTextColor={theme.colors.textPlaceholder} value={reportSearch} onChangeText={setReportSearch} />
                {reportSearch.length > 0 && <TouchableOpacity onPress={() => setReportSearch('')}><X size={14} color={theme.colors.textMuted} /></TouchableOpacity>}
              </View>
              {isLoadingTree && treeData.length === 0 ? <View style={styles.empty}><ActivityIndicator color={theme.colors.primary} /><Text style={styles.emptyText}>Loading…</Text></View>
              : filteredTree.length === 0 ? <View style={styles.empty}><BarChart3 size={28} color={theme.colors.textMuted} /><Text style={styles.emptyText}>No groups found</Text></View>
              : filteredTree.map(item => {
                const { group: g, depth, memberCount, sessionCount } = item;
                const isLeaf = g.node_type === 'leaf';
                const indent = depth * 16;
                if (isLeaf) {
                  const hasData = sessionCount > 0;
                  return (
                    <TouchableOpacity key={g.id} style={[styles.reportCard, { marginLeft: indent }, selectedIds.has(g.id) && styles.reportCardSel]}
                      onLongPress={() => setSelectedIds(p => { const n = new Set(p); n.add(g.id); return n; })}
                      onPress={() => isSelecting && setSelectedIds(p => { const n = new Set(p); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; })}
                      activeOpacity={0.7}>
                      <View style={styles.reportCardRow}>
                        <View style={[styles.reportIcon, selectedIds.has(g.id) && { backgroundColor: theme.colors.primary }]}>
                          {selectedIds.has(g.id) ? <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>✓</Text> : <Users size={15} color={theme.colors.primary} />}
                        </View>
                        <View style={{ flex: 1 }}><Text style={styles.reportName} numberOfLines={1}>{g.name}</Text><Text style={styles.reportMeta}>{memberCount} members · {sessionCount} sessions · {filterLabel}</Text></View>
                        {exportingId === g.id && <ActivityIndicator size="small" color={theme.colors.primary} />}
                      </View>
                      {!isSelecting && (
                        <View style={styles.exportRow}>
                          <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.successLight }, !hasData && { opacity: 0.4 }]} onPress={() => handleExportCSV(g.id)} disabled={!!exportingId || !hasData}>
                            <FileSpreadsheet size={14} color={theme.colors.successDark} /><Text style={[styles.exportBtnText, { color: theme.colors.successDark }]}>{exportingId === g.id ? '…' : 'CSV'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.exportBtn, { backgroundColor: theme.colors.dangerLight }, !hasData && { opacity: 0.4 }]} onPress={() => handleExportPDF(g.id)} disabled={!!exportingId || !hasData}>
                            <FileText size={14} color={theme.colors.dangerDark} /><Text style={[styles.exportBtnText, { color: theme.colors.dangerDark }]}>{exportingId === g.id ? '…' : 'PDF'}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity key={g.id} style={[styles.reportCard, { marginLeft: indent }]} onPress={() => toggleExpand(g.id)} activeOpacity={0.7}>
                    <View style={styles.reportCardRow}>
                      <View style={[styles.reportIcon, { backgroundColor: theme.colors.successLight }]}><FolderOpen size={15} color={theme.colors.successDark} /></View>
                      <View style={{ flex: 1 }}><Text style={styles.reportName} numberOfLines={1}>{g.name}</Text><Text style={styles.reportMeta}>{memberCount} members · {sessionCount} sessions · {filterLabel}</Text></View>
                      <ChevronRight size={16} color={theme.colors.textMuted} style={{ transform: [{ rotate: expandedGroupIds.has(g.id) ? '90deg' : '0deg' }] }} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Animated.View>

        {/* Account */}
        <Animated.View entering={FadeInDown.delay(160).duration(300).springify()}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.section}>
            {isGuest ? (
              <>
                <View style={styles.guestCard}>
                  <Shield size={20} color={theme.colors.warningDark} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.guestTitle}>Guest Mode</Text>
                    <Text style={styles.guestSub}>Local storage only — not backed up</Text>
                  </View>
                </View>
                <View style={styles.guestBtns}>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.primary }]} onPress={() => { setUpgradeTab('signup'); setUpgradeModal(true); }} activeOpacity={0.85}><UserPlus size={17} color="#fff" /><Text style={styles.btnText}>Sign Up</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, { backgroundColor: theme.colors.successDark }]} onPress={() => { setUpgradeTab('signin'); setUpgradeModal(true); }} activeOpacity={0.85}><LogIn size={17} color="#fff" /><Text style={styles.btnText}>Sign In</Text></TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.accountRow}>
                  <View style={styles.avatar}><User size={22} color={theme.colors.primary} /></View>
                  <View style={{ flex: 1 }}><Text style={styles.email}>{user?.email ?? 'Signed in'}</Text><SyncBadge status={syncStatus} /></View>
                </View>
                <View style={styles.rowDivider} />
                <TouchableOpacity style={[styles.rowBtn, { justifyContent: 'center' }]} onPress={() => setChangePwModal(true)} activeOpacity={0.7}>
                  <KeyRound size={17} color={theme.colors.primary} /><Text style={[styles.rowBtnText, { flex: 0 }]}>Change Password</Text>
                </TouchableOpacity>
                <View style={styles.rowDivider} />
                <TouchableOpacity style={[styles.rowBtn, { justifyContent: 'center' }]} onPress={handleSync} activeOpacity={0.7}>
                  <RefreshCw size={15} color={theme.colors.primary} /><Text style={[styles.rowBtnText, { flex: 0 }]}>Bidirectional Sync</Text>
                </TouchableOpacity>
                <View style={styles.rowDivider} />
                <TouchableOpacity style={[styles.rowBtn, { justifyContent: 'center' }]} onPress={() => Alert.alert('Sign Out', 'Local data will be deleted. Sync first.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign Out', style: 'destructive', onPress: signOut }])}>
                  <LogOut size={15} color={theme.colors.danger} /><Text style={[styles.rowBtnText, { flex: 0, color: theme.colors.danger }]}>Sign Out</Text>
                </TouchableOpacity>
                <View style={styles.rowDivider} /><View style={styles.dangerRow}>
                  <TouchableOpacity style={styles.dangerBtn} onPress={() => Alert.alert('Delete Data', 'All local records will be permanently deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { setDeletingLabel('Deleting data…'); try { await clearAllData(); if (mode === 'authenticated') await deleteAllData(); setSuccessLabel('All data deleted.'); } catch (e: any) { Alert.alert('Error', e.message); } finally { setDeletingLabel(null); } } }])}>
                    <Trash2 size={15} color={theme.colors.danger} /><Text style={styles.dangerBtnText}>Clear Data</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dangerBtn, { backgroundColor: theme.colors.danger }]} onPress={() => Alert.alert('Delete Account', 'Account and all data will be permanently deleted.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete Account', style: 'destructive', onPress: async () => { setDeletingLabel('Deleting account…'); try { await clearAllData(); await deleteAccount(); setSuccessLabel('Account deleted.'); } catch (e: any) { Alert.alert('Error', e.message); } finally { setDeletingLabel(null); } } }])}>
                    <X size={15} color="#fff" /><Text style={[styles.dangerBtnText, { color: '#fff' }]}>Delete Account</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </Animated.View>

        {/* Security */}
        <Animated.View entering={FadeInDown.delay(220).duration(300).springify()}>
          <Text style={styles.sectionLabel}>SECURITY</Text>
          <View style={styles.section}>
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySurface, width: 36, height: 36 }]}><Lock size={18} color={theme.colors.primary} /></View>
                <View><Text style={styles.setTitle}>App Lock (WIP)</Text><Text style={styles.setSub}>Lock when in background</Text></View>
              </View>
              <TouchableOpacity style={[styles.toggle, appLockEnabled && styles.toggleOn]} onPress={() => setAppLock(!appLockEnabled)} activeOpacity={0.8}>
                <View style={[styles.toggleThumb, appLockEnabled && styles.toggleThumbOn]} />
              </TouchableOpacity>
            </View>
            {appLockEnabled && (
              <Animated.View entering={FadeInDown.duration(200)}>
                <View style={styles.rowDivider} />
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySurface, width: 36, height: 36 }]}><Timer size={18} color={theme.colors.primary} /></View>
                    <View><Text style={styles.setTitle}>Lock After</Text><Text style={styles.setSub}>Inactivity timeout</Text></View>
                  </View>
                  <View style={styles.timeoutRow}>
                    {([0, 1, 5, 15] as LockTimeout[]).map(t => (
                      <TouchableOpacity key={t} style={[styles.timeoutBtn, lockTimeoutMin === t && styles.timeoutBtnOn]} onPress={() => setLockTimeout(t)} activeOpacity={0.7}>
                        <Text style={[styles.timeoutText, lockTimeoutMin === t && styles.timeoutTextOn]}>{t === 0 ? 'Now' : `${t}m`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.rowDivider} />
                <View style={styles.settingRow}>
                  <View style={styles.settingLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySurface, width: 36, height: 36 }]}><KeyRound size={18} color={theme.colors.primary} /></View>
                    <View><Text style={styles.setTitle}>PIN</Text><Text style={styles.setSub}>{hasPin ? 'PIN is set' : 'Set a PIN'}</Text></View>
                  </View>
                  <TouchableOpacity style={[styles.pinBtn, !hasPin && { backgroundColor: theme.colors.warningLight }]} onPress={() => { setPinSetupStep('set'); setPinSetupModal(true); }}>
                    <Text style={[styles.pinBtnText, !hasPin && { color: theme.colors.warningDark }]}>{hasPin ? 'Change' : 'Set'}</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </ScrollView>

      {isSelecting && (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <TouchableOpacity style={styles.bulkCancel} onPress={() => setSelectedIds(new Set())}><X size={15} color={theme.colors.textSecondary} /><Text style={styles.bulkCancelText}>Cancel ({selectedIds.size})</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.bulkBtn, { backgroundColor: theme.colors.dangerLight }]} onPress={handleBulkPDF} disabled={!!bulkExporting}>
            {bulkExporting ? <ActivityIndicator size="small" color={theme.colors.dangerDark} /> : <FileText size={15} color={theme.colors.dangerDark} />}
            <Text style={[styles.bulkBtnText, { color: theme.colors.dangerDark }]}>Export PDF</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={upgradeModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setUpgradeModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Back Up Your Data</Text>
            <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
            {upgradeTab === 'signup' && <TextInput style={styles.input} placeholder="Confirm Password" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry />}
            <TouchableOpacity style={styles.saveBtn} onPress={handleUpgrade} disabled={upgradeLoading}>
              {upgradeLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{upgradeTab === 'signup' ? 'Create Account' : 'Sign In'}</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={changePwModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setChangePwModal(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Change Password</Text>
            {cpError ? <Text style={styles.cpError}>{cpError}</Text> : null}
            {[{ l: 'Current Password', v: cpCurrent, s: setCpCurrent }, { l: 'New Password', v: cpNew, s: setCpNew }, { l: 'Confirm New Password', v: cpConfirm, s: setCpConfirm }].map(({ l, v, s }) => (
              <View key={l} style={{ marginBottom: 10 }}>
                <Text style={styles.cpLabel}>{l}</Text>
                <TextInput style={styles.input} value={v} onChangeText={s} secureTextEntry placeholder="••••••" placeholderTextColor={theme.colors.textPlaceholder} />
              </View>
            ))}
            <TouchableOpacity style={[styles.saveBtn, cpLoading && { opacity: 0.7 }]} onPress={handleChangePassword} disabled={cpLoading}>
              {cpLoading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PinModal visible={pinSetupModal} onClose={() => { setPinSetupModal(false); setPinSetupStep('set'); }} onSuccess={handlePinSetup} mode={pinSetupStep} error={pinSetupError} />
      <ExportModal visible={!!exportPrompt} defaultName={exportPrompt?.def ?? ''} onExport={(n) => { exportPrompt?.cb(n); setExportPrompt(null); }} onClose={() => setExportPrompt(null)} />
      <SyncModal visible={!!syncModal} progress={syncModal} onClose={() => { if (syncModal?.phase === 'complete' || syncModal?.phase === 'error') setSyncModal(null); }} />
      <SuccessToast visible={!!successLabel} message={successLabel ?? ''} onHide={() => setSuccessLabel(null)} />
      <Modal visible={!!deletingLabel} transparent animationType="fade">
        <View style={styles.modalBg}><View style={styles.deletingCard}><ActivityIndicator color={theme.colors.primary} /><Text style={{ fontWeight: '600', color: theme.colors.text }}>{deletingLabel}</Text></View></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md },
  headerTitle: { ...theme.typography.h1, color: theme.colors.textInverse },
  headerSub: { ...theme.typography.caption, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.xl, marginBottom: 8, letterSpacing: 1 },
  section: { backgroundColor: theme.colors.surface, marginHorizontal: theme.spacing.md, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: 8, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  sectionIcon: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  // Reports
  reportToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, marginHorizontal: theme.spacing.md, marginTop: 20, borderRadius: theme.borderRadius.xl, padding: 16, gap: 12, ...theme.shadows.sm, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  reportToggleTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  reportToggleSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  reportBody: { marginHorizontal: theme.spacing.md, marginTop: 8 },
  filterRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  filterChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center' },
  filterChipActive: { backgroundColor: theme.colors.primarySurface },
  filterChipText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  filterChipTextActive: { color: theme.colors.primary },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  dateBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.primarySurface, padding: 10, borderRadius: 10 },
  dateBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  reportSearch: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8, borderWidth: 1, borderColor: theme.colors.border },
  reportSearchInput: { flex: 1, fontSize: 14, color: theme.colors.text, paddingVertical: 0 },
  empty: { alignItems: 'center', padding: 28, gap: 8 },
  emptyText: { color: theme.colors.textMuted, fontSize: 13 },
  reportCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: 6, ...theme.shadows.xs, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  reportCardSel: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },
  reportCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  reportName: { fontWeight: '700', fontSize: 14, color: theme.colors.text },
  reportMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  exportRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  exportBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: 8, gap: 4 },
  exportBtnText: { fontWeight: '700', fontSize: 12 },

  // Account
  guestCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  guestTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.warningDark },
  guestSub: { fontSize: 12, color: theme.colors.warningDark },
  guestBtns: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: theme.borderRadius.lg },
  btnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  email: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  rowDivider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 8 },
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  rowBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  cpForm: { marginTop: 4, gap: 8 },
  cpError: { color: theme.colors.danger, fontSize: 12 },
  cpLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 4 },
  input: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.borderRadius.lg, alignItems: 'center', ...theme.shadows.primary },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dangerRow: { flexDirection: 'row', gap: 8 },
  dangerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.borderRadius.lg, borderWidth: 1, borderColor: theme.colors.danger },
  dangerBtnText: { fontWeight: '700', fontSize: 12, color: theme.colors.danger },

  // Security
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  setTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  setSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  toggle: { width: 48, height: 28, borderRadius: 14, backgroundColor: theme.colors.border, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: theme.colors.primary },
  toggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  timeoutRow: { flexDirection: 'row', gap: 4 },
  timeoutBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: theme.colors.surfaceAlt },
  timeoutBtnOn: { backgroundColor: theme.colors.primary },
  timeoutText: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted },
  timeoutTextOn: { color: '#fff' },
  pinBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: theme.colors.primarySurface },
  pinBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },

  // Bulk bar
  bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, padding: 16, flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: theme.colors.border, ...theme.shadows.lg },
  bulkCancel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  bulkCancelText: { fontWeight: '600', color: theme.colors.textSecondary, fontSize: 13 },
  bulkBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 10 },
  bulkBtnText: { fontWeight: '700', fontSize: 13 },

  // Modals
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { backgroundColor: theme.colors.surface, padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 20 },
  deletingCard: { backgroundColor: theme.colors.surface, padding: 28, borderRadius: theme.borderRadius.xl, alignItems: 'center', gap: 12, ...theme.shadows.lg },
});
