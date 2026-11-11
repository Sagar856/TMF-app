export interface NotificationHistoryEntry {
  id: string;
  kind: 'extracted' | 'alert';
  title: string;
  message: string;
  timestamp: number;
  status: 'pending' | 'added' | 'ignored' | 'alert';
}

export const NOTIFICATION_HISTORY_LIMIT = 20;

export function updateNotificationHistory(
  history: NotificationHistoryEntry[], entry: NotificationHistoryEntry,
): NotificationHistoryEntry[] {
  const previous = history.find((item) => item.id === entry.id);
  const next = previous && entry.status === 'pending' && previous.status !== 'pending'
    ? previous
    : previous ? { ...entry, timestamp: previous.timestamp } : entry;
  return [next, ...history.filter((item) => item.id !== entry.id)]
    .sort((a, b) => b.timestamp - a.timestamp).slice(0, NOTIFICATION_HISTORY_LIMIT);
}

export function isNotificationHistory(value: unknown): value is NotificationHistoryEntry[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === 'string'
    && typeof item.title === 'string' && typeof item.message === 'string' && Number.isFinite(item.timestamp)
    && ['extracted', 'alert'].includes(item.kind) && ['pending', 'added', 'ignored', 'alert'].includes(item.status));
}
