import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middleware/auth';

const XPR_EXPLORER = 'https://explorer.xprnetwork.org/api/v1';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/:account — Transaction history
// ─────────────────────────────────────────────────────────────────────────────
export const getTransactions = async (req: Request, res: Response): Promise<void> => {
  const { account } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10), 100);
  const offset = parseInt(req.query.offset as string ?? '0', 10);

  if (!/^[a-z1-5.]{1,12}$/.test(account)) {
    res.status(400).json({ error: 'Invalid XPR account name' });
    return;
  }

  try {
    const response = await fetch(
      `${XPR_EXPLORER}/actions?account=${account}&limit=${limit}&skip=${offset}&filter=eosio.token:transfer,xtokens:transfer`
    );

    if (!response.ok) {
      res.status(500).json({ error: 'Failed to fetch transaction history' });
      return;
    }

    const data = await response.json();
    const actions = data.actions ?? [];

    const transactions = actions.map((action: any) => ({
      id: action.trx_id,
      type: action.act?.data?.from === account ? 'send' : 'receive',
      from: action.act?.data?.from,
      to: action.act?.data?.to,
      amount: action.act?.data?.quantity,
      memo: action.act?.data?.memo,
      timestamp: action.timestamp,
      blockNum: action.block_num,
      explorerUrl: `https://explorer.xprnetwork.org/transaction/${action.trx_id}`,
    }));

    res.json({ transactions, total: data.total ?? transactions.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/transactions/tx/:txId — Single transaction
// ─────────────────────────────────────────────────────────────────────────────
export const getTransaction = async (req: Request, res: Response): Promise<void> => {
  const { txId } = req.params;

  try {
    const response = await fetch(
      `https://api.xprnetwork.org/v1/history/get_transaction`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: txId }),
      }
    );

    if (!response.ok) {
      res.status(404).json({ error: 'Transaction not found' });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
};
