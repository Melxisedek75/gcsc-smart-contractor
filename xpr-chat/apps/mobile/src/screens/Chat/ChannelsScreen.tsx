import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMatrix } from '../../hooks/useMatrix';
import { MatrixRoom } from '../../services/matrixService';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { truncate } from '../../utils/formatters';

// ─── Channel Card ─────────────────────────────────────────────────────────────
const ChannelCard: React.FC<{
  room: MatrixRoom & { memberCount?: number };
  onJoin: () => void;
  isJoining: boolean;
}> = ({ room, onJoin, isJoining }) => (
  <View style={styles.channelCard}>
    <View style={styles.channelIconBg}>
      <Text style={styles.channelIcon}>#</Text>
    </View>

    <View style={styles.channelInfo}>
      <Text style={styles.channelName}>{room.name}</Text>
      {room.topic && (
        <Text style={styles.channelTopic} numberOfLines={2}>
          {truncate(room.topic, 80)}
        </Text>
      )}
      <View style={styles.channelMeta}>
        <Text style={styles.channelMembers}>
          👥 {(room as any).memberCount ?? '?'} members
        </Text>
        <View style={styles.publicBadge}>
          <Text style={styles.publicBadgeText}>PUBLIC</Text>
        </View>
      </View>
    </View>

    <TouchableOpacity
      style={[styles.joinButton, isJoining && styles.joinButtonLoading]}
      onPress={onJoin}
      disabled={isJoining}
    >
      {isJoining ? (
        <ActivityIndicator size="small" color={Colors.background} />
      ) : (
        <Text style={styles.joinButtonText}>Join</Text>
      )}
    </TouchableOpacity>
  </View>
);

