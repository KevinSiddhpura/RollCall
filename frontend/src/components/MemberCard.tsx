import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Pencil, Trash2, Check } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { theme } from '../theme';
import { pctColor } from '../utils/colorHelpers';
import { MemberDTO, FieldDefDTO } from '../services/db/types';
import { getMemberDisplayName, getMemberUniqueValue } from '../utils/memberHelpers';

interface Props {
  member: MemberDTO;
  fields: FieldDefDTO[];
  index: number;
  pct: number | null;
  isSelected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isSelecting?: boolean;
}

const MemberCard = memo(function MemberCard({ member, fields, index, pct, isSelected, onPress, onLongPress, onEdit, onDelete, isSelecting }: Props) {
  const { colors } = useTheme();
  const displayName = getMemberDisplayName(fields, member);
  const uniqueVal = getMemberUniqueValue(fields, member);
  const accentColor = pct === null || pct === 0 ? colors.border : pctColor(pct, colors);

  return (
    <TouchableOpacity
      style={[styles.row, isSelected && styles.rowSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      delayLongPress={300}
    >
      <View style={[styles.accentBar, { backgroundColor: isSelected ? theme.colors.primary : accentColor }]}>
        {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
      </View>

      <View style={[styles.indexBubble, isSelected && { backgroundColor: theme.colors.primary }]}>
        {isSelected
          ? <Check size={10} color="#fff" strokeWidth={3} />
          : <Text style={styles.indexNum}>{index + 1}</Text>}
      </View>

      <View style={styles.info}>
        <View style={styles.topRow}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {pct !== null && pct !== 0
            ? <Text style={[styles.pct, { color: accentColor }]}>{pct}%</Text>
            : <Text style={styles.noPct}>–</Text>}
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.meta}>{uniqueVal}</Text>
          {pct !== null && pct !== 0 && (
            <View style={styles.miniBarBg}>
              <View style={[styles.miniBarFill, { width: `${pct}%`, backgroundColor: accentColor }]} />
            </View>
          )}
        </View>
      </View>

      {!isSelecting && (
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity onPress={onEdit} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Pencil size={14} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity onPress={onDelete} style={styles.actionBtn} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Trash2 size={14} color={theme.colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.md,
    marginBottom: 5, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'transparent', ...theme.shadows.xs,
  },
  rowSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySurface },
  accentBar: { width: 5, justifyContent: 'center', alignItems: 'center' },
  indexBubble: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center', alignItems: 'center',
    marginHorizontal: 8, flexShrink: 0, alignSelf: 'center',
  },
  indexNum: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted },
  info: { flex: 1, paddingVertical: 9, paddingLeft: 2, paddingRight: 4 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: 11, color: theme.colors.textMuted, fontWeight: '500', flexShrink: 0 },
  miniBarBg: { flex: 1, height: 3, backgroundColor: theme.colors.borderLight, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: 3, borderRadius: 2 },
  pct: { fontSize: 13, fontWeight: '800', letterSpacing: -0.3, flexShrink: 0 },
  noPct: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted, flexShrink: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 6 },
  actionBtn: { padding: 8 },
});

export default MemberCard;
