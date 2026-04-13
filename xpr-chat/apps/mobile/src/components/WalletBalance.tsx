import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../utils/theme';
import { formatXPR } from '../utils/formatters';
import { useXPRWallet } from '../hooks/useXPRWallet';

interface WalletBalanceProps {
  compact?: boolean;
  onPress?: () => void;
}

export const WalletBalance: React.FC<WalletBalanceProps> = ({
  compact = false,
  onPress,
}) => {
  const { balance, isLoadingBalance } = useXPRWallet();

  if (compact) {
    return (
      <TouchableOpacity style={styles.compact} onPress={onPress} activeOpacity={0.75}>
        <Text style={styles.compactIcon}>⚡</Text>
        <Text style={styles.compactAmount}>
          {isLoadingBalance ? '...' : formatXPR(balance.xpr)}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardLabel}>XPR BALANCE</Text>
        <Text style={styles.networkBadge}>MAINNET</Text>
      </View>

      <Text style={styles.xprAmount}>
        {isLoadingBalance ? '—' : formatXPR(balance.xpr)}
      </Text>

      {balance.xusdt > 0 && (
        <Text style={styles.xusdtAmount}>
          {formatXPR(balance.xusdt, 'XUSDT')}
        </Text>
      )}

      <Text style={styles.tapHint}>Tap to send or view history</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  cardLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  networkBadge: {
    fontSize: 9,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.success,
    letterSpacing: 1,
    borderWidth: 1,
    borderColor: Colors.success,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  xprAmount: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  xusdtAmount: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },
  tapHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },

  // Compact mode (header bar)
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  compactIcon: { fontSize: 12 },
  compactAmount: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
  },
});
