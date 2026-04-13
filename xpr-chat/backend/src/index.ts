import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import rateLimit from 'express-rate-limit';

import { authRoutes } from './api/auth/authRoutes';
import { userRoutes } from './api/users/userRoutes';
import { txRoutes } from './api/transactions/txRoutes';
import { logger } from './utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// App Setup
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Socket.IO for real-time presence ─────────────────────────────────────
const io = new SocketServer(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
});

// ─── Global middleware ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// ─── Rate limiting ─────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/transactions', apiLimiter, txRoutes);

// ─── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'xpr-chat-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── Socket.IO — online presence ──────────────────────────────────────────
const onlineUsers = new Map<string, string>(); // socketId → xprAccount

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('presence:online', (xprAccount: string) => {
    onlineUsers.set(socket.id, xprAccount);
    io.emit('presence:update', { account: xprAccount, online: true });
    logger.info(`${xprAccount} came online`);
  });

  socket.on('disconnect', () => {
    const account = onlineUsers.get(socket.id);
    if (account) {
      onlineUsers.delete(socket.id);
      io.emit('presence:update', { account, online: false });
      logger.info(`${account} went offline`);
    }
  });

  socket.on('presence:query', (accounts: string[]) => {
    const onlineSet = new Set(onlineUsers.values());
    const result = accounts.reduce<Record<string, boolean>>((acc, a) => {
      acc[a] = onlineSet.has(a);
      return acc;
    }, {});
    socket.emit('presence:response', result);
  });
});

// ─── Global error handler ──────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '4000', 10);

server.listen(PORT, () => {
  logger.info(`XPR Chat backend running on port ${PORT}`);
});

export { io };
