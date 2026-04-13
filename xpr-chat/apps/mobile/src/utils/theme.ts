// XPR Chat Design System — Dark Web3 Theme

export const Colors = {
  // Backgrounds
  background: '#1A1A2E',
  surface: '#16213E',
  surfaceElevated: '#0F3460',
  overlay: 'rgba(26, 26, 46, 0.95)',

  // Accent
  primary: '#00D4FF',
  primaryDim: 'rgba(0, 212, 255, 0.15)',
  primaryGlow: 'rgba(0, 212, 255, 0.3)',
  secondary: '#7B2FBE',
  success: '#00FF94',
  warning: '#FFB800',
  error: '#FF4757',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.65)',
  textMuted: 'rgba(255, 255, 255, 0.35)',
  textOnAccent: '#1A1A2E',

  // Chat bubbles
  bubbleSent: '#00D4FF',
  bubbleReceived: '#16213E',
  bubbleSentText: '#1A1A2E',
  bubbleReceivedText: '#FFFFFF',

  // Borders
  border: 'rgba(0, 212, 255, 0.2)',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',

  // XPR specific
  xprGold: '#FFB800',
  xprBlue: '#00D4FF',
};

export const Typography = {
  fontFamily: {
    mono: 'SpaceMono-Regular',
    monoBold: 'SpaceMono-Bold',
    regular: 'SpaceMono-Regular',
    bold: 'SpaceMono-Bold',
  },
  fontSize: {
    xs: 10,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    hero: 36,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.8,
  },
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const BorderRadius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const Shadows = {
  glow: {
    shadowColor: '#00D4FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
};
