import { Transaction, ParsedNotification } from '../../types/finance';

const seenHashes = new Set<string>();
const seenRefNumbers = new Set<string>();

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
  // 1. Text Hash Check
  const textHash = hashString(rawText.trim().toLowerCase());
  if (seenHashes.has(textHash)) {
    return true;
  }

  // 2. Reference Number / UTR / Txn ID Check
  if (refNumber && refNumber.length >= 6) {
    const normalizedRef = refNumber.toLowerCase().trim();
    if (seenRefNumbers.has(normalizedRef)) {
      return true;
    }

    // Check against existing transactions rawText or note
    for (const tx of existingTransactions) {
      if (tx.rawText && tx.rawText.toLowerCase().includes(normalizedRef)) {
        return true;
      }
    }

    // Check against pending notifications
    for (const pending of pendingNotifications) {
      if (pending.refNumber && pending.refNumber.toLowerCase() === normalizedRef) {
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
  seenHashes.add(textHash);
  if (refNumber && refNumber.length >= 6) {
    seenRefNumbers.add(refNumber.toLowerCase().trim());
  }

  return false;
}
