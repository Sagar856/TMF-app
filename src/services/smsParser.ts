import { ParsedNotification, TransactionType, LocationTag } from '../types/finance';

interface CategoryMatch {
  category: string;
  subcategory: string;
}

const MERCHANT_CATEGORY_MAP: Record<string, CategoryMatch> = {
  starbucks: { category: 'Expense', subcategory: 'Food & Dining' },
  coffee: { category: 'Expense', subcategory: 'Food & Dining' },
  swiggy: { category: 'Expense', subcategory: 'Food & Dining' },
  zomato: { category: 'Expense', subcategory: 'Food & Dining' },
  restaurant: { category: 'Expense', subcategory: 'Food & Dining' },
  mcdonalds: { category: 'Expense', subcategory: 'Food & Dining' },
  uber: { category: 'Expense', subcategory: 'Transport & Fuel' },
  ola: { category: 'Expense', subcategory: 'Transport & Fuel' },
  petrol: { category: 'Expense', subcategory: 'Transport & Fuel' },
  shell: { category: 'Expense', subcategory: 'Transport & Fuel' },
  fuel: { category: 'Expense', subcategory: 'Transport & Fuel' },
  amazon: { category: 'Expense', subcategory: 'Shopping & Tech' },
  flipkart: { category: 'Expense', subcategory: 'Shopping & Tech' },
  apple: { category: 'Expense', subcategory: 'Shopping & Tech' },
  zerodha: { category: 'Investment', subcategory: 'Stocks & ETFs' },
  groww: { category: 'Investment', subcategory: 'Mutual Funds' },
  coinswitch: { category: 'Investment', subcategory: 'Crypto' },
  salary: { category: 'Income', subcategory: 'Salary' },
  freelance: { category: 'Income', subcategory: 'Freelance' },
  dividend: { category: 'Income', subcategory: 'Dividends' },
  netflix: { category: 'Expense', subcategory: 'Subscriptions' },
  spotify: { category: 'Expense', subcategory: 'Subscriptions' },
  electricity: { category: 'Expense', subcategory: 'Bills & Utilities' },
  airtel: { category: 'Expense', subcategory: 'Bills & Utilities' },
  jio: { category: 'Expense', subcategory: 'Bills & Utilities' },
};

export function parseSmsNotification(
  text: string,
  userLocation?: LocationTag | null
): ParsedNotification {
  const lower = text.toLowerCase();
  
  // 1. Detect Transaction Type
  let type: TransactionType = 'debit';
  if (
    lower.includes('received') ||
    lower.includes('credited') ||
    lower.includes('deposit') ||
    lower.includes('added to') ||
    lower.includes('cashback')
  ) {
    type = 'credit';
  } else if (
    lower.includes('sent') ||
    lower.includes('debited') ||
    lower.includes('paid to') ||
    lower.includes('spent') ||
    lower.includes('transferred to')
  ) {
    type = 'debit';
  }

  // 2. Extract Amount
  // Matches: "Rs 420.00", "Rs.420", "INR 1,250", "$45.00", "420.00 INR", "Rs 500"
  // NOTE: intentionally no bare-digit fallback here — matching any random
  // number in the text (dates, phone numbers, reference IDs) produced wrong
  // amounts. If no currency-tagged amount is found, we report amount = 0 so
  // the user can fix it up in the review/edit step instead of silently
  // recording a bogus figure.
  let amount = 0;
  const amountRegex = /(?:rs\.?|inr|\$|usd|€|£)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|\$)/i;
  const amountMatch = text.match(amountRegex);
  if (amountMatch) {
    const rawVal = amountMatch[1] || amountMatch[2];
    if (rawVal) {
      amount = parseFloat(rawVal.replace(/,/g, ''));
    }
  }

  // 3. Extract Payee / Payer ("whom to sent")
  let payeeOrPayer = 'Unknown Merchant';
  
  // Try matching "to [Merchant]" or "paid to [Merchant]" or "at [Merchant]" or "vpa [UPI ID]"
  const payeeRegexes = [
    /(?:paid to|sent to|transferred to|to|at|vpa:?)\s+([A-Za-z0-9\s&_.-]{2,30})(?:\s+on|\s+via|\s+ref|\s+from|\.|$)/i,
    /(?:from)\s+([A-Za-z0-9\s&_.-]{2,30})(?:\s+on|\s+via|\s+ref|\.|$)/i,
  ];

  for (const regex of payeeRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // clean noise
      if (!['a/c', 'account', 'your', 'upi', 'bank'].includes(candidate.toLowerCase())) {
        payeeOrPayer = candidate;
        break;
      }
    }
  }

  if (payeeOrPayer === 'Unknown Merchant') {
    // Check if any known merchant keyword is in text
    for (const key of Object.keys(MERCHANT_CATEGORY_MAP)) {
      if (lower.includes(key)) {
        payeeOrPayer = key.charAt(0).toUpperCase() + key.slice(1);
        break;
      }
    }
  }

  // 4. Auto Category & Subcategory Detection
  let category = type === 'credit' ? 'Income' : 'Expense';
  let subcategory = type === 'credit' ? 'Other Income' : 'General Expense';

  const payeeLower = payeeOrPayer.toLowerCase();
  let matched = false;

  for (const [key, mapping] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (lower.includes(key) || payeeLower.includes(key)) {
      category = mapping.category;
      subcategory = mapping.subcategory;
      matched = true;
      break;
    }
  }

  if (!matched && type === 'credit') {
    if (lower.includes('salary') || lower.includes('payroll')) {
      category = 'Income';
      subcategory = 'Salary';
    } else if (lower.includes('dividend')) {
      category = 'Income';
      subcategory = 'Dividends';
    }
  }

  // 5. Detect App Source
  let appSource = 'SMS Interceptor';
  if (lower.includes('paytm')) appSource = 'Paytm UPI';
  else if (lower.includes('phonepe')) appSource = 'PhonePe';
  else if (lower.includes('gpay') || lower.includes('google pay')) appSource = 'Google Pay';
  else if (lower.includes('hdfc')) appSource = 'HDFC Bank';
  else if (lower.includes('sbi')) appSource = 'SBI Alert';
  else if (lower.includes('icici')) appSource = 'ICICI Bank';
  else if (lower.includes('axis')) appSource = 'Axis Bank';
  else if (lower.includes('apple pay')) appSource = 'Apple Pay';

  // 6. Location Tag
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5); // "14:15"
  const dateStr = now.toISOString().slice(0, 10); // "2026-07-28"

  const defaultLocation: LocationTag = userLocation || {
    lat: 19.0760,
    lng: 72.8777,
    name: 'Downtown Financial District'
  };

  return {
    id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    rawText: text,
    amount,
    payeeOrPayer,
    type,
    date: dateStr,
    time: timeStr,
    category,
    subcategory,
    location: defaultLocation,
    appSource,
    status: 'pending',
  };
}
