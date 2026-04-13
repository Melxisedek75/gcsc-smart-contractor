import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  StatusBar,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore, AuthStatus } from '../../store/authStore';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../utils/theme';

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator component
// ─────────────────────────────────────────────────────────────────────────────
const StepIndicator: React.FC<{
  step: number;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}> = ({ step, label, status }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status === 'active') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.1, duration: 600, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      scaleAnim.stopAnimation();
      scaleAnim.setValue(1);
    }
  }, [status]);

  const stepColors = {
    pending: Colors.textMuted,
    active: Colors.primary,
    done: Colors.success,
    error: Colors.error,
  };

  const stepIcons = { pending: step.toString(), active: '...', done: '✓', error: '✗' };

  return (
    <View style={styles.stepRow}>
      <Animated.View
        style={[
          styles.stepBadge,
          { borderColor: stepColors[status], transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Text style={[styles.stepBadgeText, { color: stepColors[status] }]}>
          {stepIcons[status]}
        </Text>
      </Animated.View>
      <Text style={[styles.stepLabel, { color: stepColors[status] }]}>{label}</Text>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Wallet option button
// ─────────────────────────────────────────────────────────────────────────────
const WalletOption: React.FC<{
  icon: string;
  name: string;
  description: string;
  badge?: string;
  onPress: () => void;
}> = ({ icon, name, description, badge, onPress }) => (
  <TouchableOpacity style={styles.walletOption} onPress={onPress} activeOpacity={0.75}>
    <View style={styles.walletOptionLeft}>
      <View style={styles.walletIconBg}>
        <Text style={styles.walletIcon}>{icon}</Text>
      </View>
      <View style={styles.walletOptionText}>
        <View style={styles.walletNameRow}>
          <Text style={styles.walletName}>{name}</Text>
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={styles.walletDescription}>{description}</Text>
      </View>
    </View>
    <Text style={styles.walletArrow}>›</Text>
  </TouchableOpacity>
);

// ─────────────────────────────────────────────────────────────────────────────
// Login Screen
// ─────────────────────────────────────────────────────────────────────────────
export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { status, account, error, login, clearError } = useAuthStore();
  const [loginPhase, setLoginPhase] = useState<number>(0);

  const cardTranslate = useRef(new Animated.Value(40)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  // Track login phases for UI
  useEffect(() => {
    if (status === 'authenticating') setLoginPhase(1);
    else if (status === 'authenticated') setLoginPhase(4);
  }, [status]);

  useEffect(() => {
    if (status === 'authenticated') {
      // Brief delay then navigate to main app
      setTimeout(() => {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }, 1000);
    }
  }, [status]);

  useEffect(() => {
    if (error) {
      Alert.alert(
        'Connection Failed',
        error,
        [{ text: 'Try Again', onPress: clearError, style: 'default' }]
      );
    }
  }, [error]);

  const handleXPRLogin = async () => {
    setLoginPhase(1);
    await login();
  };

  const handleInstallWebAuth = () => {
    Linking.openURL('https://xprnetwork.org/wallet');
  };

  const isAuthenticating = status === 'authenticating';
  const isAuthenticated = status === 'authenticated';
  const showingResult = isAuthenticating || isAuthenticated || status === 'error';

  const steps = [
    { step: 1, label: 'Connecting to XPR Network...' },
    { step: 2, label: 'Verifying wallet signature...' },
    { step: 3, label: 'Generating Signal keys...' },
    { step: 4, label: 'Syncing Matrix account...' },
  ];

  const getStepStatus = (stepNum: number): 'pending' | 'active' | 'done' | 'error' => {
    if (status === 'error') return stepNum === loginPhase ? 'error' : stepNum < loginPhase ? 'done' : 'pending';
    if (loginPhase > stepNum) return 'done';
    if (loginPhase === stepNum) return 'active';
    return 'pending';
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>

        {/* Title section */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>Connect Wallet</Text>
          <Text style={styles.subtitle}>
            Sign in with your XPR Network account.{'\n'}
            Your username becomes your chat ID.
          </Text>
        </View>

        {/* Main card */}
        <Animated.View
          style={[
            styles.card,
            {
              opacity: cardOpacity,
              transform: [{ translateY: cardTranslate }],
            },
          ]}
        >
          {!showingResult ? (
            <>
              {/* Wallet options */}
              <Text style={styles.cardSectionLabel}>CHOOSE WALLET</Text>

              <WalletOption
                icon="🔐"
                name="WebAuth"
                description="Official XPR Network wallet"
                badge="RECOMMENDED"
                onPress={handleXPRLogin}
              />

              <WalletOption
                icon="📱"
                name="Proton Pass"
                description="Mobile wallet app"
                onPress={handleXPRLogin}
              />

              <WalletOption
                icon="🌐"
                name="WalletConnect"
                description="Connect via QR code"
                onPress={handleXPRLogin}
              />

              {/* Divider */}
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>Don't have a wallet?</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Install link */}
              <TouchableOpacity
                style={styles.installButton}
                onPress={handleInstallWebAuth}
                activeOpacity={0.75}
              >
                <Text style={styles.installButtonText}>
                  Create XPR Account →
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            // Login in progress / completed
            <>
              <View style={styles.loginProgress}>
                {/* Spinner or success icon */}
                <View style={styles.progressIconContainer}>
                  {isAuthenticated ? (
                    <Text style={styles.successIcon}>✓</Text>
                  ) : (
                    <ActivityIndicator
                      size="large"
                      color={Colors.primary}
                      style={styles.spinner}
                    />
                  )}
                </View>

                <Text style={styles.progressTitle}>
                  {isAuthenticated
                    ? `Welcome, @${account?.actor}!`
                    : 'Connecting...'}
                </Text>

                {isAuthenticated && (
                  <Text style={styles.progressSubtitle}>
                    Identity verified on XPR Network
                  </Text>
                )}

                {/* Step list */}
                <View style={styles.stepsList}>
                  {steps.map(({ step, label }) => (
                    <StepIndicator
                      key={step}
                      step={step}
                      label={label}
                      status={getStepStatus(step)}
                    />
                  ))}
                </View>

                {/* Cancel (during auth only) */}
                {isAuthenticating && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setLoginPhase(0);
                      clearError();
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </Animated.View>

        {/* Security badge */}
        <View style={styles.securityBadge}>
          <Text style={styles.securityIcon}>🛡</Text>
          <Text style={styles.securityText}>
            Your private keys never leave your device.{'\n'}
            XPR Chat is open source and non-custodial.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxl,
  },

  header: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
  },
  backIcon: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.mono,
  },

  // Title
  titleSection: {
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.fontSize.xxl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    lineHeight: 22,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },
  cardSectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },

  // Wallet options
  walletOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  walletOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  walletIconBg: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletIcon: {
    fontSize: 20,
  },
  walletOptionText: {
    flex: 1,
    gap: 2,
  },
  walletNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  walletName: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  badge: {
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 8,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },
  walletDescription: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },
  walletArrow: {
    fontSize: Typography.fontSize.xl,
    color: Colors.textMuted,
    fontFamily: Typography.fontFamily.mono,
  },

  // Divider
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderSubtle,
  },
  dividerText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },

  // Install button
  installButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  installButtonText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    letterSpacing: 1,
  },

  // Login progress
  loginProgress: {
    alignItems: 'center',
    gap: Spacing.base,
  },
  progressIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryDim,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  spinner: {
    transform: [{ scale: 1.2 }],
  },
  successIcon: {
    fontSize: 36,
    color: Colors.success,
    fontFamily: Typography.fontFamily.monoBold,
  },
  progressTitle: {
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  progressSubtitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    textAlign: 'center',
  },
  stepsList: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.monoBold,
  },
  stepLabel: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
  },
  cancelButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  cancelText: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
  },

  // Security badge
  securityBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.primaryDim,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  securityIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  securityText: {
    flex: 1,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
