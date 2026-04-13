import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { MatrixMessage } from '../services/matrixService';
import { ipfsService } from '../services/ipfsService';
import { Colors, Typography, Spacing, BorderRadius } from '../utils/theme';
import { formatMessageTime, formatXPR } from '../utils/formatters';

interface MessageBubbleProps {
  message: MatrixMessage;
  isOwn: boolean;
  showSender?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onLongPress?: () => void;
  onReply?: () => void;
}

// ─── XPR Transfer Bubble ────────────────────────────────────────────────────
const XPRTransferBubble: React.FC<{
  message: MatrixMessage;
  isOwn: boolean;
}> = ({ message, isOwn }) => {
  const transfer = message.metadata;
  const symbol = transfer?.symbol ?? 'XPR';
  const amount = transfer?.amount ?? 0;

  return (
    <View style={[
      styles.transferBubble,
      isOwn ? styles.transferOwn : styles.transferOther,
    ]}>
      <View style={styles.transferHeader}>
        <Text style={styles.transferIcon}>⚡</Text>
        <Text style={styles.transferTitle}>
          {isOwn ? `Sent ${symbol}` : `Received ${symbol}`}
        </Text>
      </View>
      <Text style={styles.transferAmount}>{formatXPR(amount, symbol)}</Text>
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
const ImageBubble: React.FC<{
  url: string;
  info?: { w?: number; h?: number };
  isOwn: boolean;
}> = ({ url, info, isOwn }) => {
  const resolved = ipfsService.resolveUrl(url);
  const aspectRatio = info?.w && info?.h ? info.w / info.h : 16 / 9;

  return (
    <View style={[
      styles.imageBubble,
      isOwn ? styles.ownBubble : styles.otherBubble,
    ]}>
      <Image
        source={{ uri: resolved }}
        style={[styles.messageImage, { aspectRatio }]}
        resizeMode="cover"
      />
    </View>
  );
};

// ─── Reply reference ─────────────────────────────────────────────────────────
const ReplyRef: React.FC<{ replyTo: string }> = ({ replyTo }) => (
  <View style={styles.replyRef}>
    <View style={styles.replyRefBar} />
    <Text style={styles.replyRefText} numberOfLines={1}>
      ↩ Replied to a message
    </Text>
  </View>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Message Bubble
// ─────────────────────────────────────────────────────────────────────────────
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showSender = false,
  isFirst = true,
  isLast = true,
  onLongPress,
  onReply,
}) => {
  const statusIcon =
    message.status === 'read'      ? '✓✓' :
    message.status === 'delivered' ? '✓✓' :
    message.status === 'sent'      ? '✓'  : '○';

  const statusColor =
    message.status === 'read' ? Colors.primary :
    message.status === 'delivered' ? Colors.textSecondary :
    Colors.textMuted;

  // Bubble border radius varies based on message grouping
  const bubbleRadius: any = {
    borderRadius: BorderRadius.lg,
    ...(isOwn
      ? {
          borderTopRightRadius: isFirst ? BorderRadius.lg : 4,
          borderBottomRightRadius: isLast ? BorderRadius.lg : 4,
        }
      : {
          borderTopLeftRadius: isFirst ? BorderRadius.lg : 4,
          borderBottomLeftRadius: isLast ? BorderRadius.lg : 4,
        }),
  };

  if (message.type === 'xpr_transfer') {
    return (
      <TouchableOpacity
        style={[styles.row, isOwn ? styles.ownRow : styles.otherRow, { marginVertical: 4 }]}
        onLongPress={onLongPress}
        activeOpacity={0.85}
      >
        <XPRTransferBubble message={message} isOwn={isOwn} />
      </TouchableOpacity>
    );
  }

  if (message.type === 'image' && message.metadata?.url) {
    return (
      <TouchableOpacity
        style={[styles.row, isOwn ? styles.ownRow : styles.otherRow, { marginVertical: 2 }]}
        onLongPress={onLongPress}
        activeOpacity={0.85}
      >
        <ImageBubble
          url={message.metadata.url}
          info={message.metadata.info}
          isOwn={isOwn}
        />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.row, isOwn ? styles.ownRow : styles.otherRow]}
      onLongPress={onLongPress}
      delayLongPress={350}
      activeOpacity={0.85}
    >
      <View style={[
        styles.bubble,
        isOwn ? styles.ownBubble : styles.otherBubble,
        bubbleRadius,
      ]}>
        {/* Group sender */}
        {showSender && (
          <Text style={styles.senderName}>@{message.sender}</Text>
        )}

        {/* Reply reference */}
        {message.replyTo && <ReplyRef replyTo={message.replyTo} />}

        {/* Message body */}
        <Text style={[styles.body, isOwn ? styles.ownText : styles.otherText]}>
          {message.body}
        </Text>

        {/* Meta: time + encryption + status */}
        <View style={styles.meta}>
          {message.encrypted && (
            <Text style={[styles.lockIcon, isOwn && styles.ownMeta]}>🔒</Text>
          )}
          {message.editedAt && (
            <Text style={[styles.editedLabel, isOwn ? styles.ownMeta : styles.otherMeta]}>
              edited
            </Text>
          )}
          <Text style={[styles.timestamp, isOwn ? styles.ownMeta : styles.otherMeta]}>
            {formatMessageTime(message.timestamp)}
          </Text>
          {isOwn && (
            <Text style={[styles.statusIcon, { color: statusColor }]}>
              {statusIcon}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  row: {
    marginVertical: 1,
    paddingHorizontal: Spacing.base,
  },
  ownRow: { alignItems: 'flex-end' },
  otherRow: { alignItems: 'flex-start' },

  bubble: {
    maxWidth: '82%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  ownBubble: {
    backgroundColor: Colors.bubbleSent,
  },
  otherBubble: {
    backgroundColor: Colors.bubbleReceived,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },

  senderName: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
    color: Colors.primary,
    marginBottom: 2,
  },

  replyRef: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    opacity: 0.75,
  },
  replyRefBar: {
    width: 2, height: 16,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },
  replyRefText: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.mono,
    color: Colors.textSecondary,
    flex: 1,
  },

  body: {
    fontSize: Typography.fontSize.md,
    fontFamily: Typography.fontFamily.mono,
    lineHeight: 20,
  },
  ownText: { color: Colors.bubbleSentText },
  otherText: { color: Colors.bubbleReceivedText },

  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-end',
    marginTop: 3,
  },
  lockIcon: { fontSize: 8, color: Colors.background + 'bb' },
  editedLabel: {
    fontSize: Typography.fontSize.xs - 1,
    fontFamily: Typography.fontFamily.mono,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: Typography.fontSize.xs - 1,
    fontFamily: Typography.fontFamily.mono,
  },
  ownMeta: { color: Colors.background + 'aa' },
  otherMeta: { color: Colors.textMuted },
  statusIcon: {
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.monoBold,
  },

  // Image
  imageBubble: {
    maxWidth: '75%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  messageImage: {
    width: 220,
    minHeight: 80,
  },

  // XPR transfer
  transferBubble: {
    minWidth: 210,
    maxWidth: 270,
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
  transferIcon: { fontSize: 16 },
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
