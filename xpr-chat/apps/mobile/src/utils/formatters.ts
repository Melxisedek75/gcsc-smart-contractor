import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import calendar from 'dayjs/plugin/calendar';

dayjs.extend(relativeTime);
dayjs.extend(calendar);

// Format XPR amount: 1234567890 → "12.34 XPR"
export const formatXPR = (amount: number, symbol = 'XPR'): string => {
  const value = amount / 10000; // XPR uses 4 decimal places
  return `${value.toFixed(4)} ${symbol}`;
};

// Format large numbers: 1234567 → "1.23M"
export const formatCompact = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

// Message timestamp: show time if today, date otherwise
export const formatMessageTime = (timestamp: number): string => {
  const date = dayjs(timestamp);
  const now = dayjs();
  if (date.isSame(now, 'day')) return date.format('HH:mm');
  if (date.isSame(now.subtract(1, 'day'), 'day')) return 'Yesterday';
  return date.format('DD/MM/YY');
};

// Chat list last-seen: "2 min ago", "Yesterday", etc.
export const formatRelativeTime = (timestamp: number): string =>
  dayjs(timestamp).fromNow();

// Format full date for transaction history
export const formatTxDate = (timestamp: number): string =>
  dayjs(timestamp).format('DD MMM YYYY · HH:mm');

// Truncate long text with ellipsis
export const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;

// XPR account name validation (1-12 chars, a-z1-5.)
export const isValidXPRAccount = (name: string): boolean =>
  /^[a-z1-5.]{1,12}$/.test(name);

// Format bytes for file size display
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};
