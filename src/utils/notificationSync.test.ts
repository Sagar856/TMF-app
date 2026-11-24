import test from 'node:test';
import assert from 'node:assert/strict';

// storage.ts reads the global localStorage at call time; give node one.
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
  setItem: (key: string, value: string) => { store.set(key, String(value)); },
  removeItem: (key: string) => { store.delete(key); },
  clear: () => store.clear(),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() { return store.size; },
};

const {
  enqueueNotificationUpsert,
  enqueueNotificationResolution,
  getQueuedNotificationOps,
  clearNotificationSyncQueue,
  runNotificationSyncFlush,
  mergePendingNotifications,
  NOTIFICATION_SYNC_MIGRATION_HINT,
} = await import('../services/notificationSync');
type NotificationRpcLike = import('../services/notificationSync').NotificationRpcLike;
type NotificationSyncOp = import('../services/notificationSync').NotificationSyncOp;
type ParsedNotification = import('../types/finance').ParsedNotification;

function makeNotification(id: string, overrides: Partial<ParsedNotification> = {}): ParsedNotification {
  return {
    id, rawText: `Paid via UPI ${id}`, amount: 250, payeeOrPayer: 'Chai Point',
    type: 'debit', date: '2026-11-23', time: '09:30', category: 'Food',
    subcategory: 'Snacks', appSource: 'HDFC SMS', status: 'pending', ...overrides,
  };
}

function makeRpc(result: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const calls: NotificationSyncOp[][] = [];
  const client: NotificationRpcLike = {
    rpc: async (_fn, args) => {
      calls.push(args.ops);
      return { data: result.data ?? { pending: [], resolved: [], conflicts: [] }, error: result.error ?? null };
    },
  };
  return { client, calls };
}

test('a later upsert of the same id replaces the queued one', () => {
  clearNotificationSyncQueue();
  enqueueNotificationUpsert(makeNotification('native_1'));
  enqueueNotificationUpsert(makeNotification('native_1', { description: 'edited' }));
  const queue = getQueuedNotificationOps();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].kind, 'upsert');
  assert.equal((queue[0] as { payload: ParsedNotification }).payload.description, 'edited');
});

test('a resolution supersedes a queued upsert and carries its payload', () => {
  clearNotificationSyncQueue();
  enqueueNotificationUpsert(makeNotification('native_2'));
  enqueueNotificationResolution('native_2', 'added');
  const queue = getQueuedNotificationOps();
  assert.equal(queue.length, 1);
  assert.deepEqual(
    { kind: queue[0].kind, id: queue[0].id, status: (queue[0] as { status: string }).status },
    { kind: 'resolve', id: 'native_2', status: 'added' }
  );
  assert.equal((queue[0] as { payload?: ParsedNotification }).payload?.id, 'native_2');
});

test('the first queued resolution wins and later upserts cannot re-pend it', () => {
  clearNotificationSyncQueue();
  enqueueNotificationResolution('native_3', 'ignored', makeNotification('native_3'));
  enqueueNotificationResolution('native_3', 'added');
  enqueueNotificationUpsert(makeNotification('native_3'));
  const queue = getQueuedNotificationOps();
  assert.equal(queue.length, 1);
  assert.equal((queue[0] as { status: string }).status, 'ignored');
});

test('a successful flush sends the whole batch once and clears exactly it', async () => {
  clearNotificationSyncQueue();
  enqueueNotificationUpsert(makeNotification('native_4'));
  enqueueNotificationResolution('native_5', 'added', makeNotification('native_5'));
  const { client, calls } = makeRpc({
    data: {
      pending: [makeNotification('native_4')],
      resolved: [{ id: 'native_5', status: 'added' }],
      conflicts: ['native_5'],
    },
  });
  const result = await runNotificationSyncFlush(client, false);
  assert.equal(result.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].length, 2);
  assert.deepEqual(getQueuedNotificationOps(), []);
  assert.equal(result.state?.pending.length, 1);
  assert.deepEqual(result.state?.resolved, [{ id: 'native_5', status: 'added' }]);
  assert.deepEqual(result.conflicts, ['native_5']);
});

