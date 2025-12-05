import React from 'react';
import { TouchableOpacity, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FABProps {
  onPress: () => void;
  icon: React.ReactNode;
  isActive?: boolean;
  activeColor?: string;
  inactiveColor?: string;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  offsetY?: number;
  style?: ViewStyle;
}

export const FAB: React.FC<FABProps> = ({
  onPress,
  icon,
  isActive = false,
  activeColor = '#3b82f6',
  inactiveColor = '#9ca3af',
  position = 'top-right',
  offsetY = 0,
  style,
}) => {
  const insets = useSafeAreaInsets();

  const getPositionStyle = (): ViewStyle => {
    const baseOffset = 16;

    switch (position) {
      case 'top-right':
        return {
          top: insets.top + baseOffset + offsetY,
          right: insets.right + baseOffset,
        };
      case 'top-left':
        return {
          top: insets.top + baseOffset + offsetY,
          left: insets.left + baseOffset,
        };
      case 'bottom-right':
        return {
          bottom: insets.bottom + baseOffset + offsetY,
          right: insets.right + baseOffset,
        };
      case 'bottom-left':
        return {
          bottom: insets.bottom + baseOffset + offsetY,
          left: insets.left + baseOffset,
        };
    }
  };

  return (
    <View style={[styles.container, getPositionStyle(), style]}>
      <TouchableOpacity
        onPress={onPress}
        style={[
          styles.button,
          { backgroundColor: isActive ? activeColor : inactiveColor },
        ]}
        activeOpacity={0.7}
      >
        {icon}
      </TouchableOpacity>
    </View>
  );
};

interface FABGroupProps {
  children: React.ReactNode;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

export const FABGroup: React.FC<FABGroupProps> = ({
  children,
  position = 'top-right',
}) => {
  const insets = useSafeAreaInsets();

  const getPositionStyle = (): ViewStyle => {
    const baseOffset = 16;

    switch (position) {
      case 'top-right':
        return {
          top: insets.top + baseOffset,
          right: insets.right + baseOffset,
        };
      case 'top-left':
        return {
          top: insets.top + baseOffset,
          left: insets.left + baseOffset,
        };
      case 'bottom-right':
        return {
          bottom: insets.bottom + baseOffset,
          right: insets.right + baseOffset,
        };
      case 'bottom-left':
        return {
          bottom: insets.bottom + baseOffset,
          left: insets.left + baseOffset,
        };
    }
  };

  return (
    <View style={[styles.groupContainer, getPositionStyle()]}>
      {children}
    </View>
  );
};

interface FABGroupItemProps {
  onPress: () => void;
  icon: React.ReactNode;
  isActive?: boolean;
  activeColor?: string;
  inactiveColor?: string;
}

export const FABGroupItem: React.FC<FABGroupItemProps> = ({
  onPress,
  icon,
  isActive = false,
  activeColor = '#3b82f6',
  inactiveColor = '#9ca3af',
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.button,
        styles.groupItem,
        { backgroundColor: isActive ? activeColor : inactiveColor },
      ]}
      activeOpacity={0.7}
    >
      {icon}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 100,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  groupContainer: {
    position: 'absolute',
    zIndex: 100,
    gap: 12,
  },
  groupItem: {
    marginBottom: 0,
  },
});
