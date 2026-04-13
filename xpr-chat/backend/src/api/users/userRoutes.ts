import { Router } from 'express';
import { getUserProfile, searchUsers, getMe } from './userController';
import { requireAuth } from '../../middleware/auth';

export const userRoutes = Router();

userRoutes.get('/me', requireAuth, getMe);
userRoutes.get('/search', searchUsers);
userRoutes.get('/:account', getUserProfile);
