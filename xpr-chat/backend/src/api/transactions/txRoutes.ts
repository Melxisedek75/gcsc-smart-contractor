import { Router } from 'express';
import { getTransactions, getTransaction } from './txController';

export const txRoutes = Router();

txRoutes.get('/tx/:txId', getTransaction);
txRoutes.get('/:account', getTransactions);
