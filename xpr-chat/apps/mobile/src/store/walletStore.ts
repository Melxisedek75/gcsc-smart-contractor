import { create } from 'zustand';
import { xprService, XPRBalance } from '../services/xprService';

export interface Transaction {
  id: string;
  type: 'send' | 'receive';
  amount: number;
  symbol: string;
  counterparty: string;
  memo?: string;
  timestamp: number;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
}

interface WalletState {
  balance: XPRBalance;
  transactions: Transaction[];
  isLoadingBalance: boolean;
  isLoadingTx: boolean;
  isSending: boolean;
  lastTxId: string | null;
  error: string | null;

  // Actions
  fetchBalance: (account: string) => Promise<void>;
  fetchTransactions: (account: string) => Promise<void>;
  sendXPR: (to: string, amount: number, memo?: string) => Promise<string>;
  sendXUSDT: (to: string, amount: number, memo?: string) => Promise<string>;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: { xpr: 0, xusdt: 0 },
  transactions: [],
  isLoadingBalance: false,
  isLoadingTx: false,
  isSending: false,
  lastTxId: null,
  error: null,

  fetchBalance: async (account) => {
    set({ isLoadingBalance: true });
    try {
      const balance = await xprService.getBalance(account);
      set({ balance, isLoadingBalance: false });
    } catch (error) {
      set({
        isLoadingBalance: false,
        error: error instanceof Error ? error.message : 'Failed to fetch balance',
      });
    }
  },

  fetchTransactions: async (account) => {
    set({ isLoadingTx: true });
    try {
      const rawTx = await xprService.getTransactionHistory(account);

      const transactions: Transaction[] = rawTx
        .filter((tx: any) => tx.act?.name === 'transfer')
        .map((tx: any) => ({
          id: tx.trx_id ?? tx.global_sequence?.toString(),
          type: tx.act?.data?.from === account ? 'send' : 'receive',
          amount: Math.round(parseFloat(tx.act?.data?.quantity?.split(' ')[0] ?? '0') * 10000),
          symbol: tx.act?.data?.quantity?.split(' ')[1] ?? 'XPR',
          counterparty: tx.act?.data?.from === account
            ? tx.act?.data?.to
            : tx.act?.data?.from,
          memo: tx.act?.data?.memo,
          timestamp: new Date(tx.timestamp + 'Z').getTime(),
          txHash: tx.trx_id ?? '',
          status: 'confirmed',
        }));

      set({ transactions, isLoadingTx: false });
    } catch (error) {
      set({
        isLoadingTx: false,
        error: error instanceof Error ? error.message : 'Failed to fetch transactions',
      });
    }
  },

  sendXPR: async (to, amount, memo) => {
    set({ isSending: true, error: null });
    try {
      const txId = await xprService.transfer({ to, amount, symbol: 'XPR', memo });
      set({ isSending: false, lastTxId: txId });

      // Add optimistic transaction
      set((state) => ({
        transactions: [
          {
            id: txId,
            type: 'send',
            amount,
            symbol: 'XPR',
            counterparty: to,
            memo,
            timestamp: Date.now(),
            txHash: txId,
            status: 'confirmed',
          },
          ...state.transactions,
        ],
        balance: {
          ...state.balance,
          xpr: state.balance.xpr - amount,
        },
      }));

      return txId;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Transfer failed';
      set({ isSending: false, error: msg });
      throw new Error(msg);
    }
  },

  sendXUSDT: async (to, amount, memo) => {
    set({ isSending: true, error: null });
    try {
      const txId = await xprService.transfer({ to, amount, symbol: 'XUSDT', memo });
      set({ isSending: false, lastTxId: txId });
      return txId;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Transfer failed';
      set({ isSending: false, error: msg });
      throw new Error(msg);
    }
  },

  clearError: () => set({ error: null }),
}));
