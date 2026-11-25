import type { FinancialAccount, Transaction } from '../types/finance';

export function pendingDeletionsToRestore(
  deletedIds: readonly string[],
  cloudTransactions: readonly { id: string }[],
  cloudTombstones: readonly string[],
): string[] {
  const liveIds = new Set(cloudTransactions.map(transaction => transaction.id));
  const tombstones = new Set(cloudTombstones);
  return deletedIds.filter(id => liveIds.has(id) && !tombstones.has(id));
}

export function parseTransactionSyncRevisions(
  value: unknown,
  expectedTransactionIds: readonly string[],
): Record<string, number> | undefined {
  if (!Array.isArray(value)) return undefined;
  const expected = new Set(expectedTransactionIds);
  if (expected.size !== expectedTransactionIds.length) return undefined;
  const revisions = new Map<string, number>();
  for (const row of value) {
    if (typeof row !== 'object' || row === null || !('id' in row) || !('sync_revision' in row)) return undefined;
    const { id, sync_revision: revision } = row as { id: unknown; sync_revision: unknown };
    if (typeof id !== 'string' || !expected.has(id) || revisions.has(id)
      || typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) return undefined;
    revisions.set(id, revision);
  }
  return revisions.size === expected.size ? Object.fromEntries(revisions) : undefined;
}

export function applyTransactionSyncRevisions(
  transactions: Transaction[],
  revisions: Readonly<Record<string, number>>,
): Transaction[] {
  return transactions.map(transaction => {
    if (!Object.hasOwn(revisions, transaction.id)) return transaction;
    const syncRevision = revisions[transaction.id];
    return syncRevision <= (transaction.syncRevision ?? 0) ? transaction : { ...transaction, syncRevision };
  });
}

export function applyAccountSyncRevisions(
  accounts: FinancialAccount[],
  revisions: Readonly<Record<string, number>>,
): FinancialAccount[] {
  return accounts.map(account => Object.hasOwn(revisions, account.id) && (account.syncRevision ?? 0) < revisions[account.id]
    ? { ...account, syncRevision: revisions[account.id] } : account);
}
