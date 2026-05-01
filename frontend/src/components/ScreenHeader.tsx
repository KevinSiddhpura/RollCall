import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { theme } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

const ScreenHeader = memo(function ScreenHeader({ title, subtitle, right }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[theme.colors.primaryDeep, theme.colors.primary]}
      style={[styles.root, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.row}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={theme.colors.textInverse} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </View>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  root: {
    paddingBottom: 14,
    paddingHorizontal: theme.spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    flexShrink: 0,
  },
  titleBlock: { flex: 1 },
  title: { ...theme.typography.h2, color: theme.colors.textInverse },
  subtitle: { ...theme.typography.caption, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  rightSlot: { flexShrink: 0 },
});

export default ScreenHeader;
