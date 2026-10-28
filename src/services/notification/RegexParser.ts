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
  // Messages often carry several amounts (transaction, available balance,
  // limit); pick the one closest to a transaction verb and never the balance.
  const amountRegex = /(?:(?:rs\.?|inr|₹|\$|usd|€|eur|£|gbp)\s*([\d,]+(?:\.\d{1,2})?))|(?:([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹|usd|eur|gbp))/gi;
  const balanceSpan = (() => {
    const m = /(?:avl\s*bal|available\s*balance|net\s*bal|\bbal)[\s:=]*(?:rs\.?|inr|₹|\$)?\s*[\d,]+(?:\.\d{1,2})?/i.exec(text);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  })();
  const limitSpan = (() => {
    const m = /(?:limit|credit\s*limit)[\s:=]*(?:rs\.?|inr|₹|\$)?\s*[\d,]+(?:\.\d{1,2})?/i.exec(text);
    return m ? { start: m.index, end: m.index + m[0].length } : null;
  })();
  const verbIndices = Array.from(
    text.matchAll(/\b(debited|credited|paid|sent|received|spent|withdrawn|transferred|deducted|refund(?:ed)?|revers(?:al|ed)|purchase|payment)\b/gi)
  ).map((m) => m.index ?? 0);

  type Candidate = { value: number; index: number; raw: string };
  const candidates: Candidate[] = [];
  for (const match of text.matchAll(amountRegex)) {
    const rawValue = match[1] ?? match[2];
    const index = match.index ?? 0;
    if (!rawValue) continue;
    const insideBalance = balanceSpan && index >= balanceSpan.start && index < balanceSpan.end;
    const insideLimit = limitSpan && index >= limitSpan.start && index < limitSpan.end;
    if (insideBalance || insideLimit) continue;
    const value = parseFloat(rawValue.replace(/,/g, ''));
    if (Number.isFinite(value) && value > 0) candidates.push({ value, index, raw: match[0] });
  }

  if (candidates.length > 0) {
    const distanceToVerb = (c: Candidate) =>
      verbIndices.length === 0 ? 0 : Math.min(...verbIndices.map((v) => Math.abs(v - c.index)));
    const best = candidates.reduce((acc, c) => (distanceToVerb(c) < distanceToVerb(acc) ? c : acc), candidates[0]);
    amount = best.value;
    const raw = best.raw.toLowerCase();
    if (raw.includes('$') || /usd/.test(raw)) currency = 'USD';
    else if (raw.includes('€') || /eur/.test(raw)) currency = 'EUR';
    else if (raw.includes('£') || /gbp/.test(raw)) currency = 'GBP';
    else currency = 'INR';
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
  // Require an explicit label and a token that contains digits so ordinary words aren't captured.
  const refRegexes = [
    /(?:upi\s*ref(?:\s*no)?|ref(?:erence)?\s*no\.?|rrn|utr|txn\s*id|transaction\s*id)[\s:=#.-]*([a-zA-Z0-9]{8,22})/i,
    /\bref[\s:=#.-]+([a-zA-Z0-9]{8,22})/i,
  ];

  for (const regex of refRegexes) {
    const match = text.match(regex);
    if (match && match[1] && /\d{4,}/.test(match[1])) {
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
