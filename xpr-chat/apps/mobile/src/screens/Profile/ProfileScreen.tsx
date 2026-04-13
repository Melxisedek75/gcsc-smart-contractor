import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../../components/Avatar';
import { WalletBalance } from '../../components/WalletBalance';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { keyFingerprint } from '../../utils/crypto';
import { useEncryption } from '../../hooks/useEncryption';
import { xprService } from '../../services/xprService';
import { ipfsService } from '../../services/ipfsService';
import { matrixService } from '../../services/matrixService';

// ─── Profile Edit Form ────────────────────────────────────────────────────────
const EditForm: React.FC<{
  account: string;
  currentName: string;
  currentAvatar: string;
  onDone: () => void;
}> = ({ account, currentName, currentAvatar, onDone }) => {
  const [name, setName] = useState(currentName);
  const [avatarHash, setAvatarHash] = useState(currentAvatar);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });

    if (result.canceled || !result.assets[0]) return;

    setIsUploadingAvatar(true);
    try {
      const uploaded = await ipfsService.uploadAvatar(result.assets[0].uri);
      setAvatarHash(uploaded.hash);
    } catch {
      Alert.alert('Upload failed', 'Could not upload avatar to IPFS.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { getIdentityPublicKey } = require('../../services/encryptionService');
      const pubKey = (await import('../../services/encryptionService'))
        .encryptionService.getIdentityPublicKey() ?? '';

      await xprService.publishIdentity({
        account,
        displayName: name,
        avatar: avatarHash,
        signalPublicKey: pubKey,
      });

      // Also update Matrix display name
      await matrixService.setDisplayName(name || account);

      Alert.alert('Saved', 'Your profile has been updated on XPR Network.');
      onDone();
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={editStyles.form}>
      <View style={editStyles.avatarSection}>
        <TouchableOpacity onPress={handlePickAvatar} disabled={isUploadingAvatar}>
          <View style={editStyles.avatarWrapper}>
            <Avatar account={account} ipfsHash={avatarHash} size={80} />
            <View style={editStyles.editOverlay}>
              {isUploadingAvatar
                ? <ActivityIndicator size="small" color={Colors.primary} />
                : <Text style={editStyles.editOverlayText}>✎</Text>
              }
            </View>
          </View>
        </TouchableOpacity>
        <Text style={editStyles.avatarHint}>
          {avatarHash ? 'Stored on IPFS ✓' : 'Tap to upload avatar'}
        </Text>
      </View>

      <Text style={editStyles.label}>DISPLAY NAME</Text>
      <TextInput
        style={editStyles.input}
        value={name}
        onChangeText={setName}
        placeholder={`@${account}`}
        placeholderTextColor={Colors.textMuted}
        maxLength={64}
      />

      <View style={editStyles.actions}>
        <TouchableOpacity style={editStyles.cancelBtn} onPress={onDone}>
          <Text style={editStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[editStyles.saveBtn, isSaving && editStyles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving
            ? <ActivityIndicator size="small" color={Colors.background} />
            : <Text style={editStyles.saveText}>Save to Chain</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
};

const editStyles = StyleSheet.create({
  form: {
    margin: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  avatarSection: { alignItems: 'center', gap: Spacing.sm },
  avatarWrapper: { position: 'relative' },
  editOverlay: {
    position: 'absolute', bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.surface,
  },
  editOverlayText: { fontSize: 14, color: Colors.background },
  avatarHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  label: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
  },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: Colors.primaryDim },
  saveText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Profile Screen
// ─────────────────────────────────────────────────────────────────────────────
export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { account, logout } = useAuthStore();
  const { getIdentityPublicKey } = useEncryption();
  const [isEditing, setIsEditing] = useState(false);
  const [identity, setIdentity] = useState<{
    displayName?: string;
    avatar?: string;
    signalPublicKey?: string;
  }>({});
  const [isLoadingIdentity, setIsLoadingIdentity] = useState(true);

  const pubKey = getIdentityPublicKey();
  const fingerprint = pubKey ? keyFingerprint(pubKey) : '--------';

  useEffect(() => {
    if (account?.actor) {
      xprService.fetchIdentity(account.actor).then((id) => {
        if (id) setIdentity(id);
      }).finally(() => setIsLoadingIdentity(false));
    }
  }, [account?.actor]);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Sign out from XPR Chat?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const menuSections = [
    {
      title: 'MESSAGING',
      items: [
        { icon: '🔔', label: 'Notifications', onPress: () => {} },
        { icon: '🔒', label: 'Privacy & Security', onPress: () => {} },
        { icon: '#', label: 'Channels', onPress: () => navigation.navigate('Channels') },
      ],
    },
    {
      title: 'CRYPTO',
      items: [
        { icon: '⚡', label: 'Wallet', onPress: () => navigation.navigate('Wallet') },
        { icon: '📊', label: 'Transaction History', onPress: () => navigation.navigate('TransactionHistory') },
        { icon: '🔗', label: 'XPR Explorer', onPress: () => {} },
      ],
    },
    {
      title: 'APP',
      items: [
        { icon: '🎨', label: 'Appearance', onPress: () => {} },
        { icon: '📦', label: 'Storage & Data', onPress: () => {} },
        { icon: '❓', label: 'Help & Feedback', onPress: () => {} },
        { icon: '📄', label: 'Terms & Privacy', onPress: () => {} },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
          <Text style={styles.editText}>{isEditing ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Edit form */}
        {isEditing && account && (
          <EditForm
            account={account.actor}
            currentName={identity.displayName ?? ''}
            currentAvatar={identity.avatar ?? ''}
            onDone={() => setIsEditing(false)}
          />
        )}

        {/* Avatar + Identity */}
        {!isEditing && (
          <View style={styles.profileSection}>
            <TouchableOpacity onPress={() => setIsEditing(true)}>
              <Avatar
                account={account?.actor ?? ''}
                ipfsHash={identity.avatar}
                size={86}
              />
            </TouchableOpacity>

            <Text style={styles.accountName}>
              {identity.displayName || `@${account?.actor}`}
            </Text>
            {identity.displayName && (
              <Text style={styles.accountHandle}>@{account?.actor}</Text>
            )}

            <View style={styles.badgesRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeIcon}>✓</Text>
                <Text style={styles.badgeText}>XPR Identity</Text>
              </View>
              {identity.signalPublicKey && (
                <View style={[styles.badge, styles.badgeGreen]}>
                  <Text style={styles.badgeIcon}>🔒</Text>
                  <Text style={styles.badgeText}>Signal Verified</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Wallet */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WALLET</Text>
          <WalletBalance onPress={() => navigation.navigate('Wallet')} />
        </View>

        {/* Signal fingerprint */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ENCRYPTION FINGERPRINT</Text>
          <View style={styles.fingerprintCard}>
            <View style={styles.fingerprintRow}>
              <Text style={styles.fingerprintValue}>{fingerprint}</Text>
              <TouchableOpacity style={styles.copyButton}>
                <Text style={styles.copyText}>Copy</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.fingerprintHint}>
              Share this 8-char fingerprint with contacts to verify your Signal identity key
            </Text>
          </View>
        </View>

        {/* Menu sections */}
        {menuSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <React.Fragment key={item.label}>
                  <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                    <Text style={styles.menuIcon}>{item.icon}</Text>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    <Text style={styles.menuArrow}>›</Text>
                  </TouchableOpacity>
                  {i < section.items.length - 1 && (
                    <View style={styles.menuSep} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>XPR Chat v1.0.0 · Open Source · Non-Custodial</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: Spacing.xxxl },

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
    flex: 1, fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary, letterSpacing: 1, textAlign: 'center',
  },
  editText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    paddingHorizontal: Spacing.sm,
  },

  profileSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  accountName: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  accountHandle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  badgesRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
  },
  badgeGreen: {
    backgroundColor: Colors.success + '22',
    borderColor: Colors.success + '66',
  },
  badgeIcon: { fontSize: 12 },
  badgeText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
  },

  section: {
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },

  fingerprintCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  fingerprintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fingerprintValue: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 6,
  },
  copyButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
  },
  copyText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
  },
  fingerprintHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    lineHeight: 17,
  },

  menuCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  menuIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  menuLabel: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
  },
  menuArrow: {
    fontSize: Typography.fontSize.lg,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
  },
  menuSep: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: 56 },

  logoutButton: {
    margin: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    backgroundColor: Colors.error + '11',
  },
  logoutText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.error,
    letterSpacing: 1,
  },

  version: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingBottom: Spacing.md,
  },
});
