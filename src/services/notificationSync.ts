import type { ParsedNotification } from '../types/finance';
import { safeGetJson, safeSetItem } from '../utils/storage';
import { getSupabaseClient, isNetworkOrFetchError } from './supabaseClient';

// =======================================================
// CROSS-DEVICE SYNC FOR SMS/NOTIFICATION-PARSER RESULTS
//
// Every local change (a newly parsed payment, an edit, or a resolution) is
// appended to a persistent FIFO queue. The queue is flushed as ONE atomic
// batch through the sync_pending_notifications RPC (see
// supabase_pending_notifications.sql): either every queued operation commits
// or none does, and the RPC returns the authoritative cloud snapshot read in
// the same transaction.
//
// Conflict handling: resolutions are cloud tombstones and the first
// resolution wins, so a stale device can never re-add a payment another
// device already reviewed — the double-apply that would corrupt balances.
// =======================================================

export type NotificationResolutionStatus = 'added' | 'ignored';

export type NotificationSyncOp =
  | { kind: 'upsert'; id: string; payload: ParsedNotification }
  | { kind: 'resolve'; id: string; status: NotificationResolutionStatus; payload?: ParsedNotification };

export interface CloudNotificationState {
  pending: ParsedNotification[];
  resolved: Array<{ id: string; status: NotificationResolutionStatus }>;
}

export interface NotificationSyncFlushResult {
  success: boolean;
  error?: string;
  schemaOutdated?: boolean;
  /** Authoritative cloud snapshot returned by the atomic RPC. */
  state?: CloudNotificationState;
  /** Resolutions that lost to an earlier resolution on another device. */
  conflicts?: string[];
}

export const NOTIFICATION_SYNC_QUEUE_KEY = 'tmf_notification_sync_queue';
export const NOTIFICATION_SYNC_MIGRATION_HINT =
  'Run supabase_pending_notifications.sql in your Supabase SQL Editor to enable cross-device payment reviews.';

export function isParsedNotification(value: unknown): value is ParsedNotification {
  if (!value || typeof value !== 'object') return false;
  const n = value as Partial<ParsedNotification>;
  return typeof n.id === 'string' && n.id.length > 0
    && typeof n.rawText === 'string'
    && typeof n.amount === 'number' && Number.isFinite(n.amount)
    && typeof n.payeeOrPayer === 'string'
    && (n.type === 'credit' || n.type === 'debit')
    && typeof n.date === 'string'
    && typeof n.time === 'string'
    && typeof n.category === 'string'
    && typeof n.subcategory === 'string'
    && typeof n.appSource === 'string';
}

function isNotificationSyncOp(value: unknown): value is NotificationSyncOp {
  if (!value || typeof value !== 'object') return false;
  const op = value as Partial<NotificationSyncOp>;
  if (typeof op.id !== 'string' || op.id.length === 0) return false;
  if (op.kind === 'upsert') return isParsedNotification((op as { payload?: unknown }).payload);
  if (op.kind === 'resolve') {
    const resolve = op as { status?: unknown; payload?: unknown };
    return (resolve.status === 'added' || resolve.status === 'ignored')
      && (resolve.payload === undefined || isParsedNotification(resolve.payload));
  }
  return false;
}

export function getQueuedNotificationOps(): NotificationSyncOp[] {
  return safeGetJson<NotificationSyncOp[]>(
    NOTIFICATION_SYNC_QUEUE_KEY,
    [],
    (value): value is NotificationSyncOp[] => Array.isArray(value) && value.every(isNotificationSyncOp)
  );
}

function saveQueue(ops: NotificationSyncOp[]): boolean {
  return safeSetItem(NOTIFICATION_SYNC_QUEUE_KEY, JSON.stringify(ops));
}

export function clearNotificationSyncQueue(): void {
  saveQueue([]);
}

// Number of ops at the head of the queue currently being flushed. Coalescing
// never touches these so a successful flush can drop exactly that prefix.
let flushingCount = 0;

/**
 * Queues a pending notification (new or edited) for cloud upload. A later
 * upsert of the same id replaces the queued one.
 */
