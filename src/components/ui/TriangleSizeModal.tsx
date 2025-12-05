import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

interface TriangleSizeModalProps {
  visible: boolean;
  baseLength: number;
  onConfirm: (sideLeft: number, sideRight: number, flip: boolean) => void;
  onCancel: () => void;
}

export const TriangleSizeModal: React.FC<TriangleSizeModalProps> = ({
  visible,
  baseLength,
  onConfirm,
  onCancel,
}) => {
  const [sideLeft, setSideLeft] = useState('5');
  const [sideRight, setSideRight] = useState('5');
  const [flip, setFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      // Reset to defaults when modal opens
      setSideLeft('5');
      setSideRight('5');
      setFlip(false);
      setError(null);
    }
  }, [visible]);

  const validateTriangle = (base: number, left: number, right: number): boolean => {
    if (left <= 0 || right <= 0) return false;
    return (base + left > right) && (left + right > base) && (right + base > left);
  };

  const handleConfirm = () => {
    const leftNum = parseFloat(sideLeft);
    const rightNum = parseFloat(sideRight);

    if (isNaN(leftNum) || isNaN(rightNum)) {
      setError('数値を入力してください');
      return;
    }

    if (!validateTriangle(baseLength, leftNum, rightNum)) {
      setError('三角形の不等式を満たしていません');
      return;
    }

    onConfirm(leftNum, rightNum, flip);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          <Text style={styles.title}>三角形を追加</Text>

          <View style={styles.infoRow}>
            <Text style={styles.label}>基準辺:</Text>
            <Text style={styles.value}>{baseLength.toFixed(2)}</Text>
          </View>

          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>左辺</Text>
              <TextInput
                style={styles.input}
                value={sideLeft}
                onChangeText={setSideLeft}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>右辺</Text>
              <TextInput
                style={styles.input}
                value={sideRight}
                onChangeText={setSideRight}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
          </View>

          <TouchableOpacity
            style={styles.flipButton}
            onPress={() => setFlip(!flip)}
          >
            <View style={[styles.checkbox, flip && styles.checkboxChecked]}>
              {flip && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.flipLabel}>反転</Text>
          </TouchableOpacity>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>追加</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxWidth: 320,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 14,
    color: '#6b7280',
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1f2937',
  },
  flipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkmark: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  flipLabel: {
    fontSize: 14,
    color: '#374151',
  },
  error: {
    color: '#ef4444',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#22c55e',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 14,
    color: 'white',
    fontWeight: '600',
  },
});
