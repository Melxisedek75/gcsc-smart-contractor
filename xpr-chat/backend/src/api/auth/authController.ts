import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

const XPR_CHAIN_ID = '384da888112027f0321850a169f737c33e53515dfc5a246a483a9bcd12add47';
const XPR_API = 'https://api.xprnetwork.org';

// ─────────────────────────────────────────────────────────────────────────────
// Verify XPR Signature
// ─────────────────────────────────────────────────────────────────────────────
async function verifyXPRSignature(
  account: string,
  signature: string,
  nonce: string
): Promise<boolean> {
  try {
    // Fetch account's active public key from chain
    const response = await fetch(`${XPR_API}/v1/chain/get_account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_name: account }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    const activePermission = data.permissions?.find((p: any) => p.perm_name === 'active');

    if (!activePermission) return false;

    // In production: use eosjs to verify the signature against the nonce
    // The mobile app signs: sha256("xpr-chat-login:" + nonce) with WebAuth
    logger.info(`XPR signature verification for @${account}`);

    // For now return true — real implementation verifies EOSIO sig
    return true;
  } catch (err) {
    logger.error('XPR signature verification failed', { error: err });
    return false;
  }
}

// In-memory nonce store (use Redis in production)
const nonces = new Map<string, { nonce: string; expiresAt: number }>();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/nonce?account=alice
// ─────────────────────────────────────────────────────────────────────────────
export const getNonce = (req: Request, res: Response): void => {
  const account = req.query.account as string;

  if (!account || !/^[a-z1-5.]{1,12}$/.test(account)) {
    res.status(400).json({ error: 'Invalid XPR account name' });
    return;
  }

  const nonce = uuidv4();
  nonces.set(account, {
    nonce,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 min TTL
  });

  res.json({ nonce, message: `Sign to login to XPR Chat: ${nonce}` });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify
// ─────────────────────────────────────────────────────────────────────────────
export const verifyAndLogin = async (req: Request, res: Response): Promise<void> => {
  const { account, signature } = req.body;

  if (!account || !signature) {
    res.status(400).json({ error: 'account and signature are required' });
    return;
  }

  const stored = nonces.get(account);

  if (!stored) {
    res.status(400).json({ error: 'No nonce found, request a new one' });
    return;
  }

  if (Date.now() > stored.expiresAt) {
    nonces.delete(account);
    res.status(400).json({ error: 'Nonce expired' });
    return;
  }

  const valid = await verifyXPRSignature(account, signature, stored.nonce);

  if (!valid) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  nonces.delete(account);

  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
  const token = jwt.sign(
    { xprAccount: account },
    secret,
    { expiresIn: '30d' }
  );

  res.json({
    token,
    account,
    expiresIn: 30 * 24 * 60 * 60,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
export const refreshToken = (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token required' });
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

  try {
    const decoded = jwt.verify(token, secret, { ignoreExpiration: true }) as any;
    const newToken = jwt.sign(
      { xprAccount: decoded.xprAccount },
      secret,
      { expiresIn: '30d' }
    );
    res.json({ token: newToken, expiresIn: 30 * 24 * 60 * 60 });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};
