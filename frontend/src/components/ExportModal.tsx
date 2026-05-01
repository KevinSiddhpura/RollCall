import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { X, FileDown } from 'lucide-react-native';
import { theme } from '../theme';

interface Props {
  visible: boolean;
  defaultName: string;
  onExport: (fileName: string) => void;
  onClose: () => void;
}

export default function ExportModal({ visible, defaultName, onExport, onClose }: Props) {
  const [name, setName] = useState('');

  useEffect(() => { if (visible) setName(defaultName); }, [visible, defaultName]);

  const handleExport = () => {
    const final = name.trim() || defaultName;
    onExport(final);
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView behavior="padding" style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Export File</Text>
            <TouchableOpacity onPress={onClose} style={styles.close}><X size={22} color={theme.colors.textMuted} /></TouchableOpacity>
          </View>

          <Text style={styles.label}>File Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={defaultName}
            placeholderTextColor={theme.colors.textPlaceholder}
            autoFocus
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={handleExport}
          />
          <Text style={styles.hint}>Extension (.csv / .pdf) will be added automatically</Text>

          <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.85}>
            <FileDown size={18} color="white" />
            <Text style={styles.exportBtnText}>Export</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  close: { padding: 4 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: theme.colors.primary, borderRadius: theme.borderRadius.lg,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16,
    color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, marginBottom: 8,
  },
  hint: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 20 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.colors.primary, paddingVertical: 16,
    borderRadius: theme.borderRadius.lg, ...theme.shadows.primary,
  },
  exportBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.textInverse },
});
