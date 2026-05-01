import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, Platform } from 'react-native';
import { theme } from '../theme';

type Props = {
  visible: boolean;
  message: string;
  duration?: number;
  onHide?: () => void;
};

export default function SuccessToast({ visible, message, duration = 1400, onHide }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    if (visible && message) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.delay(duration),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => { if (mounted) onHide?.(); });
    }
    return () => { mounted = false; };
  }, [visible, message, duration, onHide, opacity]);

  if (!visible || !message) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.container, { opacity }] as any}>
      <View style={styles.card}>
        <Text style={styles.text} numberOfLines={2}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: Platform.OS === 'ios' ? 48 : 28,
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: theme.colors.successDark,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  text: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
