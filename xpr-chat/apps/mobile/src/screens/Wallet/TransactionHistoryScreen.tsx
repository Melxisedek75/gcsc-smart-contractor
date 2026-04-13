import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useXPRWallet } from '../../hooks/useXPRWallet';
import { useAuthStore } from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { formatXPR, formatTxDate } from '../../utils/formatters';
import { Transaction } from '../../store/walletStore';

// ─── Filter tabs ─────────────────────────────────────────────────────────────
type FilterTab = 'all' | 'send' | 'receive';

const FilterTabs: React.FC<{
  active: FilterTab;
  onChange: (tab: FilterTab) => void;
}> = ({ active, onChange }) => (
  <View style={styles.filterTabs}>
    {(['all', 'send', 'receive'] as FilterTab[]).map((tab) => (
      <TouchableOpacity
        key={tab}
        style={[styles.filterTab, active === tab && styles.filterTabActive]}
        onPress={() => onChange(tab)}
      >
        <Text style={[styles.filterTabText, active === tab && styles.filterTabTextActive]}>
          {tab === 'all' ? 'All' : tab === 'send' ? '↑ Sent' : '↓ Received'}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

// ─── Transaction detail modal ─────────────────────────────────────────────────
const TxDetailRow: React.FC<{ label: string; value: string; mono?: boolean }> = ({
  label, value, mono = false,
}) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, mono && styles.detailMono]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

// ─── Transaction Item ─────────────────────────────────────────────────────────
const TxItem: React.FC<{
  tx: Transaction;
  myAccount: string;
  onPress: () => void;
}> = ({ tx, myAccount, onPress }) => (
  <TouchableOpacity style={styles.txItem} onPress={onPress} activeOpacity={0.75}>
    <View style={[
      styles.txIcon,
      tx.type === 'send' ? styles.txIconSend : styles.txIconReceive,
    ]}>
      <Text style={styles.txIconText}>{tx.type === 'send' ? '↑' : '↓'}</Text>
    </View>

    <View style={styles.txBody}>
      <View style={styles.txRow}>
        <Text style={styles.txCounterparty}>
          {tx.type === 'send' ? `To @${tx.counterparty}` : `From @${tx.counterparty}`}
        </Text>
        <Text style={[
          styles.txAmount,
          tx.type === 'send' ? styles.txAmountSend : styles.txAmountReceive,
        ]}>
          {tx.type === 'send' ? '-' : '+'}{formatXPR(tx.amount, tx.symbol)}
        </Text>
      </View>
      <View style={styles.txRow}>
        {tx.memo ? (
          <Text style={styles.txMemo} numberOfLines={1}>{tx.memo}</Text>
        ) : (
          <Text style={styles.txNoMemo}>No memo</Text>
        )}
        <Text style={styles.txDate}>{formatTxDate(tx.timestamp)}</Text>
      </View>
    </View>
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// Transaction History Screen
// ─────────────────────────────────────────────────────────────────────────────
export const TransactionHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { account } = useAuthStore();
  const { transactions, isLoadingTx, refresh } = useXPRWallet();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  useEffect(() => {
    if (account?.actor) refresh();
  }, [account?.actor]);

  const filtered = transactions.filter((tx) => {
    if (filter === 'all') return true;
    return tx.type === filter;
  });

  const stats = {
    totalSent: transactions
      .filter((t) => t.type === 'send')
      .reduce((acc, t) => acc + t.amount, 0),
    totalReceived: transactions
      .filter((t) => t.type === 'receive')
      .reduce((acc, t) => acc + t.amount, 0),
    count: transactions.length,
  };

  const openExplorer = (txId: string) => {
    Linking.openURL(`https://explorer.xprnetwork.org/transaction/${txId}`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Transaction History</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>SENT</Text>
          <Text style={[styles.statValue, styles.statSent]}>
            -{formatXPR(stats.totalSent)}
          </Text>
        </View>
        <View style={[styles.statCard, styles.statCardCenter]}>
          <Text style={styles.statLabel}>TRANSACTIONS</Text>
          <Text style={styles.statValue}>{stats.count}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>RECEIVED</Text>
          <Text style={[styles.statValue, styles.statReceived]}>
            +{formatXPR(stats.totalReceived)}
          </Text>
        </View>
      </View>

      <FilterTabs active={filter} onChange={setFilter} />

      {/* Detail panel */}
      {selectedTx && (
        <View style={styles.detailPanel}>
          <View style={styles.detailHeader}>
            <Text style={styles.detailTitle}>Transaction Details</Text>
            <TouchableOpacity onPress={() => setSelectedTx(null)}>
              <Text style={styles.detailClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <TxDetailRow label="Type" value={selectedTx.type === 'send' ? '↑ Sent' : '↓ Received'} />
          <TxDetailRow
            label={selectedTx.type === 'send' ? 'To' : 'From'}
            value={`@${selectedTx.counterparty}`}
          />
          <TxDetailRow label="Amount" value={formatXPR(selectedTx.amount, selectedTx.symbol)} />
          {selectedTx.memo && <TxDetailRow label="Memo" value={selectedTx.memo} />}
          <TxDetailRow label="Date" value={formatTxDate(selectedTx.timestamp)} />
          <TxDetailRow label="TX ID" value={selectedTx.txHash} mono />
          <TouchableOpacity
            style={styles.explorerButton}
            onPress={() => openExplorer(selectedTx.txHash)}
          >
            <Text style={styles.explorerButtonText}>View on XPR Explorer ↗</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(tx) => tx.id}
        renderItem={({ item }) => (
          <TxItem
            tx={item}
            myAccount={account?.actor ?? ''}
            onPress={() => setSelectedTx(item === selectedTx ? null : item)}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingTx}
            onRefresh={refresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📄</Text>
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        }
      />
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

  statsRow: {
    flexDirection: 'row',
    margin: Spacing.base,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statCardCenter: {
    borderColor: Colors.border,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs - 1,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  statValue: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  statSent: { color: Colors.error },
  statReceived: { color: Colors.success },

  filterTabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 2,
    gap: 2,
  },
  filterTab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.md - 2,
  },
  filterTabActive: { backgroundColor: Colors.primary },
  filterTabText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
  },
  filterTabTextActive: { color: Colors.background },

  // Detail panel
  detailPanel: {
    margin: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  detailTitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  detailClose: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
    padding: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  detailLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 1,
    minWidth: 70,
  },
  detailValue: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    textAlign: 'right',
  },
  detailMono: {
    fontSize: Typography.fontSize.xs,
    letterSpacing: 0.5,
  },
  explorerButton: {
    marginTop: Spacing.sm,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  explorerButtonText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    letterSpacing: 0.5,
  },

  listContent: { paddingBottom: Spacing.xxxl },
  separator: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: 70 },
  txItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  txIcon: {
    width: 44, height: 44,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  txIconSend: { backgroundColor: Colors.error + '22', borderColor: Colors.error + '66' },
  txIconReceive: { backgroundColor: Colors.success + '22', borderColor: Colors.success + '66' },
  txIconText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  txBody: { flex: 1, gap: 4 },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txCounterparty: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  txAmount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
  },
  txAmountSend: { color: Colors.error },
  txAmountReceive: { color: Colors.success },
  txMemo: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    fontStyle: 'italic',
    flex: 1,
  },
  txNoMemo: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted + '66',
    flex: 1,
  },
  txDate: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
    gap: Spacing.md,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
});