test('a failed flush keeps every op queued for retry', async () => {
  clearNotificationSyncQueue();
  enqueueNotificationUpsert(makeNotification('native_6'));
  const { client } = makeRpc({ error: { message: 'TypeError: Failed to fetch' } });
  const result = await runNotificationSyncFlush(client, false);
  assert.equal(result.success, false);
  assert.match(result.error || '', /offline or unreachable/i);
  assert.equal(getQueuedNotificationOps().length, 1);
});

test('a missing migration is reported as schemaOutdated and keeps the queue', async () => {
  clearNotificationSyncQueue();
  enqueueNotificationResolution('native_7', 'ignored');
  const { client } = makeRpc({ error: { code: 'PGRST202', message: 'function not found' } });
  const result = await runNotificationSyncFlush(client, false);
  assert.equal(result.success, false);
  assert.equal(result.schemaOutdated, true);
  assert.ok((result.error || '').includes(NOTIFICATION_SYNC_MIGRATION_HINT));
  assert.equal(getQueuedNotificationOps().length, 1);
});

test('ops enqueued while a flush is in flight survive the flush', async () => {
  clearNotificationSyncQueue();
  enqueueNotificationUpsert(makeNotification('native_8'));
  const client: NotificationRpcLike = {
    rpc: async () => {
      enqueueNotificationResolution('native_9', 'added', makeNotification('native_9'));
      return { data: { pending: [], resolved: [], conflicts: [] }, error: null };
    },
  };
  const result = await runNotificationSyncFlush(client, false);
  assert.equal(result.success, true);
  const queue = getQueuedNotificationOps();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, 'native_9');
  clearNotificationSyncQueue();
});

test('merge drops locals resolved elsewhere, adds cloud-pending ones, and self-heals', () => {
  const localKept = makeNotification('native_a');
  const localResolvedElsewhere = makeNotification('native_b');
  const cloudNew = makeNotification('native_c');
  const cloudAlreadyTransacted = makeNotification('native_d');
  const cloudLocallyResolvedButUnsynced = makeNotification('native_e');
  const merge = mergePendingNotifications(
    [localKept, localResolvedElsewhere],
    {
      pending: [localKept, cloudNew, cloudAlreadyTransacted, cloudLocallyResolvedButUnsynced],
      resolved: [{ id: 'native_b', status: 'ignored' }],
    },
    [{ kind: 'resolve', id: 'native_e', status: 'added' }],
    (transactionId) => transactionId === 'tx_native_d'
  );
  assert.equal(merge.changed, true);
  assert.deepEqual(merge.next.map((n) => n.id), ['native_a', 'native_c']);
  assert.deepEqual(merge.removed, [{ notification: localResolvedElsewhere, status: 'ignored' }]);
  assert.deepEqual(merge.selfHealed, ['native_d']);
  assert.equal(merge.next[1].status, 'pending');
});

test('merge reports local-only reviews for backfill upload unless something is already queued', () => {
  const knownToCloud = makeNotification('native_g');
  const localOnly = makeNotification('native_h');
  const localOnlyQueued = makeNotification('native_i');
  const localOnlyResolving = makeNotification('native_j');
  const merge = mergePendingNotifications(
    [knownToCloud, localOnly, localOnlyQueued, localOnlyResolving],
    { pending: [knownToCloud], resolved: [] },
    [
      { kind: 'upsert', id: 'native_i', payload: localOnlyQueued },
      { kind: 'resolve', id: 'native_j', status: 'added' },
    ],
    () => false
  );
  // Only the entry the cloud has never seen and nothing is queued for.
  assert.deepEqual(merge.toUpload.map((n) => n.id), ['native_h']);
  assert.equal(merge.changed, false);
  assert.deepEqual(merge.next.map((n) => n.id), ['native_g', 'native_h', 'native_i', 'native_j']);
});

test('merge returns the same list reference when nothing changed', () => {
  const local = [makeNotification('native_f')];
  const merge = mergePendingNotifications(local, { pending: [local[0]], resolved: [] }, [], () => false);
  assert.equal(merge.changed, false);
  assert.equal(merge.next, local);
  assert.deepEqual(merge.removed, []);
});
