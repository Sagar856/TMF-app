/**
 * Stage 1 Regex Extraction Module
 * Extracts numeric amounts, currency symbols, masked accounts, reference IDs, and available balance.
 */

export interface RegexExtractionResult {
  amount: number;
  currency: string;
  accountLast4?: string;
  refNumber?: string;
  availableBalance?: number;
}

export function extractWithRegex(text: string): RegexExtractionResult {
  let amount = 0;
  let currency = 'INR';
  let accountLast4: string | undefined;
  let refNumber: string | undefined;
  let availableBalance: string | number | undefined;

  // 1. Currency & Amount Extraction
  // Examples: "Rs 420.00", "Rs.420", "INR 1,250", "₹500", "420.00 INR", "$45.00"
  const amountRegexes = [
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i,
    /(?:\$|usd)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:€|eur)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:£|gbp)\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const regex of amountRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsedVal = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsedVal) && parsedVal > 0) {
        amount = parsedVal;
        if (text.includes('$') || /usd/i.test(text)) currency = 'USD';
        else if (text.includes('€') || /eur/i.test(text)) currency = 'EUR';
        else if (text.includes('£') || /gbp/i.test(text)) currency = 'GBP';
        else currency = 'INR';
        break;
      }
    }
  }

  // 2. Account / Card Last 4 Digits Extraction
  // Examples: "A/C XX1234", "acct ending 5678", "card ending 9012", "a/c *4321", "A/C No. ...1234"
  const accountRegexes = [
    /(?:a\/c|account|acct|card|vpa)\s*(?:no\.?|number|ending)?\s*(?:[xX*]*(\d{3,4}))/i,
    /(?:ending|ending in)\s*([0-9]{4})/i,
    /([0-9]{4})\s*(?:is debited|is credited|was debited|was credited)/i,
  ];

  for (const regex of accountRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      accountLast4 = match[1];
      break;
    }
  }

  // 3. Reference Number / UTR / Txn ID Extraction
  // Examples: "Ref 421901234567", "UPI Ref: 629104812345", "Txn ID: P260809123456", "UTR: 908123765432"
  const refRegexes = [
    /(?:upi\s*ref|ref\s*no\.?|ref|rrn|utr|txn\s*id|transaction\s*id)[\s:=#]*([a-zA-Z0-9]{8,18})/i,
    /(?:ref|rrn|utr)\s*:\s*([0-9]{10,14})/i,
  ];

  for (const regex of refRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      refNumber = match[1].trim();
      break;
    }
  }

  // 4. Available Balance Extraction
  // Examples: "Avl bal: Rs 15,200.00", "Bal: INR 4,500", "Available balance ₹12,000", "Bal Rs 500"
  const balanceRegexes = [
    /(?:avl\s*bal|available\s*balance|bal|net\s*bal)[\s:=]*(?:rs\.?|inr|₹|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  for (const regex of balanceRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(val)) {
        availableBalance = val;
        break;
      }
    }
  }

  return {
    amount,
    currency,
    accountLast4,
    refNumber,
    availableBalance: typeof availableBalance === 'number' ? availableBalance : undefined,
  };
}
