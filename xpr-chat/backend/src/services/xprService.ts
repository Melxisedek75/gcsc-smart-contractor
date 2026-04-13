import { logger } from '../utils/logger';

const XPR_API = process.env.XPR_ENDPOINT ?? 'https://api.xprnetwork.org';
const CHAIN_ID = '384da888112027f0321850a169f737c33e53515dfc5a246a483a9bcd12add47';
const CONTRACT = process.env.XPR_CONTRACT_ACCOUNT ?? 'xprchat';

// ─────────────────────────────────────────────────────────────────────────────
// XPR Network backend service
// ─────────────────────────────────────────────────────────────────────────────

export interface XPRAccountInfo {
  account_name: string;
  created: string;
  core_liquid_balance?: string;
  permissions: Array<{ perm_name: string; required_auth: { keys: Array<{ key: string }> } }>;
}

export interface XPRIdentity {
  account: string;
  display_name: string;
  avatar_ipfs: string;
  signal_pub_key: string;
  created_at: number;
  updated_at: number;
}

// ── Get XPR account info from chain ──────────────────────────────────────────
export async function getXPRAccount(
  accountName: string
): Promise<XPRAccountInfo | null> {
  try {
    const response = await fetch(`${XPR_API}/v1/chain/get_account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: accountName }),
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 500) return null; // account not found
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return response.json();
  } catch (err) {
    logger.error('getXPRAccount failed', { account: accountName, error: err });
    return null;
  }
}

// ── Get identity from xprchat contract ────────────────────────────────────────
export async function getXPRIdentity(
  accountName: string
): Promise<XPRIdentity | null> {
  try {
    const response = await fetch(`${XPR_API}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: CONTRACT,
        scope: CONTRACT,
        table: 'identities',
        lower_bound: accountName,
        upper_bound: accountName,
        limit: 1,
        key_type: 'name',
        index_position: 1,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.rows?.[0] ?? null;
  } catch (err) {
    logger.error('getXPRIdentity failed', { account: accountName, error: err });
    return null;
  }
}

// ── Get XPR token balance ─────────────────────────────────────────────────────
export async function getXPRBalance(accountName: string): Promise<{
  xpr: string;
  xusdt: string;
}> {
  try {
    const [xprRes, xusdtRes] = await Promise.all([
      fetch(`${XPR_API}/v1/chain/get_currency_balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'eosio.token', account: accountName, symbol: 'XPR' }),
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${XPR_API}/v1/chain/get_currency_balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'xtokens', account: accountName, symbol: 'XUSDT' }),
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    const xprAmounts: string[] = xprRes.ok ? await xprRes.json() : [];
    const xusdtAmounts: string[] = xusdtRes.ok ? await xusdtRes.json() : [];

    return {
      xpr: xprAmounts[0] ?? '0.0000 XPR',
      xusdt: xusdtAmounts[0] ?? '0.0000 XUSDT',
    };
  } catch (err) {
    logger.error('getXPRBalance failed', { account: accountName, error: err });
    return { xpr: '0.0000 XPR', xusdt: '0.0000 XUSDT' };
  }
}

// ── Verify that an XPR account exists ────────────────────────────────────────
export async function accountExists(accountName: string): Promise<boolean> {
  const info = await getXPRAccount(accountName);
  return info !== null;
}
