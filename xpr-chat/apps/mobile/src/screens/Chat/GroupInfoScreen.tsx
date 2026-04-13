import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { matrixService } from '../../services/matrixService';
import { useMatrix } from '../../hooks/useMatrix';
import { Avatar } from '../../components/Avatar';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';

interface RouteParams {
  roomId: string;
}

export const GroupInfoScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { roomId } = useRoute().params as RouteParams;
  const { rooms, leaveRoom } = useMatrix();

  const room = rooms.find((r) => r.id === roomId);
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [topic, setTopic] = useState(room?.topic ?? '');

  const handleLeave = () => {
    Alert.alert('Leave Group', `Are you sure you want to leave "${room?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveRoom(roomId);
          navigation.navigate('Chats');
        },
      },
    ]);
  };

  const handleSaveTopic = async () => {
    await matrixService.setRoomTopic(roomId, topic);
    setIsEditingTopic(false);
  };

  if (!room) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.notFound}>Room not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Group Info</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Group avatar + name */}
        <View style={styles.groupSection}>
          <View style={styles.groupIconBg}>
            <Text style={styles.groupIconText}>#</Text>
          </View>
          <Text style={styles.groupName}>{room.name}</Text>
          <Text style={styles.memberCount}>{room.members.length} members</Text>

          {room.isEncrypted ? (
            <View style={styles.encryptedBadge}>
              <Text style={styles.encryptedText}>🔒 End-to-end encrypted</Text>
            </View>
          ) : (
            <View style={[styles.encryptedBadge, styles.publicBadge]}>
              <Text style={styles.publicText}># Public channel</Text>
            </View>
          )}
        </View>

        {/* Topic */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>TOPIC</Text>
            <TouchableOpacity onPress={() => setIsEditingTopic(!isEditingTopic)}>
              <Text style={styles.editLink}>{isEditingTopic ? 'Cancel' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>
          {isEditingTopic ? (
            <View style={styles.topicEditRow}>
              <TextInput
                style={styles.topicInput}
                value={topic}
                onChangeText={setTopic}
                placeholder="Add a topic..."
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={256}
              />
              <TouchableOpacity style={styles.saveTopicBtn} onPress={handleSaveTopic}>
                <Text style={styles.saveTopicText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.topicText}>
              {room.topic || 'No topic set'}
            </Text>
          )}
        </View>

        {/* Members */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MEMBERS ({room.members.length})</Text>
          <View style={styles.membersCard}>
            {room.members.slice(0, 20).map((member, i) => (
              <React.Fragment key={member}>
                <TouchableOpacity
                  style={styles.memberRow}
                  onPress={() => navigation.navigate('Profile', { account: member })}
                >
                  <Avatar account={member} size={40} />
                  <Text style={styles.memberName}>@{member}</Text>
                </TouchableOpacity>
                {i < room.members.length - 1 && i < 19 && (
                  <View style={styles.memberSep} />
                )}
              </React.Fragment>
            ))}
            {room.members.length > 20 && (
              <Text style={styles.moreMembers}>
                +{room.members.length - 20} more members
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.leaveButton} onPress={handleLeave}>
            <Text style={styles.leaveText}>Leave Group</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: Typography.fontSize.lg, color: Colors.primary, fontFamily: Typography.fontFamily.mono },
  title: {
    flex: 1, fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary, letterSpacing: 1, textAlign: 'center',
  },
  notFound: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 80,
  },

  groupSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  groupIconBg: {
    width: 80, height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryDim,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  groupIconText: {
    fontSize: 36,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
  },
  groupName: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  memberCount: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  encryptedBadge: {
    backgroundColor: Colors.success + '22',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.success + '66',
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  encryptedText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.success,
  },
  publicBadge: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.border,
  },
  publicText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
  },

  section: { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg, gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  editLink: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
  },
  topicText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  topicEditRow: { gap: Spacing.sm },
  topicInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveTopicBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  saveTopicText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
  },

  membersCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  memberName: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  memberSep: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: 60 },
  moreMembers: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.md,
  },

  leaveButton: {
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.error + '11',
  },
  leaveText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.error,
    letterSpacing: 1,
  },
});
