import React, { useState, useRef, useCallback } from 'react';
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
  onTypingChange?: (isTyping: boolean) => void;
  disabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Input
// ─────────────────────────────────────────────────────────────────────────────
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendText,
  onSendXPR,
  onSendMedia,
  onTypingChange,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    Animated.spring(expandAnim, {
      toValue: next ? 1 : 0,
      tension: 60,
      friction: 10,
      useNativeDriver: false,
    }).start();
  };

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText('');
    onTypingChange?.(false);
  }, [text, onSendText, onTypingChange]);

  const handleChangeText = useCallback(
    (val: string) => {
      setText(val);
      onTypingChange?.(val.trim().length > 0);
    },
    [onTypingChange]
  );

  const hasText = text.trim().length > 0;

  const trayHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 88],
  });

  const actionItems = [
    { icon: '⚡', label: 'Send XPR', onPress: onSendXPR },
    { icon: '🖼', label: 'Photo', onPress: onSendMedia },
    { icon: '📷', label: 'Camera', onPress: () => {} },
    { icon: '📁', label: 'File', onPress: () => {} },
    { icon: '🎤', label: 'Voice', onPress: () => {} },
  ];

  return (
    <View style={styles.container}>
      {/* Expandable action tray */}
      <Animated.View style={[styles.actionsTray, { height: trayHeight, overflow: 'hidden' }]}>
        <View style={styles.actionsTrayInner}>
          {actionItems.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.actionTile}
              onPress={() => { item.onPress(); setIsExpanded(false); expandAnim.setValue(0); }}
              disabled={disabled}
            >
              <Text style={styles.actionTileIcon}>{item.icon}</Text>
              <Text style={styles.actionTileLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

      {/* Input row */}
      <View style={styles.inputRow}>
        {/* Plus / close */}
        <TouchableOpacity
          style={[styles.iconButton, isExpanded && styles.iconButtonActive]}
          onPress={toggleExpand}
          disabled={disabled}
        >
          <Animated.Text
            style={[
              styles.plusIcon,
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
          onChangeText={handleChangeText}
          placeholder="Message..."
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={4096}
          editable={!disabled}
          onFocus={() => { if (isExpanded) { setIsExpanded(false); expandAnim.setValue(0); } }}
          onBlur={() => onTypingChange?.(false)}
        />

        {/* Right button: send OR $ */}
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
    paddingBottom: Platform.OS === 'ios' ? 0 : Spacing.xs,
  },
  actionsTray: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  actionsTrayInner: {
    flexDirection: 'row',
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  actionTile: {
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    flex: 1,
  },
  actionTileIcon: { fontSize: 20 },
  actionTileLabel: {
    fontSize: Typography.fontSize.xs - 1,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  iconButton: {
    width: 36, height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.background,
    marginBottom: 1,
  },
  iconButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  plusIcon: {
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
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    textAlignVertical: 'center',
  },
  sendButton: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  sendIcon: {
    fontSize: 18,
    color: Colors.background,
    fontFamily: Typography.fontFamily.monoBold,
  },
  xprButton: {
    width: 36, height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primaryDim,
    marginBottom: 1,
  },
  xprButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
  },
});
