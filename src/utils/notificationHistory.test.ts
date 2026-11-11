import test from 'node:test';
import assert from 'node:assert/strict';
import { updateNotificationHistory, isNotificationHistory, type NotificationHistoryEntry } from './notificationHistory';

const entry = (id: number, status: NotificationHistoryEntry['status'] = 'pending'): NotificationHistoryEntry => ({
  id: `notification-${id}`, title: `Payment ${id}`, message: 'Expense · Food',
  kind: 'extracted', timestamp: id, status,
});

test('notification history retains only the latest twenty extracted notifications and alerts', () => {
  let history: NotificationHistoryEntry[] = [];
  for (let i = 1; i <= 25; i++) history = updateNotificationHistory(history, entry(i));
  assert.equal(history.length, 20);
  assert.equal(history[0].id, 'notification-25');
  assert.equal(history[19].id, 'notification-6');
  history = updateNotificationHistory(history, { ...entry(26), kind: 'alert', status: 'alert' });
  assert.equal(history[0].kind, 'alert');
  assert.equal(history.length, 20);
  assert.equal(isNotificationHistory(JSON.parse(JSON.stringify(history))), true);
});

test('notification replay deduplicates entries without downgrading their status or changing capture time', () => {
  const saved = updateNotificationHistory([entry(1)], { ...entry(1, 'added'), message: 'Edited category', timestamp: 100 });
  assert.equal(saved[0].timestamp, 1);
  assert.equal(saved[0].status, 'added');
  const replayed = updateNotificationHistory(saved, entry(1));
  assert.equal(replayed.length, 1);
  assert.equal(replayed[0].status, 'added');
  assert.equal(replayed[0].message, 'Edited category');
  assert.equal(isNotificationHistory([{ ...entry(1), status: 'bad' }]), false);
  assert.equal(isNotificationHistory([{ ...entry(1), timestamp: NaN }]), false);
});
