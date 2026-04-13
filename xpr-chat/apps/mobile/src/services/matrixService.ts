import {
  createClient,
  MatrixClient,
  MatrixEvent,
  Room,
  RoomMember,
  EventType,
  MsgType,
  ClientEvent,
  RoomEvent,
  MembershipEventContent,
  AutoDiscovery,
  MemoryStore,
  IndexedDBCryptoStore,
} from 'matrix-js-sdk';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const MATRIX_CONFIG = {
  baseUrl: 'https://matrix.xprchat.io',
  identityServerUrl: 'https://identity.xprchat.io',
};

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface MatrixMessage {
  id: string;
  roomId: string;
  sender: string;
  body: string;
  timestamp: number;
  type: 'text' | 'image' | 'file' | 'audio' | 'xpr_transfer';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  encrypted: boolean;
  editedAt?: number;
  replyTo?: string;
  metadata?: Record<string, any>;
  localId?: string; // optimistic id before echo
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
  isEncrypted: boolean;
  typingUsers: string[];
}

export interface TypingEvent {
  roomId: string;
  users: string[];
}

export interface ReadReceiptEvent {
  roomId: string;
  eventId: string;
  userId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Matrix Service
// ─────────────────────────────────────────────────────────────────────────────
class MatrixService {
  private client: MatrixClient | null = null;
  private userId = '';
  private accessToken = '';
  private deviceId = '';

  private messageListeners: Array<(msg: MatrixMessage) => void> = [];
  private typingListeners: Array<(ev: TypingEvent) => void> = [];
  private receiptListeners: Array<(ev: ReadReceiptEvent) => void> = [];
  private syncListeners: Array<(state: string) => void> = [];

  // ── ID helpers ─────────────────────────────────────────────────────────────
  xprToMatrixId(xprAccount: string): string {
    return `@${xprAccount}:xprchat.io`;
  }

