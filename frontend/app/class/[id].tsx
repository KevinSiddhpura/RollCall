import {
  View, Text, StyleSheet, TouchableOpacity, Alert, FlatList,
  Modal, ScrollView, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSQLiteContext } from '../../src/db/sqlite';
import { useState, useCallback } from 'react';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import {
  ArrowLeft, ClipboardCheck, UserPlus, FileDown, FileUp, FileText, Trash2,
  Users, Check, X, CheckSquare,
  CalendarDays, Pencil, Info,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import Papa from 'papaparse';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { format, parseISO } from 'date-fns';

type StudentItem = {
  id: number; first_name: string; middle_name: string; last_name: string;
  roll_no: string; enrollment_no: string; index_no: string; notes: string;
  present_count: number; total_sessions: number;
};

type SessionItem = {
  id: number; date: string; time: string;
  total_students: number; present_count: number;
  absent_count: number; late_count: number; excused_count: number;
};

type Tab = 'roster' | 'sessions';

function formatDate(d: string) {
  try { return format(parseISO(d), 'EEE, MMM d, yyyy'); } catch { return d; }
}

function pctColor(pct: number) {
  if (pct >= 75) return theme.colors.present;
  if (pct >= 50) return theme.colors.late;
  return theme.colors.absent;
}

export default function ClassDetailsScreen() {
  const { id } = useLocalSearchParams();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [classInfo, setClassInfo] = useState<any>(null);
  const [students, setStudents] = useState<StudentItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('roster');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [csvModalVisible, setCsvModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editFocused, setEditFocused] = useState<string | null>(null);

  const isSelecting = selectedIds.size > 0;
  const classId = Number(id);

  const loadData = useCallback(async () => {
    const cls = await db.getFirstAsync('SELECT * FROM classes WHERE id = ?', [classId]);
    setClassInfo(cls);

    const studs = await db.getAllAsync<StudentItem>(`
      SELECT s.id, s.first_name, s.middle_name, s.last_name, s.roll_no, s.enrollment_no, s.index_no, s.notes,
        (SELECT COUNT(*) FROM attendance_records ar
         JOIN attendance_sessions a_s ON ar.session_id = a_s.id
         WHERE ar.student_id = s.id AND a_s.class_id = ? AND ar.status IN ('present','late')) as present_count,
        (SELECT COUNT(*) FROM attendance_sessions WHERE class_id = ?) as total_sessions
      FROM students s WHERE s.class_id = ?
      ORDER BY CAST(s.roll_no AS INTEGER) ASC, s.first_name ASC
    `, [classId, classId, classId]);
    setStudents(studs);

    const sess = await db.getAllAsync<SessionItem>(`
      SELECT s.id, s.date, s.time,
        COUNT(ar.id) as total_students,
        SUM(CASE WHEN ar.status='present' THEN 1 ELSE 0 END) as present_count,
        SUM(CASE WHEN ar.status='absent' THEN 1 ELSE 0 END) as absent_count,
        SUM(CASE WHEN ar.status='late' THEN 1 ELSE 0 END) as late_count,
        SUM(CASE WHEN ar.status='excused' THEN 1 ELSE 0 END) as excused_count
      FROM attendance_sessions s
      LEFT JOIN attendance_records ar ON ar.session_id = s.id
      WHERE s.class_id = ?
      GROUP BY s.id ORDER BY s.date DESC
    `, [classId]);
    setSessions(sess);
  }, [classId, db]);

  useFocusEffect(useCallback(() => { if (id) loadData(); }, [id, loadData]));

  // ─── Stats ───
  const totalSessions = students.length > 0 ? students[0].total_sessions : 0;
  const totalPresent = students.reduce((a, s) => a + s.present_count, 0);
  const avgPct = students.length > 0 && totalSessions > 0
    ? Math.round((totalPresent / (students.length * totalSessions)) * 100) : 0;

  // ─── Multi-select helpers ───
  const toggleSelect = (sid: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const openEditModal = () => {
    setEditName(classInfo.name || '');
    setEditDivision(classInfo.division || '');
    setEditSubject(classInfo.subject || '');
    setEditFocused(null);
    setEditModalVisible(true);
  };

  const handleSaveClass = async () => {
    if (!editName.trim()) { Alert.alert('Required', 'Class name is required.'); return; }
    if (!editDivision.trim()) { Alert.alert('Required', 'Division is required.'); return; }
    try {
      await db.runAsync(
        'UPDATE classes SET name = ?, division = ?, subject = ? WHERE id = ?',
        [editName.trim(), editDivision.trim(), editSubject.trim(), classId]
      );
      setEditModalVisible(false);
      loadData();
    } catch {
      Alert.alert('Error', 'Failed to update class.');
    }
  };

  const handleBulkDelete = () => {
    Alert.alert(
      `Delete ${selectedIds.size} Student${selectedIds.size > 1 ? 's' : ''}`,
      'This will also remove their attendance records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            await Promise.all(Array.from(selectedIds).map(sid =>
              db.runAsync('DELETE FROM students WHERE id = ?', [sid])
            ));
            clearSelection();
            loadData();
          },
        },
      ]
    );
  };

  const handleDeleteStudent = (sid: number, name: string) => {
    Alert.alert('Delete Student', `Remove "${name}" and all their attendance records?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await db.runAsync('DELETE FROM students WHERE id = ?', [sid]);
          loadData();
        },
      },
    ]);
  };

  // ─── CSV Import ───
  const handleImportCSV = async () => {
    setCsvModalVisible(false);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.length) {
        const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
        Papa.parse(content, {
          header: true, skipEmptyLines: true,
          complete: async (parsed) => {
            if (!parsed.data?.length) { Alert.alert('Warning', 'No data found in CSV.'); return; }
            try {
              const existing = await db.getAllAsync<{ index_no: string }>(
                'SELECT index_no FROM students WHERE class_id = ? AND index_no IS NOT NULL AND index_no != ""',
                [classId]
              );
              let maxIdx = existing.reduce((m, r) => Math.max(m, parseInt(r.index_no, 10) || 0), 0);

              let imported = 0;
              let skipped = 0;
              for (const row of parsed.data as any[]) {
                const firstName = (row.first_name || row.firstName || row.FirstName || '').trim();
                const lastName = (row.last_name || row.lastName || row.LastName || '').trim();
                if (!firstName || !lastName) continue;

                const middleName = (row.middle_name || row.middleName || '').trim();
                const rollNo = (row.roll_no || row.rollNo || row.RollNo || '-').trim().toUpperCase();
                const enrollmentNo = (row.enrollment_no || row.enrollmentNo || '-').trim();
                let indexNo = (row.index_no || row.indexNo || '').trim();
                if (!indexNo) { maxIdx++; indexNo = String(maxIdx); }
                const notes = (row.reason || row.notes || '').trim();

                // Duplicate check
                const dup = await db.getFirstAsync<{ count: number }>(
                  `SELECT COUNT(*) as count FROM students WHERE class_id = ?
                   AND ((roll_no = ? AND roll_no != '-') OR (enrollment_no = ? AND enrollment_no != '-'))`,
                  [classId, rollNo, enrollmentNo]
                );
                if (dup && dup.count > 0) { skipped++; continue; }

                await db.runAsync(
                  `INSERT INTO students (class_id, first_name, middle_name, last_name, roll_no, enrollment_no, index_no, notes)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [classId, firstName, middleName, lastName, rollNo, enrollmentNo, indexNo, notes]
                );
                imported++;
              }
              Alert.alert('Import Complete', `${imported} student${imported !== 1 ? 's' : ''} imported${skipped > 0 ? `, ${skipped} skipped (duplicates)` : ''}.`);
              loadData();
            } catch (err) {
              Alert.alert('Error', 'Failed to insert students.');
            }
          },
          error: (err: any) => Alert.alert('Parse Error', err.message),
        });
      }
    } catch {
      Alert.alert('Error', 'Failed to read file.');
    }
  };

  // ─── CSV Export (shared helper) ───
  const exportStudentsAsCSV = async (subset: StudentItem[]) => {
    try {
      const rows = subset.map(s => ({
        first_name: s.first_name,
        middle_name: s.middle_name || '',
        last_name: s.last_name,
        roll_no: s.roll_no || '-',
        enrollment_no: s.enrollment_no || '-',
        index_no: s.index_no || '',
        reason: s.notes || '',
      }));
      const csv = Papa.unparse(rows);
      const filename = `${classInfo.name} ${classInfo.division} - Roster - ${format(new Date(), 'MMM d yyyy')}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { Alert.alert('Error', 'Sharing is not available on this device.'); return; }
      await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Student Roster' });
    } catch {
      Alert.alert('Error', 'Failed to export CSV.');
    }
  };

  const exportStudentsAsPDF = async (subset: StudentItem[]) => {
    try {
      const now = new Date();
      const exportDate = format(now, 'MMM d, yyyy · hh:mm a');
      const rows = subset.map((s, i) => {
        const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ');
        const pct = s.total_sessions > 0
          ? Math.round((s.present_count / s.total_sessions) * 100) : null;
        const pctCol = pct === null ? '#64748B' : pct >= 75 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
        return `<tr>
          <td>${i + 1}</td>
          <td style="text-align:left">${fullName}</td>
          <td>${s.roll_no && s.roll_no !== '-' ? s.roll_no : '–'}</td>
          <td>${s.enrollment_no && s.enrollment_no !== '-' ? s.enrollment_no : '–'}</td>
          <td style="color:${pctCol};font-weight:700">${pct !== null ? `${pct}%` : '–'}</td>
          <td style="text-align:left;color:#64748B">${s.notes || ''}</td>
        </tr>`;
      }).join('');
      const html = `<html><head><style>
        body{font-family:Helvetica,sans-serif;padding:24px;color:#0F172A}
        h1{color:#1E3A8A;margin:0 0 4px;font-size:20px}
        h3{color:#475569;margin:0 0 4px;font-size:13px;font-weight:500}
        p{color:#94A3B8;font-size:11px;margin:0 0 20px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border:1px solid #E2E8F0;padding:7px 10px;text-align:center}
        th{background:#EFF6FF;color:#1D4ED8;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
        tr:nth-child(even){background:#F8FAFC}
      </style></head><body>
        <h1>Student Roster</h1>
        <h3>${classInfo.name} — Div ${classInfo.division}${classInfo.subject ? ` · ${classInfo.subject}` : ''}</h3>
        <p>Exported ${exportDate} · ${subset.length} student${subset.length !== 1 ? 's' : ''}</p>
        <table><thead>
          <tr><th>#</th><th>Name</th><th>Roll No</th><th>Enrollment No</th><th>Attendance</th><th>Notes</th></tr>
        </thead><tbody>${rows}</tbody></table>
      </body></html>`;
      const pdfFilename = `${classInfo.name} ${classInfo.division} - Roster - ${format(new Date(), 'MMM d yyyy')}.pdf`;
      const { uri: rawUri } = await Print.printToFileAsync({ html });
      const pdfUri = `${FileSystem.cacheDirectory}${pdfFilename}`;
      await FileSystem.copyAsync({ from: rawUri, to: pdfUri });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) { Alert.alert('Error', 'Sharing is not available on this device.'); return; }
      await Sharing.shareAsync(pdfUri, { mimeType: 'application/pdf', dialogTitle: 'Export Student Roster' });
    } catch {
      Alert.alert('Error', 'Failed to export PDF.');
    }
  };

  const handleExportSelected = () => {
    const subset = students.filter(s => selectedIds.has(s.id));
    if (!subset.length) return;
    Alert.alert(
      `Export ${subset.length} Student${subset.length !== 1 ? 's' : ''}`,
      'Choose export format',
      [
        { text: 'CSV', onPress: () => { clearSelection(); exportStudentsAsCSV(subset); } },
        { text: 'PDF', onPress: () => { clearSelection(); exportStudentsAsPDF(subset); } },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleExportCSV = () => {
    setCsvModalVisible(false);
    if (students.length === 0) {
      Alert.alert('Nothing to Export', 'Add students to this class before exporting.');
      return;
    }
    exportStudentsAsCSV(students);
  };

  const handleExportPDF = () => {
    setCsvModalVisible(false);
    if (students.length === 0) {
      Alert.alert('Nothing to Export', 'Add students to this class before exporting.');
      return;
    }
    exportStudentsAsPDF(students);
  };

  const handleDeleteSession = (sessionId: number, date: string) => {
    Alert.alert('Delete Session', `Delete attendance session for ${formatDate(date)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await db.runAsync('DELETE FROM attendance_sessions WHERE id = ?', [sessionId]);
          loadData();
        },
      },
    ]);
  };

  if (!classInfo) {
    return <View style={styles.container} />;
  }

  // ─── Student card ───
  const renderStudent = ({ item, index }: { item: StudentItem; index: number }) => {
    const isSelected = selectedIds.has(item.id);
    const pct = item.total_sessions > 0
      ? Math.round((item.present_count / item.total_sessions) * 100) : null;
    const fullName = [item.first_name, item.middle_name, item.last_name].filter(Boolean).join(' ');
    const accentColor = pct === null ? theme.colors.border : pctColor(pct);
    const identifier = item.enrollment_no && item.enrollment_no !== '-'
      ? `Enr ${item.enrollment_no}`
      : item.roll_no && item.roll_no !== '-' ? `Roll ${item.roll_no}` : null;

    return (
      <TouchableOpacity
        style={[styles.studentRow, isSelected && styles.studentRowSelected]}
        onPress={() => isSelecting ? toggleSelect(item.id) : router.push(`/student/${item.id}`)}
        onLongPress={() => { setSelectedIds(prev => new Set([...prev, item.id])); }}
        activeOpacity={0.75} delayLongPress={300}
      >
        {/* Left accent — widens to show check when selected */}
        <View style={[styles.accentBar, { backgroundColor: isSelected ? theme.colors.primary : accentColor }]}>
          {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
        </View>

        {/* Index bubble */}
        <View style={[styles.indexBubble, isSelected && { backgroundColor: theme.colors.primary }]}>
          {isSelected
            ? <Check size={10} color="#fff" strokeWidth={3} />
            : <Text style={styles.indexNum}>{index + 1}</Text>}
        </View>

        {/* Main content */}
        <View style={styles.studentInfo}>
          <View style={styles.studentTopRow}>
            <Text style={styles.studentName} numberOfLines={1}>{fullName}</Text>
            {pct !== null
              ? <Text style={[styles.pctText, { color: accentColor }]}>{pct}%</Text>
              : <Text style={styles.noPct}>–</Text>}
          </View>
          <View style={styles.studentBottomRow}>
            {identifier
              ? <Text style={styles.studentMeta}>{identifier}</Text>
              : <Text style={styles.studentMeta}>–</Text>}
            {item.total_sessions > 0 && (
              <View style={styles.miniBarBg}>
                <View style={[styles.miniBarFill, { width: `${pct ?? 0}%`, backgroundColor: accentColor }]} />
              </View>
            )}
          </View>
        </View>

        {/* Actions */}
        {!isSelecting && (
          <View style={styles.rowActions}>
            <TouchableOpacity
              onPress={() => router.push(`/class/${classId}/add-student?studentId=${item.id}`)}
              style={styles.rowActionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Pencil size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteStudent(item.id, fullName)}
              style={styles.rowActionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Trash2 size={14} color={theme.colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── Session card ───
  const renderSession = ({ item, index }: { item: SessionItem; index: number }) => {
    const sessionNo = sessions.length - index;
    const attendedPct = item.total_students > 0
      ? Math.round(((item.present_count + item.late_count) / item.total_students) * 100) : 0;
    const col = pctColor(attendedPct);
    return (
      <View style={styles.sessionRow}>
        <View style={styles.sessionLeft}>
          <View style={styles.sessionDateRow}>
            <View style={styles.sessionIndexBubble}>
              <Text style={styles.sessionIndexText}>#{sessionNo}</Text>
            </View>
            <Text style={styles.sessionDate}>{formatDate(item.date)}</Text>
          </View>
          <View style={styles.sessionPills}>
            <View style={[styles.pill, { backgroundColor: theme.colors.presentLight }]}>
              <Text style={[styles.pillText, { color: theme.colors.present }]}>P {item.present_count}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: theme.colors.absentLight }]}>
              <Text style={[styles.pillText, { color: theme.colors.absent }]}>A {item.absent_count}</Text>
            </View>
            {item.late_count > 0 && (
              <View style={[styles.pill, { backgroundColor: theme.colors.lateLight }]}>
                <Text style={[styles.pillText, { color: theme.colors.late }]}>L {item.late_count}</Text>
              </View>
            )}
            {item.excused_count > 0 && (
              <View style={[styles.pill, { backgroundColor: theme.colors.excusedLight }]}>
                <Text style={[styles.pillText, { color: theme.colors.excused }]}>E {item.excused_count}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.sessionRight}>
          <Text style={[styles.sessionPct, { color: col }]}>{attendedPct}%</Text>
          <View style={styles.sessionBtns}>
            <TouchableOpacity
              style={styles.editSessionBtn}
              onPress={() => router.push(`/class/${classId}/take-attendance?sessionId=${item.id}`)}
            >
              <Pencil size={14} color={theme.colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteSessionBtn}
              onPress={() => handleDeleteSession(item.id, item.date)}
            >
              <Trash2 size={14} color={theme.colors.danger} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ─── Hero Header ─── */}
      <View style={styles.hero}>
        {/* Nav row: back + class name + division */}
        <View style={styles.heroTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <ArrowLeft size={22} color={theme.colors.textInverse} strokeWidth={2.5} />
          </TouchableOpacity>
          <View style={styles.heroTitleBlock}>
            <Text style={styles.heroName} numberOfLines={1}>{classInfo.name}</Text>
            <View style={styles.heroBadges}>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>Div {classInfo.division}</Text>
              </View>
              {classInfo.subject ? (
                <Text style={styles.heroSubject} numberOfLines={1}>{classInfo.subject}</Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity style={styles.heroIconBadge} onPress={openEditModal} activeOpacity={0.7}>
            <Pencil size={16} color={theme.colors.textInverse} />
          </TouchableOpacity>
        </View>

        {/* Stats strip */}
        <View style={styles.statsStrip}>
          {[
            { label: 'Students', value: students.length },
            { label: 'Sessions', value: totalSessions },
            { label: 'Avg Present', value: totalSessions > 0 ? `${avgPct}%` : '–', color: totalSessions > 0 ? pctColor(avgPct) : undefined },
          ].map((stat, i) => (
            <View key={stat.label} style={[styles.stripStat, i > 0 && styles.stripStatBorder]}>
              <Text style={[styles.stripValue, stat.color ? { color: stat.color } : null]}>
                {stat.value}
              </Text>
              <Text style={styles.stripLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ─── Segmented Tabs ─── */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'roster' && styles.tabBtnActive]}
          onPress={() => { setActiveTab('roster'); clearSelection(); }}
          activeOpacity={0.8}
        >
          <Users size={15} color={activeTab === 'roster' ? theme.colors.primary : theme.colors.textMuted} strokeWidth={2.5} />
          <Text style={[styles.tabBtnText, activeTab === 'roster' && styles.tabBtnTextActive]}>
            Roster ({students.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'sessions' && styles.tabBtnActive]}
          onPress={() => { setActiveTab('sessions'); clearSelection(); }}
          activeOpacity={0.8}
        >
          <CalendarDays size={15} color={activeTab === 'sessions' ? theme.colors.primary : theme.colors.textMuted} strokeWidth={2.5} />
          <Text style={[styles.tabBtnText, activeTab === 'sessions' && styles.tabBtnTextActive]}>
            Sessions ({sessions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Content ─── */}
      {activeTab === 'roster' ? (
        <>
          {students.length === 0 ? (
            <View style={styles.emptyState}>
              <Users size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No students yet</Text>
              <Text style={styles.emptyText}>Add students manually or import a CSV roster.</Text>
            </View>
          ) : (
            <FlatList
              data={students}
              keyExtractor={item => item.id.toString()}
              renderItem={renderStudent}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Multi-select bar */}
          {isSelecting && (
            <View style={[styles.bulkBar, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
              <View style={styles.bulkTopRow}>
                <TouchableOpacity style={styles.bulkCancel} onPress={clearSelection}>
                  <X size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.bulkCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bulkSelectAllBtn} onPress={() => {
                  if (selectedIds.size === students.length) clearSelection();
                  else setSelectedIds(new Set(students.map(s => s.id)));
                }}>
                  <CheckSquare size={16} color={theme.colors.primary} />
                  <Text style={styles.bulkSelectAllText}>
                    {selectedIds.size === students.length ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.bulkBottomRow}>
                <TouchableOpacity style={styles.bulkExportBtn} onPress={handleExportSelected}>
                  <FileUp size={16} color={theme.colors.textInverse} />
                  <Text style={styles.bulkExportText}>Export ({selectedIds.size})</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bulkDeleteBtn} onPress={handleBulkDelete}>
                  <Trash2 size={16} color={theme.colors.textInverse} />
                  <Text style={styles.bulkDeleteText}>Delete ({selectedIds.size})</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      ) : (
        <>
          {sessions.length === 0 ? (
            <View style={styles.emptyState}>
              <CalendarDays size={36} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No sessions yet</Text>
              <Text style={styles.emptyText}>Take attendance to record the first session.</Text>
            </View>
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={item => item.id.toString()}
              renderItem={renderSession}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </>
      )}

      {/* ─── Bottom Action Bar ─── */}
      {!isSelecting && (
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}>
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={() => router.push(`/class/${classId}/take-attendance`)}
            activeOpacity={0.85}
          >
            <ClipboardCheck size={20} color={theme.colors.textInverse} strokeWidth={2.5} />
            <Text style={styles.primaryActionText}>Take Attendance</Text>
          </TouchableOpacity>
          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={styles.secBtn}
              onPress={() => router.push(`/class/${classId}/add-student`)}
              activeOpacity={0.75}
            >
              <UserPlus size={18} color={theme.colors.primary} strokeWidth={2} />
              <Text style={styles.secBtnText}>Add Student</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secBtn}
              onPress={() => setCsvModalVisible(true)}
              activeOpacity={0.75}
            >
              <FileDown size={18} color={theme.colors.primary} strokeWidth={2} />
              <Text style={styles.secBtnText}>Import/Export</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Edit Class Modal ─── */}
      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={() => setEditModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}>
                <View style={styles.modalHandle} />
                <View style={styles.modalHeader}>
                  <View style={styles.modalIconBox}>
                    <Pencil size={20} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.modalTitle}>Edit Class</Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)} style={styles.modalCloseBtn}>
                    <X size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.editLabel}>Class Name / Grade <Text style={styles.editRequired}>*</Text></Text>
                <TextInput
                  style={[styles.editInput, editFocused === 'name' && styles.editInputFocused]}
                  placeholder="e.g. 10th Grade, Class A"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={editName}
                  onChangeText={setEditName}
                  onFocus={() => setEditFocused('name')}
                  onBlur={() => setEditFocused(null)}
                />

                <Text style={styles.editLabel}>Division / Section <Text style={styles.editRequired}>*</Text></Text>
                <TextInput
                  style={[styles.editInput, editFocused === 'division' && styles.editInputFocused]}
                  placeholder="e.g. A, B, Science"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={editDivision}
                  onChangeText={setEditDivision}
                  onFocus={() => setEditFocused('division')}
                  onBlur={() => setEditFocused(null)}
                />

                <Text style={styles.editLabel}>Subject <Text style={styles.editOptional}>(optional)</Text></Text>
                <TextInput
                  style={[styles.editInput, editFocused === 'subject' && styles.editInputFocused]}
                  placeholder="e.g. Mathematics, Physics"
                  placeholderTextColor={theme.colors.textPlaceholder}
                  value={editSubject}
                  onChangeText={setEditSubject}
                  onFocus={() => setEditFocused('subject')}
                  onBlur={() => setEditFocused(null)}
                />

                <TouchableOpacity style={[styles.chooseFileBtn, { marginTop: theme.spacing.lg }]} onPress={handleSaveClass} activeOpacity={0.85}>
                  <Check size={20} color={theme.colors.textInverse} />
                  <Text style={styles.chooseFileBtnText}>Save Changes</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setEditModalVisible(false)}>
                  <Text style={styles.cancelModalText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── CSV Import/Export Modal ─── */}
      <Modal visible={csvModalVisible} transparent animationType="slide" onRequestClose={() => setCsvModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalScrollView}
            contentContainerStyle={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.lg) }]}
            bounces={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <Info size={20} color={theme.colors.primary} />
              </View>
              <Text style={styles.modalTitle}>Import / Export CSV</Text>
              <TouchableOpacity onPress={() => setCsvModalVisible(false)} style={styles.modalCloseBtn}>
                <X size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Export section */}
            <View style={styles.csvSection}>
              <Text style={styles.csvSectionTitle}>Export</Text>
              <Text style={styles.modalDesc}>
                Download the full student roster. Choose your preferred format.
              </Text>
              <View style={styles.exportFormatRow}>
                <TouchableOpacity style={[styles.exportFormatBtn, styles.exportFormatBtnCSV]} onPress={handleExportCSV} activeOpacity={0.85}>
                  <FileUp size={18} color={theme.colors.textInverse} />
                  <Text style={styles.exportFormatBtnText}>CSV</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.exportFormatBtn, styles.exportFormatBtnPDF]} onPress={handleExportPDF} activeOpacity={0.85}>
                  <FileText size={18} color={theme.colors.textInverse} />
                  <Text style={styles.exportFormatBtnText}>PDF</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalDivider} />

            {/* Import section */}
            <View style={styles.csvSection}>
              <Text style={styles.csvSectionTitle}>Import</Text>
              <Text style={styles.modalDesc}>
                Your CSV file must have a header row. Column names are flexible — the following formats are accepted:
              </Text>

              <View style={styles.fieldList}>
                {[
                  { key: 'first_name', alts: 'firstName, FirstName', required: true },
                  { key: 'last_name', alts: 'lastName, LastName', required: true },
                  { key: 'roll_no', alts: 'rollNo, RollNo', required: true },
                  { key: 'middle_name', alts: 'middleName, MiddleName', required: false },
                  { key: 'enrollment_no', alts: 'enrollmentNo, EnrollmentNo', required: false },
                  { key: 'reason', alts: 'notes', required: false },
                ].map(f => (
                  <View key={f.key} style={styles.fieldRow}>
                    <View style={[styles.fieldBadge, f.required ? styles.fieldBadgeReq : styles.fieldBadgeOpt]}>
                      <Text style={[styles.fieldBadgeText, f.required ? { color: theme.colors.primary } : { color: theme.colors.textMuted }]}>
                        {f.required ? 'required' : 'optional'}
                      </Text>
                    </View>
                    <View style={styles.fieldContent}>
                      <Text style={styles.fieldKey}>{f.key}</Text>
                      <Text style={styles.fieldAlts}>{f.alts}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <Text style={styles.modalNote}>
                Students with a duplicate roll number or enrollment number in this class will be skipped automatically.
              </Text>

              <TouchableOpacity style={styles.chooseFileBtn} onPress={handleImportCSV} activeOpacity={0.85}>
                <FileDown size={20} color={theme.colors.textInverse} />
                <Text style={styles.chooseFileBtnText}>Choose CSV File</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setCsvModalVisible(false)}>
              <Text style={styles.cancelModalText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },

  // Hero
  hero: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  heroTopRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: theme.spacing.md, marginBottom: theme.spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  heroTitleBlock: { flex: 1 },
  heroName: { fontSize: 17, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.3 },
  heroBadges: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 3 },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: theme.borderRadius.full },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.textInverse },
  heroSubject: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  heroIconBadge: {
    width: 36, height: 36, borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },

  statsStrip: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: theme.borderRadius.lg, overflow: 'hidden',
  },
  stripStat: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  stripStatBorder: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.15)' },
  stripValue: { fontSize: 20, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.5 },
  stripLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '600' },

  // Tabs
  tabRow: {
    flexDirection: 'row', backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm, gap: theme.spacing.sm,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: theme.borderRadius.md,
  },
  tabBtnActive: { backgroundColor: theme.colors.primarySurface },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  tabBtnTextActive: { color: theme.colors.primary },

  // Student list
  listContent: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm, paddingBottom: 160 },

  studentRow: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
    marginBottom: 5, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'transparent', ...theme.shadows.xs,
  },
  studentRowSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },

  accentBar: { width: 5, justifyContent: 'center', alignItems: 'center' },
  indexBubble: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 8, flexShrink: 0, alignSelf: 'center',
  },
  indexNum: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },

  studentInfo: { flex: 1, paddingVertical: 9, paddingLeft: 2, paddingRight: 4 },
  studentTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  studentBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  studentName: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  studentMeta: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '500', flexShrink: 0 },

  miniBarBg: { flex: 1, height: 3, backgroundColor: theme.colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: 3, borderRadius: 2 },

  pctText: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3, flexShrink: 0 },
  noPct: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted, flexShrink: 0 },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 6 },
  rowActionBtn: { padding: 8 },

  // Session list
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md, marginBottom: theme.spacing.sm, ...theme.shadows.xs,
  },
  sessionLeft: { flex: 1 },
  sessionDateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  sessionIndexBubble: {
    paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: theme.colors.primarySurface, borderRadius: theme.borderRadius.full,
  },
  sessionIndexText: { fontSize: 11, fontWeight: '800', color: theme.colors.primary },
  sessionDate: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  sessionPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full },
  pillText: { fontSize: 11, fontWeight: '700' },
  sessionRight: { alignItems: 'flex-end', gap: theme.spacing.sm },
  sessionPct: { fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  sessionBtns: { flexDirection: 'row', gap: 8 },
  editSessionBtn: {
    width: 30, height: 30, borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primarySurface, justifyContent: 'center', alignItems: 'center',
  },
  deleteSessionBtn: {
    width: 30, height: 30, borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.dangerLight, justifyContent: 'center', alignItems: 'center',
  },

  // Empty
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: theme.spacing.md, paddingHorizontal: theme.spacing.xxl, paddingBottom: 80,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Bulk bar
  bulkBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: theme.colors.surface, borderTopWidth: 1,
    borderTopColor: theme.colors.border, paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md, gap: theme.spacing.sm, ...theme.shadows.lg,
  },
  bulkTopRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  bulkBottomRow: { flexDirection: 'row', gap: theme.spacing.sm },
  bulkCancel: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  bulkCancelText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  bulkSelectAllBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md, paddingVertical: 10,
  },
  bulkSelectAllText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  bulkExportBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.present, borderRadius: theme.borderRadius.md, paddingVertical: 10,
  },
  bulkExportText: { fontSize: 13, fontWeight: '700', color: theme.colors.textInverse },
  bulkDeleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: theme.colors.danger, borderRadius: theme.borderRadius.md, paddingVertical: 10,
  },
  bulkDeleteText: { fontSize: 13, fontWeight: '700', color: theme.colors.textInverse },

  // Bottom bar
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: theme.colors.surface, borderTopWidth: 1,
    borderTopColor: theme.colors.border, paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.md, ...theme.shadows.lg,
  },
  primaryAction: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
    paddingVertical: 14, gap: theme.spacing.sm, marginBottom: theme.spacing.sm,
    ...theme.shadows.primary,
  },
  primaryActionText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
  secondaryActions: { flexDirection: 'row', gap: theme.spacing.sm },
  secBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: theme.colors.primarySurface,
    borderRadius: theme.borderRadius.md, paddingVertical: 11,
  },
  secBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },

  // CSV Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalScrollView: {
    maxHeight: '90%',
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xxl, borderTopRightRadius: theme.borderRadius.xxl,
    paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm,
  },
  csvSection: { marginBottom: theme.spacing.md },
  csvSectionTitle: {
    fontSize: 13, fontWeight: '700', color: theme.colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: theme.spacing.sm,
  },
  modalDivider: {
    height: 1, backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.lg,
  },
  exportFormatRow: { flexDirection: 'row', gap: theme.spacing.sm },
  exportFormatBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: theme.borderRadius.lg, paddingVertical: 13,
  },
  exportFormatBtnCSV: { backgroundColor: theme.colors.present },
  exportFormatBtnPDF: { backgroundColor: theme.colors.danger },
  exportFormatBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.textInverse },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border,
    alignSelf: 'center', marginBottom: theme.spacing.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md },
  modalIconBox: {
    width: 40, height: 40, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primarySurface, justifyContent: 'center', alignItems: 'center',
  },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text },
  modalCloseBtn: { padding: theme.spacing.xs },

  modalDesc: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: theme.spacing.lg },

  fieldList: { gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },
  fieldBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full, marginTop: 2 },
  fieldBadgeReq: { backgroundColor: theme.colors.primarySurface },
  fieldBadgeOpt: { backgroundColor: theme.colors.surfaceAlt },
  fieldBadgeText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldContent: { flex: 1 },
  fieldKey: { fontSize: 14, fontWeight: '700', color: theme.colors.text, fontFamily: 'monospace' },
  fieldAlts: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },

  modalNote: {
    fontSize: 13, color: theme.colors.textMuted, lineHeight: 18,
    backgroundColor: theme.colors.warningLight, padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md, marginBottom: theme.spacing.lg,
  },
  chooseFileBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: theme.spacing.sm, backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg, paddingVertical: 14,
    marginBottom: theme.spacing.sm, ...theme.shadows.primary,
  },
  chooseFileBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
  cancelModalBtn: { paddingVertical: 14, alignItems: 'center' },
  cancelModalText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },

  // Edit class modal
  editLabel: {
    fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm, marginTop: theme.spacing.md,
  },
  editRequired: { color: theme.colors.danger },
  editOptional: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '400' },
  editInput: {
    borderWidth: 1.5, borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: 13,
    fontSize: 15, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt,
  },
  editInputFocused: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
});
