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

export function extractWithKeywords(text: string): KeywordExtractionResult {
  const lower = text.toLowerCase();

  // 1. Transaction Type Detection
  let type: TransactionType = 'debit';
  let creditScore = 0;
  let debitScore = 0;

  for (const kw of CREDIT_KEYWORDS) {
    if (lower.includes(kw)) creditScore += kw.length > 8 ? 2 : 1;
  }

  for (const kw of DEBIT_KEYWORDS) {
    if (lower.includes(kw)) debitScore += kw.length > 8 ? 2 : 1;
  }

  if (creditScore > debitScore) {
    type = 'credit';
  } else {
    type = 'debit';
  }

  // 2. Payment Method Detection
  let paymentMethod = 'UPI / Online';
  if (lower.includes('credit card') || lower.includes('cc')) {
    paymentMethod = 'Credit Card';
  } else if (lower.includes('debit card') || lower.includes('dc') || lower.includes('atm card')) {
    paymentMethod = 'Debit Card';
  } else if (lower.includes('upi') || lower.includes('vpa') || lower.includes('gpay') || lower.includes('phonepe') || lower.includes('paytm')) {
    paymentMethod = 'UPI';
  } else if (lower.includes('netbanking') || lower.includes('net banking') || lower.includes('imps') || lower.includes('neft') || lower.includes('rtgs')) {
    paymentMethod = 'NetBanking';
  } else if (lower.includes('wallet') || lower.includes('balance')) {
    paymentMethod = 'Wallet';
  } else if (lower.includes('atm') || lower.includes('cash withdrawal')) {
    paymentMethod = 'ATM Cash';
  }

  return {
    type,
    paymentMethod,
  };
}
