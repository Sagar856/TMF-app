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
  refNumber?: string;
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


export interface StockLot {
  id: string;
  date: string;
  shares: number;
  purchasePrice: number;
  brokerageFees?: number;
}

export interface InvestmentRedemption {
  id: string;
  date: string;
  unitsOrSharesRedeemed: number;
  redemptionPrice: number;
  grossProceeds: number;
  charges: number; // Exit load / Brokerage / Penalties
  taxes: number; // STCG / LTCG / TDS
  netCredited: number;
  costBasis: number;
  realizedGainLoss: number;
  creditedAccountId: string;
  creditedAccountName?: string;
  transactionId?: string;
  isFullRedemption: boolean;
  notes?: string;
}

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

  // Status & Holdings
  status?: 'active' | 'partially_redeemed' | 'redeemed';
  linkedAccountId?: string;
  dematAccount?: string; // e.g. 'Zerodha' | 'Dhan' | 'Groww' | 'Upstox' | 'Angel One' | 'ICICI Direct'
  brokerClientId?: string;
  realizedProfitLoss?: number;
  redemptions?: InvestmentRedemption[];

  // Mutual Funds specific
  schemeCode?: string;
  investmentPlan?: 'lump_sum' | 'sip';
  purchaseNav?: number;
  currentNav?: number;
  units?: number;
  navDate?: string;
  exitLoadPercent?: number;
  expenseRatio?: number;

  // Stocks specific
  symbol?: string;
  exchange?: 'NSE' | 'BSE' | 'US' | 'OTHER';
  shares?: number;
  purchasePrice?: number;
  currentPrice?: number;
  priceTimestamp?: string;
  priceSource?: string;
  brokerageFees?: number;
  lots?: StockLot[];

  // Fixed Deposits specific
  bankName?: string;
  interestRate?: number;
  depositDate?: string;
  maturityDate?: string;
  tenureMonths?: number;
  compoundingFrequency?: 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'simple';
  payoutFrequency?: 'monthly' | 'quarterly' | 'at_maturity';
  maturityAmount?: number;
  accruedInterest?: number;
  prematurePenaltyPercent?: number;
  isPrematureWithdrawalAllowed?: boolean;
}

export type LoanType = 'loan' | 'lend'; // 'loan' = borrowed from someone, 'lend' = given money to someone

export type LoanStructure = 
  | 'standard_emi' 
  | 'no_cost_emi' 
  | 'down_payment_emi' 
  | 'interest_only' 
  | 'peer_loan' 
  | 'peer_lend';

export interface Repayment {
  id: string;
  amount: number;
  date: string;
  note?: string;
  installmentNumber?: number;
  principalComponent?: number;
  interestComponent?: number;
  transactionId?: string;
}

export interface LoanInstallment {
  installmentNumber: number;
  dueDate: string;
  emiAmount: number;
  principalComponent: number;
  interestComponent: number;
  outstandingBalance: number;
  status: 'scheduled' | 'pending_confirmation' | 'paid' | 'overdue' | 'skipped' | 'cancelled';
  paidDate?: string;
  transactionId?: string;
  confirmedAt?: string;
  skippedAt?: string;
  notes?: string;
  paymentAccountId?: string;
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

  // Advanced Loan Structure fields
  loanStructure?: LoanStructure;
  totalPurchasePrice?: number;
  downPayment?: number;
  financedPrincipal?: number;
  tenureMonths?: number;
  repaymentFrequency?: 'Monthly' | 'Quarterly' | 'Yearly';
  monthlyEmi?: number;
  expectedEmi?: number;
  isEmiOverridden?: boolean;
  emiOverrideDifference?: number;
  processingFees?: number;
  discounts?: number;
  startDate?: string;
  firstInstallmentDate?: string;
  linkedAccountId?: string;
  interestCalculationMethod?: 'reducing_balance' | 'flat' | 'no_cost' | 'interest_only';
  schedule?: LoanInstallment[];
}

export interface EmiConfirmationRequest {
  id: string;
  loanId: string;
  installmentNumber: number;
  loanTitle: string;
  lenderOrBank: string;
  amount: number;
  dueDate: string;
  linkedAccountId?: string;
  accountName?: string;
  status: 'pending' | 'confirmed' | 'skipped' | 'reminded_later';
  createdAt: string;
  confirmedAt?: string;
  skippedAt?: string;
  remindedAt?: string;
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


export interface ConnectedDematAccount {
  id: string;
  brokerName: string;
  brokerCode: 'Zerodha' | 'Dhan' | 'Groww' | 'Upstox' | 'Angel One' | string;
  clientId: string;
  isConnected: boolean;
  connectedAt?: string;
  lastSyncedAt?: string;
  apiKeyMasked?: string;
  mockPortfolioValue?: number;
  mockReturnsPercent?: number;
  totalHoldingsCount?: number;
  color?: string;
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
  autoCollapseExpandOnScroll?: boolean;
  sampleDataLoaded?: boolean;
  skipDeleteConfirmation?: boolean;
  skipInvestmentDeleteConfirmation?: boolean;
  skipLoanDeleteConfirmation?: boolean;
  connectedDematAccounts?: ConnectedDematAccount[];
}
