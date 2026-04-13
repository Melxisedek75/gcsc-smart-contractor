import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useXPRWallet } from '../../hooks/useXPRWallet';
import { useAuthStore } from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { formatXPR, formatTxDate } from '../../utils/formatters';
import { Transaction } from '../../store/walletStore';

// ─── Transaction Row ─────────────────────────────────────────────────────────
const TxRow: React.FC<{ tx: Transaction }> = ({ tx }) => (
  <View style={styles.txRow}>
    <View style={[styles.txIcon, tx.type === 'send' ? styles.txIconSend : styles.txIconReceive]}>
      <Text style={styles.txIconText}>{tx.type === 'send' ? '↑' : '↓'}</Text>
    </View>
    <View style={styles.txBody}>
      <Text style={styles.txCounterparty}>
        {tx.type === 'send' ? `To @${tx.counterparty}` : `From @${tx.counterparty}`}
      </Text>
      {tx.memo ? <Text style={styles.txMemo}>{tx.memo}</Text> : null}
      <Text style={styles.txDate}>{formatTxDate(tx.timestamp)}</Text>
    </View>
    <Text style={[styles.txAmount, tx.type === 'send' ? styles.txAmountSend : styles.txAmountReceive]}>
      {tx.type === 'send' ? '-' : '+'}{formatXPR(tx.amount, tx.symbol)}
    </Text>
  </View>
);

// ─── Wallet Screen ───────────────────────────────────────────────────────────
export const WalletScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { account } = useAuthStore();
  const { balance, transactions, isLoadingBalance, isLoadingTx, refresh } = useXPRWallet();

  useEffect(() => {
    if (account?.actor) refresh();
  }, [account?.actor]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Wallet</Text>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('TransactionHistory')}
        >
          <Text style={styles.historyText}>History</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingBalance}
            onRefresh={refresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        {/* Balance card */}
        <View style={styles.balanceCard}>
          <View style={styles.networkBadgeRow}>
            <View style={styles.networkBadge}>
              <Text style={styles.networkBadgeText}>XPR MAINNET</Text>
            </View>
            <Text style={styles.zeroFees}>⚡ Zero Fees</Text>
          </View>

          <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
          <Text style={styles.balanceXPR}>
            {isLoadingBalance ? '—' : formatXPR(balance.xpr)}
          </Text>
          {balance.xusdt > 0 && (
            <Text style={styles.balanceXUSDT}>{formatXPR(balance.xusdt, 'XUSDT')}</Text>
          )}

          <Text style={styles.walletAddress}>@{account?.actor}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('SendToken', { symbol: 'XPR' })}
          >
            <Text style={styles.actionIcon}>↑</Text>
            <Text style={styles.actionLabel}>Send</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionIcon}>↓</Text>
            <Text style={styles.actionLabel}>Receive</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionIcon}>⇄</Text>
            <Text style={styles.actionLabel}>Swap</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => {}}>
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionLabel}>Markets</Text>
          </TouchableOpacity>
        </View>

        {/* Recent transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
          {transactions.slice(0, 5).map((tx) => (
            <TxRow key={tx.id} tx={tx} />
          ))}
          {transactions.length === 0 && !isLoadingTx && (
            <Text style={styles.emptyTx}>No transactions yet</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: Spacing.xxxl },

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
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  historyButton: { paddingHorizontal: Spacing.sm },
  historyText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
  },

  balanceCard: {
    margin: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  networkBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.sm,
  },
  networkBadge: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  networkBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  zeroFees: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },
  balanceLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  balanceXPR: {
    fontSize: 34,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  balanceXUSDT: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },
  walletAddress: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    marginTop: Spacing.sm,
  },

  actions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.md,
  },
  actionIcon: {
    fontSize: 22,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
  },
  actionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },

  section: { paddingHorizontal: Spacing.base },
  sectionTitle: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  txIcon: {
    width: 40, height: 40,
    borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  txIconSend: { backgroundColor: Colors.error + '22', borderColor: Colors.error },
  txIconReceive: { backgroundColor: Colors.success + '22', borderColor: Colors.success },
  txIconText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  txBody: { flex: 1, gap: 2 },
  txCounterparty: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  txMemo: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  txDate: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  txAmount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
  },
  txAmountSend: { color: Colors.error },
  txAmountReceive: { color: Colors.success },
  emptyTx: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
});
