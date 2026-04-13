import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, Typography, BorderRadius } from '../utils/theme';
import { ipfsService } from '../services/ipfsService';

interface AvatarProps {
  account: string;
  ipfsHash?: string;
  size?: number;
  showOnlineIndicator?: boolean;
  isOnline?: boolean;
}

// Generate a deterministic color from account name
const accountToColor = (account: string): string => {
  const colors = [
    '#00D4FF', '#7B2FBE', '#00FF94', '#FFB800',
    '#FF4757', '#2F86D4', '#E74C3C', '#8E44AD',
  ];
  let hash = 0;
  for (let i = 0; i < account.length; i++) {
    hash = account.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

// Get initials from account name
const getInitials = (account: string): string =>
  account.slice(0, 2).toUpperCase();

export const Avatar: React.FC<AvatarProps> = ({
  account,
  ipfsHash,
  size = 44,
  showOnlineIndicator = false,
  isOnline = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const avatarColor = accountToColor(account);
  const indicatorSize = Math.max(10, size * 0.22);

  const imageUrl = ipfsHash && !imageError
    ? ipfsService.getUrl(ipfsHash)
    : null;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
          onError={() => setImageError(true)}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: avatarColor + '22',
              borderColor: avatarColor,
            },
          ]}
        >
          <Text
            style={[
              styles.initials,
              { fontSize: size * 0.32, color: avatarColor },
            ]}
          >
            {getInitials(account)}
          </Text>
        </View>
      )}

      {showOnlineIndicator && (
        <View
          style={[
            styles.indicator,
            {
              width: indicatorSize,
              height: indicatorSize,
              borderRadius: indicatorSize / 2,
              backgroundColor: isOnline ? Colors.success : Colors.textMuted,
              bottom: 0,
              right: 0,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  initials: {
    fontFamily: Typography.fontFamily.monoBold,
  },
  indicator: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: Colors.background,
  },
});
