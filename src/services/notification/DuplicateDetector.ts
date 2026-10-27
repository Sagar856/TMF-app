import { Transaction, ParsedNotification } from '../../types/finance';

const MAX_ENTRIES = 500;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const seenMemory = new Map<string, number>();

/** Evicts expired entries and enforces the maximum size cap */
function pruneMemory(now: number): void {
  for (const [key, ts] of seenMemory.entries()) {
    if (now - ts > TTL_MS) {
      seenMemory.delete(key);
    }
  }
  while (seenMemory.size > MAX_ENTRIES) {
    const oldestKey = seenMemory.keys().next().value;
    if (oldestKey !== undefined) {
      seenMemory.delete(oldestKey);
    } else {
      break;
    }
  }
}

/** Resets duplicate detection memory on user sign-out or data reset */
export function resetDuplicateMemory(): void {
  seenMemory.clear();
}

/** Simple deterministic string hash for notification text deduplication */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

export function isDuplicateNotification(
  rawText: string,
  amount: number,
  payeeOrPayer: string,
  refNumber?: string,
  existingTransactions: Transaction[] = [],
  pendingNotifications: ParsedNotification[] = []
): boolean {
  const now = Date.now();
  pruneMemory(now);

  // 1. Text Hash Check
  const textHash = `text_${hashString(rawText.trim().toLowerCase())}`;
  const hashTimestamp = seenMemory.get(textHash);
  if (hashTimestamp && now - hashTimestamp <= TTL_MS) {
    return true;
  }

  // 2. Reference Number / UTR / Txn ID Check
  if (refNumber && refNumber.length >= 6) {
    const normalizedRefKey = `ref_${refNumber.toLowerCase().trim()}`;
    const refTimestamp = seenMemory.get(normalizedRefKey);
    if (refTimestamp && now - refTimestamp <= TTL_MS) {
      return true;
    }

    const plainRef = refNumber.toLowerCase().trim();
    // Check against existing transactions rawText or note
    for (const tx of existingTransactions) {
      if (tx.rawText && tx.rawText.toLowerCase().includes(plainRef)) {
        return true;
      }
    }

    // Check against pending notifications
    for (const pending of pendingNotifications) {
      if (pending.refNumber && pending.refNumber.toLowerCase() === plainRef) {
        return true;
      }
    }
  }

  // 3. Amount + Payee within short window
  if (amount > 0 && payeeOrPayer && payeeOrPayer !== 'Unknown Merchant') {
    const normPayee = payeeOrPayer.toLowerCase();
    for (const pending of pendingNotifications) {
      if (pending.amount === amount && pending.payeeOrPayer.toLowerCase() === normPayee) {
        return true;
      }
    }
  }

  // Register hash & ref number
  seenMemory.set(textHash, now);
  if (refNumber && refNumber.length >= 6) {
    seenMemory.set(`ref_${refNumber.toLowerCase().trim()}`, now);
  }

  return false;
}
