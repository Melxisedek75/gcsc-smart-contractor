import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Animated,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Typography, Spacing, BorderRadius } from '../../utils/theme';
import { isValidXPRAccount } from '../../utils/formatters';

// ─────────────────────────────────────────────────────────────────────────────
// Register Screen — Info about getting an XPR account
// ─────────────────────────────────────────────────────────────────────────────
export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [previewName, setPreviewName] = useState('');
  const isValid = isValidXPRAccount(previewName) && previewName.length >= 3;

  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, []);

  const steps = [
    {
      num: '01',
      title: 'Visit XPR Network',
      body: 'Go to xprnetwork.org and create a free account. XPR usernames are 1-12 characters (a-z, 1-5).',
    },
    {
      num: '02',
      title: 'Install WebAuth',
      body: 'Download the WebAuth app — it\'s your decentralized wallet. Available on iOS and Android.',
    },
    {
      num: '03',
      title: 'Import to XPR Chat',
      body: 'Come back here and tap "Connect XPR Wallet". Scan the QR or open WebAuth to authorize.',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={styles.title}>Get Started</Text>
          <Text style={styles.subtitle}>
            XPR Chat uses your XPR Network account as identity.{'\n'}
            No email. No phone. No password.
          </Text>

          {/* Preview name input */}
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>PREVIEW YOUR CHAT ID</Text>
            <View style={styles.previewInputRow}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={styles.previewInput}
                value={previewName}
                onChangeText={(t) => setPreviewName(t.toLowerCase().replace(/[^a-z1-5.]/g, ''))}
                placeholder="yourname"
                placeholderTextColor={Colors.textMuted}
                maxLength={12}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {previewName.length > 0 && (
              <Text style={[styles.previewStatus, { color: isValid ? Colors.success : Colors.error }]}>
                {isValid
                  ? `✓ @${previewName} is a valid XPR name`
                  : '✗ Must be 3-12 chars, only a-z and 1-5'}
              </Text>
            )}
          </View>

          {/* Steps */}
          <Text style={styles.sectionLabel}>HOW TO GET YOUR XPR ACCOUNT</Text>

          {steps.map((step) => (
            <View key={step.num} style={styles.stepCard}>
              <Text style={styles.stepNum}>{step.num}</Text>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}

          {/* CTA */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>I have an XPR account →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.externalLink}
            onPress={() => {}}
          >
            <Text style={styles.externalLinkText}>Create XPR Account at xprnetwork.org ↗</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxl },

  header: { paddingTop: Spacing.sm, paddingBottom: Spacing.base },
  backButton: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
  },
  backIcon: { fontSize: Typography.fontSize.lg, color: Colors.primary, fontFamily: Typography.fontFamily.mono },

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
    marginBottom: Spacing.xl,
  },

  previewCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.xl,
  },
  previewLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  previewInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
  },
  atSign: {
    fontSize: Typography.fontSize.lg,
    color: Colors.primary,
    fontFamily: Typography.fontFamily.monoBold,
    marginRight: Spacing.xs,
  },
  previewInput: {
    flex: 1,
    fontSize: Typography.fontSize.lg,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textPrimary,
    paddingVertical: Spacing.md,
  },
  previewStatus: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    marginTop: Spacing.sm,
  },

  sectionLabel: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.md,
  },
  stepCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.base,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  stepNum: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    opacity: 0.6,
    minWidth: 36,
  },
  stepContent: { flex: 1, gap: Spacing.xs },
  stepTitle: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textPrimary,
  },
  stepBody: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    lineHeight: 20,
  },

  ctaButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  ctaText: {
    fontSize: Typography.fontSize.base,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.background,
    letterSpacing: 1,
  },
  externalLink: { alignItems: 'center', paddingVertical: Spacing.sm },
  externalLinkText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
