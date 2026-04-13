import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// Notification categories
// ─────────────────────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type NotificationPayload =
  | { type: 'message'; roomId: string; sender: string; preview: string }
  | { type: 'xpr_received'; from: string; amount: number; txId: string }
  | { type: 'group_invite'; roomId: string; inviter: string; groupName: string };

// ─────────────────────────────────────────────────────────────────────────────
// Notification Service
// ─────────────────────────────────────────────────────────────────────────────
class NotificationService {
  private pushToken: string | null = null;
  private tapListeners: Array<(payload: NotificationPayload) => void> = [];

  // ── Request permission and get token ──────────────────────────────────────
  async initialize(): Promise<string | null> {
    if (!Device.isDevice) return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Push notification permission denied');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00D4FF',
        sound: 'default',
      });

      await Notifications.setNotificationChannelAsync('xpr_transfers', {
        name: 'XPR Transfers',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#FFB800',
        sound: 'default',
      });
    }

    const token = await Notifications.getExpoPushTokenAsync({
      projectId: 'xpr-chat-project-id',
    });

    this.pushToken = token.data;

    // Listen for taps
    Notifications.addNotificationResponseReceivedListener((response) => {
      const payload = response.notification.request.content.data as NotificationPayload;
      this.tapListeners.forEach((cb) => cb(payload));
    });

    return this.pushToken;
  }

  // ── Show local notification ────────────────────────────────────────────────
  async showMessage(
    sender: string,
    preview: string,
    roomId: string
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `@${sender}`,
        body: preview,
        data: { type: 'message', roomId, sender, preview } as NotificationPayload,
        sound: 'default',
        categoryIdentifier: 'messages',
        badge: 1,
      },
      trigger: null,
    });
  }

  // ── XPR received notification ──────────────────────────────────────────────
  async showXPRReceived(
    from: string,
    amount: number,
    txId: string
  ): Promise<void> {
    const displayAmount = (amount / 10000).toFixed(4);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚡ XPR Received',
        body: `@${from} sent you ${displayAmount} XPR`,
        data: { type: 'xpr_received', from, amount, txId } as NotificationPayload,
        sound: 'default',
        categoryIdentifier: 'xpr_transfers',
        badge: 1,
      },
      trigger: null,
    });
  }

  // ── Group invite notification ──────────────────────────────────────────────
  async showGroupInvite(
    inviter: string,
    groupName: string,
    roomId: string
  ): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Group Invite',
        body: `@${inviter} invited you to "${groupName}"`,
        data: { type: 'group_invite', roomId, inviter, groupName } as NotificationPayload,
        sound: 'default',
        badge: 1,
      },
      trigger: null,
    });
  }

  // ── Set badge count ────────────────────────────────────────────────────────
  async setBadgeCount(count: number): Promise<void> {
    await Notifications.setBadgeCountAsync(count);
  }

  async clearBadge(): Promise<void> {
    await Notifications.setBadgeCountAsync(0);
  }

  // ── Subscribe to notification tap ─────────────────────────────────────────
  onTap(cb: (payload: NotificationPayload) => void): () => void {
    this.tapListeners.push(cb);
    return () => { this.tapListeners = this.tapListeners.filter((x) => x !== cb); };
  }

  getPushToken(): string | null { return this.pushToken; }
}

export const notificationService = new NotificationService();
