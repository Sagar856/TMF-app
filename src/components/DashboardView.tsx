import { useMoneyFormatter } from '../hooks/useMoneyFormatter';
import React, { useState, useEffect, useMemo } from 'react';
import { Transaction, Category, InvestmentRecord, LoanRecord, ParsedNotification, FinancialAccount, SavingsGoal } from '../types/finance';
import { BudgetAlertPayload } from '../services/budgetAlertService';
import { currentMonthLocal, todayLocalISO } from '../utils/dates';
import { getEffectiveLoanStatus } from '../utils/loanStatus';
import { calculateSavingsRate } from '../utils/savingsRate';
import {
  getTransactionKind,
  isOperatingExpense,
  isOperatingIncome,
  isRefund,
  sumOperatingExpense,
  sumOperatingIncome,
} from '../utils/transactionKind';
import { CashflowTrendLineChart } from './CashflowTrendLineChart';
import { SevenDaySpendingTrendChart } from './SevenDaySpendingTrendChart';
import { CategoryDonutChart } from './CategoryDonutChart';
import { TopMerchantsCard } from './TopMerchantsCard';
import { TopCategoriesCard } from './TopCategoriesCard';
import { BudgetThresholdMonitor } from './BudgetThresholdMonitor';
import { RecurringTransactionsCard } from './RecurringTransactionsCard';
import { CashflowForecastCard } from './CashflowForecastCard';
import { SavingsGoalsCard } from './SavingsGoalsCard';
import { InfoButton } from './InfoButton';
import { useScrollCarouselGroup } from '../hooks/useScrollCarouselGroup';

const DASHBOARD_SECTIONS = ['budget', 'recurring', 'trend'] as const;
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  TrendingUp, 
  Plus,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Layers,
  CreditCard,
  MapPin,
  ArrowRight,
  ReceiptText,
  AlertTriangle
} from 'lucide-react';