  matrixToXpr(matrixId: string): string {
    return matrixId.replace('@', '').split(':')[0];
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  async login(xprAccount: string, password: string): Promise<void> {
    const tmp = createClient({ baseUrl: MATRIX_CONFIG.baseUrl });

    const response = await tmp.loginWithPassword(
      this.xprToMatrixId(xprAccount),
      password
    );

    this.accessToken = response.access_token;
    this.userId = response.user_id;
    this.deviceId = response.device_id ?? '';

    await this._buildClient();
  }

  // ── Register ───────────────────────────────────────────────────────────────
  async register(xprAccount: string, password: string): Promise<void> {
    const tmp = createClient({ baseUrl: MATRIX_CONFIG.baseUrl });

    const response = await (tmp as any).register(
      xprAccount,
      password,
      null,
      { kind: 'user' }
    );

    this.accessToken = response.access_token;
    this.userId = response.user_id;
    this.deviceId = response.device_id ?? '';

    await this._buildClient();
  }

  // ── Restore existing session from stored creds ─────────────────────────────
  async restoreSession(
    userId: string,
    accessToken: string,
    deviceId: string
  ): Promise<void> {
    this.userId = userId;
    this.accessToken = accessToken;
    this.deviceId = deviceId;
    await this._buildClient();
  }

  // ── Build and start client ─────────────────────────────────────────────────
  private async _buildClient(): Promise<void> {
    this.client = createClient({
      baseUrl: MATRIX_CONFIG.baseUrl,
      accessToken: this.accessToken,
      userId: this.userId,
      deviceId: this.deviceId,
      store: new MemoryStore({ localStorage: undefined }),
      cryptoStore: new IndexedDBCryptoStore(undefined, 'xpr-chat-crypto'),
      timelineSupport: true,
      unstableClientRelationAggregation: true,
    });

    // Init E2E crypto (Olm/Megolm)
    await this.client.initRustCrypto?.() ?? await this.client.initCrypto?.();

    this._registerListeners();

    this.client.startClient({
      initialSyncLimit: 30,
      includeArchivedRooms: false,
      lazyLoadMembers: true,
    });
  }

  // ── Register all event listeners ───────────────────────────────────────────
  private _registerListeners(): void {
    if (!this.client) return;

    // New / decrypted messages
    this.client.on(ClientEvent.Event, (event: MatrixEvent) => {
      if (
        event.getType() === EventType.RoomMessage ||
        event.getType() === 'm.room.encrypted'
      ) {
        const msg = this._eventToMessage(event);
        if (msg) this.messageListeners.forEach((cb) => cb(msg));
      }
    });

    // Typing indicators
    this.client.on(RoomEvent.Timeline as any, () => {});
    this.client.on('RoomMember.typing' as any, (_event: any, member: RoomMember) => {
      const room = this.client?.getRoom(member.roomId);
      if (!room) return;
      const typingMembers = room.getMembersWithMembership('join')
        .filter((m: RoomMember) => (m as any).typing)
        .map((m: RoomMember) => this.matrixToXpr(m.userId));
      this.typingListeners.forEach((cb) =>
        cb({ roomId: member.roomId, users: typingMembers })
      );
    });

    // Read receipts
    this.client.on('Room.receipt' as any, (event: MatrixEvent, room: Room) => {
      const content = event.getContent();
      Object.entries(content).forEach(([eventId, receiptsByType]) => {
        const readReceipts = (receiptsByType as any)['m.read'] ?? {};
        Object.keys(readReceipts).forEach((userId) => {
          this.receiptListeners.forEach((cb) =>
            cb({ roomId: room.roomId, eventId, userId })
          );
        });
      });
    });

    // Sync state
    this.client.on(ClientEvent.Sync as any, (state: string) => {
      this.syncListeners.forEach((cb) => cb(state));
    });

    // After decrypt — re-emit
    this.client.on('Event.decrypted' as any, (event: MatrixEvent) => {
      const msg = this._eventToMessage(event);
      if (msg) this.messageListeners.forEach((cb) => cb(msg));
    });
  }

  // ── Send text message ──────────────────────────────────────────────────────
  async sendMessage(
    roomId: string,
    body: string,
    replyToEventId?: string
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    let content: any = { msgtype: MsgType.Text, body };

    if (replyToEventId) {
      content['m.relates_to'] = {
        'm.in_reply_to': { event_id: replyToEventId },
      };
    }

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Send XPR transfer event ────────────────────────────────────────────────
  async sendXPRTransfer(
    roomId: string,
    amount: number,
    txId: string,
    symbol = 'XPR',
    memo?: string
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const displayAmount = (amount / 10000).toFixed(4);
    const body = `⚡ Sent ${displayAmount} ${symbol}${memo ? ` · ${memo}` : ''}`;

    const content = {
      msgtype: 'org.xprchat.xpr_transfer' as MsgType,
      body,
      'org.xprchat.transfer': { amount, symbol, tx_id: txId, memo: memo ?? '' },
    };

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Send image (IPFS) ──────────────────────────────────────────────────────
  async sendImage(
    roomId: string,
    ipfsHash: string,
    mimeType: string,
    width: number,
    height: number,
    size: number
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const content = {
      msgtype: MsgType.Image,
      body: 'Image',
      url: `ipfs://${ipfsHash}`,
      info: { mimetype: mimeType, w: width, h: height, size },
    };

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Send file ──────────────────────────────────────────────────────────────
  async sendFile(
    roomId: string,
    ipfsHash: string,
    filename: string,
    mimeType: string,
    size: number
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const content = {
      msgtype: MsgType.File,
      body: filename,
      url: `ipfs://${ipfsHash}`,
      info: { mimetype: mimeType, size },
    };

    const response = await this.client.sendMessage(roomId, content);
    return response.event_id;
  }

  // ── Send typing notification ───────────────────────────────────────────────
  async sendTyping(roomId: string, isTyping: boolean): Promise<void> {
    if (!this.client) return;
    await this.client.sendTyping(roomId, isTyping, 4000);
  }

  // ── Mark room as read ──────────────────────────────────────────────────────
  async markAsRead(roomId: string): Promise<void> {
    if (!this.client) return;
    const room = this.client.getRoom(roomId);
    if (!room) return;
    const events = room.getLiveTimeline().getEvents();
    const last = events[events.length - 1];
    if (last) {
      await this.client.sendReadReceipt(last);
      await this.client.setRoomReadMarkers(roomId, last.getId()!);
    }
  }

  // ── Create DM room ─────────────────────────────────────────────────────────
  async createDirectRoom(recipientXPR: string): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    // Check if DM room already exists
    const existing = this._findExistingDM(recipientXPR);
    if (existing) return existing;

    const response = await this.client.createRoom({
      is_direct: true,
      invite: [this.xprToMatrixId(recipientXPR)],
      preset: 'trusted_private_chat' as any,
      initial_state: [
        { type: 'm.room.encryption', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
      ],
    });

    return response.room_id;
  }

  // ── Create group room ──────────────────────────────────────────────────────
  async createGroupRoom(
    name: string,
    members: string[],
    isPublic = false
  ): Promise<string> {
    if (!this.client) throw new Error('Matrix not initialized');

    const inviteIds = members.map((m) => this.xprToMatrixId(m));

    const response = await this.client.createRoom({
      name,
      invite: inviteIds,
      preset: isPublic ? ('public_chat' as any) : ('private_chat' as any),
      visibility: isPublic ? 'public' : 'private',
      initial_state: isPublic
        ? []
        : [{ type: 'm.room.encryption', content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
    });

    return response.room_id;
  }

  // ── Invite user to room ────────────────────────────────────────────────────
  async inviteUser(roomId: string, xprAccount: string): Promise<void> {
    if (!this.client) throw new Error('Matrix not initialized');
    await this.client.invite(roomId, this.xprToMatrixId(xprAccount));
  }

  // ── Leave room ─────────────────────────────────────────────────────────────
  async leaveRoom(roomId: string): Promise<void> {
    if (!this.client) return;
    await this.client.leave(roomId);
  }

  // ── Update room name/topic ─────────────────────────────────────────────────
  async setRoomName(roomId: string, name: string): Promise<void> {
    if (!this.client) return;
    await this.client.setRoomName(roomId, name);
  }

  async setRoomTopic(roomId: string, topic: string): Promise<void> {
    if (!this.client) return;
    await this.client.setRoomTopic(roomId, topic);
  }

  // ── Set display name / avatar ──────────────────────────────────────────────
  async setDisplayName(displayName: string): Promise<void> {
    if (!this.client) return;
    await this.client.setDisplayName(displayName);
  }

  async setAvatarUrl(mxcUrl: string): Promise<void> {
    if (!this.client) return;
    await this.client.setAvatarUrl(mxcUrl);
  }

  // ── Get all rooms ──────────────────────────────────────────────────────────
  getRooms(): MatrixRoom[] {
    if (!this.client) return [];

    return this.client
      .getRooms()
      .filter((r: Room) => r.getMyMembership() === 'join')
      .map((room: Room) => {
        const isDirect = this._isDirectRoom(room);
        const lastEvents = room.getLiveTimeline().getEvents();
        const lastMsgEvent = [...lastEvents]
          .reverse()
          .find((e) => e.getType() === EventType.RoomMessage);

        return {
          id: room.roomId,
          name: room.name,
          topic: room.currentState
            .getStateEvents('m.room.topic', '')
            ?.getContent()?.topic,
          avatarUrl:
            room.getAvatarUrl(MATRIX_CONFIG.baseUrl, 56, 56, 'crop') ?? undefined,
          members: room
            .getMembers()
            .map((m: RoomMember) => this.matrixToXpr(m.userId)),
          lastMessage: lastMsgEvent
            ? this._eventToMessage(lastMsgEvent) ?? undefined
            : undefined,
          unreadCount: room.getUnreadNotificationCount() ?? 0,
          isDirect,
          isEncrypted: room.hasEncryptionStateEvent(),
          typingUsers: [],
        };
      });
  }

  // ── Get messages for a room ────────────────────────────────────────────────
  getRoomMessages(roomId: string): MatrixMessage[] {
    if (!this.client) return [];
    const room = this.client.getRoom(roomId);
    if (!room) return [];

    return room
      .getLiveTimeline()
      .getEvents()
      .filter(
        (e: MatrixEvent) =>
          e.getType() === EventType.RoomMessage && e.getContent()?.body
      )
      .map((e: MatrixEvent) => this._eventToMessage(e))
      .filter(Boolean) as MatrixMessage[];
  }

  // ── Load more history ──────────────────────────────────────────────────────
  async loadMoreMessages(roomId: string, limit = 30): Promise<MatrixMessage[]> {
    if (!this.client) return [];
    const room = this.client.getRoom(roomId);
    if (!room) return [];

    await this.client.scrollback(room, limit);
    return this.getRoomMessages(roomId);
  }

  // ── Search public rooms (channels) ────────────────────────────────────────
  async searchPublicRooms(query: string, limit = 20): Promise<MatrixRoom[]> {
    if (!this.client) return [];

    const results = await this.client.publicRooms({
      limit,
      filter: { generic_search_term: query },
      server: 'xprchat.io',
    });

    return (results.chunk ?? []).map((r: any) => ({
      id: r.room_id,
      name: r.name ?? r.canonical_alias ?? r.room_id,
      topic: r.topic,
      avatarUrl: r.avatar_url,
      members: [],
      unreadCount: 0,
      isDirect: false,
      isEncrypted: false,
      typingUsers: [],
      memberCount: r.num_joined_members,
    }));
  }

  // ── Join a public room ─────────────────────────────────────────────────────
  async joinRoom(roomIdOrAlias: string): Promise<string> {
    if (!this.client) throw new Error('Not initialized');
    const result = await this.client.joinRoom(roomIdOrAlias);
    return result.roomId;
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────
  onMessage(cb: (msg: MatrixMessage) => void): () => void {
    this.messageListeners.push(cb);
    return () => { this.messageListeners = this.messageListeners.filter((x) => x !== cb); };
  }

  onTyping(cb: (ev: TypingEvent) => void): () => void {
    this.typingListeners.push(cb);
    return () => { this.typingListeners = this.typingListeners.filter((x) => x !== cb); };
  }

  onReadReceipt(cb: (ev: ReadReceiptEvent) => void): () => void {
    this.receiptListeners.push(cb);
    return () => { this.receiptListeners = this.receiptListeners.filter((x) => x !== cb); };
  }

  onSyncState(cb: (state: string) => void): () => void {
    this.syncListeners.push(cb);
    return () => { this.syncListeners = this.syncListeners.filter((x) => x !== cb); };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private _isDirectRoom(room: Room): boolean {
    const members = room.getMembers().filter(
      (m: RoomMember) => m.membership === 'join' || m.membership === 'invite'
    );
    return (
      members.length <= 2 ||
      room.currentState.getStateEvents('m.room.member').length <= 2
    );
  }

  private _findExistingDM(xprAccount: string): string | null {
    if (!this.client) return null;
    const targetId = this.xprToMatrixId(xprAccount);
    const dmRooms = this.client.getRooms().filter((r: Room) => {
      if (!this._isDirectRoom(r)) return false;
      return r.getMembers().some((m: RoomMember) => m.userId === targetId);
    });
    return dmRooms[0]?.roomId ?? null;
  }

  private _eventToMessage(event: MatrixEvent): MatrixMessage | null {
    const content = event.getContent();
    if (!content?.body) return null;

    const msgtype = content.msgtype as string;
    let type: MatrixMessage['type'] = 'text';
    if (msgtype === MsgType.Image) type = 'image';
    else if (msgtype === MsgType.File) type = 'file';
    else if (msgtype === MsgType.Audio) type = 'audio';
    else if (msgtype === 'org.xprchat.xpr_transfer') type = 'xpr_transfer';

    const replyRelation = content['m.relates_to']?.['m.in_reply_to'];

    return {
      id: event.getId() ?? `local-${Date.now()}`,
      roomId: event.getRoomId() ?? '',
      sender: this.matrixToXpr(event.getSender() ?? ''),
      body: content.body,
      timestamp: event.getTs(),
      type,
      status: 'delivered',
      encrypted: event.isEncrypted(),
      replyTo: replyRelation?.event_id,
      editedAt: content['m.new_content'] ? event.getTs() : undefined,
      metadata: type === 'xpr_transfer'
        ? content['org.xprchat.transfer']
        : type === 'image' || type === 'file'
        ? { url: content.url, info: content.info }
        : undefined,
    };
  }

  getCredentials() {
    return {
      userId: this.userId,
      accessToken: this.accessToken,
      deviceId: this.deviceId,
    };
  }

  getUserId(): string { return this.userId; }
  isConnected(): boolean { return this.client !== null; }

  async stop(): Promise<void> {
    this.client?.stopClient();
    this.client = null;
  }
}

export const matrixService = new MatrixService();
