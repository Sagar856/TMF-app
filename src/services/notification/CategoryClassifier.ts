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

const CATEGORY_RULES: RuleDefinition[] = [
  // ==========================================
  // FOOD & DINING
  // ==========================================
  {
    category: 'Food & Dining',
    subcategory: 'Delivery',
    categoryType: 'Expense',
    keywords: [
      'zomato',
      'swiggy',
      'eatclub',
      'freshmenu',
      'box8',
      'faasos',
      'behrouz',
      'ovenstory',
      'mojo pizza',
      'rebel foods',
      'dotpe',
      'magicpin',
      'food delivery',
    ],
  },
  {
    category: 'Food & Dining',
    subcategory: 'Coffee & Cafes',
    categoryType: 'Expense',
    keywords: [
      'starbucks',
      'cafe coffee day',
      'ccd',
      'costa coffee',
      'tim hortons',
      'blue tokai',
      'third wave',
      'third wave coffee',
      'chaayos',
      'chai point',
      'roastery',
      'barista',
      'cafe',
      'bakery',
      'dunkin',
      'tea post',
      'boba',
      'le pain quotidien',
      'paul bakery',
    ],
  },
  {
    category: 'Food & Dining',
    subcategory: 'Restaurants',
    categoryType: 'Expense',
    keywords: [
      'mcdonalds',
      "mcdonald's",
      'kfc',
      'dominos',
      "domino's",
      'pizza hut',
      'burger king',
      'subway',
      'taco bell',
      'wendys',
      'popeyes',
      'haldiram',
      'bikanervala',
      'barbeque nation',
      'mainland china',
      'wow momo',
      'naturals ice cream',
      'baskin robbins',
      'gianis',
      'tibbs frankie',
      'restaurant',
      'diner',
      'bistro',
      'dhaba',
      'biryani',
      'food court',
      'swiggy dineout',
      'dineout',
      'canteen',
      'tiffin',
      'pizzeria',
      'burger',
      'pizza',
      'shawarma',
      'sweet house',
      'mithai',
    ],
  },
  {
    category: 'Food & Dining',
    subcategory: 'Groceries',
    categoryType: 'Expense',
    keywords: [
      'blinkit',
      'instamart',
      'zepto',
      'bigbasket',
      'dmart',
      'd-mart',
      'grofers',
      'spencers',
      "nature's basket",
      'reliance fresh',
      'reliance smart',
      'more retail',
      'jiomart',
      'milkbasket',
      'country delight',
      'dunzo',
      'supermarket',
      'hypermarket',
      'grocery',
      'kirana',
      'vegetables',
      'fruits',
      'provisions',
      'ration',
      'dairy',
      'amul',
      'mother dairy',
    ],
  },

  // ==========================================
  // TRANSPORT & FUEL
  // ==========================================
  {
    category: 'Transport & Fuel',
    subcategory: 'Cab Services',
    categoryType: 'Expense',
    keywords: [
      'uber',
      'ola',
      'rapido',
      'nammayatri',
      'namma yatri',
      'blusmart',
      'meru',
      'cab',
      'taxi',
      'auto rickshaw',
      'yulu',
      'bounce',
    ],
  },
  {
    category: 'Transport & Fuel',
    subcategory: 'Fuel',
    categoryType: 'Expense',
    keywords: [
      'petrol',
      'diesel',
      'fuel',
      'shell',
      'hpcl',
      'bpcl',
      'iocl',
      'bharat petroleum',
      'indian oil',
      'hindustan petroleum',
      'cng',
      'gas station',
      'speed petrol',
      'power petrol',
      'nayara',
      'essar fuel',
    ],
  },
  {
    category: 'Transport & Fuel',
    subcategory: 'Public Transport & Travel',
    categoryType: 'Expense',
    keywords: [
      'fastag',
      'toll',
      'nhai',
      'toll plaza',
      'parking',
      'irctc',
      'indian rail',
      'railways',
      'redbus',
      'abhibus',
      'chalo',
      'metro',
      'delhi metro',
      'dmrc',
      'bmrc',
      'mmrda',
      'uts',
      'makemytrip',
      'cleartrip',
      'goibibo',
      'easemytrip',
      'yatra',
      'indigo',
      'air india',
      'vistara',
      'akasa',
      'spicejet',
      'airasia',
      'flight',
      'airline',
    ],
  },

  // ==========================================
  // SHOPPING & TECH
  // ==========================================
  {
    category: 'Shopping & Tech',
    subcategory: 'Electronics',
    categoryType: 'Expense',
    keywords: [
      'apple',
      'apple.com',
      'croma',
      'vijay sales',
      'reliance digital',
      'boat',
      'noise',
      'oneplus',
      'samsung',
      'xiaomi',
      'realme',
      'lenovo',
      'hp world',
      'dell',
      'asus',
      'sony',
      'electronics',
      'gadgets',
      'headphone',
      'laptop',
    ],
  },
  {
    category: 'Shopping & Tech',
    subcategory: 'Fashion & Retail',
    categoryType: 'Expense',
    keywords: [
      'amazon',
      'flipkart',
      'myntra',
      'ajio',
      'nykaa',
      'tata cliq',
      'meesho',
      'snapdeal',
      'purplle',
      'bewakoof',
      'snitch',
      'the souled store',
      'urbanic',
      'zara',
      'h&m',
      'uniqlo',
      'marks & spencer',
      'lifestyle',
      'westside',
      'shoppers stop',
      'pantaloons',
      'max fashion',
      'decathlon',
      'nike',
      'adidas',
      'puma',
      'skechers',
      'crocs',
      'lenskart',
      'titan',
      'fastrack',
      'zudio',
      'apparel',
      'clothing',
      'shoes',
      'fashion',
    ],
  },

  // ==========================================
  // BILLS & UTILITIES
  // ==========================================
  {
    category: 'Bills & Utilities',
    subcategory: 'Mobile & Internet',
    categoryType: 'Expense',
    keywords: [
      'airtel',
      'jio',
      'vi',
      'vodafone',
      'idea',
      'bsnl',
      'act fibernet',
      'act corp',
      'hathway',
      'spectra',
      'airtel broadband',
      'jiofiber',
      'wifi',
      'broadband',
      'recharge',
      'mobile recharge',
      'postpaid bill',
      'prepaid',
    ],
  },
  {
    category: 'Bills & Utilities',
    subcategory: 'Electricity & Gas',
    categoryType: 'Expense',
    keywords: [
      'bescom',
      'tata power',
      'adani electricity',
      'msedcl',
      'dhbvn',
      'bses',
      'tneb',
      'cesc',
      'electricity bill',
      'power discom',
      'water bill',
      'jal board',
      'bwssb',
      'igl',
      'mgl',
      'indane',
      'bharat gas',
      'hp gas',
      'piped gas',
      'lpg cylinder',
      'gas bill',
    ],
  },
  {
    category: 'Bills & Utilities',
    subcategory: 'DTH & Housing',
    categoryType: 'Expense',
    keywords: [
      'tata play',
      'tatasky',
      'dish tv',
      'sun direct',
      'airtel dth',
      'dth',
      'rent',
      'house rent',
      'society maintenance',
      'mygate',
      'nobroker',
      'magicbricks',
      'housing.com',
      'maintenance charges',
      'property tax',
      'municipal',
    ],
  },

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================
  {
    category: 'Subscriptions',
    subcategory: 'Streaming & Media',
    categoryType: 'Expense',
    keywords: [
      'netflix',
      'spotify',
      'youtube',
      'youtube premium',
      'hotstar',
      'disney',
      'prime video',
      'primevideo',
      'amazon prime',
      'apple music',
      'apple tv',
      'sonyliv',
      'zee5',
      'jiocinema',
      'audible',
      'gaana',
      'jiosaavn',
      'bookmyshow',
    ],
  },
  {
    category: 'Subscriptions',
    subcategory: 'Software & AI',
    categoryType: 'Expense',
    keywords: [
      'openai',
      'chatgpt',
      'anthropic',
      'claude',
      'midjourney',
      'github',
      'canva',
      'notion',
      'figma',
      'adobe',
      'linkedin',
      'linkedin premium',
      'duolingo',
      'medium',
      'google storage',
      'google one',
      'icloud',
      'dropbox',
      'hostinger',
      'aws',
      'vercel',
    ],
  },

  // ==========================================
  // HEALTH & FITNESS
  // ==========================================
  {
    category: 'Health & Fitness',
    subcategory: 'Medicines & Pharmacy',
    categoryType: 'Expense',
    keywords: [
      'apollo',
      'apollo pharmacy',
      'netmeds',
      'tata 1mg',
      '1mg',
      'pharmeasy',
      'medplus',
      'wellness forever',
      'pharmacy',
      'chemist',
      'medicines',
      'practo',
      'dr lal pathlabs',
      'srl diagnostics',
      'metropolis',
      'hospital',
      'clinic',
      'doctor consult',
      'dental',
      'dentist',
    ],
  },
  {
    category: 'Health & Fitness',
    subcategory: 'Gym & Wellness',
    categoryType: 'Expense',
    keywords: [
      'cult.fit',
      'cultpass',
      'curefit',
      "gold's gym",
      'anytime fitness',
      'gym',
      'fitness',
      'protein',
      'muscleblaze',
      'myprotein',
      'optimum nutrition',
      'yoga',
      'crossfit',
    ],
  },

  // ==========================================
  // INVESTMENTS - STOCKS & ETFS
  // ==========================================
  {
    category: 'Stocks & ETFs',
    subcategory: 'Equities & Trading',
    categoryType: 'Investment',
    keywords: [
      'zerodha',
      'kite',
      'groww',
      'upstox',
      'angel one',
      'angel broking',
      'icici direct',
      'hdfc sky',
      '5paisa',
      'dhan',
      'smallcase',
      'indmoney',
      'kuvera',
      'vested',
      'sharekhan',
      'motilal oswal',
      'nse',
      'bse',
      'cdsl',
      'nsdl',
      'stocks',
      'shares',
      'equity trading',
      'demat',
    ],
  },

  // ==========================================
  // INVESTMENTS - MUTUAL FUNDS
  // ==========================================
  {
    category: 'Mutual Funds',
    subcategory: 'Index & Flexi Cap',
    categoryType: 'Investment',
    keywords: [
      'mutual fund',
      'mutualfund',
      'sip',
      'nippon india',
      'hdfc mutual fund',
      'hdfc mf',
      'sbi mutual fund',
      'sbi mf',
      'icici prudential mf',
      'axis mutual fund',
      'axis mf',
      'mirae asset',
      'parag parikh',
      'ppfas',
      'uti mutual fund',
      'quant mutual fund',
      'quant mf',
      'kotak mf',
      'dsp mf',
      'tata mutual fund',
      'navi mutual fund',
      'amc',
      'folio',
    ],
  },

  // ==========================================
  // INVESTMENTS - CRYPTO & ASSETS
  // ==========================================
  {
    category: 'Crypto & Assets',
    subcategory: 'Digital Assets & Gold',
    categoryType: 'Investment',
    keywords: [
      'coinswitch',
      'coindcx',
      'wazirx',
      'binance',
      'kucoin',
      'mudrex',
      'bitcoin',
      'ethereum',
      'crypto',
      'sovereign gold',
      'digital gold',
      'jar app',
      'gullak',
      'safegold',
    ],
  },

  // ==========================================
  // INCOME - SALARY, FREELANCE, DIVIDENDS
  // ==========================================
  {
    category: 'Salary',
    subcategory: 'Primary Job',
    categoryType: 'Income',
    keywords: [
      'salary',
      'payroll',
      'wage',
      'stipend',
      'bonus',
      'incentive',
      'monthly salary',
      'employer',
      'reimbursement',
    ],
  },
  {
    category: 'Freelance',
    subcategory: 'Client Work & Consulting',
    categoryType: 'Income',
    keywords: [
      'freelance',
      'upwork',
      'fiverr',
      'toptal',
      'client payment',
      'consulting fee',
      'invoice payment',
      'freelancing',
    ],
  },
  {
    category: 'Dividends',
    subcategory: 'Returns & Interest',
    categoryType: 'Income',
    keywords: [
      'dividend',
      'dividends',
      'interest credited',
      'fd interest',
      'savings interest',
      'bank interest',
      'cashback',
      'refund',
      'reversal',
      'reward credited',
    ],
  },
];

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

