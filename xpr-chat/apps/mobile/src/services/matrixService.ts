import {
  createClient,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomMember,
  EventType,
  MsgType,
  ClientEvent,
} from 'matrix-js-sdk';
import { encryptionService } from './encryptionService';

// ─────────────────────────────────────────────────────────────────────────────
// Matrix Config
// ─────────────────────────────────────────────────────────────────────────────
const MATRIX_CONFIG = {
  baseUrl: 'https://matrix.xprchat.io',
  identityServerUrl: 'https://identity.xprchat.io',
};

export interface MatrixMessage {
  id: string;
  roomId: string;
  sender: string;
  body: string;
  timestamp: number;
  type: 'text' | 'image' | 'file' | 'xpr_transfer';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  encrypted: boolean;
  metadata?: Record<string, any>;
}

export interface MatrixRoom {
  id: string;
  name: string;
  topic?: string;
  avatarUrl?: string;
  members: string[];
  lastMessage?: MatrixMessage;
  unreadCount: number;
  isDirect: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix Service
// ─────────────────────────────────────────────────────────────────────────────
class MatrixService {
  private client: MatrixClient | null = null;
  private userId: string = '';
  private messageListeners: Array<(message: MatrixMessage) => void> = [];

  // ── Create Matrix userId from XPR account ──────────────────────────────────
  xprToMatrixId(xprAccount: string): string {
    return `@${xprAccount}:xprchat.io`;
  }

  matrixToXpr(matrixId: string): string {
    return matrixId.replace('@', '').split(':')[0];
  }

  // ── Login with XPR account credentials ────────────────────────────────────
  async login(xprAccount: string, password: string): Promise<void> {
    const client = createClient({ baseUrl: MATRIX_CONFIG.baseUrl });

    const response = await client.loginWithPassword(
      this.xprToMatrixId(xprAccount),
      password
    );

    this.client = createClient({
      baseUrl: MATRIX_CONFIG.baseUrl,
      accessToken: response.access_token,
      userId: response.user_id,
      deviceId: response.device_id,
    });

    this.userId = response.user_id;
    await this.startSync();
  }

  // ── Register a new Matrix user ─────────────────────────────────────────────
  async register(xprAccount: string, password: string): Promise<void> {
    const client = createClient({ baseUrl: MATRIX_CONFIG.baseUrl });

    const response = await client.register(
      xprAccount,
      password,
      null,
      { kind: 'guest' }
    );

    this.client = createClient({
      baseUrl: MATRIX_CONFIG.baseUrl,
      accessToken: response.access_token,
      userId: response.user_id,
      deviceId: response.device_id,
    });

    this.userId = response.user_id;
    await this.startSync();
  }

  // ── Start real-time sync ───────────────────────────────────────────────────
  private async startSync(): Promise<void> {
    if (!this.client) return;

    // Enable E2E encryption
    await this.client.initCrypto();

    this.client.on(ClientEvent.Event, (event: MatrixEvent) => {
      if (event.getType() === EventType.RoomMessage) {
        const message = this.eventToMessage(event);
        if (message) {
          this.messageListeners.forEach((cb) => cb(message));
        }
      }
    });

    this.client.startClient({
      initialSyncLimit: 20,
      includeArchivedRooms: false,
    });
  }

