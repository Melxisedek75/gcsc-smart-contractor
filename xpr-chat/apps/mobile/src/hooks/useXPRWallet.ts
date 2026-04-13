import { useEffect, useCallback } from 'react';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';

export const useXPRWallet = () => {
  const account = useAuthStore((s) => s.account);
  const {
    balance,
    transactions,
    isLoadingBalance,
    isLoadingTx,
    isSending,
    lastTxId,
    error,
    fetchBalance,
    fetchTransactions,
    sendXPR,
    sendXUSDT,
    clearError,
  } = useWalletStore();

  // Auto-fetch balance when account changes
  useEffect(() => {
    if (account?.actor) {
      fetchBalance(account.actor);
    }
  }, [account?.actor]);

  const refresh = useCallback(() => {
    if (account?.actor) {
      fetchBalance(account.actor);
      fetchTransactions(account.actor);
    }
  }, [account?.actor]);

  return {
    balance,
    transactions,
    isLoadingBalance,
    isLoadingTx,
    isSending,
    lastTxId,
    error,
    sendXPR,
    sendXUSDT,
    refresh,
    clearError,
  };
};
