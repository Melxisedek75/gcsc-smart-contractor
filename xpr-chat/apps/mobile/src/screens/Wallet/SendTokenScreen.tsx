import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useWalletStore } from '../../store/walletStore';
import { useAuthStore } from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { formatXPR, isValidXPRAccount } from '../../utils/formatters';
import { xprService } from '../../services/xprService';

interface RouteParams {
  symbol?: 'XPR' | 'XUSDT';
  prefilledRecipient?: string;
}

type Step = 'form' | 'confirm' | 'success';

export const SendTokenScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { symbol: defaultSymbol = 'XPR', prefilledRecipient = '' } =
    (route.params as RouteParams) ?? {};

  const { balance, isSending, sendXPR, sendXUSDT } = useWalletStore();
  const { account } = useAuthStore();

  const [step, setStep] = useState<Step>('form');
  const [recipient, setRecipient] = useState(prefilledRecipient);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [symbol, setSymbol] = useState<'XPR' | 'XUSDT'>(defaultSymbol);
  const [txId, setTxId] = useState('');
  const [recipientValid, setRecipientValid] = useState<boolean | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const successScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (step === 'success') {
      Animated.spring(successScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }).start();
    }
  }, [step]);

  const maxBalance = symbol === 'XPR' ? balance.xpr : balance.xusdt;
  const parsedAmount = parseFloat(amount) || 0;
  const rawAmount = Math.round(parsedAmount * 10000);
  const isAmountValid = rawAmount > 0 && rawAmount <= maxBalance;
  const isFormValid = recipientValid === true && isAmountValid;

  // Verify recipient on XPR chain
  const verifyRecipient = async (name: string) => {
    if (!isValidXPRAccount(name)) {
      setRecipientValid(false);
      return;
    }
    if (name === account?.actor) {
      setRecipientValid(false);
      return;
    }
    setIsVerifying(true);
    try {
      const identity = await xprService.fetchIdentity(name);
      setRecipientValid(identity !== null);
    } catch {
      // Even without identity, account might exist
      setRecipientValid(isValidXPRAccount(name));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRecipientBlur = () => {
    if (recipient.trim()) verifyRecipient(recipient.trim());
  };

  const handleMaxAmount = () => {
    setAmount((maxBalance / 10000).toFixed(4));
  };

  const handleConfirm = () => {
    if (!isFormValid) return;
    setStep('confirm');
  };

  const handleSend = async () => {
    try {
      const sendFn = symbol === 'XPR' ? sendXPR : sendXUSDT;
      const id = await sendFn(recipient.trim(), rawAmount, memo || undefined);
      setTxId(id);
      setStep('success');
    } catch (err) {
      Alert.alert(
        'Transfer Failed',
        err instanceof Error ? err.message : 'Unknown error. Please try again.'
      );
    }
  };

  const handleDone = () => {
    navigation.navigate('Wallet');
  };

  // ─── Form Step ────────────────────────────────────────────────────────────
  const renderForm = () => (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Token selector */}
      <Text style={styles.sectionLabel}>TOKEN</Text>
      <View style={styles.tokenSelector}>
        {(['XPR', 'XUSDT'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tokenTab, symbol === t && styles.tokenTabActive]}
            onPress={() => { setSymbol(t); setAmount(''); }}
          >
            <Text style={[styles.tokenTabText, symbol === t && styles.tokenTabTextActive]}>
              {t}
            </Text>
            <Text style={[styles.tokenBalance, symbol === t && styles.tokenTabTextActive]}>
              {formatXPR(t === 'XPR' ? balance.xpr : balance.xusdt, t)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recipient */}
      <Text style={styles.sectionLabel}>RECIPIENT</Text>
      <View style={[
        styles.inputRow,
        recipientValid === false && styles.inputRowError,
        recipientValid === true && styles.inputRowSuccess,
      ]}>
        <Text style={styles.atSign}>@</Text>
        <TextInput
          style={styles.input}
          value={recipient}
          onChangeText={(t) => {
            setRecipient(t.toLowerCase().replace(/[^a-z1-5.]/g, ''));
            setRecipientValid(null);
          }}
          onBlur={handleRecipientBlur}
          placeholder="xpr_account_name"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={12}
        />
        {isVerifying && <ActivityIndicator size="small" color={Colors.primary} />}
        {recipientValid === true && <Text style={styles.checkMark}>✓</Text>}
        {recipientValid === false && <Text style={styles.crossMark}>✗</Text>}
      </View>
      {recipientValid === false && (
        <Text style={styles.fieldError}>
          {!isValidXPRAccount(recipient)
            ? 'Invalid account name (a-z, 1-5, up to 12 chars)'
            : recipient === account?.actor
            ? 'Cannot send to yourself'
            : 'Account not found on XPR Network'}
        </Text>
      )}

      {/* Amount */}
      <Text style={styles.sectionLabel}>AMOUNT</Text>
      <View style={[styles.inputRow, !isAmountValid && parsedAmount > 0 && styles.inputRowError]}>
        <TextInput
          style={[styles.input, styles.amountInput]}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.0000"
          placeholderTextColor={Colors.textMuted}
          keyboardType="decimal-pad"
          maxLength={12}
        />
        <Text style={styles.symbolLabel}>{symbol}</Text>
        <TouchableOpacity style={styles.maxButton} onPress={handleMaxAmount}>
          <Text style={styles.maxText}>MAX</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.balanceHint}>Balance: {formatXPR(maxBalance, symbol)}</Text>

      {/* Memo */}
      <Text style={styles.sectionLabel}>MEMO (OPTIONAL)</Text>
      <TextInput
        style={styles.memoInput}
        value={memo}
        onChangeText={setMemo}
        placeholder="Add a note..."
        placeholderTextColor={Colors.textMuted}
        maxLength={256}
      />

      {/* Zero fees */}
      <View style={styles.feesBadge}>
        <Text style={styles.feesText}>⚡ Zero gas fees on XPR Network</Text>
      </View>

      <TouchableOpacity
        style={[styles.nextButton, !isFormValid && styles.nextButtonDisabled]}
        onPress={handleConfirm}
        disabled={!isFormValid}
      >
        <Text style={styles.nextButtonText}>Review Transfer</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ─── Confirm Step ─────────────────────────────────────────────────────────
  const renderConfirm = () => (
    <View style={styles.confirmContainer}>
      <Text style={styles.confirmTitle}>Confirm Transfer</Text>

      <View style={styles.confirmCard}>
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>FROM</Text>
          <Text style={styles.confirmValue}>@{account?.actor}</Text>
        </View>
        <View style={styles.confirmDivider} />
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>TO</Text>
          <Text style={styles.confirmValue}>@{recipient}</Text>
        </View>
        <View style={styles.confirmDivider} />
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>AMOUNT</Text>
          <Text style={[styles.confirmValue, styles.confirmAmount]}>
            {parsedAmount.toFixed(4)} {symbol}
          </Text>
        </View>
        {memo ? (
          <>
            <View style={styles.confirmDivider} />
            <View style={styles.confirmRow}>
              <Text style={styles.confirmLabel}>MEMO</Text>
              <Text style={styles.confirmValue}>{memo}</Text>
            </View>
          </>
        ) : null}
        <View style={styles.confirmDivider} />
        <View style={styles.confirmRow}>
          <Text style={styles.confirmLabel}>NETWORK FEE</Text>
          <Text style={[styles.confirmValue, styles.freeLabel]}>FREE</Text>
        </View>
      </View>

      <View style={styles.confirmWarning}>
        <Text style={styles.confirmWarningText}>
          ⚠ Blockchain transactions are irreversible.{'\n'}Please verify the recipient address.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.sendButton}
        onPress={handleSend}
        disabled={isSending}
      >
        {isSending ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.sendButtonText}>
            Confirm & Send {parsedAmount.toFixed(4)} {symbol}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => setStep('form')}>
        <Text style={styles.cancelText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── Success Step ─────────────────────────────────────────────────────────
  const renderSuccess = () => (
    <View style={styles.successContainer}>
      <Animated.View style={[styles.successIcon, { transform: [{ scale: successScale }] }]}>
        <Text style={styles.successIconText}>✓</Text>
      </Animated.View>
      <Text style={styles.successTitle}>Transfer Sent!</Text>
      <Text style={styles.successSubtitle}>
        {parsedAmount.toFixed(4)} {symbol} sent to @{recipient}
      </Text>

      <View style={styles.successTxCard}>
        <Text style={styles.txIdLabel}>TRANSACTION ID</Text>
        <Text style={styles.txIdValue} numberOfLines={2}>{txId}</Text>
      </View>

      <TouchableOpacity style={styles.sendButton} onPress={handleDone}>
        <Text style={styles.sendButtonText}>Done</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => step === 'form' ? navigation.goBack() : setStep('form')}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Send {symbol}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        {(['form', 'confirm', 'success'] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            <View style={[
              styles.progressDot,
              step === s && styles.progressDotActive,
              (step === 'confirm' && i === 0) || step === 'success'
                ? styles.progressDotDone
                : null,
            ]} />
            {i < 2 && (
              <View style={[
                styles.progressLine,
                (i === 0 && (step === 'confirm' || step === 'success')) ||
                (i === 1 && step === 'success')
                  ? styles.progressLineDone
                  : null,
              ]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {step === 'form' && renderForm()}
      {step === 'confirm' && renderConfirm()}
      {step === 'success' && renderSuccess()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: Typography.fontSize.lg, color: Colors.primary, fontFamily: Typography.fontFamily.mono },
  title: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
  },

  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: 0,
  },
  progressDot: {
    width: 10, height: 10,
    borderRadius: 5,
    backgroundColor: Colors.borderSubtle,
    borderWidth: 2,
    borderColor: Colors.borderSubtle,
  },
  progressDotActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  progressDotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  progressLine: {
    width: 40, height: 2,
    backgroundColor: Colors.borderSubtle,
  },
  progressLineDone: { backgroundColor: Colors.success },

  scroll: { padding: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxxl },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },

  tokenSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
    gap: 2,
    marginBottom: Spacing.sm,
  },
  tokenTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    gap: 2,
    borderRadius: BorderRadius.lg - 2,
  },
  tokenTabActive: { backgroundColor: Colors.primary },
  tokenTabText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  tokenTabTextActive: { color: Colors.background },
  tokenBalance: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  inputRowError: { borderColor: Colors.error },
  inputRowSuccess: { borderColor: Colors.success },
  atSign: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
  },
  input: {
    flex: 1,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md,
  },
  amountInput: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
  },
  symbolLabel: {
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
  checkMark: { fontSize: 16, color: Colors.success, fontFamily: Typography.fontFamily.monoBold },
  crossMark: { fontSize: 16, color: Colors.error, fontFamily: Typography.fontFamily.monoBold },
  fieldError: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.error,
    marginTop: 4,
  },
  balanceHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: 4,
  },
  memoInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  feesBadge: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  feesText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },
  nextButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  nextButtonDisabled: { backgroundColor: Colors.primaryDim },
  nextButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },

  // Confirm
  confirmContainer: {
    flex: 1,
    padding: Spacing.base,
    gap: Spacing.lg,
  },
  confirmTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
    marginVertical: Spacing.md,
  },
  confirmCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
  },
  confirmDivider: { height: 1, backgroundColor: Colors.borderSubtle, marginHorizontal: 0 },
  confirmLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  confirmValue: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  confirmAmount: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
  },
  freeLabel: { color: Colors.success },
  confirmWarning: {
    backgroundColor: Colors.warning + '22',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.warning + '66',
    padding: Spacing.md,
  },
  confirmWarningText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.warning,
    textAlign: 'center',
    lineHeight: 18,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
  },
  sendButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },
  cancelButton: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },

  // Success
  successContainer: {
    flex: 1,
    padding: Spacing.base,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  successIcon: {
    width: 100, height: 100,
    borderRadius: 50,
    backgroundColor: Colors.success + '22',
    borderWidth: 2,
    borderColor: Colors.success,
    alignItems: 'center', justifyContent: 'center',
  },
  successIconText: {
    fontSize: 46,
    color: Colors.success,
    fontFamily: Typography.fontFamily.monoBold,
  },
  successTitle: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  successSubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  successTxCard: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.xs,
  },
  txIdLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  txIdValue: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
});