  // ── Send text message ──────────────────────────────────────────────────────
  async sendMessage(roomId: string, body: string): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const content = {
      msgtype: MsgType.Text,
      body,
    };

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Send XPR transfer notification in chat ─────────────────────────────────
  async sendXPRTransfer(
    roomId: string,
    amount: number,
    txId: string,
    memo?: string
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const body = `💸 Sent ${(amount / 10000).toFixed(4)} XPR${memo ? ` — ${memo}` : ''}`;

    const content = {
      msgtype: 'org.xprchat.xpr_transfer' as MsgType,
      body,
      'org.xprchat.transfer': {
        amount,
        tx_id: txId,
        memo: memo ?? '',
      },
    };

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Send image via IPFS ────────────────────────────────────────────────────
  async sendImage(
    roomId: string,
    ipfsHash: string,
    mimeType: string,
    width: number,
    height: number
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const content = {
      msgtype: MsgType.Image,
      body: 'Image',
      url: `ipfs://${ipfsHash}`,
      info: { mimetype: mimeType, w: width, h: height },
    };

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Create direct message room ─────────────────────────────────────────────
  async createDirectRoom(recipientXPR: string): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const recipientId = this.xprToMatrixId(recipientXPR);
    const response = await this.client.createRoom({
      is_direct: true,
      invite: [recipientId],
      preset: 'trusted_private_chat' as any,
      initial_state: [
        {
          type: 'm.room.encryption',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
      ],
    });

    return response.room_id;
  }

  // ── Create group room ──────────────────────────────────────────────────────
  async createGroupRoom(name: string, members: string[]): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const inviteIds = members.map((m) => this.xprToMatrixId(m));

    const response = await this.client.createRoom({
      name,
      invite: inviteIds,
      preset: 'private_chat' as any,
      initial_state: [
        {
          type: 'm.room.encryption',
          content: { algorithm: 'm.megolm.v1.aes-sha2' },
        },
      ],
    });

    return response.room_id;
  }

  // ── Get all rooms ──────────────────────────────────────────────────────────
  getRooms(): MatrixRoom[] {
    if (!this.client) return [];

    return this.client.getRooms().map((room: Room) => ({
      id: room.roomId,
      name: room.name,
      topic: room.currentState.getStateEvents('m.room.topic', '')?.getContent()?.topic,
      avatarUrl: room.getAvatarUrl(MATRIX_CONFIG.baseUrl, 48, 48, 'crop') ?? undefined,
      members: room.getMembers().map((m: RoomMember) => m.userId),
      unreadCount: room.getUnreadNotificationCount() ?? 0,
      isDirect: room.getDMInviter() !== undefined ||
        room.currentState.getStateEvents('m.room.member').length === 2,
    }));
  }

  // ── Get room messages ──────────────────────────────────────────────────────
  getRoomMessages(roomId: string): MatrixMessage[] {
    if (!this.client) return [];

    const room = this.client.getRoom(roomId);
    if (!room) return [];

    return room
      .getLiveTimeline()
      .getEvents()
      .filter((e: MatrixEvent) => e.getType() === EventType.RoomMessage)
      .map((e: MatrixEvent) => this.eventToMessage(e))
      .filter(Boolean) as MatrixMessage[];
  }

  // ── Mark room as read ──────────────────────────────────────────────────────
  async markAsRead(roomId: string): Promise<void> {
    if (!this.client) return;
    const room = this.client.getRoom(roomId);
    if (!room) return;

    const timeline = room.getLiveTimeline().getEvents();
    const lastEvent = timeline[timeline.length - 1];
    if (lastEvent) {
      await this.client.sendReadReceipt(lastEvent);
    }
  }

  // ── Subscribe to new messages ──────────────────────────────────────────────
  onMessage(callback: (message: MatrixMessage) => void): () => void {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter((cb) => cb !== callback);
    };
  }

  // ── Convert Matrix event to app message ───────────────────────────────────
  private eventToMessage(event: MatrixEvent): MatrixMessage | null {
    const content = event.getContent();
    if (!content.body) return null;

    const msgtype = content.msgtype as string;

    let type: MatrixMessage['type'] = 'text';
    if (msgtype === MsgType.Image) type = 'image';
    else if (msgtype === 'org.xprchat.xpr_transfer') type = 'xpr_transfer';
    else if (msgtype === MsgType.File) type = 'file';

    return {
      id: event.getId() ?? '',
      roomId: event.getRoomId() ?? '',
      sender: this.matrixToXpr(event.getSender() ?? ''),
      body: content.body,
      timestamp: event.getTs(),
      type,
      status: 'delivered',
      encrypted: event.isEncrypted(),
      metadata: content['org.xprchat.transfer'],
    };
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  async stop(): Promise<void> {
    this.client?.stopClient();
    this.client = null;
  }

  getUserId(): string {
    return this.userId;
  }

  isConnected(): boolean {
    return this.client !== null;
  }
}

export const matrixService = new MatrixService();