// ─── Create Channel Modal ─────────────────────────────────────────────────────
const CreateChannelForm: React.FC<{
  onSubmit: (name: string, topic: string) => void;
  isCreating: boolean;
  onClose: () => void;
}> = ({ onSubmit, isCreating, onClose }) => {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');

  return (
    <View style={styles.createForm}>
      <View style={styles.createFormHeader}>
        <Text style={styles.createFormTitle}>New Public Channel</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.createFormClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.inputLabel}>CHANNEL NAME</Text>
      <View style={styles.channelNameRow}>
        <Text style={styles.hashPrefix}>#</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) =>
            setName(t.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
          }
          placeholder="channel-name"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          maxLength={64}
        />
      </View>

      <Text style={styles.inputLabel}>DESCRIPTION</Text>
      <TextInput
        style={[styles.input, styles.topicInput]}
        value={topic}
        onChangeText={setTopic}
        placeholder="What's this channel about?"
        placeholderTextColor={Colors.textMuted}
        multiline
        maxLength={256}
      />

      <TouchableOpacity
        style={[styles.createButton, (!name || isCreating) && styles.createButtonDisabled]}
        onPress={() => name && onSubmit(name, topic)}
        disabled={!name || isCreating}
      >
        {isCreating ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.createButtonText}>Create Channel →</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Channels Screen
// ─────────────────────────────────────────────────────────────────────────────
export const ChannelsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { joinRoom, createGroupRoom, searchPublicRooms } = useMatrix();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MatrixRoom[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    try {
      const found = await searchPublicRooms(query.trim());
      setResults(found);
    } catch {
      Alert.alert('Search failed', 'Could not search channels. Try again.');
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  const handleJoin = async (room: MatrixRoom) => {
    setJoiningRoomId(room.id);
    try {
      const roomId = await joinRoom(room.id);
      navigation.navigate('ChatRoom', {
        roomId,
        roomName: room.name,
        isGroup: true,
      });
    } catch (err) {
      Alert.alert(
        'Could not join',
        err instanceof Error ? err.message : 'Failed to join channel.'
      );
    } finally {
      setJoiningRoomId(null);
    }
  };

  const handleCreate = async (name: string, topic: string) => {
    setIsCreating(true);
    try {
      const roomId = await createGroupRoom(name, [], true);
      setShowCreate(false);
      navigation.navigate('ChatRoom', {
        roomId,
        roomName: `#${name}`,
        isGroup: true,
      });
    } catch (err) {
      Alert.alert('Failed', 'Could not create channel.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Channels</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(!showCreate)}>
          <Text style={styles.createBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      {showCreate && (
        <CreateChannelForm
          onSubmit={handleCreate}
          isCreating={isCreating}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Text style={styles.searchBarHash}>#</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search public channels..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
          />
          {isSearching ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <TouchableOpacity onPress={handleSearch}>
              <Text style={styles.searchButton}>Search</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Featured channels */}
      {results.length === 0 && !isSearching && (
        <View style={styles.featuredSection}>
          <Text style={styles.sectionLabel}>FEATURED CHANNELS</Text>
          {[
            { name: '#xpr-general', topic: 'General XPR Network discussion', members: 1420 },
            { name: '#defi-talk', topic: 'DeFi on XPR Network', members: 892 },
            { name: '#nft-creators', topic: 'NFT artists and collectors', members: 456 },
            { name: '#xpr-devs', topic: 'Developers building on XPR', members: 234 },
          ].map((ch) => (
            <View key={ch.name} style={styles.featuredCard}>
              <View style={styles.channelIconBg}>
                <Text style={styles.channelIcon}>#</Text>
              </View>
              <View style={styles.featuredInfo}>
                <Text style={styles.featuredName}>{ch.name}</Text>
                <Text style={styles.featuredTopic}>{ch.topic}</Text>
                <Text style={styles.featuredMembers}>👥 {ch.members.toLocaleString()}</Text>
              </View>
              <TouchableOpacity
                style={styles.joinButton}
                onPress={() => handleSearch()}
              >
                <Text style={styles.joinButtonText}>Join</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={results}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <ChannelCard
            room={item}
            onJoin={() => handleJoin(item)}
            isJoining={joiningRoomId === item.id}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query && !isSearching ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>No channels found for "{query}"</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: Typography.fontSize.lg, color: Colors.primary, fontFamily: Typography.fontFamily.mono },
  title: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  createBtn: {
    width: 36, height: 36,
    backgroundColor: Colors.primary,
    borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  createBtnText: {
    fontSize: 22,
    color: Colors.background,
    fontFamily: Typography.fontFamily.monoBold,
    lineHeight: 28,
  },

  // Create form
  createForm: {
    margin: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  createFormHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  createFormTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  createFormClose: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
    padding: 4,
  },
  inputLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  channelNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: Spacing.md,
  },
  hashPrefix: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
    marginRight: 4,
  },
  input: {
    flex: 1,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  topicInput: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  createButtonDisabled: { backgroundColor: Colors.primaryDim },
  createButtonText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },

  // Search
  searchSection: { padding: Spacing.base, paddingBottom: Spacing.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: Spacing.md,
    overflow: 'hidden',
  },
  searchBarHash: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md,
  },
  searchButton: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },

  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },

  featuredSection: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  featuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  featuredInfo: { flex: 1, gap: 3 },
  featuredName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  featuredTopic: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  featuredMembers: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },

  listContent: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  channelIconBg: {
    width: 48, height: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  channelIcon: {
    fontSize: 22,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
  },
  channelInfo: { flex: 1, gap: 4 },
  channelName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  channelTopic: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  channelMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  channelMembers: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  publicBadge: {
    borderWidth: 1,
    borderColor: Colors.success + '66',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  publicBadgeText: {
    fontSize: 8,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.success,
    letterSpacing: 1,
  },
  joinButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center', justifyContent: 'center',
    minWidth: 56,
    height: 32,
  },
  joinButtonLoading: { backgroundColor: Colors.primaryDim },
  joinButtonText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },

  noResults: {
    alignItems: 'center',
    paddingTop: Spacing.xxxl,
  },
  noResultsText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
});
