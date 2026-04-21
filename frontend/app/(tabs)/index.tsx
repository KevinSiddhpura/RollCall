import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useSQLiteContext } from '../../src/db/sqlite';
import { useState, useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import {
  BookOpen, Users, ClipboardCheck, TrendingUp,
  Plus, BarChart3, ChevronRight, Calendar,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../src/theme';
import { format, parseISO } from 'date-fns';

type Stats = { classes: number; students: number; sessions: number; avgAttendance: number };
type RecentSession = {
  id: number; date: string; time: string;
  class_id: number; class_name: string; division: string;
  total_students: number; present_count: number;
};

function formatDate(dateStr: string) {
  try { return format(parseISO(dateStr), 'MMM d, yyyy'); } catch { return dateStr; }
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats>({ classes: 0, students: 0, sessions: 0, avgAttendance: 0 });
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);

  useFocusEffect(useCallback(() => {
    async function load() {
      const [cls, stu, ses, rec] = await Promise.all([
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM classes'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM students'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM attendance_sessions'),
        db.getFirstAsync<{ total: number; present: number }>(
          `SELECT COUNT(*) as total,
            SUM(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as present
           FROM attendance_records`
        ),
      ]);

      const avg = rec && rec.total > 0 ? Math.round((rec.present / rec.total) * 100) : 0;
      setStats({ classes: cls?.count ?? 0, students: stu?.count ?? 0, sessions: ses?.count ?? 0, avgAttendance: avg });

      const sessions = await db.getAllAsync<RecentSession>(`
        SELECT s.id, s.date, s.time, c.id as class_id, c.name as class_name, c.division,
          COUNT(ar.id) as total_students,
          SUM(CASE WHEN ar.status IN ('present','late') THEN 1 ELSE 0 END) as present_count
        FROM attendance_sessions s
        JOIN classes c ON s.class_id = c.id
        LEFT JOIN attendance_records ar ON ar.session_id = s.id
        GROUP BY s.id
        ORDER BY s.date DESC, s.time DESC
        LIMIT 3
      `);
      setRecentSessions(sessions);
    }
    load();
  }, [db]));

  const statCards = [
    { icon: BookOpen, label: 'Classes', value: stats.classes, color: theme.colors.primary, bg: theme.colors.primarySurface },
    { icon: Users, label: 'Students', value: stats.students, color: '#7C3AED', bg: '#F5F3FF' },
    { icon: ClipboardCheck, label: 'Sessions', value: stats.sessions, color: theme.colors.successDark, bg: theme.colors.successLight },
    { icon: TrendingUp, label: 'Avg Present', value: `${stats.avgAttendance}%`, color: theme.colors.warningDark, bg: theme.colors.warningLight },
  ];

  const quickActions = [
    { icon: ClipboardCheck, label: 'Take Attendance', desc: 'Select a class and record', color: theme.colors.primary, bg: theme.colors.primarySurface, onPress: () => router.push('/classes') },
    { icon: Plus, label: 'Add New Class', desc: 'Create a new class roster', color: theme.colors.successDark, bg: theme.colors.successLight, onPress: () => router.push('/class/new') },
    { icon: BarChart3, label: 'Fetch Reports', desc: 'Export attendance as CSV or PDF', color: '#7C3AED', bg: '#F5F3FF', onPress: () => router.push('/reports') },
  ];

  return (
    <View style={styles.container}>
      {/* Hero Header */}
      <View style={styles.hero}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroGreeting}>{getGreeting()}</Text>
        </View>
        <View style={styles.heroBadge}>
          <Calendar size={15} color={theme.colors.textInverse} />
          <Text style={styles.heroBadgeText}>{format(new Date(), 'EEE, MMM d')}</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          {statCards.map((card) => (
            <View key={card.label} style={[styles.statCard, { backgroundColor: card.bg }]}>
              <View style={[styles.statIconBg, { backgroundColor: card.color + '20' }]}>
                <card.icon size={20} color={card.color} strokeWidth={2.5} />
              </View>
              <Text style={[styles.statValue, { color: card.color }]}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.actionsColumn}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.actionRow, { backgroundColor: action.bg }]}
              onPress={action.onPress}
              activeOpacity={0.75}
            >
              <View style={[styles.actionRowIcon, { backgroundColor: action.color + '22' }]}>
                <action.icon size={22} color={action.color} strokeWidth={2.5} />
              </View>
              <View style={styles.actionRowBody}>
                <Text style={[styles.actionRowLabel, { color: action.color }]}>{action.label}</Text>
                <Text style={styles.actionRowDesc}>{action.desc}</Text>
              </View>
              <ChevronRight size={18} color={action.color} style={{ opacity: 0.6 }} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Sessions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>RECENT SESSIONS</Text>
          {recentSessions.length > 0 && (
            <TouchableOpacity onPress={() => router.push('/classes')}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          )}
        </View>

        {recentSessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <ClipboardCheck size={28} color={theme.colors.textMuted} />
            <Text style={styles.emptyCardText}>No sessions yet. Take attendance to get started.</Text>
          </View>
        ) : (
          recentSessions.map((session) => {
            const pct = session.total_students > 0
              ? Math.round((session.present_count / session.total_students) * 100) : 0;
            const pctColor = pct >= 75 ? theme.colors.present : pct >= 50 ? theme.colors.late : theme.colors.absent;
            return (
              <TouchableOpacity
                key={session.id}
                style={styles.sessionCard}
                onPress={() => router.push(`/class/${session.class_id}`)}
                activeOpacity={0.8}
              >
                <View style={styles.sessionLeft}>
                  <Text style={styles.sessionClass} numberOfLines={1}>
                    {session.class_name}
                    <Text style={styles.sessionDiv}> · Div {session.division}</Text>
                  </Text>
                  <Text style={styles.sessionDate}>{formatDate(session.date)}</Text>
                </View>
                <View style={styles.sessionRight}>
                  <Text style={[styles.sessionPct, { color: pctColor }]}>{pct}%</Text>
                  <Text style={styles.sessionCount}>
                    {session.present_count}/{session.total_students}
                  </Text>
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  hero: {
    backgroundColor: theme.colors.primaryDeep,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  heroGreeting: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.textInverse,
    letterSpacing: -0.3,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.full,
    gap: 6,
    flexShrink: 0,
  },
  heroBadgeText: { fontSize: 13, fontWeight: '600', color: theme.colors.textInverse },

  scrollContent: { padding: theme.spacing.xl, paddingBottom: theme.spacing.xxl },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, marginBottom: theme.spacing.xl },
  statCard: {
    flex: 1, minWidth: '45%', borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md, ...theme.shadows.sm,
  },
  statIconBg: {
    width: 38, height: 38, borderRadius: theme.borderRadius.md,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.sm,
  },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600', marginTop: 2 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: theme.colors.textMuted,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: theme.spacing.sm,
  },
  seeAll: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },

  actionsColumn: { gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  actionRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md, gap: theme.spacing.md, ...theme.shadows.sm,
  },
  actionRowIcon: {
    width: 46, height: 46, borderRadius: theme.borderRadius.md,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  actionRowBody: { flex: 1 },
  actionRowLabel: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  actionRowDesc: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '500' },

  emptyCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl, alignItems: 'center', gap: theme.spacing.sm,
    ...theme.shadows.xs,
  },
  emptyCardText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },

  sessionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md, marginBottom: theme.spacing.sm, ...theme.shadows.sm,
  },
  sessionLeft: { flex: 1 },
  sessionClass: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 3 },
  sessionDiv: { fontSize: 14, fontWeight: '500', color: theme.colors.textSecondary },
  sessionDate: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '500' },
  sessionRight: { alignItems: 'flex-end', marginRight: 4 },
  sessionPct: { fontSize: 17, fontWeight: '800', letterSpacing: -0.5 },
  sessionCount: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '500' },
});
