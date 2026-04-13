import { useEffect, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { matrixService, MatrixMessage } from '../services/matrixService';

export const useMatrix = () => {
  const store = useChatStore();

  // Subscribe to incoming messages
  useEffect(() => {
    const unsubscribe = matrixService.onMessage((message: MatrixMessage) => {
      store.addMessage(message);
      store.loadRooms(); // refresh room list for last message + unread count
    });

    return unsubscribe;
  }, []);

  return {
    rooms: store.rooms,
    messages: store.messages,
    activeRoomId: store.activeRoomId,
    isLoadingRooms: store.isLoadingRooms,
    isLoadingMessages: store.isLoadingMessages,
    loadRooms: store.loadRooms,
    loadMessages: store.loadMessages,
    setActiveRoom: store.setActiveRoom,
    sendMessage: store.sendMessage,
    sendXPRTransfer: store.sendXPRTransfer,
    createDirectRoom: store.createDirectRoom,
    createGroupRoom: store.createGroupRoom,
    markAsRead: store.markAsRead,
  };
};
