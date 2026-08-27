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
  Building2, 
  CreditCard, 
  Calendar,
  AlertTriangle,
  Flame,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Search,
  Tag,
  Filter,
  Sparkles,
  Layers,
  Wallet,
  Percent,
  PieChart,
  ShoppingBag,
  Car,
  HeartPulse,
  Briefcase,
  Zap,
  Coffee,
  Coins,
  ShieldCheck,
  Code,
  DollarSign,
  ChevronLeft,
  ChevronRight
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
  syncStatus?: { collection: string; success: boolean; error?: string; timestamp: number } | null;
  onForceSyncNow?: () => Promise<{ success: boolean; error?: string }>;
}

// Icon catalog for category selection
const AVAILABLE_ICONS = [
  { name: 'Coffee', icon: Coffee, label: 'Food & Dining' },
  { name: 'Car', icon: Car, label: 'Transport' },
  { name: 'ShoppingBag', icon: ShoppingBag, label: 'Shopping' },
  { name: 'Zap', icon: Zap, label: 'Utilities' },
  { name: 'HeartPulse', icon: HeartPulse, label: 'Health' },
  { name: 'Briefcase', icon: Briefcase, label: 'Salary / Work' },
  { name: 'TrendingUp', icon: TrendingUp, label: 'Investments' },
  { name: 'Coins', icon: Coins, label: 'Crypto & Assets' },
  { name: 'PieChart', icon: PieChart, label: 'Funds' },
  { name: 'Code', icon: Code, label: 'Freelance' },
  { name: 'Tag', icon: Tag, label: 'General' },
  { name: 'CreditCard', icon: CreditCard, label: 'Cards / EMI' },
];

