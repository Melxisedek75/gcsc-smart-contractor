import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../utils/theme';

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendXPR: () => void;
  onSendMedia: () => void;
  disabled?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onSendXPR,
  onSendMedia,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const toValue = isExpanded ? 0 : 1;
    setIsExpanded(!isExpanded);
    Animated.spring(expandAnim, {
      toValue,
      tension: 60,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText('');
  };

  const hasText = text.trim().length > 0;

  // Extra action buttons scale animation
  const actionsScale = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1],
  });
  const actionsOpacity = expandAnim;

  return (
    <View style={styles.container}>
      {/* Extra actions tray */}
      <Animated.View
        style={[
          styles.actionsTray,
          { opacity: actionsOpacity, transform: [{ scale: actionsScale }] },
          !isExpanded && styles.actionsTrayHidden,
        ]}
        pointerEvents={isExpanded ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.actionTile} onPress={onSendXPR}>
          <Text style={styles.actionTileIcon}>⚡</Text>
          <Text style={styles.actionTileLabel}>Send XPR</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionTile} onPress={onSendMedia}>
          <Text style={styles.actionTileIcon}>🖼</Text>
          <Text style={styles.actionTileLabel}>Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionTile} onPress={() => {}}>
          <Text style={styles.actionTileIcon}>📁</Text>
          <Text style={styles.actionTileLabel}>File</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionTile} onPress={() => {}}>
          <Text style={styles.actionTileIcon}>🎤</Text>
          <Text style={styles.actionTileLabel}>Voice</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Main input row */}
      <View style={styles.inputRow}>
        {/* Plus / close button */}
        <TouchableOpacity
          style={[styles.iconButton, isExpanded && styles.iconButtonActive]}
          onPress={toggleExpand}
          disabled={disabled}
        >
          <Animated.Text
            style={[
              styles.iconButtonText,
              {
                transform: [{
                  rotate: expandAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '45deg'],
                  }),
                }],
              },
            ]}
          >
            +
          </Animated.Text>
        </TouchableOpacity>

        {/* Text input */}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message..."
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={4096}
          editable={!disabled}
          onFocus={() => setIsExpanded(false)}
        />

        {/* Send / XPR button */}
        {hasText ? (
          <TouchableOpacity
            style={styles.sendButton}
            onPress={handleSend}
            disabled={disabled}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.xprButton}
            onPress={onSendXPR}
            disabled={disabled}
          >
            <Text style={styles.xprButtonText}>$</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
    paddingBottom: Platform.OS === 'ios' ? 0 : Spacing.sm,
  },

  // Actions tray
  actionsTray: {
    flexDirection: 'row',
    padding: Spacing.base,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  actionsTrayHidden: {
    height: 0,
    padding: 0,
    overflow: 'hidden',
  },
  actionTile: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
  },
  actionTileIcon: { fontSize: 22 },
  actionTileLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    marginBottom: 1,
  },
  iconButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  iconButtonText: {
    fontSize: 22,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
    lineHeight: 26,
    textAlign: 'center',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 120,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendIcon: {
    fontSize: 18,
    color: Colors.background,
    fontFamily: Typography.fontFamily.monoBold,
  },
  xprButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryDim,
    marginBottom: 1,
  },
  xprButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
  },
});