export function enqueueNotificationUpsert(notification: ParsedNotification): void {
  const queue = getQueuedNotificationOps();
  const payload: ParsedNotification = { ...notification, status: 'pending' };
  // A queued resolution for this id always wins — never re-pend behind it.
  if (queue.some((op, index) => index >= flushingCount && op.kind === 'resolve' && op.id === notification.id)) return;
  const existing = queue.findIndex((op, index) => index >= flushingCount && op.kind === 'upsert' && op.id === notification.id);
  if (existing >= 0) queue[existing] = { kind: 'upsert', id: notification.id, payload };
  else queue.push({ kind: 'upsert', id: notification.id, payload });
  saveQueue(queue);
}

/**
 * Queues a resolution (payment added or ignored). Replaces any queued upsert
 * of the same id; the first queued resolution for an id wins, mirroring the
 * cloud conflict rule.
 */
export function enqueueNotificationResolution(
  id: string,
  status: NotificationResolutionStatus,
  notification?: ParsedNotification
): void {
  const queue = getQueuedNotificationOps();
  if (queue.some((op, index) => index >= flushingCount && op.kind === 'resolve' && op.id === id)) return;
  const upsert = queue.findIndex((op, index) => index >= flushingCount && op.kind === 'upsert' && op.id === id);
  const payload = notification ? { ...notification } : (upsert >= 0 ? (queue[upsert] as { payload: ParsedNotification }).payload : undefined);
  const op: NotificationSyncOp = { kind: 'resolve', id, status, ...(payload ? { payload } : {}) };
  if (upsert >= 0) queue[upsert] = op;
  else queue.push(op);
  saveQueue(queue);
}

/** Minimal RPC surface so the flush core is testable without a live client. */
export interface NotificationRpcLike {
  rpc(fn: string, args: { ops: NotificationSyncOp[] }): PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
}

function parseCloudState(data: unknown): CloudNotificationState {
  const raw = (data ?? {}) as { pending?: unknown; resolved?: unknown; conflicts?: unknown };
  const pending = Array.isArray(raw.pending) ? raw.pending.filter(isParsedNotification) : [];
  const resolved = Array.isArray(raw.resolved)
    ? raw.resolved.filter((entry): entry is { id: string; status: NotificationResolutionStatus } =>
        Boolean(entry) && typeof entry === 'object'
        && typeof (entry as { id?: unknown }).id === 'string'
        && ((entry as { status?: unknown }).status === 'added' || (entry as { status?: unknown }).status === 'ignored'))
    : [];
  return { pending, resolved };
}

function parseConflicts(data: unknown): string[] {
  const raw = (data ?? {}) as { conflicts?: unknown };
  return Array.isArray(raw.conflicts) ? raw.conflicts.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Flushes the queued ops through the atomic RPC. Exported for tests; app code
 * should use {@link flushNotificationSync}, which serialises calls.
 */
export async function runNotificationSyncFlush(
  client: NotificationRpcLike,
  fetchSnapshot: boolean
): Promise<NotificationSyncFlushResult> {
  const queue = getQueuedNotificationOps();
  if (queue.length === 0 && !fetchSnapshot) return { success: true };
  flushingCount = queue.length;
  try {
    const { data, error } = await client.rpc('sync_pending_notifications', { ops: queue });
    if (error) {
      if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01' || error.code === 'PGRST205') {
        return {
          success: false,
          schemaOutdated: true,
          error: `Cross-device payment reviews are unavailable. ${NOTIFICATION_SYNC_MIGRATION_HINT}`,
        };
      }
      if (isNetworkOrFetchError(error)) {
        return { success: false, error: 'Cloud offline or unreachable. Payment reviews saved on this device.' };
      }
      return { success: false, error: error.message || 'Could not sync payment reviews.' };
    }
    // Drop exactly the flushed prefix; ops enqueued mid-flight stay queued.
    const latest = getQueuedNotificationOps();
    saveQueue(latest.slice(queue.length));
    return { success: true, state: parseCloudState(data), conflicts: parseConflicts(data) };
  } catch (err) {
    if (isNetworkOrFetchError(err)) {
      return { success: false, error: 'Cloud offline or unreachable. Payment reviews saved on this device.' };
    }
    return { success: false, error: err instanceof Error ? err.message : 'Could not sync payment reviews.' };
  } finally {
    flushingCount = 0;
  }
}

