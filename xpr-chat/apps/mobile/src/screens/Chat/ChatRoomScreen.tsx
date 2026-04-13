import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { useMatrix } from '../../hooks/useMatrix';
import { useAuthStore } from '../../store/authStore';
import { MessageBubble } from '../../components/MessageBubble';
import { ChatInput } from '../../components/ChatInput';
import { TokenTransfer } from '../../components/TokenTransfer';
import { Avatar } from '../../components/Avatar';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { MatrixMessage } from '../../services/matrixService';
import { ipfsService } from '../../services/ipfsService';
import { truncate } from '../../utils/formatters';

interface RouteParams {
  roomId: string;
  roomName: string;
  peerAccount?: string;
  isGroup?: boolean;
}

// ─── Reply Banner ────────────────────────────────────────────────────────────
const ReplyBanner: React.FC<{
  message: MatrixMessage;
  onDismiss: () => void;
}> = ({ message, onDismiss }) => (
  <View style={styles.replyBanner}>
    <View style={styles.replyAccent} />
    <View style={styles.replyContent}>
      <Text style={styles.replyLabel}>Replying to @{message.sender}</Text>
      <Text style={styles.replyPreview} numberOfLines={1}>
        {truncate(message.body, 60)}
      </Text>
    </View>
    <TouchableOpacity onPress={onDismiss} style={styles.replyClose}>
      <Text style={styles.replyCloseText}>✕</Text>
    </TouchableOpacity>
  </View>
);

// ─── Typing indicator ────────────────────────────────────────────────────────
const TypingIndicator: React.FC<{ users: string[] }> = ({ users }) => {
  if (users.length === 0) return null;
  const label =
    users.length === 1
      ? `@${users[0]} is typing...`
      : `@${users[0]} and ${users.length - 1} others are typing...`;

  return (
    <View style={styles.typingRow}>
      <View style={styles.typingDots}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.typingDot, { opacity: 0.4 + i * 0.2 }]} />
        ))}
      </View>
      <Text style={styles.typingText}>{label}</Text>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Chat Room Screen
