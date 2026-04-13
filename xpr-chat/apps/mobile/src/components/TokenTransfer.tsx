import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../utils/theme';
import { useWalletStore } from '../store/walletStore';
import { formatXPR } from '../utils/formatters';

interface TokenTransferProps {
  visible: boolean;
  recipientXPR: string;
  onClose: () => void;
  onSuccess: (txId: string, amount: number) => void;
}

type TokenType = 'XPR' | 'XUSDT';

export const TokenTransfer: React.FC<TokenTransferProps> = ({
  visible,
  recipientXPR,
  onClose,
  onSuccess,
}) => {
  const { balance, isSending, sendXPR, sendXUSDT } = useWalletStore();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [token, setToken] = useState<TokenType>('XPR');

  const parsedAmount = parseFloat(amount) || 0;
  const rawAmount = Math.round(parsedAmount * 10000);
  const maxBalance = token === 'XPR' ? balance.xpr : balance.xusdt;
  const isValid = rawAmount > 0 && rawAmount <= maxBalance;

  const handleMax = () => {
    setAmount((maxBalance / 10000).toFixed(4));
  };

  const handleSend = async () => {
    if (!isValid) return;

    Alert.alert(
      'Confirm Transfer',
      `Send ${parsedAmount.toFixed(4)} ${token} to @${recipientXPR}${memo ? `\nMemo: ${memo}` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            try {
              const sendFn = token === 'XPR' ? sendXPR : sendXUSDT;
              const txId = await sendFn(recipientXPR, rawAmount, memo || undefined);
              setAmount('');
              setMemo('');
              onSuccess(txId, rawAmount);
              onClose();
            } catch (error) {
              Alert.alert(
                'Transfer Failed',
                error instanceof Error ? error.message : 'Unknown error'
              );
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Send Crypto</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Recipient */}
          <View style={styles.recipientRow}>
            <Text style={styles.recipientLabel}>TO</Text>
            <View style={styles.recipientBadge}>
              <Text style={styles.recipientAt}>@</Text>
              <Text style={styles.recipientName}>{recipientXPR}</Text>
            </View>
          </View>

          {/* Token selector */}
          <View style={styles.tokenSelector}>
            {(['XPR', 'XUSDT'] as TokenType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tokenTab, token === t && styles.tokenTabActive]}
                onPress={() => setToken(t)}
              >
                <Text style={[styles.tokenTabText, token === t && styles.tokenTabTextActive]}>
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Balance display */}
          <Text style={styles.balanceHint}>
            Balance: {formatXPR(maxBalance, token)}
          </Text>

          {/* Amount input */}
          <View style={styles.amountRow}>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.0000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              maxLength={12}
            />
            <Text style={styles.amountSymbol}>{token}</Text>
            <TouchableOpacity style={styles.maxButton} onPress={handleMax}>
              <Text style={styles.maxText}>MAX</Text>
            </TouchableOpacity>
          </View>

          {/* Memo input */}
          <TextInput
            style={styles.memoInput}
            value={memo}
            onChangeText={setMemo}
            placeholder="Add a note (optional)"
            placeholderTextColor={Colors.textMuted}
            maxLength={256}
          />

          {/* Zero fees badge */}
          <View style={styles.feesBadge}>
            <Text style={styles.feesText}>⚡ Zero gas fees on XPR Network</Text>
          </View>

          {/* Send button */}
          <TouchableOpacity
            style={[styles.sendButton, (!isValid || isSending) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!isValid || isSending}
          >
            {isSending ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.sendButtonText}>
                Send {parsedAmount > 0 ? `${parsedAmount.toFixed(4)} ${token}` : token}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: Colors.border,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.base,
    ...Shadows.card,
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
    alignSelf: 'center',
    marginBottom: Spacing.sm,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  closeButton: {
    width: 32, height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
  },

  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  recipientLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  recipientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  recipientAt: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
  },
  recipientName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },

  tokenSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
    gap: 2,
  },
  tokenTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.md - 2,
  },
  tokenTabActive: {
    backgroundColor: Colors.primary,
  },
  tokenTabText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  tokenTabTextActive: {
    color: Colors.background,
  },

  balanceHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'right',
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    paddingVertical: Spacing.md,
  },
  amountSymbol: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
  },
  maxButton: {
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  maxText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },

  memoInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
  },

  feesBadge: {
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  feesText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },

  sendButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.primaryDim,
  },
  sendButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },
});
