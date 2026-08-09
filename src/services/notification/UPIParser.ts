export interface UPIParseResult {
  appSource: string;
  payeeOrPayer?: string;
  upiRefNumber?: string;
  matched: boolean;
}

interface UPIAppPattern {
  appName: string;
  keywords: string[];
  payeeRegexes: RegExp[];
}

const UPI_APPS: UPIAppPattern[] = [
  {
    appName: 'Google Pay',
    keywords: ['gpay', 'google pay', 'googlepay', 'paisa'],
    payeeRegexes: [
      /(?:paid|sent|transferred)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+ref|\.|$)/i,
      /(?:received)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:from)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+ref|\.|$)/i,
    ],
  },
  {
    appName: 'PhonePe',
    keywords: ['phonepe'],
    payeeRegexes: [
      /(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:sent to|paid to|to)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+txn|\.|$)/i,
      /(?:received)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:from)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+txn|\.|$)/i,
    ],
  },
  {
    appName: 'Paytm UPI',
    keywords: ['paytm'],
    payeeRegexes: [
      /(?:paid|sent)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+utr|\.|$)/i,
      /(?:received)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:from)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+utr|\.|$)/i,
    ],
  },
  {
    appName: 'CRED UPI',
    keywords: ['cred'],
    payeeRegexes: [
      /(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:paid to|to)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+using|\s+via|\.|$)/i,
    ],
  },
  {
    appName: 'Amazon Pay',
    keywords: ['amazon pay', 'amazonpay'],
    payeeRegexes: [
      /(?:paid|sent)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\.|$)/i,
    ],
  },
  {
    appName: 'BHIM UPI',
    keywords: ['bhim'],
    payeeRegexes: [
      /(?:transferred|sent|paid)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:to)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\.|$)/i,
    ],
  },
  {
    appName: 'WhatsApp Pay',
    keywords: ['whatsapp', 'wa pay'],
    payeeRegexes: [
      /(?:paid|sent)\s+(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?\s+(?:to)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\.|$)/i,
    ],
  },
];

export function parseUPIFormat(text: string): UPIParseResult {
  const lower = text.toLowerCase();

  for (const app of UPI_APPS) {
    const isMatch = app.keywords.some((kw) => lower.includes(kw));
    if (isMatch) {
      let payeeOrPayer: string | undefined;

      for (const regex of app.payeeRegexes) {
        const match = text.match(regex);
        if (match && match[1]) {
          const candidate = match[1].trim();
          if (candidate.length >= 2 && !/^(upi|gpay|phonepe|paytm|cred|amazon|ref|utr)$/i.test(candidate)) {
            payeeOrPayer = candidate;
            break;
          }
        }
      }

      // Extract UTR / Txn ID if present
      const utrMatch = text.match(/(?:upi\s*ref|utr|txn\s*id)[\s:=#]*([a-zA-Z0-9]{8,18})/i);
      const upiRefNumber = utrMatch && utrMatch[1] ? utrMatch[1].trim() : undefined;

      return {
        appSource: app.appName,
        payeeOrPayer,
        upiRefNumber,
        matched: true,
      };
    }
  }

  // Generic fallback if text has "upi" or VPA address
  if (lower.includes('upi') || lower.includes('@')) {
    const genericPayee = text.match(/(?:to|sent to|paid to)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+vpa|\s+via|\.|$)/i);
    return {
      appSource: 'UPI Transaction',
      payeeOrPayer: genericPayee && genericPayee[1] ? genericPayee[1].trim() : undefined,
      matched: true,
    };
  }

  return {
    appSource: 'SMS / Alert',
    matched: false,
  };
}
