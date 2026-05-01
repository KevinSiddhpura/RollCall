import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Lock } from 'lucide-react-native';
import { useSecurity } from '../auth/SecurityContext';
import { theme } from '../theme';
import PinModal from './PinModal';

export default function LockScreen() {
  const { verifyPin, hasPin } = useSecurity();
  const [pinVisible, setPinVisible] = useState(false);
  const [pinError, setPinError] = useState('');

  // Always show PIN entry on mount since there's no biometric
  useEffect(() => { 
    if (hasPin) {
      setPinVisible(true);
    } else {
      Alert.alert('Security Error', 'No PIN set. Please contact support.');
    }
  }, [hasPin]);

  const handlePinSuccess = async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setPinVisible(false);
      setPinError('');
    } else {
      setPinError('Invalid PIN');
    }
  };

  return (
    <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={[theme.colors.primaryDeep, theme.colors.primary]}
        style={[StyleSheet.absoluteFill, styles.root]}
      >
        <View style={styles.iconBox}>
          <Lock size={32} color={theme.colors.textInverse} strokeWidth={2} />
        </View>
        <Text style={styles.title}>RollCall is locked</Text>
        <Text style={styles.sub}>Enter PIN to unlock</Text>

        <TouchableOpacity
          style={styles.unlockBtn}
          onPress={() => setPinVisible(true)}
          disabled={!hasPin}
          activeOpacity={0.85}
        >
          <Text style={styles.unlockBtnText}>Enter PIN / Passcode</Text>
        </TouchableOpacity>

        <PinModal
          visible={pinVisible}
          onClose={() => setPinVisible(false)}
          onSuccess={handlePinSuccess}
          mode="enter"
          error={pinError}
        />
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  iconBox: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  title: { ...theme.typography.h2, color: theme.colors.textInverse },
  sub: { ...theme.typography.body, color: 'rgba(255,255,255,0.7)' },
  unlockBtn: {
    backgroundColor: theme.colors.textInverse,
    paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: theme.borderRadius.full,
    marginTop: 24,
    ...theme.shadows.md,
  },
  unlockBtnText: { ...theme.typography.bodyMed, color: theme.colors.primary },
});
