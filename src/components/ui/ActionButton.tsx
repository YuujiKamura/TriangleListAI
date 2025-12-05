import React from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

interface ActionButtonProps {
  x: number;
  y: number;
  onPress: () => void;
  label: string;
  color?: string;
  icon?: React.ReactNode;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  x,
  y,
  onPress,
  label,
  color = '#ef4444',
  icon,
}) => {
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      style={[
        styles.container,
        {
          left: x,
          top: y,
          transform: [{ translateX: -50 }, { translateY: -50 }],
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        style={[styles.button, { backgroundColor: color }]}
        activeOpacity={0.7}
      >
        {icon}
        <Text style={styles.label}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<{
    label: string;
    onPress: () => void;
    color?: string;
    destructive?: boolean;
  }>;
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
}) => {
  return (
    <>
      {/* Backdrop */}
      <TouchableOpacity
        style={styles.backdrop}
        onPress={onClose}
        activeOpacity={1}
      />
      {/* Menu */}
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={[
          styles.menuContainer,
          {
            left: x,
            top: y,
            transform: [{ translateX: -80 }],
          },
        ]}
      >
        {items.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.menuItem,
              index < items.length - 1 && styles.menuItemBorder,
            ]}
            onPress={() => {
              item.onPress();
              onClose();
            }}
          >
            <Text
              style={[
                styles.menuItemText,
                item.destructive && styles.menuItemTextDestructive,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 200,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  label: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 199,
  },
  menuContainer: {
    position: 'absolute',
    zIndex: 200,
    backgroundColor: 'white',
    borderRadius: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  menuItemText: {
    fontSize: 16,
    color: '#374151',
  },
  menuItemTextDestructive: {
    color: '#ef4444',
  },
});
