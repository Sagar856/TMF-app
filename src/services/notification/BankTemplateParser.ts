export interface BankTemplateResult {
  bankName: string;
  payeeOrPayer?: string;
  accountLast4?: string;
  matched: boolean;
}

interface BankPattern {
  name: string;
  keywords: string[];
  payeeRegexes: RegExp[];
  accountRegexes: RegExp[];
}

const BANK_PATTERNS: BankPattern[] = [
  {
    name: 'HDFC Bank',
    keywords: ['hdfc', 'hdfcbank'],
    payeeRegexes: [
      /(?:to|at|vpa)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+vpa|\s+ref|\s+on|\s+avl|\.|$)/i,
      /(?:from)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\s+on|\s+avl|\.|$)/i,
    ],
    accountRegexes: [/(?:a\/c|account)\s*(?:no\.?)?\s*[*xX]*(\d{4})/i],
  },
  {
    name: 'State Bank of India',
    keywords: ['sbi', 'sbiinb', 'sbiupi', 'state bank'],
    payeeRegexes: [
      /(?:transfer to|to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\s+on|\.|$)/i,
      /(?:by|from)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\s+on|\.|$)/i,
    ],
    accountRegexes: [/(?:a\/c|acct)\s*[*xX]*(\d{4})/i],
  },
  {
    name: 'ICICI Bank',
    keywords: ['icici', 'icicibk'],
    payeeRegexes: [
      /;\s*([A-Za-z0-9\s&_.-]{2,30}?)\s+(?:credited|debited)/i,
      /(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\.\s*info|\s+ref|\.|$)/i,
    ],
    accountRegexes: [/(?:a\/c)\s*[*xX]*(\d{4})/i],
  },
  {
    name: 'Axis Bank',
    keywords: ['axis', 'axisbk'],
    payeeRegexes: [
      /(?:at|to)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\s+on|\.|$)/i,
      /(?:from)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\s+on|\.|$)/i,
    ],
    accountRegexes: [/(?:a\/c\s*no\.?)\s*[*xX]*(\d{4})/i],
  },
  {
    name: 'Kotak Mahindra Bank',
    keywords: ['kotak', 'kotakb'],
    payeeRegexes: [/(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+via|\s+ref|\.|$)/i],
    accountRegexes: [/(?:a\/c)\s*[*xX]*(\d{4})/i],
  },
  {
    name: 'Punjab National Bank',
    keywords: ['pnb', 'pnbk'],
    payeeRegexes: [/(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\.|$)/i],
    accountRegexes: [/(?:a\/c)\s*[*xX]*(\d{4})/i],
  },
  {
    name: 'Bank of Baroda',
    keywords: ['bob', 'baroda'],
    payeeRegexes: [/(?:to|at)\s+([A-Za-z0-9\s&_.-]{2,30}?)(?:\s+ref|\.|$)/i],
    accountRegexes: [/(?:a\/c)\s*[*xX]*(\d{4})/i],
  },
];

export function parseBankTemplate(text: string): BankTemplateResult {
  const lower = text.toLowerCase();

  for (const bank of BANK_PATTERNS) {
    const isMatch = bank.keywords.some((kw) => lower.includes(kw));
    if (isMatch) {
      let payeeOrPayer: string | undefined;
      let accountLast4: string | undefined;

      for (const regex of bank.payeeRegexes) {
        const match = text.match(regex);
        if (match && match[1]) {
          const candidate = match[1].trim();
          if (candidate.length >= 2 && !/^(a\/c|account|ref|upi|bank|your|the)$/i.test(candidate)) {
            payeeOrPayer = candidate;
            break;
          }
        }
      }

      for (const regex of bank.accountRegexes) {
        const match = text.match(regex);
        if (match && match[1]) {
          accountLast4 = match[1];
          break;
        }
      }

      return {
        bankName: bank.name,
        payeeOrPayer,
        accountLast4,
        matched: true,
      };
    }
  }

  return {
    bankName: 'Bank Alert',
    matched: false,
  };
}