// ─────────────────────────────────────────────────────────────────────────────
export const ChatRoomScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { roomId, roomName, peerAccount, isGroup } = route.params as RouteParams;

  const { account } = useAuthStore();
  const {
    messages,
    typingUsers,
    sendMessage,
    sendXPRTransfer,
    sendImage,
    loadMessages,
    loadMoreMessages,
    markAsRead,
    setActiveRoom,
    handleTyping,
  } = useMatrix();

  const [showTransfer, setShowTransfer] = useState(false);
  const [replyTo, setReplyTo] = useState<MatrixMessage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const roomMessages: MatrixMessage[] = messages[roomId] ?? [];
  const myXPR = account?.actor ?? '';
  const roomTyping = typingUsers[roomId] ?? [];

  useEffect(() => {
    setActiveRoom(roomId);
    loadMessages(roomId);
    markAsRead(roomId);
    return () => { setActiveRoom(null); };
  }, [roomId]);

  useEffect(() => {
    if (roomMessages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [roomMessages.length]);

  // ── Send text ──────────────────────────────────────────────────────────────
  const handleSendText = useCallback(
    async (text: string) => {
      await sendMessage(roomId, text, replyTo?.id);
      setReplyTo(null);
    },
    [roomId, replyTo]
  );

  // ── Handle typing event from input ────────────────────────────────────────
  const handleTextChange = useCallback(
    (isTyping: boolean) => handleTyping(roomId, isTyping),
    [roomId]
  );

  // ── Send media via IPFS ────────────────────────────────────────────────────
  const handleSendMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to photo library to send images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    setIsUploading(true);

    try {
      const uploaded = await ipfsService.uploadImage(asset.uri, 0.85, 1920);
      await sendImage(
        roomId,
        uploaded.hash,
        'image/jpeg',
        uploaded.width,
        uploaded.height,
        uploaded.size
      );
    } catch (err) {
      Alert.alert('Upload failed', 'Could not upload image to IPFS.');
    } finally {
      setIsUploading(false);
    }
  }, [roomId]);

  // ── XPR transfer success ───────────────────────────────────────────────────
  const handleTransferSuccess = useCallback(
    async (txId: string, amount: number, symbol: string, memo?: string) => {
      await sendXPRTransfer(roomId, amount, txId, symbol, memo);
    },
    [roomId]
  );

  // ── Load older messages on scroll to top ──────────────────────────────────
  const handleScrollToTop = useCallback(async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    await loadMoreMessages(roomId);
    setIsLoadingMore(false);
  }, [roomId, isLoadingMore]);

  // ── Long press message → reply ────────────────────────────────────────────
  const handleLongPress = useCallback((message: MatrixMessage) => {
    Alert.alert('Message', undefined, [
      { text: 'Reply', onPress: () => setReplyTo(message) },
      { text: 'Copy', onPress: () => {} },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const displayName = isGroup
    ? roomName
    : peerAccount
    ? `@${peerAccount}`
    : roomName;

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
          onPress={() =>
            isGroup
              ? navigation.navigate('GroupInfo', { roomId })
              : navigation.navigate('Profile', { account: peerAccount })
          }
        >
          <Avatar
            account={peerAccount ?? roomName}
            size={36}
            showOnlineIndicator={!isGroup}
            isOnline={false}
          />
          <View style={styles.headerTitles}>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            <View style={styles.headerStatusRow}>
              <View style={styles.encryptedDot} />
              <Text style={styles.headerStatus}>End-to-end encrypted</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() => setShowTransfer(true)}
          >
            <Text style={styles.headerActionIcon}>⚡</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionBtn}
            onPress={() =>
              navigation.navigate(isGroup ? 'GroupInfo' : 'Profile', {
                roomId,
                account: peerAccount,
              })
            }
          >
            <Text style={styles.headerActionIcon}>⋮</Text>
          </TouchableOpacity>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages list */}
        <FlatList
          ref={flatListRef}
          data={roomMessages}
          keyExtractor={(m) => m.id}
          renderItem={({ item, index }) => {
            const isOwn = item.sender === myXPR;
            const prev = index > 0 ? roomMessages[index - 1] : null;
            const next = index < roomMessages.length - 1
              ? roomMessages[index + 1]
              : null;
            const showSender = isGroup && !isOwn && item.sender !== prev?.sender;
            const isFirst = item.sender !== prev?.sender;
            const isLast = item.sender !== next?.sender;

            return (
              <MessageBubble
                message={item}
                isOwn={isOwn}
                showSender={showSender}
                isFirst={isFirst}
                isLast={isLast}
                onLongPress={() => handleLongPress(item)}
                onReply={() => setReplyTo(item)}
              />
            );
          }}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.05}
          ListHeaderComponent={
            isLoadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          onScrollBeginDrag={() => handleScrollToTop()}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatIcon}>🔒</Text>
              <Text style={styles.emptyChatTitle}>Secured channel</Text>
              <Text style={styles.emptyChatText}>
                Messages are end-to-end encrypted{'\n'}
                using Signal Protocol (Megolm).{'\n'}
                Only you and {peerAccount ? `@${peerAccount}` : 'group members'} can read them.
              </Text>
            </View>
          }
        />

        {/* Typing indicator */}
        <TypingIndicator users={roomTyping.filter((u) => u !== myXPR)} />

        {/* Reply banner */}
        {replyTo && (
          <ReplyBanner message={replyTo} onDismiss={() => setReplyTo(null)} />
        )}

        {/* Upload progress */}
        {isUploading && (
          <View style={styles.uploadBanner}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.uploadText}>Uploading to IPFS...</Text>
          </View>
        )}

        {/* Input */}
        <ChatInput
          onSendText={handleSendText}
          onSendXPR={() => setShowTransfer(true)}
          onSendMedia={handleSendMedia}
          onTypingChange={handleTextChange}
          disabled={isUploading}
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

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
    gap: Spacing.xs,
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
  headerTitles: { flex: 1, gap: 1 },
  headerName: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  encryptedDot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  headerStatus: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },
  headerActions: { flexDirection: 'row', gap: Spacing.xs },
  headerActionBtn: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 18,
  },
  headerActionIcon: { fontSize: 18, color: Colors.textSecondary },

  // Messages
  messagesList: {
    paddingVertical: Spacing.sm,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  loadingMore: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },

  // Empty state
  emptyChat: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xxxl,
    paddingTop: '25%',
    gap: Spacing.md,
  },
  emptyChatIcon: { fontSize: 44 },
  emptyChatTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textSecondary,
  },
  emptyChatText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Typing
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
  },
  typingDots: { flexDirection: 'row', gap: 3 },
  typingDot: {
    width: 6, height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  typingText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },

  // Reply banner
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  replyAccent: {
    width: 3, height: 36,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  replyContent: { flex: 1, gap: 2 },
  replyLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
  },
  replyPreview: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },
  replyClose: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  replyCloseText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
  },

  // Upload banner
  uploadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primaryDim,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  uploadText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
  },
});
