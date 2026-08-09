import React, { useState, useEffect } from 'react';
import { Transaction, Category, InvestmentRecord, LoanRecord, ParsedNotification } from '../types/finance';
import { CashflowTrendLineChart } from './CashflowTrendLineChart';
import { CategoryDonutChart } from './CategoryDonutChart';
import { TopMerchantsCard } from './TopMerchantsCard';
import { TopCategoriesCard } from './TopCategoriesCard';
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
  ReceiptText
} from 'lucide-react';

interface DashboardViewProps {
  transactions: Transaction[];
  categories: Category[];
  investments: InvestmentRecord[];
  loans: LoanRecord[];
  pendingNotifications: ParsedNotification[];
  onOpenNotifications: () => void;
  onOpenAddTransaction: () => void;
  onNavigateToTransactions?: () => void;
  onNavigateToInvestments?: () => void;
  currencySymbol: string;
  defaultNetWorthMasked?: boolean;
  isCloudSynced?: boolean;
  onOpenCloudSyncStatus?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  categories,
  investments,
  loans,
  pendingNotifications,
  onOpenNotifications,
  onOpenAddTransaction,
  onNavigateToTransactions,
  onNavigateToInvestments,
  currencySymbol,
  defaultNetWorthMasked = true,
  isCloudSynced = false,
  onOpenCloudSyncStatus,
}) => {
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
  const [touchStartY, setTouchStartY] = useState<number | null>(null);

  // Auto-collapse expanded KPIs when user scrolls down
  useEffect(() => {
    const handleScroll = () => {
      const mainEl = document.querySelector('main');
      if (mainEl && mainEl.scrollTop > 50 && !isKpiStacked) {
        setIsKpiStacked(true);
      }
    };
    const mainEl = document.querySelector('main');
    mainEl?.addEventListener('scroll', handleScroll);
    return () => mainEl?.removeEventListener('scroll', handleScroll);
  }, [isKpiStacked]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartY;
    if (diffY > 25) {
      // Swiped down -> Expand vertically (placed one below one)
      setIsKpiStacked(false);
    } else if (diffY < -25) {
      // Swiped up -> Stack vertically with overlap
      setIsKpiStacked(true);
    }
    setTouchStartY(null);
  };

  // Calculate key totals
  const totalCredit = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalDebit = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + t.amount, 0);

  const netBalance = totalCredit - totalDebit;
  const totalInvested = investments.reduce((sum, inv) => sum + inv.currentValue, 0);
  const totalNetWorth = netBalance + totalInvested;

  const savingsRate = totalCredit > 0 ? Math.max(0, Math.round(((totalCredit - totalDebit) / totalCredit) * 100)) : 0;

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

      {/* ==================== COMMERCIAL GRADE EXECUTIVE HEADER STRIP ==================== */}
      <div className="bg-gradient-to-r from-[#141416] via-[#111113] to-[#18181c] border border-[#26262a] p-3.5 sm:p-4 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-red-950/60 border border-red-600/50 rounded-xl flex items-center justify-center text-red-500 shrink-0 shadow-inner">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#888] uppercase tracking-widest">
                EXECUTIVE SUMMARY
              </span>
              <span className="px-1.5 py-0.5 bg-emerald-950/70 text-emerald-400 text-[9px] font-bold rounded border border-emerald-800/50">
                HEALTHY
              </span>
            </div>
            <div className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2 mt-0.5">
              <span>NET WORTH:</span>
              <span className="text-emerald-400 font-extrabold">
                {isNetWorthHidden ? '••••••••' : `${currencySymbol}${totalNetWorth.toLocaleString('en-IN')}`}
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

        {/* Right Stats & Quick Actions */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap justify-between md:justify-end border-t md:border-t-0 border-[#222] pt-2 md:pt-0">
          <button
            type="button"
            onClick={onOpenCloudSyncStatus}
            className="flex items-center gap-1.5 bg-black/60 border border-[#222] hover:border-[#333] px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
            title={isCloudSynced ? 'Synced to cloud' : 'Not synced to cloud — tap for details'}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${isCloudSynced ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-[9px] text-[#aaa] uppercase font-bold tracking-wider">
              {isCloudSynced ? 'Cloud Synced' : 'Not Synced'}
            </span>
          </button>

          <div className="bg-black/60 border border-[#222] px-3 py-1.5 rounded-xl text-right">
            <div className="text-[9px] text-[#777] uppercase font-bold">Savings Rate</div>
            <div className="text-xs font-bold text-emerald-400">{savingsRate}% MoM</div>
          </div>

          <div className="bg-black/60 border border-[#222] px-3 py-1.5 rounded-xl text-right">
            <div className="text-[9px] text-[#777] uppercase font-bold">Outflow Ratio</div>
            <div className="text-xs font-bold text-red-400">
              {totalCredit > 0 ? Math.round((totalDebit / totalCredit) * 100) : 0}%
            </div>
          </div>

        </div>
      </div>

      {/* ==================== STACKED / EXPANDABLE VERTICAL KPI SECTION ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-white">FINANCIAL METRICS</span>
          </div>
          <button
            type="button"
            onClick={() => setIsKpiStacked(!isKpiStacked)}
            className="p-1 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] hover:border-red-500 rounded-lg text-white transition-colors cursor-pointer flex items-center justify-center shadow-sm"
            title={isKpiStacked ? "Expand Metrics" : "Collapse Metrics"}
          >
            {isKpiStacked ? (
              <ChevronDown className="w-3.5 h-3.5 text-red-400" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-red-400" />
            )}
          </button>
        </div>

        {/* Vertical Stack / Expanded Container */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`transition-all duration-300 ease-in-out ${
            isKpiStacked
              ? 'space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'space-y-2.5 sm:space-y-3'
          }`}
        >
          {/* 1. Net Balance KPI */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-emerald-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-40 shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Total Net Balance</span>
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
                {showNetBalance ? `${currencySymbol}${netBalance.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-emerald-400 flex items-center gap-0.5 font-bold">
                <ArrowUpRight className="w-3 h-3" />
                <span>+4.2% MoM</span>
              </div>
            </div>
          </div>

          {/* 2. Total Credit KPI */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-emerald-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-30 scale-[0.98] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="font-bold text-white tracking-wider">Total Credit (Income)</span>
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
                {showCredit ? `+${currencySymbol}${totalCredit.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                {transactions.filter((t) => t.type === 'credit').length} Deposits
              </div>
            </div>
          </div>

          {/* 3. Total Debit KPI */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-red-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-20 scale-[0.96] shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-white/10'
                : 'hover:border-white/30 shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <ArrowUpRight className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="font-bold text-white tracking-wider">Total Debit (Expenses)</span>
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
                {showDebit ? `-${currencySymbol}${totalDebit.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-[#aaa]">
                {transactions.filter((t) => t.type === 'debit').length} Expenses
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
            className={`p-3 sm:p-3.5 bg-[#181820]/75 dark:bg-[#12121c]/80 backdrop-blur-md border border-white/20 dark:border-white/15 border-t-2 border-t-cyan-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 cursor-pointer group ${
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
                {showInvestments ? `${currencySymbol}${totalInvested.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              
              {/* Arrow at bottom right corner signifying show more / redirect */}
              <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-cyan-400 font-bold group-hover:translate-x-0.5 transition-transform">
                <span>+21.8% Returns</span>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400 ml-0.5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 1 Visuals: Cashflow Trend Line Chart & Category Donut Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4">
          <CashflowTrendLineChart transactions={transactions} currencySymbol={currencySymbol} />

          {/* Just Below Cash Flow Trend Visual: Recent Activity (All 3 in Single Row) */}
          <div className="bg-carbon border border-nothing p-3 sm:p-4 rounded-2xl space-y-2.5 shadow-md">
            <div className="flex items-center justify-between pb-2 border-b border-nothing">
              <div className="flex items-center gap-2">
                <ReceiptText className="w-3.5 h-3.5 text-red-500" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                  Recent Activity
                </h4>
              </div>

              {/* Redirect Icon Button to Transactions Page */}
              <button
                type="button"
                onClick={onNavigateToTransactions}
                title="Go to Transactions Page"
                className="p-1.5 bg-obsidian hover:bg-[#222] border border-nothing hover:border-red-500 rounded-lg text-white transition-all cursor-pointer flex items-center gap-1 group text-[10px] shrink-0"
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
                  className="p-2.5 bg-obsidian hover:bg-[#121212] border border-nothing hover:border-[#333] rounded-xl flex flex-col justify-between transition-all cursor-pointer group min-w-0"
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
                      {tx.type === 'debit' ? '-' : '+'}{currencySymbol}{tx.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <CategoryDonutChart transactions={transactions} categories={categories} currencySymbol={currencySymbol} />
        </div>
      </div>

      {/* Row 2 Visuals: Most Spend Places / Merchants & Top Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        <TopMerchantsCard transactions={transactions} currencySymbol={currencySymbol} />
        <TopCategoriesCard transactions={transactions} categories={categories} currencySymbol={currencySymbol} />
      </div>
    </div>
  );
};

