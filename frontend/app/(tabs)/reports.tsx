import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  ActivityIndicator, TextInput, Platform,
} from 'react-native';
import { useSQLiteContext } from '../../src/db/sqlite';
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import {
  FileSpreadsheet, FileText, GraduationCap, BarChart3,
  Calendar, Search, Users, TrendingUp, X, CheckSquare, Check, ChevronDown,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';

// ─── Types ───────────────────────────────────────────────────────────────────

type DateFilterKey = 'all' | 'this_month' | 'last_month' | 'custom';

type ClassStats = {
  id: number; name: string; division: string; subject: string;
  studentCount: number; sessionCount: number; avgPct: number;
  firstSession: string | null; lastSession: string | null;
};

type ExportRecord = {
  session_id: number; student_id: number; status: string; reason: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDateRange(filter: DateFilterKey, from: Date, to: Date): { from: string | null; to: string | null } {
  const now = new Date();
  if (filter === 'this_month')
    return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(now, 'yyyy-MM-dd') };
  if (filter === 'last_month') {
    const lm = subMonths(now, 1);
    return { from: format(startOfMonth(lm), 'yyyy-MM-dd'), to: format(endOfMonth(lm), 'yyyy-MM-dd') };
  }
  if (filter === 'custom')
    return { from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd') };
  return { from: null, to: null };
}

function fmtDate(d: string | null) {
  if (!d) return null;
  try { return format(parseISO(d), 'MMM d, yyyy'); } catch { return d; }
}

function pctColor(pct: number) {
  if (pct >= 75) return theme.colors.present;
  if (pct >= 50) return theme.colors.late;
  return theme.colors.absent;
}

function statusLabel(s: string) {
  if (s === 'present') return 'P';
  if (s === 'absent')  return 'A';
  if (s === 'late')    return 'L';
  if (s === 'excused') return 'E';
  return '-';
}

const DATE_FILTERS: { key: DateFilterKey; label: string }[] = [
  { key: 'all',        label: 'All Time'    },
  { key: 'this_month', label: 'This Month'  },
  { key: 'last_month', label: 'Last Month'  },
  { key: 'custom',     label: 'Custom'      },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();

  const [classStats, setClassStats]         = useState<ClassStats[]>([]);
  const [loading, setLoading]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [dateFilter, setDateFilter]         = useState<DateFilterKey>('all');
  const [customFrom, setCustomFrom]         = useState(() => startOfMonth(new Date()));
  const [customTo, setCustomTo]             = useState(() => new Date());
  const [showFromPicker, setShowFromPicker] = useState(false);
  const [showToPicker, setShowToPicker]     = useState(false);
  const [selectedIds, setSelectedIds]       = useState<Set<number>>(new Set());
  const [exportingId, setExportingId]       = useState<number | null>(null);
  const [exportType, setExportType]         = useState<'csv' | 'pdf' | null>(null);
  const [bulkExporting, setBulkExporting]   = useState<'csv' | 'pdf' | null>(null);

  const isSelecting = selectedIds.size > 0;

  // ─── Load stats ─────────────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    try {
      const classes = await db.getAllAsync<{ id: number; name: string; division: string; subject: string }>(
        'SELECT id, name, division, subject FROM classes ORDER BY name ASC, division ASC'
      );

      const stats: ClassStats[] = await Promise.all(classes.map(async cls => {
        const sc = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM students WHERE class_id = ?', [cls.id]
        );

        let sessQ = 'SELECT COUNT(*) as count, MIN(date) as first_session, MAX(date) as last_session FROM attendance_sessions WHERE class_id = ?';
        const sessArgs: any[] = [cls.id];
        if (from) { sessQ += ' AND date >= ?'; sessArgs.push(from); }
        if (to)   { sessQ += ' AND date <= ?'; sessArgs.push(to); }

        const sd = await db.getFirstAsync<{ count: number; first_session: string | null; last_session: string | null }>(
          sessQ, sessArgs
        );

        let avgQ = `SELECT COUNT(ar.id) as total, SUM(CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END) as present_count
          FROM attendance_sessions s LEFT JOIN attendance_records ar ON ar.session_id = s.id
          WHERE s.class_id = ?`;
        const avgArgs: any[] = [cls.id];
        if (from) { avgQ += ' AND s.date >= ?'; avgArgs.push(from); }
        if (to)   { avgQ += ' AND s.date <= ?'; avgArgs.push(to); }

        const ad = await db.getFirstAsync<{ total: number; present_count: number }>(avgQ, avgArgs);
        const avgPct = ad?.total ? Math.round((ad.present_count / ad.total) * 100) : 0;

        return {
          id: cls.id, name: cls.name, division: cls.division, subject: cls.subject,
          studentCount: sc?.count ?? 0,
          sessionCount: sd?.count ?? 0,
          avgPct,
          firstSession: sd?.first_session ?? null,
          lastSession: sd?.last_session ?? null,
        };
      }));

      setClassStats(stats);
    } finally {
      setLoading(false);
    }
  }, [db, dateFilter, customFrom, customTo]);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  // ─── Export helpers ─────────────────────────────────────────────────────

  const fetchExportData = async (classId: number) => {
    const { from, to } = getDateRange(dateFilter, customFrom, customTo);
    const classInfo = await db.getFirstAsync<{ id: number; name: string; division: string; subject: string }>(
      'SELECT * FROM classes WHERE id = ?', [classId]
    );
    if (!classInfo) throw new Error('Class not found');

    const students = await db.getAllAsync<{ id: number; roll_no: string; first_name: string; last_name: string }>(
      'SELECT id, roll_no, first_name, last_name FROM students WHERE class_id = ? ORDER BY CAST(roll_no AS INTEGER) ASC, first_name ASC',
      [classId]
    );

    let sessQ = 'SELECT id, date, time FROM attendance_sessions WHERE class_id = ?';
    const sessArgs: any[] = [classId];
    if (from) { sessQ += ' AND date >= ?'; sessArgs.push(from); }
    if (to)   { sessQ += ' AND date <= ?'; sessArgs.push(to); }
    sessQ += ' ORDER BY date ASC';
    const sessions = await db.getAllAsync<{ id: number; date: string; time: string }>(sessQ, sessArgs);

    const records: ExportRecord[] = sessions.length > 0
      ? await db.getAllAsync<ExportRecord>(
          `SELECT ar.session_id, ar.student_id, ar.status, ar.reason
           FROM attendance_records ar
           WHERE ar.session_id IN (${sessions.map(() => '?').join(',')})`,
          sessions.map(s => s.id)
        )
      : [];

    return { classInfo, students, sessions, records };
  };

  const buildCSV = (data: Awaited<ReturnType<typeof fetchExportData>>) => {
    const { classInfo, students, sessions, records } = data;
    const headers = ['Roll No', 'Name', ...sessions.map(s => s.date), 'Present', 'Total', '%'];
    const rows = students.map(st => {
      let present = 0;
      const cols = sessions.map(ses => {
        const rec = records.find(r => r.session_id === ses.id && r.student_id === st.id);
        const lbl = rec ? statusLabel(rec.status) : '-';
        if (rec && (rec.status === 'present' || rec.status === 'late')) present++;
        const cell = rec?.reason ? `${lbl} (${rec.reason})` : lbl;
        return `"${cell}"`;
      });
      const pct = sessions.length > 0 ? Math.round((present / sessions.length) * 100) : 0;
      return [`"${st.roll_no}"`, `"${st.first_name} ${st.last_name}"`, ...cols,
        `"${present}"`, `"${sessions.length}"`, `"${pct}%"`].join(',');
    });
    return [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
  };

  const buildPDFSection = (data: Awaited<ReturnType<typeof fetchExportData>>, sectionIndex: number) => {
    const { classInfo, students, sessions, records } = data;
    const statusColor: Record<string, string> = {
      P: '#16A34A', A: '#DC2626', L: '#D97706', E: '#7C3AED',
    };
    const thead = `<tr><th>#</th><th>Name</th>${sessions.map(s => `<th>${s.date}</th>`).join('')}<th>Present</th><th>%</th></tr>`;
    const tbody = students.map((st, i) => {
      let present = 0;
      const tds = sessions.map(ses => {
        const rec = records.find(r => r.session_id === ses.id && r.student_id === st.id);
        const lbl = rec ? statusLabel(rec.status) : '-';
        if (rec && (rec.status === 'present' || rec.status === 'late')) present++;
        const col = statusColor[lbl] ?? '#666';
        const title = rec?.reason ? ` title="${rec.reason}"` : '';
        return `<td style="color:${col};font-weight:700"${title}>${lbl}</td>`;
      }).join('');
      const pct = sessions.length ? Math.round((present / sessions.length) * 100) : 0;
      const pctCol = pct >= 75 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
      return `<tr><td>${st.roll_no}</td><td>${st.first_name} ${st.last_name}</td>${tds}<td>${present}/${sessions.length}</td><td style="color:${pctCol};font-weight:700">${pct}%</td></tr>`;
    }).join('');
    return `
      ${sectionIndex > 0 ? '<div style="page-break-before:always"></div>' : ''}
      <h2>${classInfo.name} — Div ${classInfo.division}${classInfo.subject ? ` · ${classInfo.subject}` : ''}</h2>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
  };

  // ─── Individual export ──────────────────────────────────────────────────

  const handleExportCSV = async (classId: number) => {
    if (exportingId) return;
    setExportingId(classId); setExportType('csv');
    try {
      const data = await fetchExportData(classId);
      if (!data.students.length || !data.sessions.length) {
        Alert.alert('No data', 'This class has no students or sessions in the selected date range.');
        return;
      }
      const csv = buildCSV(data);
      const fileName = `${data.classInfo.name} ${data.classInfo.division} - Attendance - ${format(new Date(), 'MMM d yyyy')}.csv`;
      const file = new File(Paths.document, fileName);
      file.write(csv);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
    } catch { Alert.alert('Error', 'Failed to export CSV.'); }
    finally { setExportingId(null); setExportType(null); }
  };

  const handleExportPDF = async (classId: number) => {
    if (exportingId) return;
    setExportingId(classId); setExportType('pdf');
    try {
      const data = await fetchExportData(classId);
      if (!data.students.length || !data.sessions.length) {
        Alert.alert('No data', 'This class has no students or sessions in the selected date range.');
        return;
      }
      const html = `<html><head><style>
        body{font-family:Helvetica,sans-serif;padding:24px;color:#0F172A}
        h2{color:#1E3A8A;margin:20px 0 8px;font-size:16px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border:1px solid #E2E8F0;padding:6px 8px;text-align:center}
        th{background:#EFF6FF;color:#1D4ED8;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
        tr:nth-child(even){background:#F8FAFC}
      </style></head><body>
        <h1 style="color:#1E3A8A;margin:0 0 4px;font-size:20px">Attendance Report</h1>
        ${buildPDFSection(data, 0)}
      </body></html>`;
      const pdfName = `${data.classInfo.name} ${data.classInfo.division} - Attendance - ${format(new Date(), 'MMM d yyyy')}.pdf`;
      const { uri: rawUri } = await Print.printToFileAsync({ html });
      const pdfUri = `${LegacyFS.cacheDirectory}${pdfName}`;
      await LegacyFS.copyAsync({ from: rawUri, to: pdfUri });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' });
    } catch { Alert.alert('Error', 'Failed to export PDF.'); }
    finally { setExportingId(null); setExportType(null); }
  };

  // ─── Bulk export ────────────────────────────────────────────────────────

  const handleBulkCSV = async () => {
    setBulkExporting('csv');
    try {
      const ids = Array.from(selectedIds);
      const allData = await Promise.all(ids.map(fetchExportData));
      const validData = allData.filter(d => d.students.length && d.sessions.length);
      if (!validData.length) {
        Alert.alert('No data', 'None of the selected classes have sessions in the selected date range.');
        return;
      }
      // Combined summary CSV: Class, Division, Roll, Name, Present, Total, %
      const headerRow = '"Class","Division","Roll No","Name","Present","Total","%"';
      const rows: string[] = [];
      for (const data of validData) {
        const { classInfo, students, sessions, records } = data;
        students.forEach(st => {
          let present = 0;
          sessions.forEach(ses => {
            const rec = records.find(r => r.session_id === ses.id && r.student_id === st.id);
            if (rec && (rec.status === 'present' || rec.status === 'late')) present++;
          });
          const pct = sessions.length > 0 ? Math.round((present / sessions.length) * 100) : 0;
          rows.push([`"${classInfo.name}"`, `"${classInfo.division}"`, `"${st.roll_no}"`,
            `"${st.first_name} ${st.last_name}"`, `"${present}"`, `"${sessions.length}"`, `"${pct}%"`].join(','));
        });
      }
      const csv = [headerRow, ...rows].join('\n');
      const fileName = `Combined Attendance - ${format(new Date(), 'MMM d yyyy')}.csv`;
      const file = new File(Paths.document, fileName);
      file.write(csv);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
      setSelectedIds(new Set());
    } catch { Alert.alert('Error', 'Failed to export CSV.'); }
    finally { setBulkExporting(null); }
  };

  const handleBulkPDF = async () => {
    setBulkExporting('pdf');
    try {
      const ids = Array.from(selectedIds);
      const allData = await Promise.all(ids.map(fetchExportData));
      const validData = allData.filter(d => d.students.length && d.sessions.length);
      if (!validData.length) {
        Alert.alert('No data', 'None of the selected classes have sessions in the selected date range.');
        return;
      }
      const sections = validData.map((d, i) => buildPDFSection(d, i)).join('');
      const html = `<html><head><style>
        body{font-family:Helvetica,sans-serif;padding:24px;color:#0F172A}
        h1{color:#1E3A8A;margin:0 0 20px;font-size:20px}
        h2{color:#1E3A8A;margin:20px 0 8px;font-size:16px}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th,td{border:1px solid #E2E8F0;padding:5px 7px;text-align:center}
        th{background:#EFF6FF;color:#1D4ED8;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
        tr:nth-child(even){background:#F8FAFC}
      </style></head><body>
        <h1>Attendance Report</h1>${sections}
      </body></html>`;
      const pdfName = `Combined Attendance - ${format(new Date(), 'MMM d yyyy')}.pdf`;
      const { uri: rawUri } = await Print.printToFileAsync({ html });
      const pdfUri = `${LegacyFS.cacheDirectory}${pdfName}`;
      await LegacyFS.copyAsync({ from: rawUri, to: pdfUri });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf' });
      setSelectedIds(new Set());
    } catch { Alert.alert('Error', 'Failed to export PDF.'); }
    finally { setBulkExporting(null); }
  };

  // ─── Derived data ────────────────────────────────────────────────────────

  const filtered = classStats.filter(c =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
    c.division.toLowerCase().includes(search.trim().toLowerCase()) ||
    (c.subject || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  const totalSessions = classStats.reduce((s, c) => s + c.sessionCount, 0);
  const classesWithData = classStats.filter(c => c.sessionCount > 0).length;
  const overallPct = classesWithData > 0
    ? Math.round(classStats.filter(c => c.sessionCount > 0).reduce((s, c) => s + c.avgPct, 0) / classesWithData)
    : 0;

  const { from: filterFrom, to: filterTo } = getDateRange(dateFilter, customFrom, customTo);
  const filterLabel = dateFilter === 'all' ? 'All time'
    : dateFilter === 'this_month' ? 'This month'
    : dateFilter === 'last_month' ? 'Last month'
    : `${format(customFrom, 'MMM d')} – ${format(customTo, 'MMM d, yyyy')}`;

  // ─── Render card ─────────────────────────────────────────────────────────

  const renderCard = ({ item }: { item: ClassStats }) => {
    const isSelected = selectedIds.has(item.id);
    const isExp = exportingId === item.id;
    const hasData = item.sessionCount > 0;
    const col = hasData ? pctColor(item.avgPct) : theme.colors.textMuted;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => setSelectedIds(prev => {
          const next = new Set(prev); next.add(item.id); return next;
        })}
        onPress={() => {
          if (isSelecting) {
            setSelectedIds(prev => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
              return next;
            });
          }
        }}
      >
        <View style={[styles.card, isSelected && styles.cardSelected]}>
          {/* Card header */}
          <View style={styles.cardHeader}>
            <View style={[styles.cardIconBox, isSelected && { backgroundColor: theme.colors.primary }]}>
              {isSelected
                ? <Check size={18} color="#fff" strokeWidth={2.5} />
                : <GraduationCap size={18} color={theme.colors.primary} />}
            </View>
            <View style={styles.cardTitleBlock}>
              <View style={styles.cardNameRow}>
                <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.divBadge}>
                  <Text style={styles.divBadgeText}>Div {item.division}</Text>
                </View>
              </View>
              {item.subject ? <Text style={styles.cardSubject} numberOfLines={1}>{item.subject}</Text> : null}
            </View>
            {isExp && <ActivityIndicator size="small" color={theme.colors.primary} />}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <Users size={12} color={theme.colors.textMuted} />
              <Text style={styles.statChipText}>{item.studentCount} students</Text>
            </View>
            <View style={styles.statChip}>
              <Calendar size={12} color={theme.colors.textMuted} />
              <Text style={styles.statChipText}>{item.sessionCount} sessions</Text>
            </View>
            {hasData && (
              <View style={[styles.statChip, { backgroundColor: pctColor(item.avgPct) + '18' }]}>
                <TrendingUp size={12} color={col} />
                <Text style={[styles.statChipText, { color: col, fontWeight: '700' }]}>{item.avgPct}% avg</Text>
              </View>
            )}
          </View>

          {/* Session date range */}
          {hasData
            ? <Text style={styles.dateRange}>{fmtDate(item.firstSession)} – {fmtDate(item.lastSession)}</Text>
            : <Text style={styles.noData}>No sessions in this period</Text>}

          {/* Export buttons */}
          {!isSelecting && (
            <View style={styles.exportRow}>
              <TouchableOpacity
                style={[styles.exportBtn, !hasData && styles.exportBtnDisabled, { backgroundColor: theme.colors.successLight }]}
                onPress={() => handleExportCSV(item.id)}
                disabled={!!exportingId || !hasData}
                activeOpacity={0.75}
              >
                <FileSpreadsheet size={16} color={hasData ? theme.colors.successDark : theme.colors.textMuted} />
                <Text style={[styles.exportLabel, { color: hasData ? theme.colors.successDark : theme.colors.textMuted }]}>
                  {isExp && exportType === 'csv' ? 'Exporting…' : 'CSV'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.exportBtn, !hasData && styles.exportBtnDisabled, { backgroundColor: theme.colors.dangerLight }]}
                onPress={() => handleExportPDF(item.id)}
                disabled={!!exportingId || !hasData}
                activeOpacity={0.75}
              >
                <FileText size={16} color={hasData ? theme.colors.dangerDark : theme.colors.textMuted} />
                <Text style={[styles.exportLabel, { color: hasData ? theme.colors.dangerDark : theme.colors.textMuted }]}>
                  {isExp && exportType === 'pdf' ? 'Exporting…' : 'PDF'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroIconBox}>
            <BarChart3 size={20} color={theme.colors.textInverse} strokeWidth={2.5} />
          </View>
          <View style={styles.heroTitleBlock}>
            <Text style={styles.heroTitle}>Reports</Text>
            <Text style={styles.heroSub}>{filterLabel}</Text>
          </View>
        </View>
        <View style={styles.statsStrip}>
          {[
            { label: 'Classes',  value: classStats.length },
            { label: 'Sessions', value: totalSessions },
            { label: 'Avg',      value: classesWithData > 0 ? `${overallPct}%` : '–',
              color: classesWithData > 0 ? pctColor(overallPct) : undefined },
          ].map((s, i) => (
            <View key={s.label} style={[styles.stripStat, i > 0 && styles.stripStatBorder]}>
              <Text style={[styles.stripValue, s.color ? { color: s.color } : null]}>{s.value}</Text>
              <Text style={styles.stripLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Date filter tabs */}
      <View style={styles.filterSection}>
        <View style={styles.filterTabs}>
          {DATE_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterTab, dateFilter === f.key && styles.filterTabActive]}
              onPress={() => setDateFilter(f.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterTabText, dateFilter === f.key && styles.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom date range row */}
        {dateFilter === 'custom' && (
          <View style={styles.customDateRow}>
            <TouchableOpacity style={styles.datePill} onPress={() => setShowFromPicker(true)} activeOpacity={0.75}>
              <Calendar size={13} color={theme.colors.primary} />
              <Text style={styles.datePillText}>{format(customFrom, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
            <ChevronDown size={14} color={theme.colors.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
            <TouchableOpacity style={styles.datePill} onPress={() => setShowToPicker(true)} activeOpacity={0.75}>
              <Calendar size={13} color={theme.colors.primary} />
              <Text style={styles.datePillText}>{format(customTo, 'MMM d, yyyy')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {showFromPicker && (
        <DateTimePicker value={customFrom} mode="date" display="default"
          onChange={(_, d) => { setShowFromPicker(Platform.OS === 'ios'); if (d) setCustomFrom(d); }} />
      )}
      {showToPicker && (
        <DateTimePicker value={customTo} mode="date" display="default"
          onChange={(_, d) => { setShowToPicker(Platform.OS === 'ios'); if (d) setCustomTo(d); }} />
      )}

      {/* List */}
      {loading && classStats.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : classStats.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <BarChart3 size={36} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No classes yet</Text>
          <Text style={styles.emptyText}>Create a class and record attendance to generate reports.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, theme.spacing.md) + (isSelecting ? 80 : 0) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Search size={15} color={theme.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search classes…"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={15} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptySearch}>
              <Text style={styles.emptySearchText}>No classes match "{search}"</Text>
            </View>
          }
          renderItem={renderCard}
        />
      )}

      {/* Bulk action bar */}
      {isSelecting && (
        <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
          <View style={styles.bulkTopRow}>
            <TouchableOpacity style={styles.bulkCancel} onPress={() => setSelectedIds(new Set())}>
              <X size={16} color={theme.colors.textSecondary} />
              <Text style={styles.bulkCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.bulkSelectAll} onPress={() => {
              if (selectedIds.size === filtered.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(filtered.map(c => c.id)));
            }}>
              <CheckSquare size={16} color={theme.colors.primary} />
              <Text style={styles.bulkSelectAllText}>
                {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'} ({selectedIds.size})
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.bulkActions}>
            <TouchableOpacity
              style={[styles.bulkBtn, { backgroundColor: theme.colors.successLight }]}
              onPress={handleBulkCSV}
              disabled={!!bulkExporting}
              activeOpacity={0.8}
            >
              {bulkExporting === 'csv'
                ? <ActivityIndicator size="small" color={theme.colors.successDark} />
                : <FileSpreadsheet size={16} color={theme.colors.successDark} />}
              <Text style={[styles.bulkBtnText, { color: theme.colors.successDark }]}>
                {bulkExporting === 'csv' ? 'Exporting…' : 'Export CSV'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bulkBtn, { backgroundColor: theme.colors.dangerLight }]}
              onPress={handleBulkPDF}
              disabled={!!bulkExporting}
              activeOpacity={0.8}
            >
              {bulkExporting === 'pdf'
                ? <ActivityIndicator size="small" color={theme.colors.dangerDark} />
                : <FileText size={16} color={theme.colors.dangerDark} />}
              <Text style={[styles.bulkBtnText, { color: theme.colors.dangerDark }]}>
                {bulkExporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // Hero
  hero: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  heroIconBox: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  heroTitleBlock: { flex: 1 },
  heroTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  statsStrip: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.borderRadius.lg, overflow: 'hidden',
  },
  stripStat: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  stripStatBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)' },
  stripValue: { fontSize: 20, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.5 },
  stripLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '600' },

  // Filter
  filterSection: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  filterTabs: { flexDirection: 'row', gap: 6 },
  filterTab: {
    flex: 1, paddingVertical: 7, borderRadius: theme.borderRadius.md,
    alignItems: 'center', backgroundColor: theme.colors.surfaceAlt,
  },
  filterTabActive: { backgroundColor: theme.colors.primarySurface },
  filterTabText: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  filterTabTextActive: { color: theme.colors.primary },
  customDateRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  datePill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.colors.primarySurface,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.borderRadius.md,
  },
  datePillText: { flex: 1, fontSize: 12, fontWeight: '700', color: theme.colors.primary },

  // List
  listContent: { padding: theme.spacing.md, gap: theme.spacing.sm },
  searchRow: { marginBottom: theme.spacing.sm },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: 10,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text },
  emptySearch: { alignItems: 'center', paddingVertical: theme.spacing.xxl },
  emptySearchText: { fontSize: 14, color: theme.colors.textMuted, fontWeight: '500' },

  // Card
  card: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md, borderWidth: 1.5, borderColor: 'transparent',
    ...theme.shadows.sm,
  },
  cardSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  cardIconBox: {
    width: 38, height: 38, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  cardTitleBlock: { flex: 1 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.colors.text, flex: 1 },
  divBadge: {
    backgroundColor: theme.colors.primarySurface, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: theme.borderRadius.full,
  },
  divBadgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  cardSubject: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500', marginTop: 2 },

  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.colors.surfaceAlt, paddingHorizontal: 8,
    paddingVertical: 4, borderRadius: theme.borderRadius.full,
  },
  statChipText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },

  dateRange: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500', marginBottom: theme.spacing.md },
  noData: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', marginBottom: theme.spacing.md },

  exportRow: { flexDirection: 'row', gap: theme.spacing.sm },
  exportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: theme.borderRadius.md, gap: 6,
  },
  exportBtnDisabled: { opacity: 0.5 },
  exportLabel: { fontSize: 13, fontWeight: '700' },

  // States
  loadingState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: theme.spacing.xxl, marginTop: -60,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text, marginBottom: 6 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Bulk bar
  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: theme.colors.surface, borderTopWidth: 1,
    borderTopColor: theme.colors.border, paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm, ...theme.shadows.lg,
  },
  bulkTopRow: { flexDirection: 'row', gap: theme.spacing.sm },
  bulkCancel: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  bulkCancelText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  bulkSelectAll: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md, paddingVertical: 10,
  },
  bulkSelectAllText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  bulkActions: { flexDirection: 'row', gap: theme.spacing.sm },
  bulkBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderRadius: theme.borderRadius.md, paddingVertical: 11,
  },
  bulkBtnText: { fontSize: 13, fontWeight: '700' },
});
