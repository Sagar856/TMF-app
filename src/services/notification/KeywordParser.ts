import { TransactionType } from '../../types/finance';

export interface KeywordExtractionResult {
  type: TransactionType;
  paymentMethod: string;
}

const CREDIT_KEYWORDS = [
  'credited',
  'received',
  'deposit',
  'deposited',
  'added to',
  'cashback',
  'refund',
  'refunded',
  'salary credited',
  'interest credited',
  'dividend',
  'reversal',
  'reversed',
];

const DEBIT_KEYWORDS = [
  'debited',
  'sent',
  'paid to',
  'paid',
  'spent',
  'transferred to',
  'transferred',
  'withdrawn',
  'withdrawal',
  'deducted',
  'purchase of',
  'bought',
  'emi deducted',
  'subscription paid',
  'autopay',
];

/** Strong credit signals that override generic debit wording ("payment reversed", "cashback for your payment"). */
const CREDIT_OVERRIDES = /\b(refund(?:ed)?|revers(?:al|ed)|cashback|chargeback)\b/i;

/** Primary direction words; the one that appears first in the text wins ties. */
const PRIMARY_DEBIT = /\b(debited|spent|withdrawn|paid)\b/i;
const PRIMARY_CREDIT = /\b(credited|received|deposited)\b/i;

function includesWord(lower: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, 'i').test(lower);
}

export function extractWithKeywords(text: string): KeywordExtractionResult {
  const lower = text.toLowerCase();

  // 1. Transaction Type Detection
  let type: TransactionType = 'debit';
  let creditScore = 0;
  let debitScore = 0;

  for (const kw of CREDIT_KEYWORDS) {
    if (includesWord(lower, kw)) creditScore += kw.length > 8 ? 2 : 1;
  }

  for (const kw of DEBIT_KEYWORDS) {
    if (includesWord(lower, kw)) debitScore += kw.length > 8 ? 2 : 1;
  }

  if (CREDIT_OVERRIDES.test(text)) {
    type = 'credit';
  } else if (creditScore !== debitScore) {
    type = creditScore > debitScore ? 'credit' : 'debit';
  } else {
    // Tie (e.g. "debited ... credited to beneficiary"): the first primary word describes *your* account.
    const debitIdx = text.search(PRIMARY_DEBIT);
    const creditIdx = text.search(PRIMARY_CREDIT);
    if (creditIdx !== -1 && (debitIdx === -1 || creditIdx < debitIdx)) type = 'credit';
    else type = 'debit';
  }

  // 2. Payment Method Detection (word-boundary matches so "cc"/"dc" don't fire inside merchant names)
  let paymentMethod = 'UPI / Online';
  if (includesWord(lower, 'credit card') || includesWord(lower, 'cc')) {
    paymentMethod = 'Credit Card';
  } else if (includesWord(lower, 'debit card') || includesWord(lower, 'dc') || includesWord(lower, 'atm card')) {
    paymentMethod = 'Debit Card';
  } else if (['upi', 'vpa', 'gpay', 'phonepe', 'paytm'].some((kw) => includesWord(lower, kw))) {
    paymentMethod = 'UPI';
  } else if (['netbanking', 'net banking', 'imps', 'neft', 'rtgs'].some((kw) => includesWord(lower, kw))) {
    paymentMethod = 'NetBanking';
  } else if (includesWord(lower, 'wallet')) {
    paymentMethod = 'Wallet';
  } else if (includesWord(lower, 'atm') || includesWord(lower, 'cash withdrawal')) {
    paymentMethod = 'ATM Cash';
  }

  return {
    type,
    paymentMethod,
  };
}
