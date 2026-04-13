import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MatrixMessage } from '../services/matrixService';
import { Colors, Typography, Spacing, BorderRadius } from '../utils/theme';
import { formatMessageTime, formatXPR } from '../utils/formatters';

interface MessageBubbleProps {
  message: MatrixMessage;
  isOwn: boolean;
  showSender?: boolean;
}

// ─── XPR Transfer Bubble ────────────────────────────────────────────────────
const XPRTransferBubble: React.FC<{
  message: MatrixMessage;
  isOwn: boolean;
}> = ({ message, isOwn }) => {
  const transfer = message.metadata;
  return (
    <View style={[styles.transferBubble, isOwn ? styles.transferOwn : styles.transferOther]}>
      <View style={styles.transferHeader}>
        <Text style={styles.transferIcon}>⚡</Text>
        <Text style={styles.transferTitle}>
          {isOwn ? 'Sent XPR' : 'Received XPR'}
        </Text>
      </View>
      <Text style={styles.transferAmount}>
        {transfer ? formatXPR(transfer.amount) : '? XPR'}
      </Text>
      {transfer?.memo ? (
        <Text style={styles.transferMemo}>{transfer.memo}</Text>
      ) : null}
      {transfer?.tx_id && (
        <Text style={styles.transferTxId} numberOfLines={1} ellipsizeMode="middle">
          TX: {transfer.tx_id}
        </Text>
      )}
    </View>
  );
};

// ─── Image Bubble ───────────────────────────────────────────────────────────
const ImageBubble: React.FC<{ url: string; isOwn: boolean }> = ({ url, isOwn }) => (
  <View style={[styles.imageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
    <Image
      source={{ uri: url.replace('ipfs://', 'https://ipfs.io/ipfs/') }}
      style={styles.messageImage}
      resizeMode="cover"
    />
  </View>
);

// ─── Main MessageBubble ─────────────────────────────────────────────────────
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showSender = false,
}) => {
  const statusIcon =
    message.status === 'read' ? '✓✓'
    : message.status === 'delivered' ? '✓✓'
    : message.status === 'sent' ? '✓'
    : '○';

  if (message.type === 'xpr_transfer') {
    return (
      <View style={[styles.row, isOwn ? styles.ownRow : styles.otherRow]}>
        <XPRTransferBubble message={message} isOwn={isOwn} />
      </View>
    );
  }

  if (message.type === 'image' && message.metadata?.url) {
    return (
      <View style={[styles.row, isOwn ? styles.ownRow : styles.otherRow]}>
        <ImageBubble url={message.metadata.url} isOwn={isOwn} />
      </View>
    );
  }

  return (
    <View style={[styles.row, isOwn ? styles.ownRow : styles.otherRow]}>
      <View style={[styles.bubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {showSender && !isOwn && (
          <Text style={styles.senderName}>@{message.sender}</Text>
        )}

        <Text style={[styles.body, isOwn ? styles.ownText : styles.otherText]}>
          {message.body}
        </Text>

        <View style={styles.meta}>
          {message.encrypted && (
            <Text style={styles.lockIcon}>🔒</Text>
          )}
          <Text style={[styles.timestamp, isOwn ? styles.ownMeta : styles.otherMeta]}>
            {formatMessageTime(message.timestamp)}
          </Text>
          {isOwn && (
            <Text style={[
              styles.status,
              message.status === 'read' ? styles.statusRead : styles.statusDefault,
            ]}>
              {statusIcon}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: 2,
    paddingHorizontal: Spacing.base,
  },
  ownRow: {
    alignItems: 'flex-end',
  },
  otherRow: {
    alignItems: 'flex-start',
  },

  // Text bubbles
  bubble: {
    maxWidth: '80%',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  ownBubble: {
    backgroundColor: Colors.bubbleSent,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: Colors.bubbleReceived,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    marginBottom: 2,
  },
  body: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    lineHeight: 20,
  },
  ownText: {
    color: Colors.bubbleSentText,
  },
  otherText: {
    color: Colors.bubbleReceivedText,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  lockIcon: {
    fontSize: 8,
  },
  timestamp: {
    fontSize: Typography.fontSize.xs - 1,
    fontFamily: Typography.fontFamily.mono,
  },
  ownMeta: {
    color: Colors.background + 'aa',
  },
  otherMeta: {
    color: Colors.textMuted,
  },
  status: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
  },
  statusRead: {
    color: Colors.success,
  },
  statusDefault: {
    color: Colors.background + 'aa',
  },

  // Image bubble
  imageBubble: {
    maxWidth: '75%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  messageImage: {
    width: 220,
    height: 160,
  },

  // XPR transfer bubble
  transferBubble: {
    minWidth: 200,
    maxWidth: 260,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  transferOwn: {
    backgroundColor: Colors.primaryDim,
    borderColor: Colors.primary,
  },
  transferOther: {
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.xprGold,
  },
  transferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  transferIcon: {
    fontSize: 16,
  },
  transferTitle: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.textSecondary,
  },
  transferAmount: {
    fontSize: Typography.fontSize.xl,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
  },
  transferMemo: {
    fontSize: Typography.fontSize.sm,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  transferTxId: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textMuted,
    marginTop: 4,
  },
});
