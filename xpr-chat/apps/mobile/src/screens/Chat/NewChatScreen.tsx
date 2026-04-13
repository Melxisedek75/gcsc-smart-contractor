import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useContacts } from '../../hooks/useContacts';
import { useMatrix } from '../../hooks/useMatrix';
import { Avatar } from '../../components/Avatar';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';

export const NewChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const { isSearching, searchResult, searchError, searchUser } = useContacts();
  const { createDirectRoom } = useMatrix();
  const [isCreating, setIsCreating] = useState(false);

  const handleSearch = () => {
    const trimmed = query.trim().replace('@', '');
    if (trimmed) searchUser(trimmed);
  };

  const handleStartChat = async () => {
    if (!searchResult) return;
    setIsCreating(true);
    try {
      const roomId = await createDirectRoom(searchResult.account);
      navigation.replace('ChatRoom', {
        roomId,
        roomName: searchResult.account,
        peerAccount: searchResult.account,
      });
    } catch (err) {
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
        <Text style={styles.title}>New Chat</Text>
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <Text style={styles.sectionLabel}>SEARCH BY XPR ACCOUNT</Text>
        <View style={styles.searchRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="username"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            maxLength={12}
          />
          <TouchableOpacity
            style={[styles.searchButton, !query.trim() && styles.searchButtonDisabled]}
            onPress={handleSearch}
            disabled={!query.trim() || isSearching}
          >
            {isSearching ? (
              <ActivityIndicator size="small" color={Colors.background} />
            ) : (
              <Text style={styles.searchButtonText}>Find</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Error */}
        {searchError && (
          <Text style={styles.errorText}>{searchError}</Text>
        )}
      </View>

      {/* Result card */}
      {searchResult && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <Avatar
              account={searchResult.account}
              ipfsHash={searchResult.avatar}
              size={52}
            />
            <View style={styles.resultInfo}>
              <Text style={styles.resultName}>
                {searchResult.displayName || `@${searchResult.account}`}
              </Text>
              <Text style={styles.resultAccount}>@{searchResult.account}</Text>
              {searchResult.signalPublicKey && (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>🔒 Signal Key Verified</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.startChatButton}
            onPress={handleStartChat}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color={Colors.background} />
            ) : (
              <Text style={styles.startChatText}>Start Encrypted Chat →</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Hint */}
      {!searchResult && !searchError && (
        <View style={styles.hint}>
          <Text style={styles.hintIcon}>💡</Text>
          <Text style={styles.hintText}>
            Any XPR Network account can receive messages.{'\n'}
            Type their username above to find them.
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  backButton: {
    width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.mono,
  },
  title: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },

  searchSection: {
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: Spacing.md,
    overflow: 'hidden',
  },
  atSign: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
    marginRight: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  searchButtonDisabled: {
    backgroundColor: Colors.primaryDim,
  },
  searchButtonText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.error,
  },

  resultCard: {
    margin: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  resultInfo: { flex: 1, gap: 4 },
  resultName: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  resultAccount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  verifiedText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },
  startChatButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  startChatText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },

  hint: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
    gap: Spacing.md,
  },
  hintIcon: { fontSize: 36 },
  hintText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
