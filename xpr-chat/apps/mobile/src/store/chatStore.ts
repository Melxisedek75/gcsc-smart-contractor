import { create } from 'zustand';
import { matrixService, MatrixMessage, MatrixRoom } from '../services/matrixService';

interface ChatState {
  rooms: MatrixRoom[];
  activeRoomId: string | null;
  messages: Record<string, MatrixMessage[]>;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  typingUsers: Record<string, string[]>;

  // Actions
  loadRooms: () => void;
  loadMessages: (roomId: string) => void;
  setActiveRoom: (roomId: string | null) => void;
  sendMessage: (roomId: string, body: string) => Promise<void>;
  sendXPRTransfer: (roomId: string, amount: number, txId: string, memo?: string) => Promise<void>;
  createDirectRoom: (recipientXPR: string) => Promise<string>;
  createGroupRoom: (name: string, members: string[]) => Promise<string>;
  markAsRead: (roomId: string) => Promise<void>;
  addMessage: (message: MatrixMessage) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: [],
  activeRoomId: null,
  messages: {},
  isLoadingRooms: false,
  isLoadingMessages: false,
  typingUsers: {},

  loadRooms: () => {
    set({ isLoadingRooms: true });
    try {
      const rooms = matrixService.getRooms();
      set({ rooms, isLoadingRooms: false });
    } catch {
      set({ isLoadingRooms: false });
    }
  },

  loadMessages: (roomId: string) => {
    set({ isLoadingMessages: true });
    try {
      const messages = matrixService.getRoomMessages(roomId);
      set((state) => ({
        messages: { ...state.messages, [roomId]: messages },
        isLoadingMessages: false,
      }));
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  setActiveRoom: (roomId) => set({ activeRoomId: roomId }),

  sendMessage: async (roomId, body) => {
    await matrixService.sendMessage(roomId, body);
  },

  sendXPRTransfer: async (roomId, amount, txId, memo) => {
    await matrixService.sendXPRTransfer(roomId, amount, txId, memo);
  },

  createDirectRoom: async (recipientXPR) => {
    const roomId = await matrixService.createDirectRoom(recipientXPR);
    get().loadRooms();
    return roomId;
  },

  createGroupRoom: async (name, members) => {
    const roomId = await matrixService.createGroupRoom(name, members);
    get().loadRooms();
    return roomId;
  },

  markAsRead: async (roomId) => {
    await matrixService.markAsRead(roomId);
    set((state) => ({
      rooms: state.rooms.map((r) =>
        r.id === roomId ? { ...r, unreadCount: 0 } : r
      ),
    }));
  },

  addMessage: (message) => {
    set((state) => {
      const roomMessages = state.messages[message.roomId] ?? [];
      // Avoid duplicates
      if (roomMessages.some((m) => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          [message.roomId]: [...roomMessages, message],
        },
      };
    });
  },
}));
