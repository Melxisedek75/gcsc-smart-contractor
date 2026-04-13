import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useMatrix } from '../../hooks/useMatrix';
import { useAuthStore } from '../../store/authStore';
import { MessageBubble } from '../../components/MessageBubble';
import { ChatInput } from '../../components/ChatInput';
import { TokenTransfer } from '../../components/TokenTransfer';
import { Avatar } from '../../components/Avatar';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { MatrixMessage } from '../../services/matrixService';

interface RouteParams {
  roomId: string;
  roomName: string;
  peerAccount?: string;
}

export const ChatRoomScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { roomId, roomName, peerAccount } = route.params as RouteParams;

  const { account } = useAuthStore();
  const { messages, sendMessage, sendXPRTransfer, loadMessages, markAsRead, setActiveRoom } =
    useMatrix();

  const [showTransfer, setShowTransfer] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const roomMessages: MatrixMessage[] = messages[roomId] ?? [];
  const myXPR = account?.actor ?? '';

  useEffect(() => {
    setActiveRoom(roomId);
    loadMessages(roomId);
    markAsRead(roomId);
    return () => setActiveRoom(null);
  }, [roomId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (roomMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [roomMessages.length]);

  const handleSendText = useCallback(
    async (text: string) => {
      await sendMessage(roomId, text);
    },
    [roomId, sendMessage]
  );

  const handleTransferSuccess = useCallback(
    async (txId: string, amount: number) => {
      await sendXPRTransfer(roomId, amount, txId);
    },
    [roomId, sendXPRTransfer]
  );

  const handleSendMedia = () => {
    // Open image picker — handled separately
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerCenter}
          onPress={() => navigation.navigate('Profile', { account: peerAccount })}
        >
          <Avatar account={peerAccount ?? roomName} size={36} showOnlineIndicator isOnline />
          <View style={styles.headerTitles}>
            <Text style={styles.headerName} numberOfLines={1}>
              {peerAccount ? `@${peerAccount}` : roomName}
            </Text>
            <Text style={styles.headerStatus}>
              🔒 E2E encrypted
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setShowTransfer(true)}
          >
            <Text style={styles.headerActionIcon}>⚡</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerActionBtn}>
            <Text style={styles.headerActionIcon}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={roomMessages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            const isOwn = item.sender === myXPR;
            const prevMsg = index > 0 ? roomMessages[index - 1] : null;
            const showSender = !isOwn && item.sender !== prevMsg?.sender;
            return (
              <MessageBubble
                message={item}
                isOwn={isOwn}
                showSender={showSender}
              />
            );
          }}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatIcon}>🔒</Text>
              <Text style={styles.emptyChatText}>
                Messages are end-to-end encrypted{'\n'}with Signal Protocol
              </Text>
            </View>
          }
        />

        {/* Input */}
        <ChatInput
          onSendText={handleSendText}
          onSendXPR={() => setShowTransfer(true)}
          onSendMedia={handleSendMedia}
        />
      </KeyboardAvoidingView>

      {/* XPR Transfer modal */}
      {peerAccount && (
        <TokenTransfer
          visible={showTransfer}
          recipientXPR={peerAccount}
          onClose={() => setShowTransfer(false)}
          onSuccess={handleTransferSuccess}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: Spacing.sm,
  },
  backButton: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },
  backIcon: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.mono,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitles: { flex: 1, gap: 2 },
  headerName: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  headerStatus: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  headerActionBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },
  headerActionIcon: {
    fontSize: 18,
    color: Colors.textSecondary,
  },

  messagesList: {
    paddingVertical: Spacing.sm,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },

  emptyChat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
    gap: Spacing.md,
    marginTop: '30%',
  },
  emptyChatIcon: { fontSize: 40 },
  emptyChatText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
