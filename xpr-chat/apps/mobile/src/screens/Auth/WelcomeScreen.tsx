import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';

const { width, height } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────────────────────
// Animated background grid (XPR "matrix" aesthetic)
// ─────────────────────────────────────────────────────────────────────────────
const GridBackground: React.FC = () => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.grid, { opacity }]}>
      {Array.from({ length: 12 }).map((_, row) => (
        <View key={row} style={styles.gridRow}>
          {Array.from({ length: 8 }).map((_, col) => (
            <View key={col} style={styles.gridCell} />
          ))}
        </View>
      ))}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Feature pill component
// ─────────────────────────────────────────────────────────────────────────────
const FeaturePill: React.FC<{ icon: string; label: string; delay: number }> = ({
  icon,
  label,
  delay,
}) => {
  const translateY = useRef(new Animated.Value(20)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 600,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.featurePill, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureLabel}>{label}</Text>
    </Animated.View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Welcome Screen
// ─────────────────────────────────────────────────────────────────────────────
export const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const logoScale = useRef(new Animated.Value(0.8)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslate = useRef(new Animated.Value(-30)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animations
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(titleTranslate, {
        toValue: 0,
        duration: 700,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 700,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous glow pulse on logo
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <GridBackground />

      {/* Logo */}
      <View style={styles.logoSection}>
        <Animated.View
          style={[
            styles.logoGlow,
            { opacity: glowOpacity },
          ]}
        />
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Text style={styles.logoSymbol}>⬡</Text>
          <View style={styles.logoInner}>
            <Text style={styles.logoText}>XPR</Text>
          </View>
        </Animated.View>

        <Animated.View
          style={{
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslate }],
          }}
        >
          <Text style={styles.appName}>XPR Chat</Text>
          <Text style={styles.tagline}>Decentralized · Encrypted · Web3</Text>
        </Animated.View>
      </View>

      {/* Features */}
      <View style={styles.featuresSection}>
        <FeaturePill icon="🔒" label="Signal E2E Encryption" delay={400} />
        <FeaturePill icon="⚡" label="XPR Crypto Payments" delay={550} />
        <FeaturePill icon="🌐" label="Zero Gas Fees" delay={700} />
        <FeaturePill icon="📦" label="IPFS Media Storage" delay={850} />
      </View>

      {/* CTAs */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.85}
        >
          <View style={styles.primaryButtonInner}>
            <Text style={styles.primaryButtonText}>Connect XPR Wallet</Text>
            <Text style={styles.primaryButtonIcon}>→</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          By connecting, you agree to our Terms of Service.{'\n'}
          No account registration required — your XPR name is your ID.
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Powered by XPR Network · Matrix Protocol</Text>
        <View style={styles.footerDots}>
          <View style={[styles.dot, styles.dotActive]} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
      </View>
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

  // Grid background
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridRow: {
    flexDirection: 'row',
    flex: 1,
  },
  gridCell: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 212, 255, 0.08)',
  },

  // Logo section
  logoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xl,
  },
  logoGlow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: Colors.primary,
    top: '50%',
    marginTop: -150,
  },
  logoContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  logoSymbol: {
    position: 'absolute',
    fontSize: 90,
    color: Colors.primary,
    lineHeight: 100,
  },
  logoInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 18,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 2,
  },
  appName: {
    fontSize: Typography.fontSize.hero,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    textAlign: 'center',
    letterSpacing: 2,
  },

  // Features
  featuresSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDim,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  featureIcon: {
    fontSize: 14,
  },
  featureLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    letterSpacing: 0.5,
  },

  // Actions
  actionsSection: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.base,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  primaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },
  primaryButtonIcon: {
    fontSize: Typography.fontSize.lg,
    color: Colors.background,
    fontFamily: Typography.fontFamily.monoBold,
  },
  disclaimer: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Footer
  footer: {
    alignItems: 'center',
    paddingBottom: Platform.OS === 'android' ? Spacing.lg : Spacing.sm,
    gap: Spacing.sm,
  },
  footerText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
  footerDots: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 18,
  },
});