// Flushes are strictly serialised so batches can never interleave or reorder.
let flushChain: Promise<unknown> = Promise.resolve();

/**
 * Flushes the local queue to the cloud. Safe to call often: it is a no-op
 * when the queue is empty (unless a snapshot is requested), failures keep
 * every op queued for the next flush, and concurrent calls are serialised.
 */
export function flushNotificationSync(fetchSnapshot = false): Promise<NotificationSyncFlushResult> {
  const run = async (): Promise<NotificationSyncFlushResult> => {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Cloud backend is not configured.' };
    if (getQueuedNotificationOps().length === 0 && !fetchSnapshot) return { success: true };
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { success: false, error: 'Not signed in' };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks) return locks.request('minarth-notification-sync', () => runNotificationSyncFlush(client, fetchSnapshot));
    return runNotificationSyncFlush(client, fetchSnapshot);
  };
  const result = flushChain.then(run, run);
  flushChain = result.catch(() => undefined);
  return result;
}

export interface PendingNotificationMerge {
  next: ParsedNotification[];
  /** Local entries removed because another device already resolved them. */
  removed: Array<{ notification: ParsedNotification; status: NotificationResolutionStatus }>;
  /** Cloud-pending ids whose transaction already exists locally; resolve them as 'added'. */
  selfHealed: string[];
  /** Local pending entries the cloud has never seen (e.g. parsed before this
   *  feature shipped); upload them so other devices can review them too. */
  toUpload: ParsedNotification[];
  changed: boolean;
}

/**
 * Merges the authoritative cloud snapshot into the local review list.
 * Cloud resolutions always win; locally queued (unsynced) resolutions are
 * honoured; cloud-pending entries whose payment already exists locally are
 * reported for self-healing instead of being shown again; and local-only
 * pending entries unknown to the cloud are reported for backfill upload.
 */
export function mergePendingNotifications(
  local: ParsedNotification[],
  cloud: CloudNotificationState,
  queuedOps: NotificationSyncOp[],
  hasTransaction: (transactionId: string) => boolean
): PendingNotificationMerge {
  const resolved = new Map(cloud.resolved.map((entry) => [entry.id, entry.status]));
  const queuedIds = new Set(queuedOps.map((op) => op.id));
  const queuedResolves = new Set(queuedOps.filter((op) => op.kind === 'resolve').map((op) => op.id));
  const cloudPendingIds = new Set(cloud.pending.filter(isParsedNotification).map((entry) => entry.id));

  const removed: PendingNotificationMerge['removed'] = [];
  const toUpload: ParsedNotification[] = [];
  const next: ParsedNotification[] = [];
  for (const notification of local) {
    const status = resolved.get(notification.id);
    if (status) {
      removed.push({ notification, status });
      continue;
    }
    next.push(notification);
    // Entirely unknown to the cloud and nothing queued for it: backfill it.
    if (!cloudPendingIds.has(notification.id) && !queuedIds.has(notification.id)) {
      toUpload.push(notification);
    }
  }

  const present = new Set(next.map((notification) => notification.id));
  const selfHealed: string[] = [];
  for (const incoming of cloud.pending) {
    if (!isParsedNotification(incoming)) continue;
    if (present.has(incoming.id) || resolved.has(incoming.id) || queuedResolves.has(incoming.id)) continue;
    if (hasTransaction(`tx_${incoming.id}`)) {
      selfHealed.push(incoming.id);
      continue;
    }
    next.push({ ...incoming, status: 'pending' });
    present.add(incoming.id);
  }

  const changed = removed.length > 0 || next.length !== local.length;
  return { next: changed ? next : local, removed, selfHealed, toUpload, changed };
}
