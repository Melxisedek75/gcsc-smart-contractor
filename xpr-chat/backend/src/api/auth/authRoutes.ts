import { Router } from 'express';
import { getNonce, verifyAndLogin, refreshToken } from './authController';

export const authRoutes = Router();

authRoutes.get('/nonce', getNonce);
authRoutes.post('/verify', verifyAndLogin);
authRoutes.post('/refresh', refreshToken);