interface DashboardViewProps {
  transactions: Transaction[];
  categories: Category[];
  investments: InvestmentRecord[];
  loans: LoanRecord[];
  accounts?: FinancialAccount[];
  savingsGoals: SavingsGoal[];
  onSavingsGoalsChange: (goals: SavingsGoal[]) => void;
  pendingNotifications: ParsedNotification[];
  onOpenNotifications: () => void;
  onOpenAddTransaction: () => void;
  onQuickLogTransaction?: (tx: Transaction) => void;
  onNavigateToTransactions?: () => void;
  onNavigateToInvestments?: () => void;
  onNavigateToLoans?: () => void;
  onNavigateToCustomisations?: () => void;
  onTriggerBudgetAlert?: (alert: BudgetAlertPayload) => void;
  currencySymbol: string;
  defaultNetWorthMasked?: boolean;
  autoCollapseExpandOnScroll?: boolean;
  isCloudSynced?: boolean;
  onOpenCloudSyncStatus?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  categories,
  investments,
  loans,
  accounts = [],
  savingsGoals,
  onSavingsGoalsChange,
  pendingNotifications,
  onOpenNotifications,
  onOpenAddTransaction,
  onQuickLogTransaction,
  onNavigateToTransactions,
  onNavigateToInvestments,
  onNavigateToLoans,
  onNavigateToCustomisations,
  onTriggerBudgetAlert,
  currencySymbol,
  defaultNetWorthMasked = true,
  autoCollapseExpandOnScroll = true,
  isCloudSynced = false,
  onOpenCloudSyncStatus,
}) => {
  const formatAmount = useMoneyFormatter();
  // Eye toggles for KPI amounts - initialized from settings
  const defaultMaskState = defaultNetWorthMasked !== false;
  const [isNetWorthHidden, setIsNetWorthHidden] = useState<boolean>(defaultMaskState);
  const [showNetBalance, setShowNetBalance] = useState<boolean>(!defaultMaskState);
  const [showCredit, setShowCredit] = useState<boolean>(!defaultMaskState);
  const [showDebit, setShowDebit] = useState<boolean>(!defaultMaskState);
  const [showInvestments, setShowInvestments] = useState<boolean>(!defaultMaskState);

  useEffect(() => {
    const isMasked = defaultNetWorthMasked !== false;
    setIsNetWorthHidden(isMasked);
    setShowNetBalance(!isMasked);
    setShowCredit(!isMasked);
    setShowDebit(!isMasked);
    setShowInvestments(!isMasked);
  }, [defaultNetWorthMasked]);

  const handleToggleMasterNetWorth = () => {
    const nextHidden = !isNetWorthHidden;
    setIsNetWorthHidden(nextHidden);
    setShowNetBalance(!nextHidden);
    setShowCredit(!nextHidden);
    setShowDebit(!nextHidden);
    setShowInvestments(!nextHidden);
  };

  // Stacked vs Expanded KPI state for Home Page
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(true);
  const touchStartYRef = React.useRef<number | null>(null);

  // Auto-collapse expanded KPIs when the user scrolls down — only while the
  // "auto expand/collapse on scroll" preference is on, and rAF-throttled.
  useEffect(() => {
    if (autoCollapseExpandOnScroll === false || isKpiStacked) return;
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    let frame: number | null = null;
    const handleScroll = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (mainEl.scrollTop > 50) setIsKpiStacked(true);
      });
    };
    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener('scroll', handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [isKpiStacked, autoCollapseExpandOnScroll]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const startY = touchStartYRef.current;
    if (startY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - startY;
    if (diffY > 25) {
      // Swiped down -> Expand vertically (placed one below one)
      setIsKpiStacked(false);
    } else if (diffY < -25) {
      // Swiped up -> Stack vertically with overlap
      setIsKpiStacked(true);
    }
    touchStartYRef.current = null;
  };

  // Synchronized scroll focus carousel for the 3 target dashboard sections
  const carousel = useScrollCarouselGroup(DASHBOARD_SECTIONS, {
    enabled: autoCollapseExpandOnScroll !== false,
    bottomHoldRatio: 0.30,
  });

  const [kpiTimeframe, setKpiTimeframe] = useState<'month' | 'all'>('month');

  // Active month calculation for executive header threshold status
  const activeMonthStr = currentMonthLocal();
  const todayIso = todayLocalISO();

  // All-time cash movements (used only for the no-accounts fallback balance).
  // Transfers are cash-neutral and excluded.
  const totalCredit = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'credit' && getTransactionKind(t) !== 'transfer')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  const totalDebit = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'debit' && getTransactionKind(t) !== 'transfer')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [transactions]);

  // Current month OPERATING income & expense: investments, EMIs, loan
  // disbursals and transfers are balance-sheet moves, not income/spend.
  const monthTxns = useMemo(
    () => transactions.filter((t) => t.date && t.date.startsWith(activeMonthStr)),
    [transactions, activeMonthStr]
  );

  const monthCreditTxns = useMemo(() => monthTxns.filter(isOperatingIncome), [monthTxns]);
  const monthDebitTxns = useMemo(() => monthTxns.filter((t) => isOperatingExpense(t) || isRefund(t)), [monthTxns]);

  const monthCredit = useMemo(() => sumOperatingIncome(monthTxns), [monthTxns]);
  const monthDebit = useMemo(() => sumOperatingExpense(monthTxns), [monthTxns]);

  const allTimeIncome = useMemo(() => sumOperatingIncome(transactions), [transactions]);
  const allTimeExpense = useMemo(() => sumOperatingExpense(transactions), [transactions]);
  const allTimeIncomeTxns = useMemo(() => transactions.filter(isOperatingIncome), [transactions]);
  const allTimeExpenseTxns = useMemo(() => transactions.filter((t) => isOperatingExpense(t) || isRefund(t)), [transactions]);

  // Keep the rate signed so spending beyond income is visible.
  const savingsRate = useMemo(
    () => calculateSavingsRate(monthCredit, monthDebit),
    [monthCredit, monthDebit]
  );

  // Accounts & Net worth calculations
  const hasAccounts = Boolean(accounts && accounts.length > 0);

  // liquid = Σ balance of accounts with type 'Bank' | 'Wallet/UPI' | 'Debit Card'
  const liquid = useMemo(() => {
    if (!hasAccounts || !accounts) return 0;
    return accounts
      .filter((a) => a.type === 'Bank' || a.type === 'Wallet/UPI' || a.type === 'Debit Card')
      .reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  }, [accounts, hasAccounts]);

  // ccOutstanding = Σ balance of 'Credit Card'
  const ccOutstanding = useMemo(() => {
    if (!hasAccounts || !accounts) return 0;
    return accounts
      .filter((a) => a.type === 'Credit Card')
      .reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  }, [accounts, hasAccounts]);

  // receivables = Σ remainingAmount of loans where type === 'lend' and not repaid
  const receivables = useMemo(() => {
    return (loans || [])
      .filter((l) => l.type === 'lend' && getEffectiveLoanStatus(l, todayIso) !== 'repaid' && l.remainingAmount > 0)
      .reduce((sum, l) => sum + l.remainingAmount, 0);
  }, [loans, todayIso]);

  // payables = Σ remainingAmount of loans where type === 'loan' and not repaid
  const payables = useMemo(() => {
    return (loans || [])
      .filter((l) => l.type === 'loan' && getEffectiveLoanStatus(l, todayIso) !== 'repaid' && l.remainingAmount > 0)
      .reduce((sum, l) => sum + l.remainingAmount, 0);
  }, [loans, todayIso]);

  // investmentsValue = Σ currentValue of investments with status !== 'redeemed'
  const investmentsValue = useMemo(() => {
    return (investments || [])
      .filter((inv) => inv.status !== 'redeemed')
      .reduce((sum, inv) => sum + (Number(inv.currentValue) || 0), 0);
  }, [investments]);

  // liabilities = ccOutstanding + payables
  const totalLiabilities = ccOutstanding + payables;

  // Fallback cashflow-based net worth if accounts is empty. Investment
  // purchases already show up in investmentsValue, so add them back to avoid
  // counting the same rupee twice.
  const investedViaLedger = useMemo(
    () => transactions.filter((t) => t.type === 'debit' && getTransactionKind(t) === 'investment').reduce((s, t) => s + t.amount, 0),
    [transactions]
  );
  const cashflowNetBalance = totalCredit - totalDebit + investedViaLedger;
  const cashflowNetWorth = cashflowNetBalance + investmentsValue;

  // netWorth = liquid − ccOutstanding + investmentsValue + receivables − payables
  const totalNetWorth = hasAccounts
    ? liquid - ccOutstanding + investmentsValue + receivables - payables
    : cashflowNetWorth;

  const overdueLoans = useMemo(() => {
    return (loans || []).filter((l) => getEffectiveLoanStatus(l, todayIso) === 'overdue');
  }, [loans, todayIso]);

  return (
    <div className="space-y-5 pb-16 relative font-mono text-white">
      {/* Top Pending SMS / UPI Intercept Alert Banner */}
      {pendingNotifications.length > 0 && (
        <div className="bg-obsidian border border-red-600/80 p-3 rounded-xl flex items-center justify-between flex-wrap gap-2 shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider truncate">
                Action Required ({pendingNotifications.length} Pending)
              </div>
              <div className="text-xs text-white mt-0.5 truncate">
                Detected: <span className="font-bold text-red-400">{pendingNotifications[0].payeeOrPayer}</span> ({currencySymbol}{pendingNotifications[0].amount})
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenNotifications}
            className="w-full sm:w-auto px-3 py-1.5 bg-red-600 text-white text-xs font-bold uppercase rounded-lg hover:bg-red-700 transition-colors cursor-pointer text-center"
          >
            Review ({pendingNotifications.length})
          </button>
        </div>
      )}

      {/* Overdue Loan / EMI Alert Banner */}
      {overdueLoans.length > 0 && (
        <div className="bg-obsidian border border-red-600/80 p-3 rounded-xl flex items-center justify-between flex-wrap gap-2 shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-700/80 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-red-500 uppercase tracking-wider truncate">
                Overdue Payment Alert ({overdueLoans.length} {overdueLoans.length === 1 ? 'Loan/Lend' : 'Loans/Lends'})
              </div>
              <div className="text-xs text-white mt-0.5 truncate">
                <span className="font-bold text-red-400">{overdueLoans[0].title || overdueLoans[0].personOrBank}</span> has overdue payment ({currencySymbol}{formatAmount(overdueLoans[0].remainingAmount)})
              </div>
            </div>
          </div>
          {onNavigateToLoans && (
            <button
              type="button"
              onClick={onNavigateToLoans}
              className="w-full sm:w-auto px-3 py-1.5 bg-red-600/90 hover:bg-red-600 text-white text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer text-center"
            >
              View Loans
            </button>
          )}
        </div>
      )}

      {/* ==================== 1. EXECUTIVE SUMMARY ==================== */}
      <div className="bg-carbon border border-nothing p-3.5 sm:p-5 rounded-2xl shadow-md space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-red-950/60 border border-red-600/50 rounded-xl flex items-center justify-center text-red-500 shrink-0 shadow-inner">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold text-[#888] uppercase tracking-widest">
                  EXECUTIVE SUMMARY
                </span>
                <InfoButton
                  id="exec-summary-info"
                  title="Net Worth Computation"
                  content="Net Worth = Liquid Cash in Bank & Wallets − Credit Card Outstanding + Active Investments + Money Lent (Receivables) − Loans Owed (Liabilities)."
                  align="left"
                />
              </div>
              <div className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2 mt-0.5 font-mono">
                <span>NET WORTH:</span>
                <span className="text-emerald-400 font-extrabold">
                  {isNetWorthHidden ? '••••••••' : `${currencySymbol}${formatAmount(totalNetWorth)}`}
                </span>
                <button
                  type="button"
                  onClick={handleToggleMasterNetWorth}
                  className="p-1 text-[#888] hover:text-white transition-colors cursor-pointer"
                  title={isNetWorthHidden ? 'Show All Metrics' : 'Hide All Metrics'}
                >
                  {isNetWorthHidden ? <EyeOff className="w-3.5 h-3.5 text-red-400" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono bg-obsidian/70 border border-nothing px-3 py-1.5 rounded-xl self-start md:self-auto">
            <span className="text-[#888] uppercase text-[10px]">Savings Rate (This Mo):</span>
            <span className={`font-bold ${savingsRate === null ? 'text-[#888]' : savingsRate < 0 ? 'text-red-500' : savingsRate >= 20 ? 'text-emerald-400' : savingsRate > 0 ? 'text-amber-400' : 'text-[#888]'}`}>
              {savingsRate === null ? '—' : `${savingsRate}%${savingsRate < 0 ? ' · OVERSPENDING' : ''}`}
            </span>
          </div>
        </div>

        {/* Breakdown Row (Liquid / Investments / Receivables / Liabilities) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-nothing/60 text-xs font-mono">
          <div className="bg-obsidian/70 border border-nothing/80 p-2.5 rounded-xl">
            <div className="text-[9px] text-[#888] uppercase tracking-wider flex items-center justify-between">
              <span>Liquid</span>
              <Wallet className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-white font-bold text-xs sm:text-sm mt-1 truncate">
              {isNetWorthHidden ? '••••••' : `${currencySymbol}${formatAmount(liquid)}`}
            </div>
          </div>

          <div className="bg-obsidian/70 border border-nothing/80 p-2.5 rounded-xl">
            <div className="text-[9px] text-[#888] uppercase tracking-wider flex items-center justify-between">
              <span>Investments</span>
              <TrendingUp className="w-3 h-3 text-cyan-400" />
            </div>
            <div className="text-cyan-400 font-bold text-xs sm:text-sm mt-1 truncate">
              {isNetWorthHidden ? '••••••' : `${currencySymbol}${formatAmount(investmentsValue)}`}
            </div>
          </div>

          <div className="bg-obsidian/70 border border-nothing/80 p-2.5 rounded-xl">
            <div className="text-[9px] text-[#888] uppercase tracking-wider flex items-center justify-between">
              <span>Receivables</span>
              <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-emerald-400 font-bold text-xs sm:text-sm mt-1 truncate">
              {isNetWorthHidden ? '••••••' : `${currencySymbol}${formatAmount(receivables)}`}
            </div>
          </div>

          <div className="bg-obsidian/70 border border-nothing/80 p-2.5 rounded-xl">
            <div className="text-[9px] text-[#888] uppercase tracking-wider flex items-center justify-between">
              <span>Liabilities</span>
              <CreditCard className="w-3 h-3 text-red-400" />
            </div>
            <div className="text-red-400 font-bold text-xs sm:text-sm mt-1 truncate">
              {isNetWorthHidden ? '••••••' : `${currencySymbol}${formatAmount(totalLiabilities)}`}
            </div>
          </div>
        </div>

        {/* If accounts is empty: one-line hint */}
        {!hasAccounts && (
          <div className="text-[11px] text-amber-400/90 font-mono flex items-center gap-1.5 pt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
            <span>Add accounts to see true net worth</span>
          </div>
        )}
      </div>

      {/* ==================== 2. FINANCIAL METRICS ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[#888] flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">FINANCIAL METRICS</span>
            <InfoButton
              id="fin-metrics-info"
              title="Financial Metrics"
              content="Key performance indicators: Cash in Accounts (= liquid bank & wallet balances), This Month's Income, Expenses, and Active Investments. Switch between This Month and All Time using the toggle."
              align="left"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-[#121218] border border-nothing rounded-lg p-0.5 text-[10px] font-mono">
              <button
                type="button"
                onClick={() => setKpiTimeframe('month')}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  kpiTimeframe === 'month'
                    ? 'bg-red-600 text-white font-bold'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                THIS MONTH
              </button>
              <button
                type="button"
                onClick={() => setKpiTimeframe('all')}
                className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                  kpiTimeframe === 'all'
                    ? 'bg-red-600 text-white font-bold'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                ALL TIME
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsKpiStacked(!isKpiStacked)}
              className="p-1 bg-[#1a1a1a] hover:bg-surface-3 border border-[#333] hover:border-red-500 rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center shadow-sm"
              title={isKpiStacked ? "Expand Metrics" : "Collapse Metrics"}
            >
              {isKpiStacked ? (
                <ChevronDown className="w-3.5 h-3.5 text-red-400" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5 text-red-400" />
              )}
            </button>
          </div>
        </div>

        {/* Vertical Stack / Expanded Container */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`transition-all duration-300 ease-in-out ${
            isKpiStacked
              ? 'kpi-stack space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'space-y-2.5 sm:space-y-3'
          }`}
        >
          {/* 1. Cash in Accounts KPI */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-emerald-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-40 shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Cash in Accounts</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowNetBalance(!showNetBalance);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showNetBalance ? "Hide amount" : "Show amount"}
              >
                {showNetBalance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight">
                {showNetBalance
                  ? `${currencySymbol}${formatAmount((hasAccounts ? liquid : cashflowNetBalance))}`
                  : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-emerald-400 flex items-center gap-0.5 font-bold">
                {hasAccounts ? (
                  <span>{accounts.filter((a) => a.type !== 'Credit Card').length} Liquid Accounts</span>
                ) : (
                  <span className="text-amber-400">Add accounts to see true net worth</span>
                )}
              </div>
            </div>
          </div>

          {/* 2. Income KPI (This Month / All Time) */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-emerald-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-30 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">
                  {kpiTimeframe === 'month' ? 'Income (This Month)' : 'Total Income (All Time)'}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCredit(!showCredit);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showCredit ? "Hide amount" : "Show amount"}
              >
                {showCredit ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-emerald-400 tracking-tight">
                {showCredit
                  ? `+${currencySymbol}${formatAmount((kpiTimeframe === 'month' ? monthCredit : allTimeIncome))}`
                  : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                {(kpiTimeframe === 'month' ? monthCreditTxns : allTimeIncomeTxns).length} Deposits
              </div>
            </div>
          </div>

          {/* 3. Expenses KPI (This Month / All Time) */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-red-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-20 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="font-bold text-white tracking-wider">
                  {kpiTimeframe === 'month' ? 'Expenses (This Month)' : 'Total Expenses (All Time)'}
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDebit(!showDebit);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showDebit ? "Hide amount" : "Show amount"}
              >
                {showDebit ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-red-500 tracking-tight">
                {showDebit
                  ? `-${currencySymbol}${formatAmount((kpiTimeframe === 'month' ? monthDebit : allTimeExpense))}`
                  : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                {(kpiTimeframe === 'month' ? monthDebitTxns : allTimeExpenseTxns).length} Expenses
              </div>
            </div>
          </div>

          {/* 4. Portfolio Investments KPI (Click redirects to Investment Page) */}
          <div
            onClick={() => {
              if (isKpiStacked) {
                setIsKpiStacked(false);
              }
              if (onNavigateToInvestments) {
                onNavigateToInvestments();
              }
            }}
            className={`p-3 sm:p-3.5 bg-[#181820] backdrop-blur-md border border-white/20 border-t-2 border-t-cyan-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 cursor-pointer group ${
              isKpiStacked
                ? 'z-10 scale-[0.94] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 ring-1 ring-white/10'
                : 'hover:border-cyan-400/80 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="font-bold text-white tracking-wider group-hover:text-cyan-400 transition-colors">Invested Portfolio</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInvestments(!showInvestments);
                }}
                className="text-[#888] hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showInvestments ? "Hide amount" : "Show amount"}
              >
                {showInvestments ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-white tracking-tight">
                {showInvestments ? `${currencySymbol}${formatAmount(investmentsValue)}` : '••••••••'}
              </div>
              
              {/* Arrow at bottom right corner signifying show more / redirect */}
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">
                <span>{investments.filter((i) => i.status !== 'redeemed').length} Active</span>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400 ml-0.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== 3. RECENT ACTIVITY ==================== */}
      <div className="bg-carbon border border-nothing p-3 sm:p-4 rounded-2xl space-y-2.5 shadow-md">
        <div className="flex items-center justify-between pb-2 border-b border-nothing">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-3.5 h-3.5 text-red-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">
              Recent Activity
            </h4>
            <InfoButton
              id="recent-activity-info"
              title="Recent Activity"
              content="Your 3 most recent financial transactions. Tap on any card or ALL TXNS to navigate to the full transaction history."
              align="left"
            />
          </div>

          {/* Redirect Icon Button to Transactions Page */}
          <button
            type="button"
            onClick={onNavigateToTransactions}
            title="Go to Transactions Page"
            className="p-1.5 bg-obsidian hover:bg-surface-3 border border-nothing hover:border-red-500 rounded-lg text-white transition-all nav-lift cursor-pointer flex items-center gap-1 group text-[10px] shrink-0"
          >
            <span className="hidden sm:inline text-[#aaa] group-hover:text-white transition-colors">ALL TXNS</span>
            <ArrowRight className="w-3.5 h-3.5 text-red-500 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* Single Row with 3 Short Details Transactions across all screen sizes */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {transactions.slice(0, 3).map((tx) => (
            <div
              key={tx.id}
              onClick={onNavigateToTransactions}
              className="p-2.5 bg-obsidian hover:bg-surface-3 border border-nothing hover:border-[#333] rounded-xl flex flex-col justify-between transition-all tactile-lift cursor-pointer group min-w-0"
            >
              <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                <span className="text-[9px] text-[#777] truncate">{tx.date}</span>
                <span
                  className={`text-[8px] sm:text-[9px] font-bold px-1 sm:px-1.5 py-0.5 rounded shrink-0 ${
                    tx.type === 'debit'
                      ? 'bg-red-950/60 text-red-400 border border-red-800/50'
                      : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                  }`}
                >
                  {tx.type === 'debit' ? 'DR' : 'CR'}
                </span>
              </div>

              <div className="text-[11px] sm:text-xs font-bold text-white truncate group-hover:text-red-400 transition-colors">
                {tx.title}
              </div>

              <div className="flex items-center justify-between gap-1 mt-2 pt-1.5 border-t border-[#1a1a1a] min-w-0">
                <span className="text-[8px] sm:text-[9px] text-[#888] truncate hidden sm:inline">{tx.category}</span>
                <span
                  className={`text-[11px] sm:text-xs font-bold ml-auto ${
                    tx.type === 'debit' ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {tx.type === 'debit' ? '-' : '+'}{currencySymbol}{formatAmount(tx.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==================== 4. MONITOR BUDGET ==================== */}
      <BudgetThresholdMonitor
        transactions={transactions}
        categories={categories}
        currencySymbol={currencySymbol}
        onNavigateToTransactions={onNavigateToTransactions}
        onNavigateToCustomisations={onNavigateToCustomisations}
        onTriggerAlert={onTriggerBudgetAlert}
        carouselState={carousel.getSectionState('budget')}
        containerRef={carousel.registerContainer('budget')}
        contentRef={carousel.registerContent('budget')}
        onToggleExpand={() => carousel.toggleSection('budget')}
      />

      <CashflowForecastCard
        transactions={transactions}
        accounts={accounts}
        categories={categories}
        currencySymbol={currencySymbol}
      />

      <SavingsGoalsCard
        goals={savingsGoals}
        onChange={onSavingsGoalsChange}
        currencySymbol={currencySymbol}
      />

      {/* ==================== RECURRING BILLS & UPCOMING PAYMENTS (COLLAPSIBLE) ==================== */}
      <RecurringTransactionsCard
        transactions={transactions}
        categories={categories}
        loans={loans}
        currencySymbol={currencySymbol}
        onQuickLogTransaction={onQuickLogTransaction}
        onNavigateToTransactions={onNavigateToTransactions}
        carouselState={carousel.getSectionState('recurring')}
        containerRef={carousel.registerContainer('recurring')}
        contentRef={carousel.registerContent('recurring')}
        onToggleExpand={() => carousel.toggleSection('recurring')}
      />

      {/* ==================== 5. 7-DAY SPENDING TREND (COLLAPSIBLE) ==================== */}
      <SevenDaySpendingTrendChart 
        transactions={transactions} 
        currencySymbol={currencySymbol}
        carouselState={carousel.getSectionState('trend')}
        containerRef={carousel.registerContainer('trend')}
        contentRef={carousel.registerContent('trend')}
        onToggleExpand={() => carousel.toggleSection('trend')}
      />

      {/* ==================== 6. CASH FLOW TREND TRAJECTORY ==================== */}
      <CashflowTrendLineChart transactions={transactions} currencySymbol={currencySymbol} />

      {/* ==================== 7. CATEGORY EXPENSE DONUT ==================== */}
      <CategoryDonutChart transactions={transactions} categories={categories} currencySymbol={currencySymbol} month={activeMonthStr} />

      {/* ==================== 8. TOP SPEND CATEGORY & 9. MOST SPEND PLACES & MERCHANTS ==================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <TopCategoriesCard transactions={transactions} categories={categories} currencySymbol={currencySymbol} month={activeMonthStr} />
        <TopMerchantsCard transactions={transactions} currencySymbol={currencySymbol} month={activeMonthStr} />
      </div>
    </div>
  );
};
