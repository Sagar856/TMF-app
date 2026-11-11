import categoryRules from '../../../native/notification-intercept-plugin/res/raw/payment_category_rules.json';

export interface CategoryMapping {
  category: string; // e.g. 'Food & Dining', 'Transport & Fuel', 'Shopping & Tech', 'Bills & Utilities', 'Subscriptions', 'Health & Fitness', 'Salary', 'Freelance', 'Dividends', 'Stocks & ETFs', 'Mutual Funds', 'Crypto & Assets'
  subcategory: string; // e.g. 'Delivery', 'Restaurants', 'Coffee', 'Fuel', 'Cab Services', 'Electronics', 'Electricity', etc.
  categoryType: 'Expense' | 'Income' | 'Investment';
  confidence?: number;
  matchedKeyword?: string;
  suggestedTitle?: string;
}

interface RuleDefinition {
  keywords: string[];
  category: string;
  subcategory: string;
  categoryType: 'Expense' | 'Income' | 'Investment';
  suggestedTitle?: string;
}

const CATEGORY_RULES = categoryRules as RuleDefinition[];

/**
 * Clean & tokenize text for robust matching against keywords
 */
function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifies merchant name and raw text to return category, subcategory, and category group.
 * E.g., 'Zomato' -> category: 'Food & Dining', subcategory: 'Delivery'
 */
export function classifyMerchant(
  merchantName: string,
  rawText = '',
  type: 'credit' | 'debit' = 'debit'
): CategoryMapping {
  const combined = `${merchantName} ${rawText}`.trim();
  const normalized = ` ${normalizeText(combined)} `;

  // 1. High-priority exact or multi-word keyword checks
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      const normalizedKw = normalizeText(kw);
      if (!normalizedKw) continue;

      // Word boundary match or substring check for compound names
      const kwPattern = new RegExp(`(?:^|\\s)${normalizedKw}(?:\\s|$)`, 'i');
      if (kwPattern.test(normalized) || normalized.includes(` ${normalizedKw} `)) {
        return {
          category: rule.category,
          subcategory: rule.subcategory,
          categoryType: rule.categoryType,
          confidence: 0.95,
          matchedKeyword: kw,
          suggestedTitle: merchantName && merchantName !== 'Unknown' && merchantName !== 'Unknown Merchant'
            ? merchantName
            : capitalizeWords(kw),
        };
      }
    }
  }

  // 2. Secondary fallback for partial substrings
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (kw.length >= 4 && normalized.includes(kw.toLowerCase())) {
        return {
          category: rule.category,
          subcategory: rule.subcategory,
          categoryType: rule.categoryType,
          confidence: 0.8,
          matchedKeyword: kw,
          suggestedTitle: merchantName && merchantName !== 'Unknown' && merchantName !== 'Unknown Merchant'
            ? merchantName
            : capitalizeWords(kw),
        };
      }
    }
  }

  // 3. Fallback defaults based on credit vs debit
  if (type === 'credit') {
    return {
      category: 'Salary',
      subcategory: 'Primary Job',
      categoryType: 'Income',
      confidence: 0.5,
    };
  }

  return {
    category: 'Food & Dining',
    subcategory: 'General',
    categoryType: 'Expense',
    confidence: 0.5,
  };
}

function capitalizeWords(str: string): string {
  return str
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Helper to auto-suggest category given a user-typed title or merchant description
 */
export function suggestCategoryForTitle(
  title: string,
  type: 'credit' | 'debit' = 'debit'
): CategoryMapping | null {
  if (!title || title.trim().length < 2) return null;
  const result = classifyMerchant(title, '', type);
  if (result && result.confidence && result.confidence >= 0.8) {
    return result;
  }
  return null;
}

