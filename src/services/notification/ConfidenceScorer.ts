export interface ConfidenceScoreResult {
  score: number; // 0 - 100
  requiresManualVerification: boolean;
  unparsedFields: string[];
}

export function computeConfidenceScore(
  amount: number,
  payeeOrPayer: string,
  type: string,
  accountLast4?: string,
  refNumber?: string
): ConfidenceScoreResult {
  let score = 0;
  const unparsedFields: string[] = [];

  // 1. Amount Check (40 pts)
  if (amount > 0) {
    score += 40;
  } else {
    unparsedFields.push('amount');
  }

  // 2. Merchant / Payee Check (30 pts)
  if (payeeOrPayer && payeeOrPayer !== 'Unknown Merchant' && payeeOrPayer.length >= 2) {
    score += 30;
  } else {
    unparsedFields.push('payeeOrPayer');
  }

  // 3. Direction Check (15 pts)
  if (type === 'credit' || type === 'debit') {
    score += 15;
  } else {
    unparsedFields.push('type');
  }

  // 4. Account or Ref ID Check (15 pts)
  if (refNumber || accountLast4) {
    score += 15;
  } else {
    unparsedFields.push('referenceNumber');
  }

  const requiresManualVerification = score < 80;

  return {
    score,
    requiresManualVerification,
    unparsedFields,
  };
}
