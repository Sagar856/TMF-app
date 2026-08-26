import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Category, FinancialAccount, Transaction } from '../types/finance';
import { 
  Sliders, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  ShieldAlert, 
  Building2, 
  CreditCard, 
  Edit2, 
  Calendar,
  AlertTriangle,
  Flame,
  CheckCircle2,
  TrendingUp,
  Percent
} from 'lucide-react';

interface CustomisationsViewProps {
  categories: Category[];
  accounts?: FinancialAccount[];
  transactions?: Transaction[];
  onAddCategory: (cat: Category) => void;
  onUpdateCategory: (cat: Category) => void;
  onDeleteCategory: (id: string) => void;
  onAddAccount?: (acc: FinancialAccount) => void;
  onUpdateAccount?: (acc: FinancialAccount) => void;
  onDeleteAccount?: (id: string) => void;
  currencySymbol: string;
}

export const CustomisationsView: React.FC<CustomisationsViewProps> = ({
  categories,
  accounts = [],
  transactions = [],
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  currencySymbol,
}) => {
  const [activeTab, setActiveTab] = useState<'categories' | 'budgets' | 'accounts'>('budgets');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [accountToDelete, setAccountToDelete] = useState<FinancialAccount | null>(null);

  // Month selector for budget tracking
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.date && tx.date.length >= 7) {
        monthsSet.add(tx.date.substring(0, 7));
      }
    });
    const nowMonth = new Date().toISOString().substring(0, 7);
    monthsSet.add(nowMonth);
    return Array.from(monthsSet).sort().reverse();
  }, [transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return availableMonths.length > 0 ? availableMonths[0] : new Date().toISOString().substring(0, 7);
  });

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

  // Debit transactions for the selected month
  const monthlyDebitTxs = useMemo(() => {
    return transactions.filter(
      (tx) => tx.type === 'debit' && tx.date && tx.date.startsWith(selectedMonth)
    );
  }, [transactions, selectedMonth]);

  // Helper to compute actual vs budget for a given category
  const getCategorySpendData = (cat: Category) => {
    const catTxs = monthlyDebitTxs.filter((tx) => tx.category === cat.name);
    const actualSpent = catTxs.reduce((sum, tx) => sum + tx.amount, 0);
    const budgetLimit = cat.budgetLimit || 0;
    const percent = budgetLimit > 0 ? (actualSpent / budgetLimit) * 100 : 0;
    const isOverThreshold = budgetLimit > 0 && percent >= 80;
    const isOverBudget = budgetLimit > 0 && percent >= 100;
    const remaining = Math.max(0, budgetLimit - actualSpent);
    const overAmount = Math.max(0, actualSpent - budgetLimit);

    return {
      actualSpent,
      budgetLimit,
      percent,
      isOverThreshold,
      isOverBudget,
      remaining,
      overAmount,
      txCount: catTxs.length,
    };
  };

  // Overall budget summary metrics
  const budgetSummary = useMemo(() => {
    const expenseCats = categories.filter((c) => c.type === 'expense');
    let totalBudget = 0;
    let totalSpent = 0;
    let overThresholdCount = 0;

    expenseCats.forEach((cat) => {
      const data = getCategorySpendData(cat);
      if (data.budgetLimit > 0) {
        totalBudget += data.budgetLimit;
        totalSpent += data.actualSpent;
        if (data.isOverThreshold) {
          overThresholdCount++;
        }
      }
    });

    const overallPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    return { totalBudget, totalSpent, overThresholdCount, overallPercent };
  }, [categories, monthlyDebitTxs]);

  // New category state
  const [catName, setCatName] = useState<string>('');
  const [catType, setCatType] = useState<'income' | 'expense' | 'investment'>('expense');
  const [subcategoriesInput, setSubcategoriesInput] = useState<string>('');
  const [budgetLimitInput, setBudgetLimitInput] = useState<string>('');

  // Editing budget limit inline
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState<string>('');

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const subs = subcategoriesInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const budget = parseFloat(budgetLimitInput);

    const newCat: Category = {
      id: 'cat_' + Date.now(),
      name: catName.trim(),
      type: catType,
      iconName: 'Tag',
      subcategories: subs.length > 0 ? subs : ['General'],
      budgetLimit: !isNaN(budget) && budget > 0 ? budget : undefined,
    };

    onAddCategory(newCat);
    setShowAddModal(false);
    setCatName('');
    setSubcategoriesInput('');
    setBudgetLimitInput('');
  };

  const handleSaveBudgetLimit = (category: Category) => {
    const val = parseFloat(editingBudgetVal);
    if (isNaN(val) || val <= 0) {
      onUpdateCategory({ ...category, budgetLimit: undefined });
    } else {
      onUpdateCategory({ ...category, budgetLimit: val });
    }
    setEditingBudgetId(null);
  };

  return (
    <div className="space-y-6 pb-12 font-mono">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-red-500" />
            <span>Categories & Budget Customisations</span>
          </h2>
          <p className="text-xs text-[#777] mt-0.5">
            Configure custom categories, subcategories, and monthly spending limits with automatic 80% threshold warnings
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Month Selector for Actual Spending calculations */}
          <div className="flex items-center gap-1.5 bg-black/80 border border-[#2a2a2e] px-3 py-1.5 rounded-xl text-xs">
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

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-white text-black font-bold text-xs uppercase rounded-xl hover:bg-neutral-200 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Category</span>
          </button>
        </div>
      </div>

      {/* Tabs: Categories vs Monthly Budgets vs Bank & Card Accounts */}
      <div className="flex flex-wrap gap-2 border-b border-nothing pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('budgets')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'budgets'
              ? 'bg-white text-black shadow-sm'
              : 'text-[#888] hover:text-white hover:bg-obsidian'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Monthly Budget Limits & Progress</span>
          {budgetSummary.overThresholdCount > 0 && (
            <span className="px-1.5 py-0.2 bg-red-600 text-white rounded-full text-[9px] font-bold animate-pulse">
              {budgetSummary.overThresholdCount} Alert{budgetSummary.overThresholdCount > 1 ? 's' : ''}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'categories'
              ? 'bg-white text-black shadow-sm'
              : 'text-[#888] hover:text-white hover:bg-obsidian'
          }`}
        >
          <span>Categories & Subcategories</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === 'accounts'
              ? 'bg-white text-black shadow-sm'
              : 'text-[#888] hover:text-white hover:bg-obsidian'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Manage Bank & Card Accounts ({accounts.length})</span>
        </button>
      </div>

      {/* View 1: Budget Setup & Limits with Visual Progress Bars */}
      {activeTab === 'budgets' && (
        <div className="space-y-5">
          {/* Executive Summary Metrics Card */}
          <div className="bg-carbon border border-nothing p-4 sm:p-5 rounded-2xl">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3 border-b border-[#222] pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>MONTHLY EXPENSE BUDGETS ({formatMonthLabel(selectedMonth)})</span>
                </h3>
                <p className="text-xs text-[#777] mt-0.5">
                  Visual progress meters turn <span className="text-red-400 font-bold">RED</span> when actual spending crosses the 80% limit threshold
                </p>
              </div>

              {budgetSummary.overThresholdCount > 0 ? (
                <span className="px-2.5 py-1 bg-red-950/90 text-red-400 border border-red-600 rounded-lg text-xs font-bold flex items-center gap-1.5 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>{budgetSummary.overThresholdCount} {budgetSummary.overThresholdCount === 1 ? 'Category Exceeded' : 'Categories Exceeded'} &gt;80% Limit</span>
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>All Monitored Budgets Safe (&lt;80%)</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-obsidian border border-[#222] p-3 rounded-xl">
                <div className="text-[9px] text-[#777] uppercase font-bold">Total Budget Tracked</div>
                <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                  {currencySymbol}{budgetSummary.totalBudget.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="bg-obsidian border border-[#222] p-3 rounded-xl">
                <div className="text-[9px] text-[#777] uppercase font-bold">Actual Month Spend</div>
                <div className="text-sm sm:text-base font-bold text-white mt-0.5">
                  {currencySymbol}{budgetSummary.totalSpent.toLocaleString('en-IN')}
                </div>
              </div>

              <div className="bg-obsidian border border-[#222] p-3 rounded-xl">
                <div className="text-[9px] text-[#777] uppercase font-bold">Overall Utilization</div>
                <div className={`text-sm sm:text-base font-bold mt-0.5 ${
                  budgetSummary.overallPercent >= 80 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {budgetSummary.overallPercent.toFixed(1)}%
                </div>
              </div>

              <div className="bg-obsidian border border-[#222] p-3 rounded-xl">
                <div className="text-[9px] text-[#777] uppercase font-bold">80% Threshold Status</div>
                <div className={`text-sm sm:text-base font-bold mt-0.5 ${
                  budgetSummary.overThresholdCount > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}>
                  {budgetSummary.overThresholdCount > 0 ? `${budgetSummary.overThresholdCount} In Alert` : 'Normal'}
                </div>
              </div>
            </div>
          </div>

          {/* List of Categories with Visual Progress Bars */}
          <div className="space-y-3.5">
            {categories
              .filter((c) => c.type === 'expense')
              .map((cat) => {
                const isEditing = editingBudgetId === cat.id;
                const spendData = getCategorySpendData(cat);
                const hasBudget = spendData.budgetLimit > 0;
                const clampedBarWidth = Math.min(100, Math.max(spendData.actualSpent > 0 ? 2 : 0, spendData.percent));

                return (
                  <div
                    key={cat.id}
                    className={`p-4 rounded-2xl border transition-all duration-200 ${
                      spendData.isOverBudget
                        ? 'bg-[#191113] border-red-600/80 shadow-[0_4px_20px_rgba(220,38,38,0.15)]'
                        : spendData.isOverThreshold
                        ? 'bg-[#191314] border-red-500/60 shadow-[0_4px_20px_rgba(239,68,68,0.1)]'
                        : 'bg-obsidian border-nothing hover:border-[#333]'
                    }`}
                  >
                    {/* Header Row: Category Name, Subcategories & Budget Controls */}
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-white">{cat.name}</span>
                          
                          {/* 80% Threshold Warning Pill */}
                          {hasBudget && spendData.isOverBudget && (
                            <span className="px-2 py-0.5 bg-red-950 text-red-400 border border-red-700 rounded-lg text-[9px] font-bold flex items-center gap-1 animate-pulse">
                              <Flame className="w-3 h-3 text-red-400 shrink-0" />
                              <span>🚨 {spendData.percent.toFixed(1)}% (OVER BUDGET)</span>
                            </span>
                          )}

                          {hasBudget && spendData.isOverThreshold && !spendData.isOverBudget && (
                            <span className="px-2 py-0.5 bg-red-950/90 text-red-400 border border-red-500 rounded-lg text-[9px] font-bold flex items-center gap-1 animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                              <span>⚠️ {spendData.percent.toFixed(1)}% (CROSSES 80% THRESHOLD)</span>
                            </span>
                          )}

                          {hasBudget && !spendData.isOverThreshold && (
                            <span className="px-2 py-0.5 bg-emerald-950/70 text-emerald-400 border border-emerald-800/60 rounded-lg text-[9px] font-bold">
                              ✅ {spendData.percent.toFixed(1)}% SAFE
                            </span>
                          )}

                          {!hasBudget && (
                            <span className="px-2 py-0.5 bg-[#1f1f23] text-[#888] border border-[#333] rounded-lg text-[9px] font-bold">
                              NO LIMIT SET
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-[#666] mt-0.5 truncate">
                          {cat.subcategories.join(', ')} • ({spendData.txCount} txns in {formatMonthLabel(selectedMonth)})
                        </div>
                      </div>

                      {/* Right: Budget Limit Setting / Inline Edit Form */}
                      <div className="flex items-center gap-3 shrink-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#888]">{currencySymbol}</span>
                            <input
                              type="number"
                              value={editingBudgetVal}
                              onChange={(e) => setEditingBudgetVal(e.target.value)}
                              placeholder="e.g. 15000"
                              className="px-2.5 py-1 bg-carbon border border-red-500 rounded text-xs font-mono text-white w-28 focus:outline-none"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveBudgetLimit(cat)}
                              className="p-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors cursor-pointer"
                              title="Save Limit"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingBudgetId(null)}
                              className="p-1.5 bg-[#222] text-[#888] hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-bold text-white">
                              {hasBudget
                                ? `${currencySymbol}${cat.budgetLimit?.toLocaleString('en-IN')}`
                                : 'No Limit'}
                            </div>
                            <button
                              onClick={() => {
                                setEditingBudgetId(cat.id);
                                setEditingBudgetVal(cat.budgetLimit ? cat.budgetLimit.toString() : '');
                              }}
                              className="text-[10px] text-red-400 hover:underline hover:text-red-300 transition-colors cursor-pointer"
                            >
                              {hasBudget ? 'Edit Limit' : '+ Set Budget Limit'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actual vs Budget Spent Row */}
                    <div className="flex items-baseline justify-between text-xs mb-2 gap-2 flex-wrap">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] text-[#777] uppercase font-bold">Actual Spent:</span>
                        <span className={`font-bold ${
                          spendData.isOverThreshold ? 'text-red-400' : 'text-white'
                        }`}>
                          {currencySymbol}{spendData.actualSpent.toLocaleString('en-IN')}
                        </span>
                        {hasBudget && (
                          <span className="text-[10px] text-[#777]">
                            of {currencySymbol}{spendData.budgetLimit.toLocaleString('en-IN')} limit
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] font-bold">
                        {hasBudget ? (
                          spendData.isOverBudget ? (
                            <span className="text-red-400">
                              +{currencySymbol}{spendData.overAmount.toLocaleString('en-IN')} over budget
                            </span>
                          ) : spendData.isOverThreshold ? (
                            <span className="text-red-400 font-bold">
                              Only {currencySymbol}{spendData.remaining.toLocaleString('en-IN')} remaining before limit
                            </span>
                          ) : (
                            <span className="text-emerald-400">
                              {currencySymbol}{spendData.remaining.toLocaleString('en-IN')} remaining
                            </span>
                          )
                        ) : (
                          <span className="text-[#666]">Budget limit not configured</span>
                        )}
                      </div>
                    </div>

                    {/* ==================== VISUAL PROGRESS BAR ==================== */}
                    <div className="relative pt-1 pb-1">
                      {/* 80% Threshold Vertical Marker Line */}
                      {hasBudget && (
                        <div
                          className="absolute top-0 bottom-0 z-20 flex flex-col items-center pointer-events-none"
                          style={{ left: '80%' }}
                        >
                          <span className="text-[8px] font-bold text-red-400 bg-black/90 px-1 py-0.2 rounded border border-red-500/60 -translate-y-1">
                            80% Alert
                          </span>
                          <div className="w-0.5 h-full bg-red-500/90 border-r border-dashed border-red-400" />
                        </div>
                      )}

                      {/* Progress Track */}
                      <div className="w-full h-3 bg-[#0a0a0c] rounded-full overflow-hidden p-0.5 border border-[#2a2a2e] relative z-10">
                        {hasBudget ? (
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              spendData.isOverThreshold
                                ? 'bg-gradient-to-r from-red-600 via-red-500 to-rose-500 shadow-[0_0_12px_rgba(239,68,68,0.7)]'
                                : 'bg-gradient-to-r from-emerald-600 to-teal-500'
                            }`}
                            style={{ width: `${clampedBarWidth}%` }}
                          />
                        ) : (
                          <div className="h-full w-full bg-[#161618] rounded-full border border-dashed border-[#333]" />
                        )}
                      </div>
                    </div>

                    {/* Threshold Explainer Footer */}
                    <div className="flex items-center justify-between text-[9px] text-[#777] mt-2 pt-2 border-t border-[#1f1f23]">
                      <span>
                        {hasBudget ? (
                          spendData.isOverThreshold ? (
                            <span className="text-red-400 font-bold flex items-center gap-1">
                              <span>⚠️ Status: Turned RED as spending crossed the 80% threshold</span>
                            </span>
                          ) : (
                            <span>Status: Normal spending within safe boundary (&lt;80%)</span>
                          )
                        ) : (
                          <span>Assign a monthly limit to enable the visual 80% threshold tracker</span>
                        )}
                      </span>

                      {hasBudget && (
                        <span className="font-bold">
                          {spendData.percent.toFixed(1)}% Used
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* View 2: Categories & Subcategories List with Progress Bars */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['expense', 'income', 'investment'].map((typeKey) => {
            const filteredCats = categories.filter((c) => c.type === typeKey);

            return (
              <div key={typeKey} className="bg-carbon border border-nothing p-5 rounded-3xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-nothing">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    {typeKey} Categories
                  </h3>
                  <span className="text-[10px] text-[#666]">{filteredCats.length} total</span>
                </div>

                <div className="space-y-3">
                  {filteredCats.map((cat) => {
                    const spendData = getCategorySpendData(cat);
                    const hasBudget = cat.type === 'expense' && spendData.budgetLimit > 0;
                    const clampedBarWidth = Math.min(100, Math.max(spendData.actualSpent > 0 ? 2 : 0, spendData.percent));

                    return (
                      <div 
                        key={cat.id} 
                        className={`p-3.5 rounded-2xl border transition-all ${
                          hasBudget && spendData.isOverThreshold
                            ? 'bg-[#191113] border-red-600/70 shadow-sm'
                            : 'bg-obsidian border-nothing'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-bold text-xs text-white">{cat.name}</div>
                          <button
                            onClick={() => onDeleteCategory(cat.id)}
                            className="text-[#666] hover:text-red-500 transition-colors cursor-pointer"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Subcategories Tags */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {cat.subcategories.map((sub, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-[#181818] border border-[#2a2a2a] text-[10px] text-[#aaa] rounded"
                            >
                              {sub}
                            </span>
                          ))}
                        </div>

                        {/* Visual Progress Bar under expense category */}
                        {cat.type === 'expense' && (
                          <div className="mt-3 pt-2.5 border-t border-[#222]/80 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-[#777]">Actual vs Budget:</span>
                              <span className={`font-bold ${
                                spendData.isOverThreshold ? 'text-red-400' : 'text-white'
                              }`}>
                                {hasBudget
                                  ? `${currencySymbol}${spendData.actualSpent.toLocaleString('en-IN')} / ${currencySymbol}${spendData.budgetLimit.toLocaleString('en-IN')}`
                                  : `${currencySymbol}${spendData.actualSpent.toLocaleString('en-IN')} (No limit)`}
                              </span>
                            </div>

                            {/* Progress bar */}
                            {hasBudget ? (
                              <div className="relative">
                                <div className="w-full h-2 bg-[#0d0d0f] rounded-full overflow-hidden p-0.5 border border-[#26262a]">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      spendData.isOverThreshold
                                        ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]'
                                        : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${clampedBarWidth}%` }}
                                  />
                                </div>
                                {spendData.isOverThreshold && (
                                  <div className="text-[9px] text-red-400 font-bold mt-1 flex items-center gap-1">
                                    <span>⚠️ Exceeded 80% threshold ({spendData.percent.toFixed(0)}%)</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('budgets');
                                  setEditingBudgetId(cat.id);
                                }}
                                className="text-[9px] text-red-400 hover:underline cursor-pointer"
                              >
                                + Set Budget Limit
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View 3: Manage Bank & Card Accounts */}
      {activeTab === 'accounts' && (
        <div className="bg-carbon border border-nothing p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-nothing">
            <div>
              <h3 className="text-sm font-bold font-mono text-white uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-red-500" />
                <span>LINKED ACCOUNTS & CREDIT CARDS ({accounts.length})</span>
              </h3>
              <p className="text-[10px] font-mono text-[#777] mt-0.5">
                Customize account details, bank names, last 4 digits, and monthly credit card bill estimates
              </p>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className="p-8 text-center bg-obsidian border border-nothing rounded-2xl">
              <Building2 className="w-8 h-8 text-[#555] mx-auto mb-2" />
              <div className="text-xs font-mono text-[#888]">No linked accounts configured.</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-4 bg-obsidian border border-nothing rounded-2xl flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-red-500 font-bold font-mono text-xs">
                      {acc.bankName.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                        {acc.name}
                        <span className="text-[9px] bg-[#222] text-[#aaa] font-mono px-1.5 py-0.5 rounded">
                          {acc.type}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-[#777] mt-0.5">
                        Bank: {acc.bankName} • Last 4: **{acc.accountNumberLast4}
                      </div>
                      {acc.type === 'Credit Card' && (
                        <div className="text-[10px] font-mono text-amber-400 mt-0.5">
                          Est Monthly Bill: {currencySymbol}{(acc.approxMonthlyBill || acc.balance).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right font-mono">
                      <div className="text-xs font-bold text-emerald-400">
                        {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[9px] text-[#666] uppercase">Balance</div>
                    </div>

                    {onDeleteAccount && (
                      <button
                        type="button"
                        onClick={() => setAccountToDelete(acc)}
                        className="p-2 bg-neutral-900 border border-neutral-800 rounded-xl text-[#777] hover:text-red-400 hover:border-red-600/50 transition-colors cursor-pointer"
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-carbon border border-nothing p-6 rounded-3xl max-w-md w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-nothing">
              <h3 className="text-sm font-bold font-mono text-white uppercase">Add Custom Category</h3>
              <button onClick={() => setShowAddModal(false)} className="text-[#666] hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Category Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCatType('expense')}
                    className={`py-2 text-[11px] font-mono font-bold uppercase rounded-xl ${
                      catType === 'expense' ? 'bg-red-600 text-white' : 'bg-obsidian text-[#777]'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('income')}
                    className={`py-2 text-[11px] font-mono font-bold uppercase rounded-xl ${
                      catType === 'income' ? 'bg-green-600 text-white' : 'bg-obsidian text-[#777]'
                    }`}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('investment')}
                    className={`py-2 text-[11px] font-mono font-bold uppercase rounded-xl ${
                      catType === 'investment' ? 'bg-white text-black' : 'bg-obsidian text-[#777]'
                    }`}
                  >
                    Investment
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Subscriptions or Gaming"
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Subcategories (Comma Separated)
                </label>
                <input
                  type="text"
                  value={subcategoriesInput}
                  onChange={(e) => setSubcategoriesInput(e.target.value)}
                  placeholder="e.g. Food, Fuel, Rent, Netflix"
                  className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                />
              </div>

              {catType === 'expense' && (
                <div>
                  <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                    Monthly Budget Limit ({currencySymbol}) - Optional
                  </label>
                  <input
                    type="number"
                    value={budgetLimitInput}
                    onChange={(e) => setBudgetLimitInput(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full px-3 py-2 bg-obsidian border border-nothing rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-nothing">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-nothing text-[#888] text-xs font-mono rounded-xl hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-white text-black font-mono text-xs font-bold uppercase rounded-xl hover:bg-neutral-200"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Account Confirmation Dialog Modal */}
      <AnimatePresence>
        {accountToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAccountToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#121216] border border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#18181f] border border-[#2d2d35] rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                      Delete Account?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAccountToDelete(null)}
                  className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-[#181820] border border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Account Name:</span>
                    <span className="font-bold text-white max-w-[200px] truncate">
                      {accountToDelete.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Type & Institution:</span>
                    <span className="text-white font-bold">{accountToDelete.type} ({accountToDelete.bankName})</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Account Number:</span>
                    <span className="text-amber-400 font-bold">•••• {accountToDelete.accountNumberLast4}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Current Balance:</span>
                    <span className="font-bold text-emerald-400">
                      {currencySymbol}{accountToDelete.balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-red-950/30 border border-red-900/50 rounded-2xl text-[11px] font-mono text-red-300 leading-relaxed">
                Deleting this account will remove it from your linked accounts and payment methods. Any previous transaction records will be preserved safely.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAccountToDelete(null)}
                  className="px-4 py-2 bg-[#18181f] hover:bg-[#222] border border-[#2d2d35] text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (accountToDelete) {
                      onDeleteAccount?.(accountToDelete.id);
                      setAccountToDelete(null);
                    }
                  }}
                  className="px-5 py-2 text-xs font-mono uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
                >
                  Delete Account
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
