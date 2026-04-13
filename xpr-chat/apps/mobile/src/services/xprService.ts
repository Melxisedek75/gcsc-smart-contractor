import { ProtonWebSDK, Link, LinkSession } from '@proton/web-sdk';
import { secureStore, sha256 } from '../utils/crypto';

// ─────────────────────────────────────────────────────────────────────────────
// XPR Network Configuration
// ─────────────────────────────────────────────────────────────────────────────
const XPR_CONFIG = {
  endpoints: ['https://api.xprnetwork.org', 'https://api2.xprnetwork.org'],
  chainId: '384da888112027f0321850a169f737c33e53515dfc5a246a483a9bcd12add47',
  appName: 'XPR Chat',
  appLogo: 'https://xprchat.io/logo.png',
  requestAccount: 'xprchat',
  contractAccount: 'xprchat',
};

const SECURE_KEYS = {
  SESSION: 'xpr_session',
  ACCOUNT: 'xpr_account',
  IDENTITY_KEY: 'xpr_identity_key',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface XPRAccount {
  actor: string;       // XPR account name (e.g. "alice")
  permission: string;  // "active" | "owner"
  publicKey: string;   // Active public key
}

export interface XPRBalance {
  xpr: number;         // XPR balance in raw units (÷10000 for display)
  xusdt: number;       // XUSDT stablecoin balance
}

export interface XPRTransferParams {
  to: string;
  amount: number;      // Raw units
  symbol?: string;
  memo?: string;
}

export interface XPRIdentity {
  account: string;
  displayName?: string;
  avatar?: string;     // IPFS hash
  signalPublicKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// XPR Service
// ─────────────────────────────────────────────────────────────────────────────
class XPRService {
  private link: Link | null = null;
  private session: LinkSession | null = null;
  private sdk: typeof ProtonWebSDK | null = null;

  // ── Initialize SDK ──────────────────────────────────────────────────────────
  async initialize(): Promise<void> {
    const { link, session } = await ProtonWebSDK({
      linkOptions: {
        chainId: XPR_CONFIG.chainId,
        endpoints: XPR_CONFIG.endpoints,
        restoreSession: true,
      },
      transportOptions: {
        requestAccount: XPR_CONFIG.requestAccount,
        backButton: true,
      },
      selectorOptions: {
        appName: XPR_CONFIG.appName,
        appLogo: XPR_CONFIG.appLogo,
        showSelector: false, // use WebAuth by default
      },
    });

    this.link = link;
    this.session = session || null;
  }

  // ── Login via WebAuth / ProtonPass ──────────────────────────────────────────
  async login(): Promise<XPRAccount> {
    if (!this.link) await this.initialize();

    const { session } = await this.link!.login(XPR_CONFIG.requestAccount);
    this.session = session;

    const account: XPRAccount = {
      actor: session.auth.actor.toString(),
      permission: session.auth.permission.toString(),
      publicKey: session.publicKey?.toString() ?? '',
    };

    // Persist session details securely
    await secureStore.set(SECURE_KEYS.SESSION, JSON.stringify(session.serialize()));
    await secureStore.set(SECURE_KEYS.ACCOUNT, JSON.stringify(account));

    return account;
  }

  // ── Restore previous session ────────────────────────────────────────────────
  async restoreSession(): Promise<XPRAccount | null> {
    if (!this.link) await this.initialize();
    if (!this.session) return null;

    const stored = await secureStore.get(SECURE_KEYS.ACCOUNT);
    return stored ? JSON.parse(stored) : null;
  }

  // ── Logout ──────────────────────────────────────────────────────────────────
  async logout(): Promise<void> {
    if (this.session) {
      await this.session.remove();
      this.session = null;
    }
    await secureStore.delete(SECURE_KEYS.SESSION);
    await secureStore.delete(SECURE_KEYS.ACCOUNT);
  }

  // ── Get XPR + XUSDT balance ─────────────────────────────────────────────────
  async getBalance(account: string): Promise<XPRBalance> {
    const response = await fetch(
      `${XPR_CONFIG.endpoints[0]}/v1/chain/get_currency_balance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'eosio.token', account, symbol: 'XPR' }),
      }
    );
    const xprRaw: string[] = await response.json();

    const xusdtResponse = await fetch(
      `${XPR_CONFIG.endpoints[0]}/v1/chain/get_currency_balance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'xtokens', account, symbol: 'XUSDT' }),
      }
    );
    const xusdtRaw: string[] = await xusdtResponse.json();

    const parseAmount = (raw: string[]): number => {
      if (!raw || raw.length === 0) return 0;
      return Math.round(parseFloat(raw[0].split(' ')[0]) * 10000);
    };

    return {
      xpr: parseAmount(xprRaw),
      xusdt: parseAmount(xusdtRaw),
    };
  }

  // ── Transfer XPR ────────────────────────────────────────────────────────────
  async transfer(params: XPRTransferParams): Promise<string> {
    if (!this.session) throw new Error('Not authenticated');

    const symbol = params.symbol ?? 'XPR';
    const amount = (params.amount / 10000).toFixed(4);
    const quantity = `${amount} ${symbol}`;
    const contract = symbol === 'XPR' ? 'eosio.token' : 'xtokens';

    const result = await this.session.transact({
      actions: [
        {
          account: contract,
          name: 'transfer',
          authorization: [
            {
              actor: this.session.auth.actor.toString(),
              permission: this.session.auth.permission.toString(),
            },
          ],
          data: {
            from: this.session.auth.actor.toString(),
            to: params.to,
            quantity,
            memo: params.memo ?? 'XPR Chat',
          },
        },
      ],
    });

    const txId =
      typeof result.processed?.id === 'string'
        ? result.processed.id
        : sha256(`${Date.now()}-${params.to}-${params.amount}`);

    return txId;
  }

  // ── Publish Signal public key on-chain ──────────────────────────────────────
  async publishIdentity(identity: XPRIdentity): Promise<string> {
    if (!this.session) throw new Error('Not authenticated');

    const result = await this.session.transact({
      actions: [
        {
          account: XPR_CONFIG.contractAccount,
          name: 'setidentity',
          authorization: [
            {
              actor: this.session.auth.actor.toString(),
              permission: this.session.auth.permission.toString(),
            },
          ],
          data: {
            account: identity.account,
            display_name: identity.displayName ?? '',
            avatar_ipfs: identity.avatar ?? '',
            signal_pub_key: identity.signalPublicKey ?? '',
          },
        },
      ],
    });

    return result.processed?.id ?? '';
  }

  // ── Fetch user identity from chain ──────────────────────────────────────────
  async fetchIdentity(account: string): Promise<XPRIdentity | null> {
    try {
      const response = await fetch(
        `${XPR_CONFIG.endpoints[0]}/v1/chain/get_table_rows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: XPR_CONFIG.contractAccount,
            scope: XPR_CONFIG.contractAccount,
            table: 'identities',
            lower_bound: account,
            upper_bound: account,
            limit: 1,
          }),
        }
      );
      const data = await response.json();

      if (!data.rows || data.rows.length === 0) return null;

      const row = data.rows[0];
      return {
        account: row.account,
        displayName: row.display_name,
        avatar: row.avatar_ipfs,
        signalPublicKey: row.signal_pub_key,
      };
    } catch {
      return null;
    }
  }

  // ── Transaction history ─────────────────────────────────────────────────────
  async getTransactionHistory(account: string): Promise<any[]> {
    try {
      const response = await fetch(
        `https://explorer.xprnetwork.org/api/v1/actions?account=${account}&limit=50`
      );
      const data = await response.json();
      return data.actions ?? [];
    } catch {
      return [];
    }
  }

  // ── Get current session actor ───────────────────────────────────────────────
  getActor(): string | null {
    return this.session?.auth.actor.toString() ?? null;
  }

  isAuthenticated(): boolean {
    return this.session !== null;
  }
}

export const xprService = new XPRService();
