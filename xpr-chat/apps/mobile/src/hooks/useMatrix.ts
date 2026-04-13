import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '../store/chatStore';
import { matrixService, MatrixMessage, TypingEvent, ReadReceiptEvent } from '../services/matrixService';
import { notificationService } from '../services/notificationService';
import { useAuthStore } from '../store/authStore';

export const useMatrix = () => {
  const store = useChatStore();
  const { account } = useAuthStore();
  const myXPR = account?.actor ?? '';

  // ── Subscribe to all Matrix events on mount ────────────────────────────────
  useEffect(() => {
    const unsubMessage = matrixService.onMessage((message: MatrixMessage) => {
      store.addMessage(message);

      // Push notification for messages not from self
      if (message.sender !== myXPR) {
        notificationService.showMessage(
          message.sender,
          message.type === 'xpr_transfer'
            ? `Sent you XPR`
            : message.body.slice(0, 80),
          message.roomId
        );
      }
    });

    const unsubTyping = matrixService.onTyping((ev: TypingEvent) => {
      store.updateTyping(ev);
    });

    const unsubSync = matrixService.onSyncState((state: string) => {
      store.setSyncState(state);
      if (state === 'PREPARED' || state === 'SYNCING') {
        store.loadRooms();
      }
    });

    return () => {
      unsubMessage();
      unsubTyping();
      unsubSync();
    };
  }, [myXPR]);

  // ── Load rooms once connected ──────────────────────────────────────────────
  useEffect(() => {
    if (matrixService.isConnected()) {
      store.loadRooms();
    }
  }, []);

  const sendMessage = useCallback(
    (roomId: string, body: string, replyToId?: string) =>
      store.sendMessage(roomId, body, replyToId),
    []
  );

  const setTypingDebounced = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTyping = useCallback((roomId: string, isTyping: boolean) => {
    if (setTypingDebounced.current) clearTimeout(setTypingDebounced.current);
    store.setTyping(roomId, isTyping);
    if (isTyping) {
      setTypingDebounced.current = setTimeout(
        () => store.setTyping(roomId, false),
        4000
      );
    }
  }, []);

  return {
    rooms: store.rooms,
    messages: store.messages,
    activeRoomId: store.activeRoomId,
    typingUsers: store.typingUsers,
    isLoadingRooms: store.isLoadingRooms,
    isLoadingMessages: store.isLoadingMessages,
    syncState: store.syncState,
    loadRooms: store.loadRooms,
    loadMessages: store.loadMessages,
    loadMoreMessages: store.loadMoreMessages,
    setActiveRoom: store.setActiveRoom,
    sendMessage,
    sendXPRTransfer: store.sendXPRTransfer,
    sendImage: store.sendImage,
    createDirectRoom: store.createDirectRoom,
    createGroupRoom: store.createGroupRoom,
    joinRoom: store.joinRoom,
    leaveRoom: store.leaveRoom,
    markAsRead: store.markAsRead,
    handleTyping,
    searchPublicRooms: store.searchPublicRooms,
  };
};
