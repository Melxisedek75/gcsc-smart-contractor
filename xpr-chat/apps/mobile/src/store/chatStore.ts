import { create } from 'zustand';
import { matrixService, MatrixMessage, MatrixRoom, TypingEvent } from '../services/matrixService';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
interface ChatState {
  rooms: MatrixRoom[];
  activeRoomId: string | null;
  messages: Record<string, MatrixMessage[]>;
  typingUsers: Record<string, string[]>;       // roomId → typing accounts
  readStatuses: Record<string, Record<string, string>>; // roomId → userId → eventId
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  syncState: string;

  // Actions
  loadRooms: () => void;
  loadMessages: (roomId: string) => void;
  loadMoreMessages: (roomId: string) => Promise<void>;
  setActiveRoom: (roomId: string | null) => void;
  sendMessage: (roomId: string, body: string, replyToId?: string) => Promise<void>;
  sendXPRTransfer: (roomId: string, amount: number, txId: string, symbol?: string, memo?: string) => Promise<void>;
  sendImage: (roomId: string, ipfsHash: string, mimeType: string, w: number, h: number, size: number) => Promise<void>;
  createDirectRoom: (recipientXPR: string) => Promise<string>;
  createGroupRoom: (name: string, members: string[], isPublic?: boolean) => Promise<string>;
  joinRoom: (roomIdOrAlias: string) => Promise<string>;
  leaveRoom: (roomId: string) => Promise<void>;
  markAsRead: (roomId: string) => Promise<void>;
  setTyping: (roomId: string, isTyping: boolean) => void;
  addMessage: (message: MatrixMessage) => void;
  updateTyping: (ev: TypingEvent) => void;
  setSyncState: (state: string) => void;
  searchPublicRooms: (query: string) => Promise<MatrixRoom[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────
export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  typingUsers: {},
  readStatuses: {},
  isLoadingRooms: false,
  isLoadingMessages: false,
  syncState: 'STOPPED',

  loadRooms: () => {
    set({ isLoadingRooms: true });
    try {
      const rooms = matrixService.getRooms();
      // Sort by last message timestamp descending
      rooms.sort((a, b) => {
        const ta = a.lastMessage?.timestamp ?? 0;
        const tb = b.lastMessage?.timestamp ?? 0;
        return tb - ta;
      });
      set({ rooms, isLoadingRooms: false });
    } catch {
      set({ isLoadingRooms: false });
    }
  },

  loadMessages: (roomId) => {
    set({ isLoadingMessages: true });
    try {
      const messages = matrixService.getRoomMessages(roomId);
      set((s) => ({
        messages: { ...s.messages, [roomId]: messages },
        isLoadingMessages: false,
      }));
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  loadMoreMessages: async (roomId) => {
    const messages = await matrixService.loadMoreMessages(roomId, 30);
    set((s) => ({ messages: { ...s.messages, [roomId]: messages } }));
  },

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  sendMessage: async (roomId, body, replyToId) => {
    await matrixService.sendMessage(roomId, body, replyToId);
  },

  sendXPRTransfer: async (roomId, amount, txId, symbol, memo) => {
    await matrixService.sendXPRTransfer(roomId, amount, txId, symbol, memo);
  },

  sendImage: async (roomId, ipfsHash, mimeType, w, h, size) => {
    await matrixService.sendImage(roomId, ipfsHash, mimeType, w, h, size);
  },

  createDirectRoom: async (recipientXPR) => {
    const roomId = await matrixService.createDirectRoom(recipientXPR);
    get().loadRooms();
    return roomId;
  },

  createGroupRoom: async (name, members, isPublic = false) => {
    const roomId = await matrixService.createGroupRoom(name, members, isPublic);
    get().loadRooms();
    return roomId;
  },

  joinRoom: async (roomIdOrAlias) => {
    const roomId = await matrixService.joinRoom(roomIdOrAlias);
    get().loadRooms();
    return roomId;
  },

  leaveRoom: async (roomId) => {
    await matrixService.leaveRoom(roomId);
    set((s) => ({
      rooms: s.rooms.filter((r) => r.id !== roomId),
    }));
  },

  markAsRead: async (roomId) => {
    await matrixService.markAsRead(roomId);
    set((s) => ({
      rooms: s.rooms.map((r) =>
        r.id === roomId ? { ...r, unreadCount: 0 } : r
      ),
    }));
  },

  setTyping: (roomId, isTyping) => {
    matrixService.sendTyping(roomId, isTyping).catch(() => {});
  },

  addMessage: (message) => {
    set((s) => {
      const existing = s.messages[message.roomId] ?? [];
      if (existing.some((m) => m.id === message.id)) return s;
      return {
        messages: {
          ...s.messages,
          [message.roomId]: [...existing, message],
        },
        // Bump room to top and update last message
        rooms: s.rooms
          .map((r) =>
            r.id === message.roomId
              ? { ...r, lastMessage: message, unreadCount: r.id === s.activeRoomId ? 0 : r.unreadCount + 1 }
              : r
          )
          .sort((a, b) => (b.lastMessage?.timestamp ?? 0) - (a.lastMessage?.timestamp ?? 0)),
      };
    });
  },

  updateTyping: (ev) => {
    set((s) => ({
      typingUsers: { ...s.typingUsers, [ev.roomId]: ev.users },
    }));
  },

  setSyncState: (state) => set({ syncState: state }),

  searchPublicRooms: async (query) => {
    return matrixService.searchPublicRooms(query);
  },
}));
