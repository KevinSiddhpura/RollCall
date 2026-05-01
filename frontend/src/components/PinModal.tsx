import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { theme } from '../theme';
import { X, Shield, Lock } from 'lucide-react-native';

interface PinModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (pin: string) => void;
  mode: 'enter' | 'set' | 'confirm';
  error?: string;
  title?: string;
  subtitle?: string;
}

export default function PinModal({ 
  visible, 
  onClose, 
  onSuccess, 
  mode = 'enter', 
  error,
  title,
  subtitle
}: PinModalProps) {
  const [pin, setPin] = useState('');

  useEffect(() => {
    setPin('');
  }, [visible, mode]);

  const handlePress = (val: string) => {
    if (pin.length < 6) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 6) {
        onSuccess(newPin);
        if (mode === 'enter') setPin('');
      }
    }
  };

  const handleDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const defaultTitle = mode === 'set' ? 'Create PIN' : mode === 'confirm' ? 'Confirm PIN' : 'Enter PIN';
  const defaultSub = mode === 'set' ? 'Set a 6-digit PIN for security' : mode === 'confirm' ? 'Please re-enter your PIN' : 'Enter your 6-digit PIN to unlock';

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          behavior="padding"
          style={styles.container}
        >
          <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={24} color={theme.colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.header}>
              <View style={styles.iconBox}>
                {mode === 'enter' ? <Lock size={28} color={theme.colors.primary} /> : <Shield size={28} color={theme.colors.primary} />}
              </View>
              <Text style={[styles.title, { color: theme.colors.text }]}>{title || defaultTitle}</Text>
              <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>{subtitle || defaultSub}</Text>
            </View>

            <View style={styles.pinContainer}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View 
                  key={i} 
                  style={[
                    styles.pinDot, 
                    pin.length > i && styles.pinDotFilled,
                    error && pin.length > i && styles.pinDotError
                  ]} 
                />
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.keypad}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <TouchableOpacity 
                  key={num} 
                  style={styles.key} 
                  onPress={() => handlePress(num.toString())}
                >
                  <Text style={[styles.keyText, { color: theme.colors.text }]}>{num}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.key} />
              <TouchableOpacity 
                style={styles.key} 
                onPress={() => handlePress('0')}
              >
                <Text style={styles.keyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.key} 
                onPress={handleDelete}
              >
                <Text style={styles.keyText}>⌫</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    width: '100%',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    alignItems: 'center',
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primarySurface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pinContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  pinDotFilled: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  pinDotError: {
    backgroundColor: theme.colors.danger,
    borderColor: theme.colors.danger,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 16,
  },
  keypad: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  key: {
    width: '30%',
    aspectRatio: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    margin: '1.5%',
  },
  keyText: {
    fontSize: 28,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
