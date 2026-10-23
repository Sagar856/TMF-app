import { FinancialAccount } from '../types/finance';

/**
 * Resolves an account ID from an account ID, legacy display string, or bank name.
 * 
 * Rules:
 * a. Exact match on id -> return id
 * b. Legacy fallback: if string contains "(**dddd)" match accountNumberLast4 (and bankName if present)
 *    else match name / bankName case-insensitively
 * c. 'Cash', 'UPI', 'Other UPI', or unmatched -> return null
 */
export function resolveAccountId(
  accountsList: FinancialAccount[],
  methodOrName: string | undefined
): string | null {
  if (!methodOrName || accountsList.length === 0) return null;
  const trimmed = methodOrName.trim();
  if (trimmed === 'Cash' || trimmed.toLowerCase() === 'cash') return null;

  // a. exact match on id
  const exactById = accountsList.find((a) => a.id === trimmed);
  if (exactById) return exactById.id;

  // b. legacy fallback: if the string contains "(**dddd)" match accountNumberLast4 (and bankName if present)
  const last4Match = trimmed.match(/\(\*\*(\d{4})\)/);
  if (last4Match) {
    const last4 = last4Match[1];
    const normalized = trimmed.toLowerCase();
    // Prefer matching both last4 and bankName/cardNetwork/name
    const withBank = accountsList.find(
      (a) =>
        a.accountNumberLast4 === last4 &&
        (normalized.includes(a.bankName.toLowerCase()) ||
          (a.cardNetwork && normalized.includes(a.cardNetwork.toLowerCase())) ||
          normalized.includes(a.name.toLowerCase()))
    );
    if (withBank) return withBank.id;

    // Otherwise match just last4
    const byLast4 = accountsList.find((a) => a.accountNumberLast4 === last4);
    if (byLast4) return byLast4.id;
  }

  // else match name/bankName case-insensitively
  const target = trimmed.toLowerCase();
  if (target === 'upi' || target === 'other upi') return null;

  const byNameOrBank = accountsList.find(
    (a) =>
      a.name.toLowerCase() === target ||
      a.bankName.toLowerCase() === target ||
      (a.cardNetwork && `${a.bankName} ${a.cardNetwork}`.toLowerCase() === target)
  );
  if (byNameOrBank) return byNameOrBank.id;

  return null;
}
