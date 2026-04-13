import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Admin push notification service
// ─────────────────────────────────────────────────────────────────────────────

interface PushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

class NotificationService {
  private firebaseApp: any = null;
  private messaging: any = null;

  async initialize(): Promise<void> {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      logger.warn('Firebase credentials not configured — push notifications disabled');
      return;
    }

    try {
      const admin = await import('firebase-admin');
      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
      } else {
        this.firebaseApp = admin.app();
      }
      this.messaging = admin.messaging();
      logger.info('Firebase Admin initialized');
    } catch (err) {
      logger.error('Firebase init failed', { error: err });
    }
  }

  // ── Send single push notification ─────────────────────────────────────────
  async sendPush(payload: PushPayload): Promise<boolean> {
    if (!this.messaging) return false;

    try {
      await this.messaging.send({
        token: payload.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: {
          priority: 'high',
          notification: { color: '#00D4FF', channelId: 'messages' },
        },
        apns: {
          payload: { aps: { badge: 1, sound: 'default' } },
        },
      });
      return true;
    } catch (err) {
      logger.warn('Push failed', { token: payload.token.slice(-8), error: err });
      return false;
    }
  }

  // ── New message notification ───────────────────────────────────────────────
  async notifyNewMessage(
    pushToken: string,
    senderXPR: string,
    preview: string,
    roomId: string
  ): Promise<void> {
    await this.sendPush({
      token: pushToken,
      title: `@${senderXPR}`,
      body: preview.slice(0, 100),
      data: { type: 'message', roomId, sender: senderXPR },
    });
  }

  // ── XPR transfer received notification ────────────────────────────────────
  async notifyXPRReceived(
    pushToken: string,
    fromXPR: string,
    amount: number,
    symbol: string,
    txId: string
  ): Promise<void> {
    const displayAmount = (amount / 10000).toFixed(4);
    await this.sendPush({
      token: pushToken,
      title: '⚡ XPR Received',
      body: `@${fromXPR} sent you ${displayAmount} ${symbol}`,
      data: { type: 'xpr_received', from: fromXPR, amount: amount.toString(), txId },
    });
  }

  // ── Group invite notification ──────────────────────────────────────────────
  async notifyGroupInvite(
    pushToken: string,
    inviter: string,
    groupName: string,
    roomId: string
  ): Promise<void> {
    await this.sendPush({
      token: pushToken,
      title: 'Group Invite',
      body: `@${inviter} invited you to "${groupName}"`,
      data: { type: 'group_invite', roomId, inviter, groupName },
    });
  }
}

export const notificationService = new NotificationService();
