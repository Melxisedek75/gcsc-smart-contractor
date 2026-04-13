import { create } from 'zustand';
import { xprService, XPRAccount } from '../services/xprService';
import { encryptionService, SignalKeyBundle } from '../services/encryptionService';
import { matrixService } from '../services/matrixService';

// ─────────────────────────────────────────────────────────────────────────────
// Auth State
// ─────────────────────────────────────────────────────────────────────────────
export type AuthStatus =
  | 'idle'
  | 'initializing'
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'error';

interface AuthState {
  status: AuthStatus;
  account: XPRAccount | null;
  signalKeyBundle: SignalKeyBundle | null;
  error: string | null;
  isFirstLogin: boolean;

  // Actions
  initialize: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth Store
// ─────────────────────────────────────────────────────────────────────────────
export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  account: null,
  signalKeyBundle: null,
  error: null,
  isFirstLogin: false,

  // ── Boot: restore session if available ─────────────────────────────────────
  initialize: async () => {
    set({ status: 'initializing' });
    try {
      await xprService.initialize();
      const account = await xprService.restoreSession();

      if (account) {
        // Restore Signal keys
        await encryptionService.initialize();

        set({
          status: 'authenticated',
          account,
          isFirstLogin: false,
        });
      } else {
        set({ status: 'unauthenticated' });
      }
    } catch (error) {
      set({
        status: 'unauthenticated',
        error: error instanceof Error ? error.message : 'Initialization failed',
      });
    }
  },

  // ── Login via XPR WebAuth ──────────────────────────────────────────────────
  login: async () => {
    set({ status: 'authenticating', error: null });
    try {
      // 1. XPR WebAuth login
      const account = await xprService.login();

      // 2. Initialize Signal Protocol keys
      await encryptionService.initialize();
      const signalKeyBundle = await encryptionService.generateKeyBundle();

      // 3. Check if first login (no identity on chain)
      const identity = await xprService.fetchIdentity(account.actor);
      const isFirstLogin = !identity?.signalPublicKey;

      if (isFirstLogin) {
        // 4. Publish Signal public key on XPR blockchain
        await xprService.publishIdentity({
          account: account.actor,
          signalPublicKey: encryptionService.getIdentityPublicKey() ?? '',
        });
      }

      // 5. Connect to Matrix
      const matrixPassword = `xpr_${account.actor}_${signalKeyBundle.registrationId}`;
      try {
        await matrixService.login(account.actor, matrixPassword);
      } catch {
        // If login fails, try registration (first time)
        await matrixService.register(account.actor, matrixPassword);
      }

      set({
        status: 'authenticated',
        account,
        signalKeyBundle,
        isFirstLogin,
        error: null,
      });
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : 'Login failed',
      });
    }
  },

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout: async () => {
    try {
      await xprService.logout();
      await matrixService.stop();
    } catch {
      // Ignore logout errors
    }
    set({
      status: 'unauthenticated',
      account: null,
      signalKeyBundle: null,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));
