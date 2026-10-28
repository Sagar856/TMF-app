/**
 * Shared helpers for turning regex captures into a usable merchant/payee name.
 * Bank SMS often places account numbers, phone numbers or boilerplate where a
 * merchant would be; those must never become transaction titles.
 */

const BOILERPLATE = new Set([
  'a/c', 'ac', 'account', 'acct', 'ref', 'upi', 'bank', 'your', 'the', 'you', 'vpa', 'gpay', 'phonepe', 'paytm', 'cred',
  'amazon', 'utr', 'txn', 'info', 'avl', 'bal', 'balance', 'via', 'on', 'at', 'to', 'from', 'by', 'rs', 'inr',
]);

const TRAILING_NOISE = /\s+(?:via|ref(?:erence)?|utr|txn|on|avl|bal(?:ance)?|using|info|upi)\b.*$/i;

export function sanitizeMerchantCandidate(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let candidate = raw.replace(TRAILING_NOISE, '').replace(/[\s.,;:-]+$/g, '').replace(/^[\s.,;:-]+/g, '').trim();
  if (candidate.length < 2) return undefined;

  const digits = (candidate.match(/\d/g) || []).length;
  // Phone numbers, account numbers and masked card numbers are not merchants.
  if (/\d{7,}/.test(candidate.replace(/\s/g, ''))) return undefined;
  if (/^[xX*]+\d{3,}$/.test(candidate)) return undefined;
  if (digits > candidate.replace(/\s/g, '').length / 2) return undefined;

  const lower = candidate.toLowerCase();
  if (BOILERPLATE.has(lower)) return undefined;
  if (/^(?:a\/c|account|acct)\b/i.test(candidate)) return undefined;

  // Collapse internal whitespace
  candidate = candidate.replace(/\s{2,}/g, ' ');
  return candidate;
}
