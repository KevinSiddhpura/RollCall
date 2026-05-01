import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  LayoutGrid, Users, CalendarDays, TrendingDown, ChevronRight,
  AlertTriangle, CircleCheck, ArrowUpRight, RefreshCw,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { theme } from '../../src/theme';
import { useTheme } from '../../src/theme/ThemeContext';
import { pctColor } from '../../src/utils/colorHelpers';
import { GroupService } from '../../src/services/db/GroupService';
import { SessionService } from '../../src/services/db/SessionService';
import { MemberService } from '../../src/services/db/MemberService';
import { FieldService } from '../../src/services/db/FieldService';
import { subscribeToDB } from '../../src/services/db/database';
import { getMemberDisplayName } from '../../src/utils/memberHelpers';
import { useAuth } from '../../src/auth/AuthContext';
import { syncData, SyncProgress } from '../../src/services/syncService';
import { queryOne } from '../../src/services/db/database';
import SyncModal from '../../src/components/SyncModal';

interface RecentSession { id: string; group_id: string; groupName: string; date: string; presentCount: number; totalCount: number; }
interface LowAttendanceMember { id: string; groupId: string; displayName: string; groupName: string; pct: number; presentCount: number; totalRecords: number; }

function ProgressRing({ pct, size = 72, strokeWidth = 6 }: { pct: number; size?: number; strokeWidth?: number }) {
  const color = pct >= 75 ? theme.colors.success : pct >= 50 ? theme.colors.warning : theme.colors.danger;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Background circle using a simpler approach */}
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: strokeWidth, borderColor: theme.colors.borderLight,
        position: 'absolute',
      }} />
      {/* This is a simplified ring - for a real one we'd use react-native-svg */}
      <View style={{
        width: size - strokeWidth * 2, height: size - strokeWidth * 2,
        borderRadius: (size - strokeWidth * 2) / 2,
        backgroundColor: `${color}15`,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ fontSize: size * 0.3, fontWeight: '800', color }}>{pct}%</Text>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ sessionCount: number; recordCount: number; presentCount: number } | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [lowAttendance, setLowAttendance] = useState<LowAttendanceMember[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalMembers, setTotalMembers] = useState(0);
  const [syncModal, setSyncModal] = useState<SyncProgress | null>(null);
  const { token, user, mode } = useAuth();

  const fetch = useCallback(async () => {
    try {
      setError(null);
      const [overall, recent, low, groups, members] = await Promise.all([
        SessionService.getOverallStats(), SessionService.getRecentWithDetails(5),
        MemberService.getLowAttendanceMembers(75, 5), GroupService.getAll(), MemberService.getAll(),
      ]);
      setStats(overall); setRecentSessions(recent); setTotalGroups(groups.length); setTotalMembers(members.length);
      const resolvedLow = await Promise.all(low.map(async (m: any) => {
        const fields = await FieldService.getByGroup(m.group_id);
        return { ...m, displayName: getMemberDisplayName(fields, m) };
      }));
      setLowAttendance(resolvedLow);
    } catch (err) {
      setError('Unable to load dashboard data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); return subscribeToDB(fetch); }, [fetch]);
  useFocusEffect(useCallback(() => { fetch(); }, [fetch]));

  const overallPct = stats && stats.recordCount > 0 ? Math.round((stats.presentCount / stats.recordCount) * 100) : 0;
  const initials = (name: string) => name.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();

  const handleSync = async () => {
    if (!token || !user) return;
    setSyncModal({ phase: 'push', message: 'Starting sync…' });
    try {
      await syncData(token, user.userId, (p) => setSyncModal(p));
      // Query final counts after sync
      const [gc, mc, sc] = await Promise.all([
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM groups'),
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM members'),
        queryOne<{ count: number }>('SELECT COUNT(*) as count FROM sessions'),
      ]);
      const rc = await queryOne<{ count: number }>('SELECT COUNT(*) as count FROM records');
      setSyncModal({ phase: 'complete', message: 'Sync complete', groups: gc?.count ?? 0, members: mc?.count ?? 0, sessions: sc?.count ?? 0, records: rc?.count ?? 0 });
      fetch();
    } catch (e: any) {
      setSyncModal({ phase: 'error', message: 'Sync failed', error: e?.message ?? 'Check connection.' });
    }
  };

  const SkeletonBlock = useCallback(({ w, h, br = 10 }: { w: string | number; h: number; br?: number }) => (
    <Animated.View entering={FadeIn} style={{ width: w as any, height: h, borderRadius: br, backgroundColor: theme.colors.borderLight }} />
  ), []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 4, paddingBottom: 100 }]}>
        {/* Header */}
        <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primary]} style={styles.header}>
          <Animated.View entering={FadeInDown.duration(400).springify()} style={styles.headerContent}>
            <View style={styles.headerTitleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.greeting}>Dashboard</Text>
                <Text style={styles.headerSub}>Your attendance overview</Text>
              </View>
              {mode === 'authenticated' && (
                <TouchableOpacity style={styles.syncBtn} onPress={handleSync} activeOpacity={0.7}>
                  <RefreshCw size={18} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Overall attendance ring */}
          <Animated.View entering={FadeInDown.delay(100).duration(400).springify()} style={styles.ringRow}>
            <View style={styles.ringCell}>
              {loading ? (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
              ) : (
                <ProgressRing pct={overallPct} size={80} strokeWidth={6} />
              )}
              <Text style={styles.ringLabel}>Overall</Text>
            </View>
            <View style={styles.headerStats}>
              {[
                { value: totalGroups, label: 'Groups', icon: <LayoutGrid size={16} color="rgba(255,255,255,0.7)" /> },
                { value: totalMembers, label: 'Members', icon: <Users size={16} color="rgba(255,255,255,0.7)" /> },
                { value: stats?.sessionCount || 0, label: 'Sessions', icon: <CalendarDays size={16} color="rgba(255,255,255,0.7)" /> },
              ].map((s) => (
                <View key={s.label} style={styles.headerStat}>
                  {s.icon}
                  <Text style={styles.headerStatValue}>{loading ? '–' : s.value}</Text>
                  <Text style={styles.headerStatLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        </LinearGradient>

        {/* Error banner */}
        {error && (
          <Animated.View entering={FadeInDown.duration(200)} style={styles.errorBanner}>
            <AlertTriangle size={16} color={theme.colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); fetch(); }}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Low Attendance */}
        <Animated.View entering={FadeInDown.delay(200).duration(300).springify()} style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.colors.dangerLight }]}>
              <TrendingDown size={16} color={theme.colors.danger} />
            </View>
            <Text style={styles.sectionTitle}>Low Attendance</Text>
          </View>

          {loading ? (
            <View style={styles.loadingCard}>
              <SkeletonBlock w="60%" h={14} /><View style={{ height: 8 }} /><SkeletonBlock w="40%" h={10} />
            </View>
          ) : lowAttendance.length === 0 ? (
            <View style={styles.emptyCard}>
              <CircleCheck size={24} color={theme.colors.success} />
              <Text style={styles.emptyText}>All members are attending regularly</Text>
            </View>
          ) : (
            lowAttendance.map((m, i) => (
              <Animated.View key={m.id} entering={FadeInDown.delay(i * 60).duration(250).springify()}>
                <TouchableOpacity
                  style={styles.alertCard}
                  onPress={() => router.push(`/group/${m.groupId}/member/${m.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: pctColor(m.pct, colors) + '20' }]}>
                    <Text style={[styles.avatarText, { color: pctColor(m.pct, colors) }]}>{initials(m.displayName)}</Text>
                  </View>
                  <View style={styles.alertInfo}>
                    <Text style={styles.alertName} numberOfLines={1}>{m.displayName}</Text>
                    <Text style={styles.alertGroup} numberOfLines={1}>{m.groupName}</Text>
                  </View>
                  <View style={styles.alertRight}>
                    <Text style={[styles.alertPct, { color: pctColor(m.pct, colors) }]}>{Math.round(m.pct)}%</Text>
                    <ArrowUpRight size={12} color={pctColor(m.pct, colors)} />
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </Animated.View>

        {/* Recent Sessions */}
        <Animated.View entering={FadeInDown.delay(260).duration(300).springify()} style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.colors.primarySurface }]}>
              <CalendarDays size={16} color={theme.colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Recent Sessions</Text>
          </View>

          {loading ? (
            <View style={styles.loadingCard}>
              <SkeletonBlock w="70%" h={14} /><View style={{ height: 8 }} /><SkeletonBlock w="30%" h={10} />
            </View>
          ) : recentSessions.length === 0 ? (
            <View style={styles.emptyCard}>
              <CalendarDays size={24} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>No sessions recorded yet</Text>
            </View>
          ) : (
            recentSessions.map((s, i) => {
              const pct = s.totalCount > 0 ? Math.round((s.presentCount / s.totalCount) * 100) : 0;
              return (
                <Animated.View key={s.id} entering={FadeInDown.delay(i * 60).duration(250).springify()}>
                  <TouchableOpacity
                    style={styles.sessionCard}
                    onPress={() => router.push(`/group/${s.group_id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.sessionDot, { backgroundColor: theme.colors.primary }]} />
                    <View style={styles.sessionInfo}>
                      <Text style={styles.sessionName} numberOfLines={1}>{s.groupName}</Text>
                      <Text style={styles.sessionDate}>{format(parseISO(s.date), 'EEE, MMM d, yyyy')}</Text>
                    </View>
                    <View style={styles.sessionRight}>
                      <View style={styles.sessionBadge}>
                        <Text style={styles.sessionBadgeText}>{s.presentCount}/{s.totalCount}</Text>
                      </View>
                      <Text style={[styles.sessionPct, { color: pctColor(pct, colors) }]}>{pct}%</Text>
                      <ChevronRight size={16} color={theme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          )}
        </Animated.View>
      </ScrollView>
      <SyncModal visible={!!syncModal} progress={syncModal} onClose={() => { if (syncModal?.phase === 'complete' || syncModal?.phase === 'error') setSyncModal(null); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: theme.spacing.md },

  // Header
  header: { marginBottom: theme.spacing.md, borderRadius: theme.borderRadius['3xl'], padding: theme.spacing.lg, overflow: 'hidden' },
  headerContent: { marginBottom: theme.spacing.md },
  headerTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  greeting: { fontSize: 28, fontWeight: '800', color: theme.colors.textInverse, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  syncBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  ringCell: { alignItems: 'center', gap: 6 },
  ringLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  headerStats: { flex: 1, gap: 10 },
  headerStat: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  headerStatValue: { fontSize: 18, fontWeight: '800', color: theme.colors.textInverse, minWidth: 24 },
  headerStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },

  // Sections
  section: { marginBottom: theme.spacing.lg },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },

  // Loading
  loadingCard: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 16, ...theme.shadows.sm },

  // Empty
  emptyCard: { alignItems: 'center', padding: 24, backgroundColor: theme.colors.surfaceAlt, borderRadius: theme.borderRadius.xl, gap: 8, borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed' },
  emptyText: { fontSize: 13, fontWeight: '500', color: theme.colors.textMuted },

  // Alert cards
  alertCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: 8, ...theme.shadows.xs, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 13, fontWeight: '700' },
  alertInfo: { flex: 1 },
  alertName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  alertGroup: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  alertRight: { alignItems: 'flex-end', gap: 2 },
  alertPct: { fontSize: 15, fontWeight: '800' },

  // Session cards
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.xl, padding: 14, marginBottom: 8, ...theme.shadows.xs, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' },
  sessionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  sessionInfo: { flex: 1 },
  sessionName: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  sessionDate: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  sessionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sessionBadge: { backgroundColor: theme.colors.primarySurface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  sessionBadgeText: { fontSize: 11, fontWeight: '700', color: theme.colors.primary },
  sessionPct: { fontSize: 13, fontWeight: '700', minWidth: 35, textAlign: 'right' },

  // Error
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.dangerLight, borderRadius: theme.borderRadius.lg, padding: 14, marginBottom: theme.spacing.lg },
  errorText: { flex: 1, fontSize: 13, fontWeight: '500', color: theme.colors.dangerDark },
  retryBtn: { backgroundColor: theme.colors.danger, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  retryBtnText: { fontSize: 12, fontWeight: '700', color: theme.colors.textInverse },
});
