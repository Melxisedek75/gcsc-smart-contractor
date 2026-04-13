import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../../components/Avatar';
import { WalletBalance } from '../../components/WalletBalance';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { keyFingerprint } from '../../utils/crypto';
import { useEncryption } from '../../hooks/useEncryption';

export const ProfileScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { account, logout } = useAuthStore();
  const { getIdentityPublicKey } = useEncryption();

  const pubKey = getIdentityPublicKey();
  const fingerprint = pubKey ? keyFingerprint(pubKey) : '--------';

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You can reconnect anytime with your XPR wallet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const menuItems = [
    { icon: '🔔', label: 'Notifications', onPress: () => {} },
    { icon: '🔒', label: 'Privacy & Security', onPress: () => {} },
    { icon: '🎨', label: 'Appearance', onPress: () => {} },
    { icon: '📦', label: 'Storage & Data', onPress: () => {} },
    { icon: '❓', label: 'Help & Support', onPress: () => {} },
    { icon: '📄', label: 'Terms & Privacy Policy', onPress: () => {} },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.editText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Avatar + account */}
        <View style={styles.profileSection}>
          <Avatar account={account?.actor ?? ''} size={80} />
          <Text style={styles.accountName}>@{account?.actor}</Text>
          <View style={styles.verifiedRow}>
            <Text style={styles.verifiedIcon}>✓</Text>
            <Text style={styles.verifiedText}>XPR Network Identity</Text>
          </View>
        </View>

        {/* Wallet */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WALLET</Text>
          <WalletBalance onPress={() => navigation.navigate('Wallet')} />
        </View>

        {/* Encryption fingerprint */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SIGNAL KEY FINGERPRINT</Text>
          <View style={styles.fingerprintCard}>
            <Text style={styles.fingerprintValue}>{fingerprint}</Text>
            <Text style={styles.fingerprintHint}>
              Share this with contacts to verify your identity
            </Text>
          </View>
        </View>

        {/* Menu */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SETTINGS</Text>
          <View style={styles.menuCard}>
            {menuItems.map((item, i) => (
              <React.Fragment key={item.label}>
                <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuArrow}>›</Text>
                </TouchableOpacity>
                {i < menuItems.length - 1 && <View style={styles.menuSeparator} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>XPR Chat v1.0.0 · Open Source</Text>
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
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 1,
    textAlign: 'center',
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
  verifiedRow: {
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
  verifiedIcon: {
    fontSize: 12,
    color: Colors.success,
    fontFamily: Typography.fontFamily.monoBold,
  },
  verifiedText: {
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
    gap: Spacing.xs,
  },
  fingerprintValue: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 4,
  },
  fingerprintHint: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
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
  menuIcon: { fontSize: 18, width: 24 },
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
  menuSeparator: {
    height: 1,
    backgroundColor: Colors.borderSubtle,
    marginLeft: 56,
  },

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
