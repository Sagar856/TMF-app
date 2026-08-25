export type TransactionType = 'credit' | 'debit';

export type PaymentSource = 'UPI' | 'SMS' | 'Manual' | 'Bank Sync';

export type AccountType = 'Bank' | 'Credit Card' | 'Debit Card' | 'Wallet/UPI';

export interface FinancialAccount {
  id: string;
  name: string;
  bankName: string;
  type: AccountType;
  accountNumberLast4: string;
  balance: number;
  creditLimit?: number;
  approxMonthlyBill?: number;
  dueDate?: string;
  cardHolderName?: string;
  cardNetwork?: 'Visa' | 'Mastercard' | 'RuPay' | 'Amex';
  cardColorTheme?: 'silver' | 'dark' | 'emerald' | 'gold' | 'midnight';
  isDefault?: boolean;
}

export interface LocationTag {
  lat: number;
  lng: number;
  name: string;
}

export interface Transaction {
  id: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: string;
  subcategory: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  location?: LocationTag;
  source: PaymentSource;
  rawText?: string;
  payeeOrPayer?: string;
  paymentMethod?: string;
  note?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'investment';
  iconName: string;
  subcategories: string[];
  budgetLimit?: number; // Monthly budget limit in default currency
}

export interface MonthlyContribution {
  month: string; // e.g., '2026-07'
  amount: number;
}

export type InvestmentType = 'Stocks' | 'Mutual Funds' | 'Crypto' | 'Fixed Deposit' | 'Gold' | 'Real Estate';

export interface InvestmentRecord {
  id: string;
  name: string;
  type: InvestmentType;
  amountInvested: number;
  currentValue: number;
  returnsPercent: number;
  date: string;
  monthlyContributions: MonthlyContribution[];
  notes?: string;
}

export type LoanType = 'loan' | 'lend'; // 'loan' = borrowed from someone, 'lend' = given money to someone

export interface Repayment {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface LoanRecord {
  id: string;
  title: string;
  personOrBank: string;
  type: LoanType;
  totalAmount: number;
  remainingAmount: number;
  interestRate?: number;
  dueDate: string;
  status: 'active' | 'repaid' | 'overdue';
  repayments: Repayment[];
  notes?: string;
}

export interface ParsedNotification {
  id: string;
  rawText: string;
  amount: number;
  payeeOrPayer: string;
  type: TransactionType;
  date: string;
  time: string;
  category: string;
  subcategory: string;
  location?: LocationTag;
  appSource: string; // e.g., "Paytm", "PhonePe", "Google Pay", "HDFC SMS", "Apple Pay"
  status: 'pending' | 'added' | 'ignored';
  accountLast4?: string;
  refNumber?: string;
  availableBalance?: number;
  paymentMethod?: string;
  confidenceScore?: number; // 0 to 100
  requiresManualVerification?: boolean;
}


export interface UserSettings {
  userName: string;
  userEmail: string;
  userPhoto?: string;
  currencySymbol: string;
  currencyCode: string;
  theme?: 'dark' | 'light';
  passcodeEnabled: boolean;
  passcode: string;
  supabaseUrl: string;
  supabaseKey: string;
  supabaseConnected: boolean;
  locationTracking: boolean;
  autoExtractSms: boolean;
  notificationsEnabled: boolean;
  budgetAlertsEnabled?: boolean;
  defaultNetWorthMasked?: boolean;
  sampleDataLoaded?: boolean;
  skipDeleteConfirmation?: boolean;
  skipInvestmentDeleteConfirmation?: boolean;
  skipLoanDeleteConfirmation?: boolean;
}
