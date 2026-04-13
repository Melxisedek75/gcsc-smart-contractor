import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';

const XPR_API = 'https://api.xprnetwork.org';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/:account — Fetch user identity from XPR chain
// ─────────────────────────────────────────────────────────────────────────────
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  const { account } = req.params;

  if (!/^[a-z1-5.]{1,12}$/.test(account)) {
    res.status(400).json({ error: 'Invalid XPR account name' });
    return;
  }

  try {
    // Fetch account from XPR chain
    const accountRes = await fetch(`${XPR_API}/v1/chain/get_account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: account }),
    });

    if (!accountRes.ok) {
      res.status(404).json({ error: 'Account not found on XPR Network' });
      return;
    }

    const accountData = await accountRes.json();

    // Fetch identity from xprchat contract
    const identityRes = await fetch(`${XPR_API}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'xprchat',
        scope: 'xprchat',
        table: 'identities',
        lower_bound: account,
        upper_bound: account,
        limit: 1,
      }),
    });

    const identityData = await identityRes.json();
    const identity = identityData.rows?.[0] ?? null;

    res.json({
      account,
      created: accountData.created,
      identity: identity
        ? {
            displayName: identity.display_name,
            avatar: identity.avatar_ipfs,
            signalPublicKey: identity.signal_pub_key,
            verified: Boolean(identity.signal_pub_key),
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/search?q=alice — Search XPR accounts
// ─────────────────────────────────────────────────────────────────────────────
export const searchUsers = async (req: Request, res: Response): Promise<void> => {
  const query = (req.query.q as string ?? '').toLowerCase().trim();

  if (!query || query.length < 2) {
    res.status(400).json({ error: 'Query must be at least 2 characters' });
    return;
  }

  try {
    // XPR Network name lookup via table rows
    const response = await fetch(`${XPR_API}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'xprchat',
        scope: 'xprchat',
        table: 'identities',
        lower_bound: query,
        limit: 10,
        key_type: 'name',
        index_position: 1,
      }),
    });

    const data = await response.json();

    const results = (data.rows ?? []).map((row: any) => ({
      account: row.account,
      displayName: row.display_name,
      avatar: row.avatar_ipfs,
      hasSignalKey: Boolean(row.signal_pub_key),
    }));

    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/users/me — Current user's profile
// ─────────────────────────────────────────────────────────────────────────────
export const getMe = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Delegate to getUserProfile
  req.params = { account: req.user.xprAccount };
  return getUserProfile(req, res);
};
