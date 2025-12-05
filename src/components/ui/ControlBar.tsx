import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ControlBarProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToContent: () => void;
  onUndo?: () => void;
  onReset?: () => void;
  onExport?: () => void;
  canUndo?: boolean;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  onZoomIn,
  onZoomOut,
  onFitToContent,
  onUndo,
  onReset,
  onExport,
  canUndo = false,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { bottom: insets.bottom + 16 }]}>
      <View style={styles.buttonGroup}>
        <TouchableOpacity style={styles.button} onPress={onZoomIn}>
          <Text style={styles.buttonText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onZoomOut}>
          <Text style={styles.buttonText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={onFitToContent}>
          <Text style={styles.buttonText}>⊡</Text>
        </TouchableOpacity>
      </View>

      {(onUndo || onReset || onExport) && (
        <View style={styles.buttonGroup}>
          {onUndo && (
            <TouchableOpacity
              style={[styles.button, !canUndo && styles.buttonDisabled]}
              onPress={onUndo}
              disabled={!canUndo}
            >
              <Text style={[styles.buttonText, !canUndo && styles.buttonTextDisabled]}>↩</Text>
            </TouchableOpacity>
          )}
          {onReset && (
            <TouchableOpacity style={styles.button} onPress={onReset}>
              <Text style={styles.buttonText}>↻</Text>
            </TouchableOpacity>
          )}
          {onExport && (
            <TouchableOpacity style={styles.button} onPress={onExport}>
              <Text style={styles.buttonText}>↓</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 50,
  },
  buttonGroup: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  button: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 20,
    color: '#374151',
  },
  buttonTextDisabled: {
    color: '#9ca3af',
  },
});
