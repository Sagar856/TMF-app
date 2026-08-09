export interface CategoryMapping {
  category: string; // 'Expense' | 'Income' | 'Investment'
  subcategory: string;
}

const MERCHANT_RULES: Record<string, CategoryMapping> = {
  // Food & Dining / Delivery
  swiggy: { category: 'Expense', subcategory: 'Food & Dining' },
  zomato: { category: 'Expense', subcategory: 'Food & Dining' },
  starbucks: { category: 'Expense', subcategory: 'Food & Dining' },
  mcdonalds: { category: 'Expense', subcategory: 'Food & Dining' },
  kfc: { category: 'Expense', subcategory: 'Food & Dining' },
  dominos: { category: 'Expense', subcategory: 'Food & Dining' },
  pizza: { category: 'Expense', subcategory: 'Food & Dining' },
  burger: { category: 'Expense', subcategory: 'Food & Dining' },
  cafe: { category: 'Expense', subcategory: 'Food & Dining' },
  restaurant: { category: 'Expense', subcategory: 'Food & Dining' },
  diner: { category: 'Expense', subcategory: 'Food & Dining' },
  bakery: { category: 'Expense', subcategory: 'Food & Dining' },
  blinkit: { category: 'Expense', subcategory: 'Groceries' },
  instamart: { category: 'Expense', subcategory: 'Groceries' },
  zepto: { category: 'Expense', subcategory: 'Groceries' },
  bigbasket: { category: 'Expense', subcategory: 'Groceries' },
  dmart: { category: 'Expense', subcategory: 'Groceries' },

  // Transport & Fuel
  uber: { category: 'Expense', subcategory: 'Transport & Fuel' },
  ola: { category: 'Expense', subcategory: 'Transport & Fuel' },
  rapido: { category: 'Expense', subcategory: 'Transport & Fuel' },
  nammayatri: { category: 'Expense', subcategory: 'Transport & Fuel' },
  petrol: { category: 'Expense', subcategory: 'Transport & Fuel' },
  shell: { category: 'Expense', subcategory: 'Transport & Fuel' },
  hpcl: { category: 'Expense', subcategory: 'Transport & Fuel' },
  bpcl: { category: 'Expense', subcategory: 'Transport & Fuel' },
  iocl: { category: 'Expense', subcategory: 'Transport & Fuel' },
  fuel: { category: 'Expense', subcategory: 'Transport & Fuel' },
  irctc: { category: 'Expense', subcategory: 'Transport & Fuel' },
  makemytrip: { category: 'Expense', subcategory: 'Transport & Fuel' },
  redbus: { category: 'Expense', subcategory: 'Transport & Fuel' },

  // Shopping & Tech
  amazon: { category: 'Expense', subcategory: 'Shopping & Tech' },
  flipkart: { category: 'Expense', subcategory: 'Shopping & Tech' },
  myntra: { category: 'Expense', subcategory: 'Shopping & Tech' },
  ajio: { category: 'Expense', subcategory: 'Shopping & Tech' },
  nykaa: { category: 'Expense', subcategory: 'Shopping & Tech' },
  apple: { category: 'Expense', subcategory: 'Shopping & Tech' },
  croma: { category: 'Expense', subcategory: 'Shopping & Tech' },
  vijaysales: { category: 'Expense', subcategory: 'Shopping & Tech' },

  // Subscriptions & Entertainment
  netflix: { category: 'Expense', subcategory: 'Subscriptions' },
  spotify: { category: 'Expense', subcategory: 'Subscriptions' },
  youtube: { category: 'Expense', subcategory: 'Subscriptions' },
  hotstar: { category: 'Expense', subcategory: 'Subscriptions' },
  primevideo: { category: 'Expense', subcategory: 'Subscriptions' },
  bookmyshow: { category: 'Expense', subcategory: 'Entertainment' },

  // Bills & Utilities
  electricity: { category: 'Expense', subcategory: 'Bills & Utilities' },
  airtel: { category: 'Expense', subcategory: 'Bills & Utilities' },
  jio: { category: 'Expense', subcategory: 'Bills & Utilities' },
  vodafone: { category: 'Expense', subcategory: 'Bills & Utilities' },
  bescom: { category: 'Expense', subcategory: 'Bills & Utilities' },
  tatasky: { category: 'Expense', subcategory: 'Bills & Utilities' },
  dth: { category: 'Expense', subcategory: 'Bills & Utilities' },
  rent: { category: 'Expense', subcategory: 'Housing & Rent' },

  // Investments
  zerodha: { category: 'Investment', subcategory: 'Stocks & ETFs' },
  groww: { category: 'Investment', subcategory: 'Mutual Funds' },
  coinswitch: { category: 'Investment', subcategory: 'Crypto' },
  upstox: { category: 'Investment', subcategory: 'Stocks & ETFs' },
  sip: { category: 'Investment', subcategory: 'Mutual Funds' },
  mutualfund: { category: 'Investment', subcategory: 'Mutual Funds' },

  // Income
  salary: { category: 'Income', subcategory: 'Salary' },
  payroll: { category: 'Income', subcategory: 'Salary' },
  stipend: { category: 'Income', subcategory: 'Salary' },
  dividend: { category: 'Income', subcategory: 'Dividends' },
  interest: { category: 'Income', subcategory: 'Interest' },

  // Cash
  atm: { category: 'Expense', subcategory: 'Cash Withdrawal' },
};

export function classifyMerchant(merchantName: string, rawText: string, type: 'credit' | 'debit'): CategoryMapping {
  const combinedLower = `${merchantName} ${rawText}`.toLowerCase();

  for (const [key, mapping] of Object.entries(MERCHANT_RULES)) {
    if (combinedLower.includes(key)) {
      return mapping;
    }
  }

  // Fallback defaults based on type
  if (type === 'credit') {
    return { category: 'Income', subcategory: 'Other Income' };
  }
  return { category: 'Expense', subcategory: 'General Expense' };
}
