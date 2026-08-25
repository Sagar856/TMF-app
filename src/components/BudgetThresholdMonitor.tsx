import React, { useState, useMemo } from 'react';
import { Transaction, Category } from '../types/finance';
import { BudgetAlertPayload } from '../services/budgetAlertService';
import { 
  AlertTriangle, 
  ShieldAlert, 
  ShieldCheck, 
  Sliders, 
  ArrowRight, 
  ChevronDown, 
  ChevronUp, 
  Flame,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ReceiptText
} from 'lucide-react';

interface BudgetThresholdMonitorProps {
  transactions: Transaction[];
  categories: Category[];
  currencySymbol: string;
  onNavigateToTransactions?: () => void;
  onNavigateToCustomisations?: () => void;
  onTriggerAlert?: (alert: BudgetAlertPayload) => void;
}

export const BudgetThresholdMonitor: React.FC<BudgetThresholdMonitorProps> = ({
  transactions,
  categories,
  currencySymbol,
  onNavigateToTransactions,
  onNavigateToCustomisations,
  onTriggerAlert,
}) => {
  // Extract all distinct year-month strings from transactions (e.g., '2026-07', '2026-08')
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        monthsSet.add(tx.date.substring(0, 7));
      }
    });
    
    // Always include current calendar month
    const nowMonth = new Date().toISOString().substring(0, 7);
    monthsSet.add(nowMonth);

    // Sort descending (latest month first)
    return Array.from(monthsSet).sort().reverse();
  }, [transactions]);

  // Selected month state - default to latest month with transactions or current month
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return availableMonths.length > 0 ? availableMonths[0] : new Date().toISOString().substring(0, 7);
  });

  // Filter mode: 'alerts' (shows only >= 80%) or 'all' (shows all categories with budgets)
  const [filterMode, setFilterMode] = useState<'alerts' | 'all'>('alerts');
  // Collapsed by default as requested
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Format YYYY-MM to readable label e.g., "July 2026"
  const formatMonthLabel = (ym: string) => {
    if (!ym || ym.length < 7) return ym;
    const [year, month] = ym.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const monthIdx = parseInt(month, 10) - 1;
    return `${monthNames[monthIdx] || month} ${year}`;
  };

  // Filter debit transactions for selected month
  const monthlyDebitTxs = useMemo(() => {
    return transactions.filter(
      (tx) => tx.type === 'debit' && tx.date && tx.date.startsWith(selectedMonth)
    );
  }, [transactions, selectedMonth]);

  // Compute category threshold status
  const categoryThresholds = useMemo(() => {
    const expenseCategoriesWithBudgets = categories.filter(
      (cat) => cat.type === 'expense' && cat.budgetLimit && cat.budgetLimit > 0
    );

    return expenseCategoriesWithBudgets.map((cat) => {
      const budget = cat.budgetLimit || 0;
      const catTxs = monthlyDebitTxs.filter((tx) => tx.category === cat.name);
      const spent = catTxs.reduce((sum, tx) => sum + tx.amount, 0);
      const percent = budget > 0 ? (spent / budget) * 100 : 0;
      const remaining = Math.max(0, budget - spent);
      const overBudget = Math.max(0, spent - budget);
      
      const isCritical = percent >= 100;
      const isWarning = percent >= 80 && percent < 100;
      const isSafe = percent < 80;

      return {
        category: cat,
        budget,
        spent,
        percent,
        remaining,
        overBudget,
        txCount: catTxs.length,
        isCritical,
        isWarning,
        isSafe,
        status: isCritical ? 'critical' : isWarning ? 'warning' : 'safe',
      };
    }).sort((a, b) => b.percent - a.percent); // Highest % spent at top
  }, [categories, monthlyDebitTxs]);

  const alertCategories = useMemo(() => {
    return categoryThresholds.filter((item) => item.isCritical || item.isWarning);
  }, [categoryThresholds]);

  const totalBudgetTracked = useMemo(() => {
    return categoryThresholds.reduce((sum, item) => sum + item.budget, 0);
  }, [categoryThresholds]);

  const totalSpentTracked = useMemo(() => {
    return categoryThresholds.reduce((sum, item) => sum + item.spent, 0);
  }, [categoryThresholds]);

  const overallUtilization = totalBudgetTracked > 0 ? (totalSpentTracked / totalBudgetTracked) * 100 : 0;

  // Categories to display based on tab
  const displayedCategories = filterMode === 'alerts' && alertCategories.length > 0 
    ? alertCategories 
    : categoryThresholds;

  const hasAlerts = alertCategories.length > 0;

  return (
    <div 
      id="budget-threshold-monitor"
      className={`rounded-2xl border transition-all duration-300 font-mono ${
        hasAlerts
          ? 'bg-gradient-to-br from-[#1c1214] via-[#141215] to-[#121214] border-red-500/60 shadow-[0_10px_30px_rgba(220,38,38,0.15)] ring-1 ring-red-500/20'
          : 'bg-[#111113] border-[#242428] shadow-md'
      }`}
    >
      {/* ==================== MONITOR HEADER ==================== */}
      <div className="p-4 sm:p-5 border-b border-[#26262a] flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Icon & Alert Status */}
        <div 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-3 min-w-0 cursor-pointer select-none"
        >
          <div 
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${
              hasAlerts
                ? 'bg-red-950/80 border-red-500 text-red-400 animate-pulse'
                : 'bg-emerald-950/70 border-emerald-600/50 text-emerald-400'
            }`}
          >
            {hasAlerts ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-white">
                Monitor Budget
              </span>

              {hasAlerts ? (
                <span className="px-2 py-0.5 bg-red-950 border border-red-600 text-red-400 text-[9px] sm:text-[10px] font-bold rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping shrink-0" />
                  <span>{alertCategories.length} {alertCategories.length === 1 ? 'CATEGORY' : 'CATEGORIES'} EXCEEDED &gt; 80%</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-emerald-950/80 border border-emerald-700/60 text-emerald-400 text-[9px] sm:text-[10px] font-bold rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>ALL BUDGETS SAFE (&lt; 80%)</span>
                </span>
              )}
            </div>

            <p className="text-xs text-[#888] mt-0.5 truncate">
              {hasAlerts
                ? `${alertCategories.map(c => c.category.name).join(', ')} exceeded 80% of defined monthly allocation`
                : `Monitored monthly expenses are currently within safe operational boundaries`}
            </p>
          </div>
        </div>

        {/* Right: Month Selector & Controls */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between md:justify-end">
          {/* Month Selector Pill */}
          <div className="flex items-center gap-1.5 bg-black/60 border border-[#2a2a2e] px-2.5 py-1.5 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#888] shrink-0" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white text-xs font-mono font-bold focus:outline-none cursor-pointer"
              title="Select billing cycle month"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m} className="bg-[#141416] text-white">
                  {formatMonthLabel(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Nav to Customisations / Adjust Limits */}
          {onNavigateToCustomisations && (
            <button
              type="button"
              onClick={onNavigateToCustomisations}
              className="p-1.5 px-2.5 bg-[#18181c] hover:bg-[#222226] border border-[#333] hover:border-red-500 rounded-xl text-white text-[10px] font-bold uppercase transition-all nav-lift flex items-center gap-1 cursor-pointer shrink-0"
              title="Configure Categories & Budget Limits"
            >
              <Sliders className="w-3 h-3 text-[#aaa]" />
              <span className="hidden sm:inline">SET LIMITS</span>
            </button>
          )}

          {/* Expand/Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 bg-[#18181c] hover:bg-[#222226] border border-[#333] rounded-xl text-[#aaa] hover:text-white transition-colors cursor-pointer shrink-0 flex items-center gap-1 text-[10px] font-bold"
            title={isExpanded ? "Collapse Details" : "Expand Details"}
          >
            <span>{isExpanded ? 'COLLAPSE' : 'EXPAND'}</span>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ==================== EXPANDED MONITOR BODY ==================== */}
      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-4">
          {/* Summary Metric Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            <div className="bg-black/50 border border-[#222] p-2.5 sm:p-3 rounded-xl">
              <div className="text-[9px] text-[#777] uppercase font-bold">Tracked Budget</div>
              <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                {currencySymbol}{totalBudgetTracked.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="bg-black/50 border border-[#222] p-2.5 sm:p-3 rounded-xl">
              <div className="text-[9px] text-[#777] uppercase font-bold">Month Spend</div>
              <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                {currencySymbol}{totalSpentTracked.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="bg-black/50 border border-[#222] p-2.5 sm:p-3 rounded-xl">
              <div className="text-[9px] text-[#777] uppercase font-bold">Overall Utilization</div>
              <div className={`text-sm sm:text-base font-bold mt-0.5 ${
                overallUtilization >= 100 ? 'text-red-400' : overallUtilization >= 80 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {overallUtilization.toFixed(1)}%
              </div>
            </div>

            <div className="bg-black/50 border border-[#222] p-2.5 sm:p-3 rounded-xl">
              <div className="text-[9px] text-[#777] uppercase font-bold">Active Alerts</div>
              <div className={`text-sm sm:text-base font-bold mt-0.5 ${hasAlerts ? 'text-red-400' : 'text-emerald-400'}`}>
                {alertCategories.length} / {categoryThresholds.length}
              </div>
            </div>
          </div>

          {/* Filter Tabs if there are multiple categories */}
          {categoryThresholds.length > 0 && (
            <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[#222] pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterMode('alerts')}
                  className={`px-3 py-1 text-[10px] sm:text-xs font-bold uppercase rounded-lg transition-all nav-lift cursor-pointer flex items-center gap-1.5 ${
                    filterMode === 'alerts'
                      ? 'bg-red-950 text-red-300 border border-red-600/80 shadow-sm'
                      : 'text-[#888] hover:text-white bg-[#141416] border border-[#26262a]'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span>Alerts ({alertCategories.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 text-[10px] sm:text-xs font-bold uppercase rounded-lg transition-all nav-lift cursor-pointer flex items-center gap-1.5 ${
                    filterMode === 'all'
                      ? 'bg-[#222] text-white border border-[#444] shadow-sm'
                      : 'text-[#888] hover:text-white bg-[#141416] border border-[#26262a]'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>All Monitored ({categoryThresholds.length})</span>
                </button>
              </div>

              <div className="text-[10px] text-[#777] hidden sm:block">
                Threshold benchmark: <span className="text-amber-400 font-bold">80%</span> of monthly budget
              </div>
            </div>
          )}

          {/* Category Threshold Cards */}
          {displayedCategories.length === 0 ? (
            <div className="p-6 bg-black/40 border border-[#222] rounded-xl text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
              <div className="text-xs font-bold text-white">No categories exceed the 80% threshold</div>
              <p className="text-[11px] text-[#777]">
                All expense categories in {formatMonthLabel(selectedMonth)} are well within safe budget boundaries.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayedCategories.map((item) => {
                const isOverBudget = item.percent >= 100;
                const isOverThreshold = item.percent >= 80 && item.percent < 100;
                const isSafe = item.percent < 80;

                // Color themes
                const badgeColor = isOverBudget
                  ? 'bg-red-950/90 text-red-400 border-red-700'
                  : isOverThreshold
                  ? 'bg-amber-950/90 text-amber-300 border-amber-600'
                  : 'bg-emerald-950/70 text-emerald-400 border-emerald-800/60';

                const progressFillColor = isOverBudget
                  ? 'bg-gradient-to-r from-red-600 to-rose-500'
                  : isOverThreshold
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-500';

                const clampedVisualWidth = Math.min(100, Math.max(2, item.percent));

                return (
                  <div
                    key={item.category.id}
                    className={`p-3.5 sm:p-4 rounded-xl border transition-all duration-200 ${
                      isOverBudget
                        ? 'bg-[#181113] border-red-600/70 hover:border-red-500 shadow-md'
                        : isOverThreshold
                        ? 'bg-[#181510] border-amber-500/70 hover:border-amber-400 shadow-md'
                        : 'bg-[#121215] border-[#242428] hover:border-[#333]'
                    }`}
                  >
                    {/* Header Row: Category name, Icon, Status Pill */}
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            isOverBudget
                              ? 'bg-red-950 border-red-600 text-red-400'
                              : isOverThreshold
                              ? 'bg-amber-950 border-amber-600 text-amber-400'
                              : 'bg-black border-[#333] text-emerald-400'
                          }`}
                        >
                          {isOverBudget ? (
                            <Flame className="w-4 h-4 text-red-400 animate-pulse" />
                          ) : isOverThreshold ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          ) : (
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {item.category.name}
                            </span>
                            <span className="text-[10px] text-[#777] hidden sm:inline truncate">
                              ({item.txCount} txns in {formatMonthLabel(selectedMonth)})
                            </span>
                          </div>
                          {item.category.subcategories && item.category.subcategories.length > 0 && (
                            <div className="text-[9px] text-[#666] truncate mt-0.5">
                              {item.category.subcategories.slice(0, 3).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded-lg border uppercase ${badgeColor}`}>
                          {isOverBudget
                            ? `🚨 ${item.percent.toFixed(1)}% OVER BUDGET`
                            : isOverThreshold
                            ? `⚠️ ${item.percent.toFixed(1)}% THRESHOLD EXCEEDED`
                            : `✅ ${item.percent.toFixed(1)}% SAFE`}
                        </span>
                      </div>
                    </div>

                    {/* Spend Metrics & Context */}
                    <div className="flex items-baseline justify-between text-xs sm:text-sm mb-2 gap-2 flex-wrap">
                      <div className="flex items-baseline gap-1.5 font-bold">
                        <span className={isOverBudget ? 'text-red-400' : isOverThreshold ? 'text-amber-300' : 'text-white'}>
                          {currencySymbol}{item.spent.toLocaleString('en-IN')}
                        </span>
                        <span className="text-[10px] text-[#777] font-normal">
                          spent of {currencySymbol}{item.budget.toLocaleString('en-IN')} limit
                        </span>
                      </div>

                      <div className="text-[10px] sm:text-[11px] font-bold">
                        {isOverBudget ? (
                          <span className="text-red-400">
                            +{currencySymbol}{item.overBudget.toLocaleString('en-IN')} over budget
                          </span>
                        ) : isOverThreshold ? (
                          <span className="text-amber-400">
                            Only {currencySymbol}{item.remaining.toLocaleString('en-IN')} remaining before max cap
                          </span>
                        ) : (
                          <span className="text-emerald-400">
                            {currencySymbol}{item.remaining.toLocaleString('en-IN')} safe buffer remaining
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar with 80% Threshold Marker */}
                    <div className="relative pt-1 pb-1">
                      {/* 80% Threshold Mark Line */}
                      <div
                        className="absolute top-0 bottom-0 z-20 flex flex-col items-center pointer-events-none"
                        style={{ left: '80%' }}
                      >
                        <span className="text-[8px] font-bold text-amber-400 bg-black/80 px-1 py-0.2 rounded border border-amber-500/50 -translate-y-1">
                          80% Alert
                        </span>
                        <div className="w-0.5 h-full bg-amber-400/80 border-r border-dashed border-amber-300" />
                      </div>

                      {/* Track */}
                      <div className="w-full h-3 bg-[#0a0a0c] rounded-full overflow-hidden p-0.5 border border-[#2a2a2e] relative z-10">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ease-out ${progressFillColor}`}
                          style={{ width: `${clampedVisualWidth}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer Actions for this category */}
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#222]/80 text-[10px]">
                      <span className="text-[#666]">
                        {isOverThreshold || isOverBudget ? (
                          <span className="text-amber-400/90 font-bold">
                            ⚠️ Monitor spending in this category to prevent deficit
                          </span>
                        ) : (
                          <span className="text-[#777]">Within planned monthly target</span>
                        )}
                      </span>

                      <div className="flex items-center gap-2">
                        {onNavigateToTransactions && (
                          <button
                            type="button"
                            onClick={onNavigateToTransactions}
                            className="px-2 py-0.5 bg-[#1a1a1e] hover:bg-[#26262c] text-[#bbb] hover:text-white border border-[#333] hover:border-red-500 rounded transition-all nav-lift cursor-pointer flex items-center gap-1"
                          >
                            <ReceiptText className="w-2.5 h-2.5" />
                            <span>View Txns</span>
                          </button>
                        )}

                        {onNavigateToCustomisations && (
                          <button
                            type="button"
                            onClick={onNavigateToCustomisations}
                            className="px-2 py-0.5 bg-[#1a1a1e] hover:bg-[#26262c] text-[#bbb] hover:text-white border border-[#333] hover:border-amber-500 rounded transition-all nav-lift cursor-pointer flex items-center gap-1"
                          >
                            <Sliders className="w-2.5 h-2.5" />
                            <span>Edit Budget</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
