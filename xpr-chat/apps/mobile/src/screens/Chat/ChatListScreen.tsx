import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMatrix } from '../../hooks/useMatrix';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../../components/Avatar';
import { WalletBalance } from '../../components/WalletBalance';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { formatRelativeTime, truncate } from '../../utils/formatters';
import { MatrixRoom } from '../../services/matrixService';

// ─── Chat List Item ──────────────────────────────────────────────────────────
const ChatItem: React.FC<{
  room: MatrixRoom;
  onPress: () => void;
}> = ({ room, onPress }) => {
  const peerAccount = room.isDirect
    ? room.members.find((m) => !m.includes('xprchat.io')) ?? room.name
    : null;

  return (
    <TouchableOpacity style={styles.chatItem} onPress={onPress} activeOpacity={0.7}>
      <Avatar
        account={peerAccount ?? room.name}
        size={50}
        showOnlineIndicator={room.isDirect}
        isOnline={false}
      />

      <View style={styles.chatItemBody}>
        <View style={styles.chatItemRow}>
          <Text style={styles.chatName} numberOfLines={1}>
            {room.isDirect ? `@${peerAccount}` : room.name}
          </Text>
          {room.lastMessage && (
            <Text style={styles.chatTime}>
              {formatRelativeTime(room.lastMessage.timestamp)}
            </Text>
          )}
        </View>

        <View style={styles.chatItemRow}>
          <Text style={styles.chatPreview} numberOfLines={1}>
            {room.lastMessage
              ? truncate(room.lastMessage.body, 45)
              : 'No messages yet'}
          </Text>
          {room.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {room.unreadCount > 99 ? '99+' : room.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Chat List Screen ────────────────────────────────────────────────────────
export const ChatListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { account } = useAuthStore();
  const { rooms, isLoadingRooms, loadRooms } = useMatrix();

  useEffect(() => {
    loadRooms();
  }, []);

  const handleRoomPress = useCallback((room: MatrixRoom) => {
    navigation.navigate('ChatRoom', { roomId: room.id, roomName: room.name });
  }, [navigation]);

  const handleNewChat = () => navigation.navigate('NewChat');
  const handleWalletPress = () => navigation.navigate('Wallet');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>XPR Chat</Text>
          {account && (
            <Text style={styles.headerAccount}>@{account.actor}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <WalletBalance compact onPress={handleWalletPress} />
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => navigation.navigate('Profile')}
          >
            <Text style={styles.iconButtonText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search bar placeholder */}
      <TouchableOpacity
        style={styles.searchBar}
        onPress={() => navigation.navigate('NewChat')}
        activeOpacity={0.8}
      >
        <Text style={styles.searchIcon}>🔍</Text>
        <Text style={styles.searchPlaceholder}>Search or start a new chat...</Text>
      </TouchableOpacity>

      {/* Chat list */}
      {rooms.length === 0 && !isLoadingRooms ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={styles.emptyTitle}>No chats yet</Text>
          <Text style={styles.emptyBody}>
            Start a conversation with any XPR Network user.{'\n'}
            Their XPR username is their chat address.
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={handleNewChat}>
            <Text style={styles.emptyButtonText}>Start New Chat →</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={rooms}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <ChatItem room={item} onPress={() => handleRoomPress(item)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isLoadingRooms}
              onRefresh={loadRooms}
              tintColor={Colors.primary}
              colors={[Colors.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB — new chat */}
      <TouchableOpacity style={styles.fab} onPress={handleNewChat} activeOpacity={0.85}>
        <Text style={styles.fabIcon}>✎</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 2,
  },
  headerAccount: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconButton: {
    width: 36, height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  iconButtonText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    margin: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchPlaceholder: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },

  listContent: { paddingVertical: Spacing.xs },
  separator: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginLeft: 70 + Spacing.base,
  },

  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  chatItemBody: { flex: 1, gap: 4 },
  chatItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatName: {
    flex: 1,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  chatTime: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  chatPreview: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadCount: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIcon: { fontSize: 56, marginBottom: Spacing.sm },
  emptyTitle: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  emptyBody: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  emptyButtonText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },

  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 22,
    color: Colors.background,
    fontFamily: Typography.fontFamily.monoBold,
  },
});
