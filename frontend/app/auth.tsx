import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  KeyboardAvoidingView, ScrollView, Alert, Pressable, Platform,
} from 'react-native';
import { useState, useRef, useCallback } from 'react';
import { LinearGradient } from 'expo-linear-gradient';

import Animated, {
  FadeIn, FadeInDown, SlideInUp, FadeOut,
} from 'react-native-reanimated';
import { useAuth } from '../src/auth/AuthContext';
import { Users, Lock, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../src/theme';

type FormTab = 'signin' | 'signup';

export default function AuthScreen() {
  const { continueAsGuest, signUp, signIn } = useAuth();
  const insets = useSafeAreaInsets();

  const [modal, setModal] = useState<{ tab: FormTab } | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const scrollToBottom = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);

  const openModal = useCallback((tab: FormTab) => {
    setEmail(''); setPassword(''); setConfirm(''); setFocused(null);
    setModal({ tab });
  }, []);

  const closeModal = useCallback(() => {
    setModal(null);
    setEmail(''); setPassword(''); setConfirm(''); setFocused(null);
  }, []);

  const switchTab = useCallback((tab: FormTab) => {
    setEmail(''); setPassword(''); setConfirm(''); setFocused(null);
    setModal({ tab });
  }, []);

  const handleSubmit = async () => {
    if (modal?.tab === 'signup') {
      if (!email.trim() || !password) { Alert.alert('Required', 'Email and password are required.'); return; }
      if (password !== confirm) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }
      if (password.length < 6) { Alert.alert('Too short', 'Password must be at least 6 characters.'); return; }
      setLoading(true);
      try { await signUp(email, password); } catch (e: any) { Alert.alert('Sign Up Failed', e.message ?? 'Unknown error.'); }
      finally { setLoading(false); }
    } else {
      if (!email.trim() || !password) { Alert.alert('Required', 'Email and password are required.'); return; }
      setLoading(true);
      try { await signIn(email, password); } catch (e: any) { Alert.alert('Sign In Failed', e.message ?? 'Unknown error.'); }
      finally { setLoading(false); }
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try { await continueAsGuest(); } catch { /* auth context handles redirect */ }
    finally { setLoading(false); }
  };

  const inputClass = (field: string) => [
    styles.input,
    focused === field && styles.inputFocused,
  ];

  return (
    <View style={styles.root}>
      <LinearGradient colors={[theme.colors.primaryDeep, theme.colors.primary]} style={StyleSheet.absoluteFill} />

      {/* Decorative elements */}
      <View style={styles.decCircleLg} pointerEvents="none" />
      <View style={styles.decCircleSm} pointerEvents="none" />
      <View style={styles.decDot1} pointerEvents="none" />
      <View style={styles.decDot2} pointerEvents="none" />

      {/* Hero */}
      <Animated.View
        entering={FadeInDown.duration(400).springify()}
        style={[styles.hero, { paddingTop: insets.top + 24 }]}
      >
        <Animated.View entering={FadeInDown.delay(80).duration(300).springify()} style={styles.logoBox}>
          <Users size={28} color={theme.colors.textInverse} strokeWidth={2.5} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(160).duration(300).springify()} style={styles.appName}>
          RollCall
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(240).duration(300).springify()} style={styles.tagline}>
          Attendance made simple
        </Animated.Text>
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        entering={SlideInUp.delay(300).duration(400).springify()}
        style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
      >
        <TouchableOpacity style={styles.primaryBtn} onPress={() => openModal('signup')} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Create Account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.outlineBtn} onPress={() => openModal('signin')} activeOpacity={0.85}>
          <Text style={styles.outlineBtnText}>Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ghostBtn} onPress={handleGuest} disabled={loading} activeOpacity={0.6}>
          <Text style={styles.ghostBtnText}>Continue as Guest</Text>
        </TouchableOpacity>

        <View style={styles.tlsRow}>
          <Lock size={10} color={theme.colors.textMuted} strokeWidth={2} />
          <Text style={styles.tlsText}>Secured with TLS</Text>
        </View>
      </Animated.View>

      {/* Auth Modal */}
      {modal && (
        <View style={StyleSheet.absoluteFill}>
          {/* Backdrop */}
          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={styles.backdrop}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeModal}
            />
          </Animated.View>

          {/* Modal sheet */}
          <KeyboardAvoidingView
            style={styles.modalWrapper}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={insets.top + 12}
          >
            <Animated.View
              entering={SlideInUp.duration(350).springify()}
              exiting={FadeOut.duration(150)}
              style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}
            >
              {/* Header */}
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={closeModal} style={styles.modalClose} activeOpacity={0.7}>
                  <X size={22} color={theme.colors.textSecondary} strokeWidth={2} />
                </TouchableOpacity>
                <Text style={styles.modalTitle}>
                  {modal.tab === 'signup' ? 'Create Account' : 'Welcome Back'}
                </Text>
                <View style={styles.modalClose} />
              </View>

              {/* Tab switcher */}
              <View style={styles.tabRow}>
                {(['signin', 'signup'] as FormTab[]).map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tabBtn, modal.tab === tab && styles.tabBtnActive]}
                    onPress={() => switchTab(tab)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabBtnText, modal.tab === tab && styles.tabBtnTextActive]}>
                      {tab === 'signin' ? 'Sign In' : 'Sign Up'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Form */}
              <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.form}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.label}>Email</Text>
                <Pressable onPress={() => emailRef.current?.focus()}>
                  <TextInput
                    ref={emailRef}
                    style={inputClass('email')}
                    placeholder="you@example.com"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => { setFocused('email'); scrollToBottom(); }}
                    onBlur={() => setFocused(null)}
                  />
                </Pressable>

                <Text style={styles.label}>Password</Text>
                <Pressable onPress={() => passwordRef.current?.focus()}>
                  <TextInput
                    ref={passwordRef}
                    style={inputClass('password')}
                    placeholder="Min. 6 characters"
                    placeholderTextColor={theme.colors.textPlaceholder}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    onFocus={() => { setFocused('password'); scrollToBottom(); }}
                    onBlur={() => setFocused(null)}
                  />
                </Pressable>

                {modal.tab === 'signup' && (
                  <>
                    <Text style={styles.label}>Confirm Password</Text>
                    <Pressable onPress={() => confirmRef.current?.focus()}>
                      <TextInput
                        ref={confirmRef}
                        style={inputClass('confirm')}
                        placeholder="Re-enter password"
                        placeholderTextColor={theme.colors.textPlaceholder}
                        value={confirm}
                        onChangeText={setConfirm}
                        secureTextEntry
                        onFocus={() => { setFocused('confirm'); scrollToBottom(); }}
                        onBlur={() => setFocused(null)}
                      />
                    </Pressable>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                  onPress={handleSubmit}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  <Text style={styles.submitBtnText}>
                    {modal.tab === 'signup' ? 'Create Account' : 'Sign In'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Decorative
  decCircleLg: { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.06)' },
  decCircleSm: { position: 'absolute', bottom: 120, left: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.05)' },
  decDot1: { position: 'absolute', top: '35%', right: 30, width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  decDot2: { position: 'absolute', top: '42%', right: 60, width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' },

  // Hero
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl, gap: 4 },
  logoBox: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  appName: { fontSize: 34, fontWeight: '900', color: theme.colors.textInverse, letterSpacing: -1 },
  tagline: { fontSize: 15, color: 'rgba(255,255,255,0.6)', fontWeight: '500', letterSpacing: 0.1 },

  // Bottom sheet
  sheet: { paddingHorizontal: theme.spacing.xl, gap: 10, paddingBottom: theme.spacing.xl },
  primaryBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg, height: 54, justifyContent: 'center', alignItems: 'center', ...theme.shadows.primary },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: theme.colors.textInverse },
  outlineBtn: { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', borderRadius: theme.borderRadius.lg, height: 54, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  outlineBtnText: { fontSize: 17, fontWeight: '700', color: theme.colors.textInverse },
  ghostBtn: { alignItems: 'center', paddingVertical: theme.spacing.sm },
  ghostBtnText: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.55)' },
  tlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 4 },
  tlsText: { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.3)' },

  // Modal
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    zIndex: 100,
  },
  modalWrapper: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    zIndex: 101,
  },
  modalSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    maxHeight: '85%',
    ...theme.shadows.lg,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, marginBottom: 4 },
  modalClose: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },

  // Tabs
  tabRow: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: theme.colors.border, marginBottom: 4 },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2.5, borderBottomColor: theme.colors.primary, marginBottom: -1.5 },
  tabBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.textMuted },
  tabBtnTextActive: { color: theme.colors.primary },

  // Form
  form: { paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  label: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md },
  input: { borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.borderRadius.md, paddingHorizontal: theme.spacing.md, paddingVertical: 12, fontSize: 15, color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt },
  inputFocused: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
  submitBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.lg, height: 50, justifyContent: 'center', alignItems: 'center', marginTop: theme.spacing.xl, ...theme.shadows.primary },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
});