const DEFAULT_SMART_RULES = [
  { id: 'rule_1', keyword: 'swiggy', category: 'Food & Dining', subcategory: 'Delivery' },
  { id: 'rule_2', keyword: 'zomato', category: 'Food & Dining', subcategory: 'Delivery' },
  { id: 'rule_3', keyword: 'uber', category: 'Transport & Fuel', subcategory: 'Cab Services' },
  { id: 'rule_4', keyword: 'ola', category: 'Transport & Fuel', subcategory: 'Cab Services' },
  { id: 'rule_5', keyword: 'netflix', category: 'Subscriptions', subcategory: 'Streaming' },
  { id: 'rule_6', keyword: 'starbucks', category: 'Food & Dining', subcategory: 'Coffee' },
  { id: 'rule_7', keyword: 'petrol', category: 'Transport & Fuel', subcategory: 'Fuel' },
  { id: 'rule_8', keyword: 'salary', category: 'Salary', subcategory: 'Primary Job' },
];

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
  syncStatus,
  onForceSyncNow,
}) => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'budgets' | 'categories' | 'accounts' | 'rules'>('budgets');
  const [isForceSyncing, setIsForceSyncing] = useState<boolean>(false);
  const [forceSyncResult, setForceSyncResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryTypeFilter, setCategoryTypeFilter] = useState<'all' | 'expense' | 'income' | 'investment'>('all');
  const [budgetStatusFilter, setBudgetStatusFilter] = useState<'all' | 'alert' | 'over' | 'safe' | 'nolimit'>('all');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | 'Bank' | 'Credit Card' | 'Wallet/UPI'>('all');

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

  const handlePrevMonth = () => {
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex < availableMonths.length - 1) {
      setSelectedMonth(availableMonths[currentIndex + 1]);
    }
  };

  const handleNextMonth = () => {
    const currentIndex = availableMonths.indexOf(selectedMonth);
    if (currentIndex > 0) {
      setSelectedMonth(availableMonths[currentIndex - 1]);
    }
  };

  // Debit transactions for the selected month
  const monthlyDebitTxs = useMemo(() => {
    return transactions.filter(
      (tx) => tx.type === 'debit' && tx.date && tx.date.startsWith(selectedMonth)
    );
  }, [transactions, selectedMonth]);

  // Helper to compute actual vs budget for a category
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

  // Overall budget metrics
  const budgetSummary = useMemo(() => {
    const expenseCats = categories.filter((c) => c.type === 'expense');
    let totalBudget = 0;
    let totalSpent = 0;
    let overThresholdCount = 0;
    let overBudgetCount = 0;

    expenseCats.forEach((cat) => {
      const data = getCategorySpendData(cat);
      if (data.budgetLimit > 0) {
        totalBudget += data.budgetLimit;
        totalSpent += data.actualSpent;
        if (data.isOverBudget) {
          overBudgetCount++;
        } else if (data.isOverThreshold) {
          overThresholdCount++;
        }
      }
    });

    const remainingBudget = Math.max(0, totalBudget - totalSpent);
    const overallPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    return {
      totalBudget,
      totalSpent,
      remainingBudget,
      overThresholdCount,
      overBudgetCount,
      totalAlerts: overThresholdCount + overBudgetCount,
      overallPercent,
    };
  }, [categories, monthlyDebitTxs]);

  // Inline Budget Editor State
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState<string>('');

  const handleSaveBudgetLimit = (category: Category, customVal?: number) => {
    const val = customVal !== undefined ? customVal : parseFloat(editingBudgetVal);
    if (isNaN(val) || val <= 0) {
      onUpdateCategory({ ...category, budgetLimit: undefined });
    } else {
      onUpdateCategory({ ...category, budgetLimit: val });
    }
    setEditingBudgetId(null);
  };

  const handleQuickBudgetDelta = (category: Category, delta: number) => {
    const current = category.budgetLimit || 0;
    const next = Math.max(0, current + delta);
    handleSaveBudgetLimit(category, next > 0 ? next : undefined);
  };

  // Inline Subcategory Quick Add
  const [addingSubcatForId, setAddingSubcatForId] = useState<string | null>(null);
  const [newSubcatText, setNewSubcatText] = useState<string>('');

  const handleAddSubcategoryInline = (category: Category) => {
    const trimmed = newSubcatText.trim();
    if (!trimmed) return;
    if (category.subcategories.includes(trimmed)) {
      setAddingSubcatForId(null);
      setNewSubcatText('');
      return;
    }
    const updated = {
      ...category,
      subcategories: [...category.subcategories, trimmed],
    };
    onUpdateCategory(updated);
    setAddingSubcatForId(null);
    setNewSubcatText('');
  };

  const handleRemoveSubcategory = (category: Category, subcatToRemove: string) => {
    const remaining = category.subcategories.filter((s) => s !== subcatToRemove);
    onUpdateCategory({
      ...category,
      subcategories: remaining.length > 0 ? remaining : ['General'],
    });
  };

  // Category Modal State (Add / Edit)
  const [showCategoryModal, setShowCategoryModal] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState<string>('');
  const [catType, setCatType] = useState<'income' | 'expense' | 'investment'>('expense');
  const [catIcon, setCatIcon] = useState<string>('Tag');
  const [catSubcategories, setCatSubcategories] = useState<string[]>([]);
  const [subcatTagInput, setSubcatTagInput] = useState<string>('');
  const [catBudgetLimitInput, setCatBudgetLimitInput] = useState<string>('');

  const openAddCategoryModal = () => {
    setEditingCategory(null);
    setCatName('');
    setCatType('expense');
    setCatIcon('Coffee');
    setCatSubcategories(['General']);
    setSubcatTagInput('');
    setCatBudgetLimitInput('');
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (cat: Category) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatType(cat.type);
    setCatIcon(cat.iconName || 'Tag');
    setCatSubcategories(cat.subcategories || ['General']);
    setSubcatTagInput('');
    setCatBudgetLimitInput(cat.budgetLimit ? cat.budgetLimit.toString() : '');
    setShowCategoryModal(true);
  };

  const handleAddTagToModal = () => {
    const trimmed = subcatTagInput.trim();
    if (trimmed && !catSubcategories.includes(trimmed)) {
      setCatSubcategories([...catSubcategories, trimmed]);
      setSubcatTagInput('');
    }
  };

  const handleRemoveTagFromModal = (tagToRemove: string) => {
    setCatSubcategories(catSubcategories.filter((t) => t !== tagToRemove));
  };

  const handleSaveCategoryModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const budget = parseFloat(catBudgetLimitInput);
    const finalSubs = catSubcategories.length > 0 ? catSubcategories : ['General'];

    if (editingCategory) {
      onUpdateCategory({
        ...editingCategory,
        name: catName.trim(),
        type: catType,
        iconName: catIcon,
        subcategories: finalSubs,
        budgetLimit: catType === 'expense' && !isNaN(budget) && budget > 0 ? budget : undefined,
      });
    } else {
      const newCat: Category = {
        id: 'cat_' + Date.now(),
        name: catName.trim(),
        type: catType,
        iconName: catIcon,
        subcategories: finalSubs,
        budgetLimit: catType === 'expense' && !isNaN(budget) && budget > 0 ? budget : undefined,
      };
      onAddCategory(newCat);
    }

    setShowCategoryModal(false);
  };

  // Account Modal State (Add / Edit)
  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);
  const [accName, setAccName] = useState<string>('');
  const [accBankName, setAccBankName] = useState<string>('HDFC');
  const [accType, setAccType] = useState<'Bank' | 'Credit Card' | 'Debit Card' | 'Wallet/UPI'>('Bank');
  const [accLast4, setAccLast4] = useState<string>('');
  const [accBalance, setAccBalance] = useState<string>('');
  const [accCreditLimit, setAccCreditLimit] = useState<string>('');
  const [accMonthlyBill, setAccMonthlyBill] = useState<string>('');
  const [accDueDate, setAccDueDate] = useState<string>('15th');

  const openAddAccountModal = () => {
    setAccName('');
    setAccBankName('HDFC');
    setAccType('Bank');
    setAccLast4('');
    setAccBalance('50000');
    setAccCreditLimit('200000');
    setAccMonthlyBill('15000');
    setAccDueDate('15th');
    setShowAccountModal(true);
  };

  const handleSaveAccountModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim() || !onAddAccount) return;

    const newAcc: FinancialAccount = {
      id: 'acc_' + Date.now(),
      name: accName.trim(),
      bankName: accBankName.trim() || 'Bank',
      type: accType,
      accountNumberLast4: accLast4.trim() || Math.floor(1000 + Math.random() * 9000).toString(),
      balance: parseFloat(accBalance) || 0,
      creditLimit: accType === 'Credit Card' && accCreditLimit ? parseFloat(accCreditLimit) : undefined,
      approxMonthlyBill: accType === 'Credit Card' && accMonthlyBill ? parseFloat(accMonthlyBill) : undefined,
      dueDate: accType === 'Credit Card' ? accDueDate : undefined,
    };

    onAddAccount(newAcc);
    setShowAccountModal(false);
  };

  // Delete Confirmations
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<FinancialAccount | null>(null);

  // Smart Rules State (Local Storage backed)
  const [smartRules, setSmartRules] = useState<Array<{ id: string; keyword: string; category: string; subcategory: string }>>(() => {
    const saved = localStorage.getItem('tmf_smart_rules');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_SMART_RULES;
      }
    }
    return DEFAULT_SMART_RULES;
  });

  const [newRuleKeyword, setNewRuleKeyword] = useState<string>('');
  const [newRuleCategory, setNewRuleCategory] = useState<string>(categories[0]?.name || 'Food & Dining');
  const [newRuleSubcat, setNewRuleSubcat] = useState<string>('General');

  const handleAddSmartRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleKeyword.trim()) return;
    const rule = {
      id: 'rule_' + Date.now(),
      keyword: newRuleKeyword.trim().toLowerCase(),
      category: newRuleCategory,
      subcategory: newRuleSubcat || 'General',
    };
    const updated = [rule, ...smartRules];
    setSmartRules(updated);
    localStorage.setItem('tmf_smart_rules', JSON.stringify(updated));
    setNewRuleKeyword('');
  };

  const handleDeleteSmartRule = (id: string) => {
    const updated = smartRules.filter((r) => r.id !== id);
    setSmartRules(updated);
    localStorage.setItem('tmf_smart_rules', JSON.stringify(updated));
  };

  // Filtered lists
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch =
        searchQuery === '' ||
        cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.subcategories.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType = categoryTypeFilter === 'all' || cat.type === categoryTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [categories, searchQuery, categoryTypeFilter]);

  const filteredBudgetCategories = useMemo(() => {
    return categories
      .filter((c) => c.type === 'expense')
      .filter((cat) => {
        const matchesSearch =
          searchQuery === '' ||
          cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          cat.subcategories.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        const spendData = getCategorySpendData(cat);
        const hasBudget = spendData.budgetLimit > 0;

        if (budgetStatusFilter === 'alert') return hasBudget && spendData.isOverThreshold && !spendData.isOverBudget;
        if (budgetStatusFilter === 'over') return hasBudget && spendData.isOverBudget;
        if (budgetStatusFilter === 'safe') return hasBudget && !spendData.isOverThreshold;
        if (budgetStatusFilter === 'nolimit') return !hasBudget;

        return true;
      });
  }, [categories, searchQuery, budgetStatusFilter, monthlyDebitTxs]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchesSearch =
        searchQuery === '' ||
        acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.bankName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.accountNumberLast4.includes(searchQuery);

      const matchesType = accountTypeFilter === 'all' || acc.type === accountTypeFilter;

      return matchesSearch && matchesType;
    });
  }, [accounts, searchQuery, accountTypeFilter]);

  // Render Category Icon Helper
  const renderCategoryIcon = (iconName?: string) => {
    const found = AVAILABLE_ICONS.find((i) => i.name === iconName);
    const IconComponent = found ? found.icon : Tag;
    return <IconComponent className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6 pb-12 font-mono">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & PRIMARY ACTIONS                                           */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#121217] border border-slate-200 dark:border-[#202028] p-4 sm:p-5 rounded-3xl shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-50 dark:bg-red-950/70 border border-red-200 dark:border-red-800/60 rounded-xl text-red-600 dark:text-red-500">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight uppercase">
                Personalisation &amp; Budgets
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-[#888] mt-0.5">
                Customise spending thresholds, categories, linked accounts, and smart rules
              </p>
            </div>
          </div>
        </div>

        {/* Global Header Actions: Sync Now + Month Navigation + Add Button */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Now */}
          {onForceSyncNow && (
            <button
              type="button"
              disabled={isForceSyncing}
              onClick={async () => {
                setIsForceSyncing(true);
                setForceSyncResult(null);
                const result = await onForceSyncNow();
                setForceSyncResult(result);
                setIsForceSyncing(false);
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-[#181820] hover:bg-slate-200 dark:hover:bg-[#24242e] border border-slate-200 dark:border-[#2a2a34] text-slate-800 dark:text-white font-bold text-xs uppercase rounded-xl transition-all cursor-pointer disabled:opacity-60 shadow-sm"
              title="Synchronize all categories, budgets, and accounts with cloud database"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-red-500 ${isForceSyncing ? 'animate-spin' : ''}`} />
              <span>{isForceSyncing ? 'Syncing...' : 'Sync Now'}</span>
              {syncStatus?.timestamp && (
                <span
                  className={`w-2 h-2 rounded-full ${syncStatus.success ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}
                />
              )}
            </button>
          )}

          {/* Month Selector with Prev/Next Steppers */}
          <div className="flex items-center bg-slate-100 dark:bg-[#181820] border border-slate-200 dark:border-[#2a2a34] rounded-xl p-0.5 text-xs">
            <button
              type="button"
              onClick={handlePrevMonth}
              title="Previous Month"
              className="p-1.5 text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#252530] rounded-lg transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-center gap-1.5 px-2 font-bold text-slate-900 dark:text-white text-xs">
              <Calendar className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-slate-900 dark:text-white text-xs font-mono font-bold focus:outline-none cursor-pointer py-1"
                title="Select month"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m} className="bg-white dark:bg-[#141416] text-slate-900 dark:text-white font-mono">
                    {formatMonthLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              title="Next Month"
              className="p-1.5 text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#252530] rounded-lg transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Contextual Primary Action Button */}
          {activeTab === 'accounts' ? (
            <button
              onClick={openAddAccountModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Account</span>
            </button>
          ) : (
            <button
              onClick={openAddCategoryModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-sm cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Category</span>
            </button>
          )}
        </div>
      </div>

      {/* Sync Status Banner if triggered */}
      {forceSyncResult && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-mono flex items-center justify-between gap-2 shadow-sm ${
            forceSyncResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{forceSyncResult.success ? 'All financial records and personalisation preferences synchronized with Supabase.' : (forceSyncResult.error || 'Sync encountered an issue.')}</span>
          </div>
          <button
            type="button"
            onClick={() => setForceSyncResult(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUB-TAB NAVIGATION SEGMENTED PILLS                                     */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100/90 dark:bg-[#141419] border border-slate-200 dark:border-[#222] rounded-2xl overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setActiveTab('budgets');
            setSearchQuery('');
          }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'budgets'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1e1e26]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Monthly Budgets</span>
          {budgetSummary.totalAlerts > 0 && (
            <span className="px-1.5 py-0.5 bg-white text-red-600 dark:bg-red-950 dark:text-red-400 rounded-full text-[9px] font-bold animate-pulse">
              {budgetSummary.totalAlerts} Alert{budgetSummary.totalAlerts > 1 ? 's' : ''}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('categories');
            setSearchQuery('');
          }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'categories'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1e1e26]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Categories &amp; Tags ({categories.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('accounts');
            setSearchQuery('');
          }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'accounts'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1e1e26]'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Bank &amp; Cards ({accounts.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('rules');
            setSearchQuery('');
          }}
          className={`px-4 py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer flex items-center gap-2 shrink-0 ${
            activeTab === 'rules'
              ? 'bg-red-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-[#1e1e26]'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Smart Rules ({smartRules.length})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3. TAB 1: MONTHLY BUDGETS & SPENDING LIMITS                               */}
      {/* ========================================================================= */}
      {activeTab === 'budgets' && (
        <div className="space-y-5">
          {/* Executive Overview Deck */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-[#222]">
              <div>
                <div className="text-[10px] text-slate-500 dark:text-[#888] uppercase font-bold tracking-wider">
                  Spending Cycle Target
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                  {formatMonthLabel(selectedMonth)} Budget Cockpit
                </h3>
              </div>

              {budgetSummary.totalAlerts > 0 ? (
                <div className="px-3 py-1.5 bg-red-50 dark:bg-red-950/80 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/80 rounded-xl text-xs font-bold flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                  <span>{budgetSummary.totalAlerts} {budgetSummary.totalAlerts === 1 ? 'Category' : 'Categories'} Crossed 80% Threshold</span>
                </div>
              ) : (
                <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/60 rounded-xl text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>All Monitored Spending Healthy (&lt;80%)</span>
                </div>
              )}
            </div>

            {/* 4-Stat Metric Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] p-3.5 rounded-2xl">
                <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Total Budget Tracked</div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {currencySymbol}{budgetSummary.totalBudget.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">Across configured categories</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] p-3.5 rounded-2xl">
                <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Month Debit Outflow</div>
                <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                  {currencySymbol}{budgetSummary.totalSpent.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">Actual debits in {formatMonthLabel(selectedMonth)}</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] p-3.5 rounded-2xl">
                <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Net Remaining Buffer</div>
                <div className={`text-base sm:text-lg font-bold mt-1 ${budgetSummary.remainingBudget === 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {currencySymbol}{budgetSummary.remainingBudget.toLocaleString('en-IN')}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">Safe spending capacity</div>
              </div>

              <div className="bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/80 dark:border-[#222] p-3.5 rounded-2xl">
                <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Overall Utilization</div>
                <div className={`text-base sm:text-lg font-bold mt-1 ${budgetSummary.overallPercent >= 80 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {budgetSummary.overallPercent.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">
                  {budgetSummary.overallPercent >= 100 ? 'Over limit' : budgetSummary.overallPercent >= 80 ? 'In 80% alert zone' : 'Within safe zone'}
                </div>
              </div>
            </div>

            {/* Visual Overall Health Meter */}
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[10px] text-slate-500 dark:text-[#888] uppercase font-bold">Combined Budget Gauge</span>
                <span className="text-[11px] font-bold text-slate-700 dark:text-[#aaa]">
                  {currencySymbol}{budgetSummary.totalSpent.toLocaleString('en-IN')} of {currencySymbol}{budgetSummary.totalBudget.toLocaleString('en-IN')} ({budgetSummary.overallPercent.toFixed(0)}%)
                </span>
              </div>
              <div className="relative w-full h-3 bg-slate-100 dark:bg-[#0d0d12] rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-[#24242d]">
                {/* 80% Marker line */}
                <div className="absolute top-0 bottom-0 z-20 w-0.5 bg-red-500" style={{ left: '80%' }} />
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    budgetSummary.overallPercent >= 80
                      ? 'bg-gradient-to-r from-red-600 to-rose-500 shadow-[0_0_12px_rgba(220,38,38,0.5)]'
                      : 'bg-gradient-to-r from-emerald-600 to-teal-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(budgetSummary.totalSpent > 0 ? 3 : 0, budgetSummary.overallPercent))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search expense category or subcategory..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] rounded-2xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-red-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All Budgets' },
                { id: 'alert', label: '⚠️ 80% Alerts' },
                { id: 'over', label: '🚨 Over Budget' },
                { id: 'safe', label: '✅ Safe' },
                { id: 'nolimit', label: 'No Limit' },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setBudgetStatusFilter(chip.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    budgetStatusFilter === chip.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm'
                      : 'bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* List of Category Budget Cards */}
          <div className="space-y-4">
            {filteredBudgetCategories.length === 0 ? (
              <div className="p-10 text-center bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] rounded-3xl">
                <TrendingUp className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <div className="text-sm font-bold text-slate-700 dark:text-[#aaa]">No budget categories match the filter</div>
                <p className="text-xs text-slate-400 mt-1">Try resetting the search query or setting budget limits</p>
              </div>
            ) : (
              filteredBudgetCategories.map((cat) => {
                const spendData = getCategorySpendData(cat);
                const hasBudget = spendData.budgetLimit > 0;
                const isEditing = editingBudgetId === cat.id;
                const clampedBarWidth = Math.min(100, Math.max(spendData.actualSpent > 0 ? 2 : 0, spendData.percent));

                return (
                  <div
                    key={cat.id}
                    className={`p-4 sm:p-5 rounded-3xl border transition-all ${
                      spendData.isOverBudget
                        ? 'bg-red-50/70 dark:bg-[#1a1114] border-red-300 dark:border-red-600/80 shadow-sm'
                        : spendData.isOverThreshold
                        ? 'bg-amber-50/50 dark:bg-[#191414] border-amber-300 dark:border-amber-600/60 shadow-sm'
                        : 'bg-white dark:bg-[#14141a] border-slate-200 dark:border-[#222] hover:border-slate-300 dark:hover:border-[#333]'
                    }`}
                  >
                    {/* Header: Category Icon, Name, Status Pill & Quick Controls */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2.5 rounded-2xl border ${
                          spendData.isOverBudget
                            ? 'bg-red-100 dark:bg-red-950/80 text-red-600 border-red-300 dark:border-red-700'
                            : spendData.isOverThreshold
                            ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 border-amber-300 dark:border-amber-700'
                            : 'bg-slate-100 dark:bg-[#1c1c24] text-slate-700 dark:text-[#aaa] border-slate-200 dark:border-[#2a2a34]'
                        }`}>
                          {renderCategoryIcon(cat.iconName)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">{cat.name}</span>

                            {/* Status Badges */}
                            {hasBudget ? (
                              spendData.isOverBudget ? (
                                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                  <Flame className="w-3 h-3 text-red-600 dark:text-red-400" />
                                  <span>🚨 {spendData.percent.toFixed(0)}% (OVER BUDGET)</span>
                                </span>
                              ) : spendData.isOverThreshold ? (
                                <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded-lg text-[10px] font-bold flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                                  <span>⚠️ {spendData.percent.toFixed(0)}% (&gt;80% ALERT)</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800 rounded-lg text-[10px] font-bold">
                                  ✅ {spendData.percent.toFixed(0)}% SAFE
                                </span>
                              )
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#1a1a22] text-slate-500 dark:text-[#777] border border-slate-200 dark:border-[#2a2a34] rounded-lg text-[10px] font-bold">
                                NO LIMIT SET
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 dark:text-[#777] mt-1 flex items-center gap-1.5 flex-wrap">
                            <span>{cat.subcategories.join(', ')}</span>
                            <span>•</span>
                            <span className="text-slate-700 dark:text-[#aaa] font-bold">{spendData.txCount} transactions in {formatMonthLabel(selectedMonth)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Budget Edit / Preset Adjusters */}
                      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 bg-white dark:bg-[#101014] border border-red-500 p-1 rounded-xl shadow-sm">
                            <span className="text-xs text-slate-400 pl-1">{currencySymbol}</span>
                            <input
                              type="number"
                              value={editingBudgetVal}
                              onChange={(e) => setEditingBudgetVal(e.target.value)}
                              placeholder="15000"
                              className="px-2 py-1 bg-transparent text-xs font-mono font-bold text-slate-900 dark:text-white w-24 focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveBudgetLimit(cat);
                                if (e.key === 'Escape') setEditingBudgetId(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveBudgetLimit(cat)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer"
                              title="Save Limit"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingBudgetId(null)}
                              className="p-1.5 bg-slate-100 dark:bg-[#222] text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                                {hasBudget
                                  ? `${currencySymbol}${cat.budgetLimit?.toLocaleString('en-IN')}`
                                  : 'No Limit'}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingBudgetId(cat.id);
                                  setEditingBudgetVal(cat.budgetLimit ? cat.budgetLimit.toString() : '');
                                }}
                                className="text-[10px] text-red-600 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1 justify-end"
                              >
                                <Edit3 className="w-2.5 h-2.5" />
                                <span>{hasBudget ? 'Edit Limit' : '+ Set Limit'}</span>
                              </button>
                            </div>

                            {/* Quick Increment/Decrement Buttons */}
                            {hasBudget && (
                              <div className="flex flex-col gap-1 border-l border-slate-200 dark:border-[#2a2a34] pl-2">
                                <button
                                  type="button"
                                  onClick={() => handleQuickBudgetDelta(cat, 1000)}
                                  className="px-1.5 py-0.5 bg-slate-100 dark:bg-[#181822] hover:bg-slate-200 dark:hover:bg-[#222] border border-slate-200 dark:border-[#333] text-[9px] font-bold text-slate-700 dark:text-[#aaa] rounded cursor-pointer"
                                  title="Add +₹1,000 to limit"
                                >
                                  +1k
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleQuickBudgetDelta(cat, -1000)}
                                  className="px-1.5 py-0.5 bg-slate-100 dark:bg-[#181822] hover:bg-slate-200 dark:hover:bg-[#222] border border-slate-200 dark:border-[#333] text-[9px] font-bold text-slate-700 dark:text-[#aaa] rounded cursor-pointer"
                                  title="Subtract -₹1,000 from limit"
                                >
                                  -1k
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Spend Metrics Readout */}
                    <div className="flex items-baseline justify-between text-xs mb-2 gap-2 flex-wrap">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Month Spend:</span>
                        <span className={`font-bold ${spendData.isOverThreshold ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
                          {currencySymbol}{spendData.actualSpent.toLocaleString('en-IN')}
                        </span>
                        {hasBudget && (
                          <span className="text-[10px] text-slate-400 dark:text-[#777]">
                            of {currencySymbol}{spendData.budgetLimit.toLocaleString('en-IN')} target
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-bold">
                        {hasBudget ? (
                          spendData.isOverBudget ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              +{currencySymbol}{spendData.overAmount.toLocaleString('en-IN')} Exceeded
                            </span>
                          ) : spendData.isOverThreshold ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              Only {currencySymbol}{spendData.remaining.toLocaleString('en-IN')} left before limit
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {currencySymbol}{spendData.remaining.toLocaleString('en-IN')} remaining
                            </span>
                          )
                        ) : (
                          <span className="text-slate-400">Target limit not set</span>
                        )}
                      </div>
                    </div>

                    {/* Visual Progress Bar */}
                    <div className="relative pt-1 pb-1">
                      {/* 80% Threshold Vertical Marker */}
                      {hasBudget && (
                        <div
                          className="absolute top-0 bottom-0 z-20 flex flex-col items-center pointer-events-none"
                          style={{ left: '80%' }}
                        >
                          <span className="text-[8px] font-bold text-red-600 dark:text-red-400 bg-white/90 dark:bg-black/90 px-1 py-0.2 rounded border border-red-500/60 -translate-y-1 shadow-sm">
                            80%
                          </span>
                          <div className="w-0.5 h-full bg-red-500 border-r border-dashed border-red-400" />
                        </div>
                      )}

                      {/* Progress Track */}
                      <div className="w-full h-3 bg-slate-100 dark:bg-[#0c0c10] rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-[#282832] relative z-10">
                        {hasBudget ? (
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                              spendData.isOverBudget
                                ? 'bg-gradient-to-r from-red-600 via-rose-500 to-red-500 shadow-sm'
                                : spendData.isOverThreshold
                                ? 'bg-gradient-to-r from-amber-500 to-red-500'
                                : 'bg-gradient-to-r from-emerald-600 to-teal-500'
                            }`}
                            style={{ width: `${clampedBarWidth}%` }}
                          />
                        ) : (
                          <div className="h-full w-full bg-slate-100 dark:bg-[#16161a] rounded-full border border-dashed border-slate-300 dark:border-[#333]" />
                        )}
                      </div>
                    </div>

                    {/* Progress Footer Explainer */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-[#777] mt-2 pt-2 border-t border-slate-100 dark:border-[#1e1e24]">
                      <span>
                        {hasBudget ? (
                          spendData.isOverThreshold ? (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              ⚠️ Warning: Spending exceeded 80% safe quota
                            </span>
                          ) : (
                            <span>Spending is within safe limits (&lt;80%)</span>
                          )
                        ) : (
                          <span>Assign a target limit to activate automatic threshold alerts</span>
                        )}
                      </span>

                      {hasBudget && (
                        <span className="font-bold text-slate-800 dark:text-white">
                          {spendData.percent.toFixed(1)}% Used
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TAB 2: CATEGORIES & SUBCATEGORIES TAXONOMY                             */}
      {/* ========================================================================= */}
      {activeTab === 'categories' && (
        <div className="space-y-5">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search categories or subcategory tags..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] rounded-2xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-red-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Type Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'expense', label: 'Expenses' },
                { id: 'income', label: 'Income' },
                { id: 'investment', label: 'Investments' },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setCategoryTypeFilter(chip.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    categoryTypeFilter === chip.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm'
                      : 'bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Grid of Categories */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCategories.map((cat) => {
              const spendData = getCategorySpendData(cat);
              const isAddingSubcat = addingSubcatForId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-4 sm:p-5 rounded-3xl shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-[#333] transition-colors"
                >
                  <div>
                    {/* Top Row: Icon + Name + Type Badge + Actions */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-slate-100 dark:bg-[#1c1c24] border border-slate-200 dark:border-[#2a2a34] rounded-xl text-red-600 dark:text-red-500">
                          {renderCategoryIcon(cat.iconName)}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white">{cat.name}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md ${
                              cat.type === 'expense'
                                ? 'bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/60'
                                : cat.type === 'income'
                                ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/60'
                                : 'bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/60'
                            }`}>
                              {cat.type}
                            </span>
                            {cat.budgetLimit && (
                              <span className="text-[10px] text-slate-500 dark:text-[#777]">
                                Limit: {currencySymbol}{cat.budgetLimit.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Action Icons */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditCategoryModal(cat)}
                          className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#202028] rounded-lg transition-colors cursor-pointer"
                          title="Edit Category"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoryToDelete(cat)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Subcategory Tags Section with Interactive Chips */}
                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-[#222]">
                      <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-2 flex items-center justify-between">
                        <span>Subcategories ({cat.subcategories.length})</span>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {cat.subcategories.map((sub, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-[#282832] text-slate-700 dark:text-[#ccc] text-[10px] font-mono rounded-xl group"
                          >
                            <span>{sub}</span>
                            {cat.subcategories.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSubcategory(cat, sub)}
                                className="text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                                title={`Remove ${sub}`}
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </span>
                        ))}

                        {/* Inline Tag Adder */}
                        {isAddingSubcat ? (
                          <div className="inline-flex items-center gap-1 bg-white dark:bg-[#101014] border border-red-500 px-2 py-0.5 rounded-xl">
                            <input
                              type="text"
                              value={newSubcatText}
                              onChange={(e) => setNewSubcatText(e.target.value)}
                              placeholder="New tag..."
                              className="w-20 text-[10px] font-mono bg-transparent text-slate-900 dark:text-white focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddSubcategoryInline(cat);
                                if (e.key === 'Escape') setAddingSubcatForId(null);
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleAddSubcategoryInline(cat)}
                              className="text-emerald-600 dark:text-emerald-400 hover:text-emerald-700"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAddingSubcatForId(null)}
                              className="text-slate-400 hover:text-slate-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingSubcatForId(cat.id);
                              setNewSubcatText('');
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-[#1a1a24] hover:bg-slate-200 dark:hover:bg-[#252532] text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white text-[10px] rounded-xl transition-colors cursor-pointer border border-dashed border-slate-300 dark:border-[#333]"
                          >
                            <Plus className="w-2.5 h-2.5" />
                            <span>Add Tag</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expense Progress Footer */}
                  {cat.type === 'expense' && (
                    <div className="pt-2 border-t border-slate-100 dark:border-[#202028] text-[10px] text-slate-500 dark:text-[#777] flex items-center justify-between">
                      <span>Spent this month:</span>
                      <span className="font-bold text-slate-800 dark:text-white">
                        {currencySymbol}{spendData.actualSpent.toLocaleString('en-IN')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TAB 3: BANK & CARD ACCOUNTS MANAGER                                    */}
      {/* ========================================================================= */}
      {activeTab === 'accounts' && (
        <div className="space-y-5">
          {/* Executive Accounts Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-4 rounded-3xl shadow-sm">
              <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Total Liquid Balances</div>
              <div className="text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {currencySymbol}
                {accounts
                  .filter((a) => a.type === 'Bank' || a.type === 'Wallet/UPI')
                  .reduce((sum, a) => sum + (a.balance || 0), 0)
                  .toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">Across bank &amp; wallet accounts</div>
            </div>

            <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-4 rounded-3xl shadow-sm">
              <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Credit Card Outstanding</div>
              <div className="text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
                {currencySymbol}
                {accounts
                  .filter((a) => a.type === 'Credit Card')
                  .reduce((sum, a) => sum + (a.balance || 0), 0)
                  .toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">Estimated bill dues</div>
            </div>

            <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-4 rounded-3xl shadow-sm">
              <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Total Linked Accounts</div>
              <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                {accounts.length} Accounts
              </div>
              <div className="text-[10px] text-slate-400 dark:text-[#666] mt-0.5">Active payment methods</div>
            </div>
          </div>

          {/* Account Type Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search account name, bank or last 4 digits..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] rounded-2xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'Bank', label: 'Bank A/c' },
                { id: 'Credit Card', label: 'Credit Cards' },
                { id: 'Wallet/UPI', label: 'Wallets & UPI' },
              ].map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setAccountTypeFilter(chip.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                    accountTypeFilter === chip.id
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-black shadow-sm'
                      : 'bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Account Cards Grid */}
          {filteredAccounts.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] rounded-3xl">
              <Building2 className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700 dark:text-[#aaa]">No accounts found</div>
              <p className="text-xs text-slate-400 mt-1">Add a new bank or card account to start tracking</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredAccounts.map((acc) => (
                <div
                  key={acc.id}
                  className="p-4 sm:p-5 bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] rounded-3xl shadow-sm flex flex-col justify-between space-y-4 hover:border-slate-300 dark:hover:border-[#333] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 bg-slate-100 dark:bg-[#1b1b22] border border-slate-200 dark:border-[#282834] rounded-2xl flex items-center justify-center text-red-600 dark:text-red-500 font-black text-xs font-mono shadow-sm">
                        {acc.bankName.slice(0, 3).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                          <span>{acc.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-[#777] mt-0.5">
                          {acc.bankName} • <span className="text-amber-600 dark:text-amber-400 font-bold">•••• {acc.accountNumberLast4}</span>
                        </div>
                      </div>
                    </div>

                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#1c1c24] text-slate-700 dark:text-[#aaa] border border-slate-200 dark:border-[#2a2a34] rounded-lg text-[10px] font-bold">
                      {acc.type}
                    </span>
                  </div>

                  {/* Account Balance / Bill Details */}
                  <div className="p-3 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200/70 dark:border-[#222] rounded-2xl flex items-center justify-between">
                    <div>
                      <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">
                        {acc.type === 'Credit Card' ? 'Current Outflow / Bill' : 'Available Balance'}
                      </div>
                      <div className={`text-base font-bold mt-0.5 ${
                        acc.type === 'Credit Card' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      }`}>
                        {currencySymbol}{acc.balance.toLocaleString('en-IN')}
                      </div>
                    </div>

                    {acc.type === 'Credit Card' && (
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold">Due Date</div>
                        <div className="text-xs font-bold text-slate-800 dark:text-white mt-0.5">
                          {acc.dueDate || '15th'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#202028]">
                    <span className="text-[10px] text-slate-400">ID: {acc.id}</span>
                    {onDeleteAccount && (
                      <button
                        type="button"
                        onClick={() => setAccountToDelete(acc)}
                        className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. TAB 4: SMART AUTO-CATEGORISATION RULES                                 */}
      {/* ========================================================================= */}
      {activeTab === 'rules' && (
        <div className="space-y-5">
          {/* Rules Explainer Header */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-5 sm:p-6 rounded-3xl shadow-sm space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white uppercase">
                  Personalised Smart Auto-Categorisation
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#888] mt-0.5">
                  When SMS or UPI transactions mention any of these keywords, TMF automatically categorises them accurately
                </p>
              </div>
            </div>

            {/* Quick Add Rule Form */}
            <form onSubmit={handleAddSmartRule} className="pt-3 border-t border-slate-100 dark:border-[#222] grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Merchant / Keyword
                </label>
                <input
                  type="text"
                  required
                  value={newRuleKeyword}
                  onChange={(e) => setNewRuleKeyword(e.target.value)}
                  placeholder="e.g. apple or blinkit"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282830] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Target Category
                </label>
                <select
                  value={newRuleCategory}
                  onChange={(e) => {
                    setNewRuleCategory(e.target.value);
                    const found = categories.find((c) => c.name === e.target.value);
                    if (found && found.subcategories.length > 0) {
                      setNewRuleSubcat(found.subcategories[0]);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282830] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none cursor-pointer"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} className="bg-white dark:bg-[#141416] text-slate-900 dark:text-white">
                      {c.name} ({c.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Subcategory
                </label>
                <input
                  type="text"
                  value={newRuleSubcat}
                  onChange={(e) => setNewRuleSubcat(e.target.value)}
                  placeholder="e.g. Groceries"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282830] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="sm:col-span-1 flex items-end">
                <button
                  type="submit"
                  className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Rule</span>
                </button>
              </div>
            </form>
          </div>

          {/* Rules List */}
          <div className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-4 sm:p-5 rounded-3xl shadow-sm space-y-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white uppercase pb-2 border-b border-slate-100 dark:border-[#222] flex items-center justify-between">
              <span>Active Keywords &amp; Mappings</span>
              <span className="text-[10px] text-slate-400">{smartRules.length} rules</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-[#202028]">
              {smartRules.map((rule) => (
                <div key={rule.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="px-2.5 py-1 bg-slate-100 dark:bg-[#1c1c24] border border-slate-200 dark:border-[#2a2a34] rounded-lg text-xs font-bold text-red-600 dark:text-red-400">
                      "{rule.keyword}"
                    </span>
                    <span className="text-slate-400 text-xs">→</span>
                    <span className="font-bold text-xs text-slate-900 dark:text-white">{rule.category}</span>
                    <span className="text-slate-400 text-[10px]">({rule.subcategory})</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSmartRule(rule.id)}
                    className="text-slate-400 hover:text-red-600 p-1.5 transition-colors cursor-pointer"
                    title="Delete Rule"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. ADD / EDIT CATEGORY MODAL                                              */}
      {/* ========================================================================= */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-[#222]">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <Tag className="w-4 h-4 text-red-500" />
                <span>{editingCategory ? 'Edit Category' : 'Create Custom Category'}</span>
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategoryModal} className="space-y-4">
              {/* Type Switcher */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Category Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCatType('expense')}
                    className={`py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
                      catType === 'expense' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-[#181820] text-slate-600 dark:text-[#888]'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('income')}
                    className={`py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
                      catType === 'income' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-[#181820] text-slate-600 dark:text-[#888]'
                    }`}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setCatType('investment')}
                    className={`py-2 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer ${
                      catType === 'investment' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-[#181820] text-slate-600 dark:text-[#888]'
                    }`}
                  >
                    Investment
                  </button>
                </div>
              </div>

              {/* Category Name */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Category Name
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Subscriptions or Gaming"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Icon Selector */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1.5">
                  Visual Icon
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVAILABLE_ICONS.map((item) => {
                    const IconComp = item.icon;
                    const isSelected = catIcon === item.name;
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => setCatIcon(item.name)}
                        title={item.label}
                        className={`p-2.5 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-red-600 text-white border-red-600 shadow-sm'
                            : 'bg-slate-50 dark:bg-[#16161e] border-slate-200 dark:border-[#282832] text-slate-700 dark:text-[#aaa] hover:border-slate-400'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Subcategories Tag Builder */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Subcategories (Press Enter to Add Tag)
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={subcatTagInput}
                    onChange={(e) => setSubcatTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddTagToModal();
                      }
                    }}
                    placeholder="Type tag and press Add..."
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddTagToModal}
                    className="px-3 py-2 bg-slate-200 dark:bg-[#20202a] hover:bg-slate-300 dark:hover:bg-[#2a2a38] text-slate-800 dark:text-white text-xs font-bold rounded-xl cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl">
                  {catSubcategories.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-white dark:bg-[#1a1a24] border border-slate-200 dark:border-[#333] text-slate-800 dark:text-[#ccc] text-[10px] rounded-lg"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTagFromModal(tag)}
                        className="text-slate-400 hover:text-red-500 cursor-pointer"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Monthly Budget Target (if Expense) */}
              {catType === 'expense' && (
                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                    Monthly Target Budget ({currencySymbol}) - Optional
                  </label>
                  <input
                    type="number"
                    value={catBudgetLimitInput}
                    onChange={(e) => setCatBudgetLimitInput(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                  <div className="text-[10px] text-slate-400 mt-1">
                    Automatic 80% threshold alerts will trigger when spending crosses 80% of this value.
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#222]">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-[#2a2a34] text-slate-600 dark:text-[#888] text-xs rounded-xl hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  {editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. ADD ACCOUNT MODAL                                                      */}
      {/* ========================================================================= */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-[#14141a] border border-slate-200 dark:border-[#222] p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-[#222]">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
                <Building2 className="w-4 h-4 text-red-500" />
                <span>Link New Financial Account</span>
              </h3>
              <button
                onClick={() => setShowAccountModal(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccountModal} className="space-y-4">
              {/* Account Type */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Account Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'Bank', label: 'Savings/Bank A/c' },
                    { id: 'Credit Card', label: 'Credit Card' },
                    { id: 'Wallet/UPI', label: 'Digital Wallet' },
                    { id: 'Debit Card', label: 'Debit Card' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setAccType(t.id as any)}
                      className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                        accType === t.id
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-slate-100 dark:bg-[#181820] text-slate-600 dark:text-[#888]'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Nickname */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Account Nickname
                </label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="e.g. HDFC Salary Account or Amazon Pay ICICI"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Bank Name */}
              <div>
                <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                  Bank / Provider Name
                </label>
                <input
                  type="text"
                  required
                  value={accBankName}
                  onChange={(e) => setAccBankName(e.target.value)}
                  placeholder="e.g. HDFC, SBI, Kotak, ICICI, Paytm"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Last 4 Digits & Balance */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                    Last 4 Digits
                  </label>
                  <input
                    type="text"
                    maxLength={4}
                    value={accLast4}
                    onChange={(e) => setAccLast4(e.target.value)}
                    placeholder="4666"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                    {accType === 'Credit Card' ? 'Current Dues' : 'Balance'} ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value)}
                    placeholder="50000"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* Credit Card Specific Fields */}
              {accType === 'Credit Card' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                      Credit Limit ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      value={accCreditLimit}
                      onChange={(e) => setAccCreditLimit(e.target.value)}
                      placeholder="200000"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-500 dark:text-[#777] uppercase font-bold mb-1">
                      Billing Due Date
                    </label>
                    <input
                      type="text"
                      value={accDueDate}
                      onChange={(e) => setAccDueDate(e.target.value)}
                      placeholder="15th"
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0e0e14] border border-slate-200 dark:border-[#282832] rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-[#222]">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-[#2a2a34] text-slate-600 dark:text-[#888] text-xs rounded-xl hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-sm cursor-pointer"
                >
                  Link Account
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. DELETE CONFIRMATION DIALOGS                                            */}
      {/* ========================================================================= */}
      {/* Category Deletion Dialog */}
      <AnimatePresence>
        {categoryToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCategoryToDelete(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative z-10 w-full max-w-md bg-white dark:bg-[#121216] border border-slate-200 dark:border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-50 dark:bg-[#18181f] border border-red-200 dark:border-[#2d2d35] rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white uppercase">
                      Delete Category?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCategoryToDelete(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-[#26262f] rounded-2xl space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-[#666]">Category:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{categoryToDelete.name}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-[#666]">Type:</span>
                  <span className="font-bold uppercase text-slate-900 dark:text-white">{categoryToDelete.type}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-[#666]">Subcategories:</span>
                  <span className="text-slate-700 dark:text-[#ccc] truncate max-w-[200px]">
                    {categoryToDelete.subcategories.join(', ')}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCategoryToDelete(null)}
                  className="px-4 py-2 border border-slate-200 dark:border-[#2a2a34] text-xs font-bold rounded-xl text-slate-600 dark:text-[#888] hover:text-slate-900 dark:hover:text-white cursor-pointer uppercase"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteCategory(categoryToDelete.id);
                    setCategoryToDelete(null);
                  }}
                  className="px-5 py-2 text-xs uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm transition-all cursor-pointer"
                >
                  Delete Category
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Account Deletion Dialog */}
      <AnimatePresence>
        {accountToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAccountToDelete(null)}
              className="absolute inset-0 bg-black/75 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              className="relative z-10 w-full max-w-md bg-white dark:bg-[#121216] border border-slate-200 dark:border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-50 dark:bg-[#18181f] border border-red-200 dark:border-[#2d2d35] rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-wide uppercase">
                      Delete Account?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAccountToDelete(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-[#181820] border border-slate-200 dark:border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-[#666]">Account Name:</span>
                    <span className="font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
                      {accountToDelete.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-[#666]">Type &amp; Institution:</span>
                    <span className="text-slate-900 dark:text-white font-bold">{accountToDelete.type} ({accountToDelete.bankName})</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-[#666]">Account Number:</span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold">•••• {accountToDelete.accountNumberLast4}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-[#666]">Current Balance:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {currencySymbol}{accountToDelete.balance.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl text-[11px] font-mono text-red-700 dark:text-red-300 leading-relaxed">
                Deleting this account will remove it from your linked accounts and payment methods. Any previous transaction records will be preserved safely.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAccountToDelete(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-[#18181f] hover:bg-slate-200 dark:hover:bg-[#222] border border-slate-200 dark:border-[#2d2d35] text-xs font-mono text-slate-700 dark:text-[#888] hover:text-slate-900 dark:hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
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
                  className="px-5 py-2 text-xs font-mono uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm transition-all cursor-pointer"
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
