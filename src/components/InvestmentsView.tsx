import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { InvestmentRecord, InvestmentType, Transaction, UserSettings } from '../types/finance';
import {
  TrendingUp,
  Plus,
  BarChart2,
  PieChart as PieIcon,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Calendar,
  Wallet,
  Layers,
  Search,
  Table as TableIcon,
  LayoutList,
  MoreVertical,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  AlertTriangle
} from 'lucide-react';
import { EmptyState } from './EmptyState';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface InvestmentsViewProps {
  investments: InvestmentRecord[];
  transactions?: Transaction[];
  onAddInvestment: (inv: InvestmentRecord) => void;
  onUpdateInvestment?: (inv: InvestmentRecord) => void;
  onDeleteInvestment?: (id: string) => void;
  onEditTransaction?: (tx: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  currencySymbol: string;
  settings: UserSettings;
  onUpdateSettings: (newSettings: UserSettings) => void;
}

interface InvestmentTxn {
  id: string;
  date: string;
  category: string;
  account: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
}

const PALETTE = ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6'];

export const InvestmentsView: React.FC<InvestmentsViewProps> = ({
  investments,
  transactions = [],
  onAddInvestment,
  onUpdateInvestment,
  onDeleteInvestment,
  onEditTransaction,
  onDeleteTransaction,
  currencySymbol,
  settings,
  onUpdateSettings,
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingInv, setEditingInv] = useState<InvestmentRecord | null>(null);

  // Deletion modal state
  const [txnToDelete, setTxnToDelete] = useState<InvestmentTxn | null>(null);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; name: string; type: string; amount: number } | null>(null);
  const [doNotAskAgainChecked, setDoNotAskAgainChecked] = useState<boolean>(false);

  // Collapsible filter state
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState<boolean>(false);
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [isKpiStacked, setIsKpiStacked] = useState<boolean>(true);
  const [touchStartY, setTouchStartY] = useState<number | null>(null);
  const [showCurrentValue, setShowCurrentValue] = useState<boolean>(true);
  const [showInvestedCapital, setShowInvestedCapital] = useState<boolean>(true);
  const [showTotalProfit, setShowTotalProfit] = useState<boolean>(true);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartY;
    if (diffY > 25) {
      // Swiped down -> Expand vertically
      setIsKpiStacked(false);
    } else if (diffY < -25) {
      // Swiped up -> Stack vertically with overlap
      setIsKpiStacked(true);
    }
    setTouchStartY(null);
  };
  const [viewMode, setViewMode] = useState<'table' | 'detail'>('table');
  const [selectedMonth, setSelectedMonth] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [selectedAccount, setSelectedAccount] = useState<string>('All Accounts');
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Auto-collapse when user scrolls down
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

  // Form state
  const [name, setName] = useState<string>('');
  const [type, setType] = useState<InvestmentType>('Mutual Funds');
  const [amountInvested, setAmountInvested] = useState<string>('');
  const [currentValue, setCurrentValue] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedMonth !== 'All') count++;
    if (selectedCategory !== 'All Categories') count++;
    if (selectedAccount !== 'All Accounts') count++;
    if (selectedType !== 'All') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [selectedMonth, selectedCategory, selectedAccount, selectedType, searchQuery]);

  // Derive investment transaction history dynamically from real transactions & investment records
  const investmentTransactions: InvestmentTxn[] = useMemo(() => {
    const fromTx: InvestmentTxn[] = transactions
      .filter((t) => {
        const cat = (t.category || '').toLowerCase();
        const sub = (t.subcategory || '').toLowerCase();
        const title = (t.title || '').toLowerCase();
        return (
          cat.includes('invest') ||
          cat.includes('sip') ||
          cat.includes('stock') ||
          cat.includes('fund') ||
          cat.includes('crypto') ||
          cat.includes('gold') ||
          sub.includes('invest') ||
          sub.includes('sip') ||
          title.includes('sip') ||
          title.includes('mutual') ||
          title.includes('groww') ||
          title.includes('zerodha') ||
          title.includes('coin')
        );
      })
      .map((t) => ({
        id: t.id,
        date: t.date,
        category: t.category || 'Investment',
        account: t.paymentMethod || t.source || 'Account',
        type: (t.type === 'credit' ? 'CREDIT' : 'DEBIT') as 'DEBIT' | 'CREDIT',
        amount: t.amount,
      }));

    if (fromTx.length > 0) {
      return fromTx.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // Fallback: derive transactions from investment records so the ledger is never blank if investments exist
    const fromInv: InvestmentTxn[] = [];
    investments.forEach((inv) => {
      fromInv.push({
        id: `tx_${inv.id}_initial`,
        date: inv.date || new Date().toISOString().slice(0, 10),
        category: inv.name,
        account: inv.type,
        type: 'DEBIT',
        amount: inv.amountInvested,
      });

      if (inv.monthlyContributions) {
        inv.monthlyContributions.forEach((mc, idx) => {
          fromInv.push({
            id: `tx_${inv.id}_mc_${idx}`,
            date: `${mc.month}-01`,
            category: `${inv.name} (SIP)`,
            account: inv.type,
            type: 'DEBIT',
            amount: mc.amount,
          });
        });
      }
    });

    return fromInv.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, investments]);

  // Unique categories and accounts for filter dropdowns
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    investmentTransactions.forEach((t) => set.add(t.category));
    investments.forEach((i) => set.add(i.type));
    return Array.from(set);
  }, [investmentTransactions, investments]);

  const availableAccounts = useMemo(() => {
    const set = new Set<string>();
    investmentTransactions.forEach((t) => set.add(t.account));
    return Array.from(set);
  }, [investmentTransactions]);

  // Filter transactions according to selected filters
  const filteredTxns = useMemo(() => {
    return investmentTransactions.filter((tx) => {
      if (selectedMonth !== 'All' && !tx.date.startsWith(selectedMonth)) return false;
      if (selectedCategory !== 'All Categories' && tx.category !== selectedCategory) return false;
      if (selectedAccount !== 'All Accounts' && tx.account !== selectedAccount) return false;
      if (selectedType !== 'All' && tx.type !== selectedType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !tx.category.toLowerCase().includes(q) &&
          !tx.account.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [investmentTransactions, selectedMonth, selectedCategory, selectedAccount, selectedType, searchQuery]);

  // Calculations for summary KPI
  const totalDebit = useMemo(() => {
    return filteredTxns
      .filter((t) => t.type === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTxns]);

  const totalCredit = useMemo(() => {
    return filteredTxns
      .filter((t) => t.type === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);
  }, [filteredTxns]);

  const totalInvestmentAmount = Math.round((totalDebit - totalCredit) * 100) / 100;

  // Dynamic Trend data for Line Chart
  const trendData = useMemo(() => {
    if (filteredTxns.length === 0) {
      return [
        { date: 'Start', amount: 0 },
        { date: 'Current', amount: 0 },
      ];
    }

    const sortedAsc = [...filteredTxns].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let runningTotal = 0;
    const points: { date: string; amount: number }[] = [];

    sortedAsc.forEach((tx) => {
      runningTotal += tx.type === 'DEBIT' ? tx.amount : -tx.amount;
      const d = new Date(tx.date);
      const dateLabel = isNaN(d.getTime())
        ? tx.date
        : d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
      points.push({ date: dateLabel, amount: Math.max(0, Math.round(runningTotal * 100) / 100) });
    });

    return points;
  }, [filteredTxns]);

  // Dynamic Pie chart data by Category or Type
  const pieData = useMemo(() => {
    if (investments.length > 0) {
      const typeMap: { [key: string]: number } = {};
      investments.forEach((inv) => {
        typeMap[inv.type] = (typeMap[inv.type] || 0) + inv.currentValue;
      });
      return Object.entries(typeMap).map(([name, value], idx) => ({
        name,
        value: Math.round(value * 100) / 100,
        color: PALETTE[idx % PALETTE.length],
      }));
    }

    if (filteredTxns.length > 0) {
      const catMap: { [key: string]: number } = {};
      filteredTxns.forEach((tx) => {
        catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
      });
      return Object.entries(catMap).map(([name, value], idx) => ({
        name,
        value: Math.round(value * 100) / 100,
        color: PALETTE[idx % PALETTE.length],
      }));
    }

    return [{ name: 'No Assets', value: 1, color: '#333' }];
  }, [investments, filteredTxns]);

  // Overall Portfolio calculations
  const totalInvestedCapital = Math.round(investments.reduce((sum, i) => sum + i.amountInvested, 0) * 100) / 100;
  const totalCurrentValue = Math.round(investments.reduce((sum, i) => sum + i.currentValue, 0) * 100) / 100;
  const totalProfit = Math.round((totalCurrentValue - totalInvestedCapital) * 100) / 100;
  const overallReturnPercent =
    totalInvestedCapital > 0
      ? (((totalCurrentValue - totalInvestedCapital) / totalInvestedCapital) * 100).toFixed(2)
      : '0.00';

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  };

  const handleOpenEditModal = (inv: InvestmentRecord) => {
    setEditingInv(inv);
    setName(inv.name);
    setType(inv.type);
    setAmountInvested(inv.amountInvested.toString());
    setCurrentValue(inv.currentValue.toString());
    setNotes(inv.notes || '');
    setShowAddModal(true);
  };

  const handleSaveInvestment = (e: React.FormEvent) => {
    e.preventDefault();
    const numInv = parseFloat(amountInvested);
    const numVal = parseFloat(currentValue) || numInv;

    if (isNaN(numInv) || numInv <= 0) return;

    const returnPct = parseFloat((((numVal - numInv) / numInv) * 100).toFixed(2));

    if (editingInv && onUpdateInvestment) {
      onUpdateInvestment({
        ...editingInv,
        name: name.trim() || 'Investment',
        type,
        amountInvested: numInv,
        currentValue: numVal,
        returnsPercent: returnPct,
        notes: notes.trim(),
      });
    } else {
      const newInv: InvestmentRecord = {
        id: 'inv_' + Date.now(),
        name: name.trim() || 'New Investment',
        type,
        amountInvested: numInv,
        currentValue: numVal,
        returnsPercent: returnPct,
        date: new Date().toISOString().slice(0, 10),
        monthlyContributions: [
          { month: new Date().toISOString().slice(0, 7), amount: numInv },
        ],
        notes: notes.trim(),
      };
      onAddInvestment(newInv);
    }

    setShowAddModal(false);
    setEditingInv(null);
    setName('');
    setAmountInvested('');
    setCurrentValue('');
    setNotes('');
  };

  const handleDeleteInv = (id: string, name: string, type: string, amount: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (settings.skipInvestmentDeleteConfirmation) {
      onDeleteInvestment?.(id);
    } else {
      setAssetToDelete({ id, name, type, amount });
      setDoNotAskAgainChecked(false);
    }
  };

  const handleConfirmDeleteAsset = () => {
    if (!assetToDelete) return;
    if (doNotAskAgainChecked) {
      onUpdateSettings({
        ...settings,
        skipInvestmentDeleteConfirmation: true,
      });
    }
    onDeleteInvestment?.(assetToDelete.id);
    setAssetToDelete(null);
  };

  const handleEditTxn = (tx: InvestmentTxn) => {
    const realTx = transactions.find((t) => t.id === tx.id);
    if (realTx && onEditTransaction) {
      onEditTransaction(realTx);
      return;
    }
    const inv = investments.find((i) => tx.id.startsWith(`tx_${i.id}`) || i.id === tx.id || i.name === tx.category);
    if (inv) {
      handleOpenEditModal(inv);
      return;
    }
    if (onEditTransaction) {
      onEditTransaction({
        id: tx.id,
        date: tx.date,
        title: tx.category,
        amount: tx.amount,
        type: tx.type === 'CREDIT' ? 'credit' : 'debit',
        category: 'Investment',
        paymentMethod: tx.account,
        source: 'MANUAL',
      });
    }
  };

  const performDeleteTxn = (tx: InvestmentTxn) => {
    const realTx = transactions.find((t) => t.id === tx.id);
    if (realTx && onDeleteTransaction) {
      onDeleteTransaction(realTx.id);
      return;
    }
    const inv = investments.find((i) => tx.id.startsWith(`tx_${i.id}`) || i.id === tx.id || i.name === tx.category);
    if (inv && onDeleteInvestment) {
      onDeleteInvestment(inv.id);
      return;
    }
    if (onDeleteTransaction) {
      onDeleteTransaction(tx.id);
    }
  };

  const handleDeleteTxn = (tx: InvestmentTxn) => {
    if (settings.skipDeleteConfirmation) {
      performDeleteTxn(tx);
    } else {
      setTxnToDelete(tx);
      setDoNotAskAgainChecked(false);
    }
  };

  const handleConfirmDeleteTxn = () => {
    if (!txnToDelete) return;
    if (doNotAskAgainChecked) {
      onUpdateSettings({
        ...settings,
        skipDeleteConfirmation: true,
      });
    }
    performDeleteTxn(txnToDelete);
    setTxnToDelete(null);
  };

  return (
    <div className="space-y-6 pb-16 font-mono text-white relative">
      {/* Backdrop overlay for click-outside auto-collapsing filters or menus */}
      {(isFilterOpen || showThreeDotMenu) && (
        <div
          className="fixed inset-0 z-20 pointer-events-auto cursor-default"
          onClick={() => {
            setIsFilterOpen(false);
            setShowThreeDotMenu(false);
          }}
        />
      )}

      {/* ==================== TOP BAR: TITLE, SEARCH, FILTER ICON & THREE DOT MENU ==================== */}
      <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-[#222] relative z-30">
        {isSearchExpanded ? (
          /* Search Bar overlapping Page Title */
          <div className="flex-1 relative min-w-0 mr-1 animate-in fade-in duration-200">
            <Search className="w-3.5 h-3.5 text-red-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search investment transactions or accounts..."
              className="w-full bg-[#111111] border border-red-500/60 rounded-xl py-1.5 pl-8 pr-7 text-xs font-mono text-white placeholder-[#666] focus:outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={() => {
                setIsSearchExpanded(false);
                setSearchQuery('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#777] hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* Standard Header Title */
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse shrink-0" />
            <h1 className="text-sm font-bold tracking-wider uppercase text-white truncate">
              INVESTMENTS & SIPs
            </h1>
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isSearchExpanded && (
            <button
              type="button"
              onClick={() => setIsSearchExpanded(true)}
              className="p-1.5 bg-[#111111] hover:bg-[#1a1a1a] border border-[#222] hover:border-[#444] rounded-lg text-[#aaa] hover:text-white transition-colors cursor-pointer"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          )}

          {/* Filter Toggle Button */}
          <button
            type="button"
            onClick={() => {
              setIsFilterOpen(!isFilterOpen);
              setShowThreeDotMenu(false);
            }}
            className={`p-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFilterOpen || activeFilterCount > 0
                ? 'bg-red-950/40 border-red-500 text-red-400'
                : 'bg-[#111111] hover:bg-[#1a1a1a] border-[#222] hover:border-[#444] text-[#aaa] hover:text-white'
            }`}
            title="Filter Investments"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[9px] font-bold flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Add Investment Button */}
          <button
            type="button"
            onClick={() => {
              setEditingInv(null);
              setName('');
              setAmountInvested('');
              setCurrentValue('');
              setNotes('');
              setShowAddModal(true);
            }}
            className="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ADD</span>
          </button>
        </div>
      </div>

      {/* ==================== COLLAPSIBLE FILTER PANEL ==================== */}
      {isFilterOpen && (
        <div className="bg-[#111111] border border-[#222] p-4 rounded-2xl space-y-3 z-30 relative animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
          <div className="flex items-center justify-between text-xs font-mono text-[#888] pb-1 border-b border-[#222]">
            <span className="font-bold uppercase tracking-wider text-white">FILTER INVESTMENTS</span>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="text-[#666] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                MONTH / YEAR
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All">All Months</option>
                <option value="2026-08">Aug 2026</option>
                <option value="2026-07">Jul 2026</option>
                <option value="2026-06">Jun 2026</option>
                <option value="2026-05">May 2026</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                CATEGORY
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All Categories">All Categories</option>
                {availableCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                ACCOUNT
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All Accounts">All Accounts</option>
                {availableAccounts.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-[#777] uppercase tracking-wider mb-1">
                TYPE
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full px-3 py-2 bg-[#0a0a0a] border border-[#222] rounded-xl text-xs font-mono text-white focus:outline-none focus:border-red-600"
              >
                <option value="All">All</option>
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">CREDIT</option>
              </select>
            </div>
          </div>

          {/* Reset Filter Button */}
          {activeFilterCount > 0 && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth('All');
                  setSelectedCategory('All Categories');
                  setSelectedAccount('All Accounts');
                  setSelectedType('All');
                  setSearchQuery('');
                }}
                className="text-[10px] font-mono uppercase text-red-400 hover:underline"
              >
                RESET FILTERS
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== EMPTY STATE IF NO INVESTMENTS ==================== */}
      {investments.length === 0 && (
        <EmptyState
          icon={TrendingUp}
          title="No Investments Logged"
          description="Track your mutual funds, equities, crypto, and fixed deposits in real time."
          actionLabel="Add Investment"
          onAction={() => setShowAddModal(true)}
        />
      )}

      {/* ==================== PORTFOLIO SUMMARY & ASSETS ==================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-[#888]">
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-red-500" />
            <span className="uppercase font-bold tracking-wider text-slate-900 dark:text-white">PORTFOLIO SUMMARY & ASSETS</span>
          </div>
          <button
            type="button"
            onClick={() => setIsKpiStacked(!isKpiStacked)}
            className="p-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#1a1a1a] dark:hover:bg-[#222] border border-slate-200 dark:border-[#333] hover:border-red-500 rounded-lg text-slate-700 dark:text-white transition-colors cursor-pointer flex items-center justify-center shadow-sm"
            title={isKpiStacked ? "Expand Metrics" : "Collapse Metrics"}
          >
            {isKpiStacked ? (
              <ChevronDown className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
            )}
          </button>
        </div>

        {/* Vertical Stack / Expanded Container with Touch Swipe Support */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className={`transition-all duration-300 ease-in-out ${
            isKpiStacked
              ? 'space-y-[-50px] sm:space-y-[-54px] pt-1 pb-2 max-w-2xl mx-auto'
              : 'space-y-2.5 sm:space-y-3'
          }`}
        >
          {/* 1. CURRENT VALUE */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-white dark:bg-[#181820]/75 dark:backdrop-blur-md border border-slate-200 dark:border-white/20 border-t-2 border-t-emerald-500 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-30 shadow-[0_8px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-slate-200 dark:ring-white/10'
                : 'hover:border-slate-300 dark:hover:border-white/30 shadow-sm dark:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white tracking-wider">Current Value</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCurrentValue(!showCurrentValue);
                }}
                className="text-slate-400 hover:text-slate-700 dark:text-[#888] dark:hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showCurrentValue ? "Hide amount" : "Show amount"}
              >
                {showCurrentValue ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                {showCurrentValue ? `${currencySymbol}${totalCurrentValue.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 font-bold">
                <TrendingUp className="w-3 h-3" />
                <span>+{overallReturnPercent}% Returns</span>
              </div>
            </div>
          </div>

          {/* 2. CAPITAL INVESTED */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-white dark:bg-[#181820]/75 dark:backdrop-blur-md border border-slate-200 dark:border-white/20 border-t-2 border-t-cyan-500 dark:border-t-cyan-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-20 scale-[0.98] shadow-[0_8px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-slate-200 dark:ring-white/10'
                : 'hover:border-slate-300 dark:hover:border-white/30 shadow-sm dark:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white tracking-wider">Capital Invested</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInvestedCapital(!showInvestedCapital);
                }}
                className="text-slate-400 hover:text-slate-700 dark:text-[#888] dark:hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showInvestedCapital ? "Hide amount" : "Show amount"}
              >
                {showInvestedCapital ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className="text-base sm:text-lg lg:text-xl font-bold text-slate-700 dark:text-[#aaa] tracking-tight">
                {showInvestedCapital ? `${currencySymbol}${totalInvestedCapital.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-[#aaa]">
                Net Principal
              </div>
            </div>
          </div>

          {/* 3. TOTAL PROFIT/LOSS */}
          <div
            onClick={() => isKpiStacked && setIsKpiStacked(false)}
            className={`p-3 sm:p-3.5 bg-white dark:bg-[#181820]/75 dark:backdrop-blur-md border border-slate-200 dark:border-white/20 border-t-2 border-t-purple-500 dark:border-t-purple-400 rounded-xl sm:rounded-2xl transition-all duration-300 ease-in-out relative min-w-0 ${
              isKpiStacked
                ? 'z-10 scale-[0.96] shadow-[0_8px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_25px_rgba(0,0,0,0.85)] hover:-translate-y-2 hover:z-50 cursor-pointer ring-1 ring-slate-200 dark:ring-white/10'
                : 'hover:border-slate-300 dark:hover:border-white/30 shadow-sm dark:shadow-md'
            }`}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-slate-500 dark:text-[#aaa] uppercase mb-0.5">
              <div className="flex items-center gap-1.5">
                <PieIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="font-bold text-slate-900 dark:text-white tracking-wider">Total Profit/Loss</span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTotalProfit(!showTotalProfit);
                }}
                className="text-slate-400 hover:text-slate-700 dark:text-[#888] dark:hover:text-white p-0.5 cursor-pointer shrink-0"
                title={showTotalProfit ? "Hide amount" : "Show amount"}
              >
                {showTotalProfit ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
              </button>
            </div>

            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <div className={`text-base sm:text-lg lg:text-xl font-bold tracking-tight ${
                totalProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-500'
              }`}>
                {showTotalProfit ? `${totalProfit >= 0 ? '+' : ''}${currencySymbol}${totalProfit.toLocaleString('en-IN')}` : '••••••••'}
              </div>
              <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-[#aaa]">
                Unrealized Gain
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================== CHARTS: TREND & ALLOCATION ==================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OVER TIME Line Chart */}
        <div className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-3">
          <div className="flex items-center justify-between text-[10px] font-mono font-bold text-[#777] uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>CUMULATIVE INVESTMENT OVER TIME</span>
            </div>
            <span className="text-white">
              {currencySymbol}{totalInvestmentAmount.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="h-48 sm:h-56 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  stroke="#555"
                  tick={{ fontSize: 10, fill: '#777', fontFamily: 'monospace' }}
                  tickLine={false}
                />
                <YAxis
                  stroke="#555"
                  tick={{ fontSize: 10, fill: '#777', fontFamily: 'monospace' }}
                  tickLine={false}
                  tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                  formatter={(val: any) => [`${currencySymbol}${Number(val).toLocaleString()}`, 'Cumulative']}
                />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#06b6d4' }}
                  activeDot={{ r: 6, fill: '#38bdf8' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BY CATEGORY Pie Chart */}
        <div className="bg-[#111111] border border-[#222] p-4 sm:p-5 rounded-2xl space-y-3">
          <div className="text-[10px] font-mono font-bold text-[#777] uppercase tracking-widest flex items-center gap-2">
            <PieIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>PORTFOLIO ALLOCATION</span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 h-48 sm:h-56">
            <div className="w-full sm:w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111', borderColor: '#333', borderRadius: '12px', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(val: any) => [`${currencySymbol}${Number(val).toLocaleString()}`, 'Value']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend list */}
            <div className="w-full sm:w-1/2 space-y-2.5 overflow-y-auto max-h-48">
              {pieData.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs font-mono bg-[#0a0a0a] p-2 rounded-xl border border-[#222]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-[#ccc] truncate max-w-[110px]">{item.name}</span>
                  </div>
                  <span className="font-bold text-white shrink-0">
                    {currencySymbol}{item.value.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ==================== TRANSACTIONS TABLE & CARD VIEW ==================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider">
            INVESTMENT LEDGER TRANSACTIONS
          </div>

          <div className="flex items-center bg-[#111111] p-0.5 border border-[#222] rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-all nav-lift cursor-pointer ${
                viewMode === 'table' ? 'bg-[#222] text-white font-bold shadow-sm' : 'text-[#777] hover:text-white'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span className="text-[10px]">Table</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detail')}
              className={`p-1 px-2 rounded text-xs font-mono flex items-center gap-1 transition-all nav-lift cursor-pointer ${
                viewMode === 'detail' ? 'bg-[#222] text-white font-bold shadow-sm' : 'text-[#777] hover:text-white'
              }`}
              title="Card Detail View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              <span className="text-[10px]">Detail</span>
            </button>
          </div>
        </div>

        {viewMode === 'table' ? (
          <div className="bg-[#111111] border border-[#222] rounded-2xl overflow-x-auto shadow-sm">
            <div className="min-w-[860px]">
              {/* Table Header */}
              <div className="grid grid-cols-12 px-4 py-3 border-b border-[#222] text-[#666] text-[10px] font-bold uppercase tracking-wider bg-[#0a0a0a]">
                <div className="col-span-2">DATE</div>
                <div className="col-span-3">CATEGORY / ASSET</div>
                <div className="col-span-2">ACCOUNT</div>
                <div className="col-span-1">TYPE</div>
                <div className="col-span-2 text-right">AMOUNT</div>
                <div className="col-span-2 text-right">ACTIONS</div>
              </div>

              {/* Rows */}
              {filteredTxns.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#666]">
                  No investment transactions recorded yet.
                </div>
              ) : (
                filteredTxns.map((tx) => (
                  <div
                    key={tx.id}
                    className="grid grid-cols-12 px-4 py-3 border-b border-[#1a1a1a] items-center text-xs text-white hover:bg-[#181818] transition-all hover:translate-x-0.5"
                  >
                    <div className="col-span-2 text-[#aaa] truncate">
                      {formatDateDisplay(tx.date)}
                    </div>
                    <div className="col-span-3 font-bold text-white truncate pr-2">
                      {tx.category}
                    </div>
                    <div className="col-span-2 text-[#aaa] truncate">
                      {tx.account}
                    </div>
                    <div className="col-span-1 font-bold text-cyan-400">
                      {tx.type}
                    </div>
                    <div className="col-span-2 text-right font-bold text-cyan-400">
                      {currencySymbol}{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                    </div>
                    <div className="col-span-2 flex items-center justify-end gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTxn(tx);
                        }}
                        className="px-2 py-1 bg-[#181818] hover:bg-[#282828] border border-[#333] hover:border-white text-[#aaa] hover:text-white text-[10px] uppercase font-bold rounded-lg transition-all cursor-pointer shrink-0"
                        title="Edit Transaction"
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTxn(tx);
                        }}
                        className="px-2 py-1 bg-[#181818] hover:bg-red-950/60 border border-red-900/60 hover:border-red-500 text-red-400 hover:text-red-300 text-[10px] uppercase font-bold rounded-lg transition-all cursor-pointer shrink-0"
                        title="Delete Transaction"
                      >
                        DEL
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredTxns.length === 0 ? (
              <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-2xl">
                No investment transactions recorded yet.
              </div>
            ) : (
              filteredTxns.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-[#111111] border border-[#222] hover:border-[#333] hover:bg-[#161616] rounded-2xl flex items-center justify-between gap-3 font-mono transition-all tactile-lift"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="text-xs font-bold text-white truncate">{tx.category}</div>
                    <div className="text-[10px] text-[#777] flex items-center gap-2">
                      <span>{formatDateDisplay(tx.date)}</span>
                      <span>•</span>
                      <span>{tx.account}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="text-xs font-bold text-cyan-400">
                        {currencySymbol}{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                      </div>
                      <span className="text-[9px] bg-cyan-950/80 text-cyan-400 font-bold px-1.5 py-0.5 rounded uppercase">
                        {tx.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTxn(tx);
                        }}
                        className="px-2 py-0.5 bg-[#181818] hover:bg-[#282828] border border-[#333] hover:border-white text-[#aaa] hover:text-white text-[9px] uppercase font-bold rounded-md transition-all cursor-pointer"
                        title="Edit Transaction"
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTxn(tx);
                        }}
                        className="px-2 py-0.5 bg-[#181818] hover:bg-red-950/60 border border-red-900/60 hover:border-red-500 text-red-400 hover:text-red-300 text-[9px] uppercase font-bold rounded-md transition-all cursor-pointer"
                        title="Delete Transaction"
                      >
                        DEL
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ==================== INDIVIDUAL HOLDINGS & ASSET CARDS ==================== */}
      <div className="pt-4 border-t border-[#222] space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono font-bold text-[#888] uppercase tracking-wider">
            PORTFOLIO ASSETS & INDIVIDUAL HOLDINGS ({investments.length})
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingInv(null);
              setName('');
              setAmountInvested('');
              setCurrentValue('');
              setNotes('');
              setShowAddModal(true);
            }}
            className="text-[10px] text-red-400 hover:text-red-300 font-mono font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3 h-3" /> ADD ASSET
          </button>
        </div>

        {/* Existing Asset Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {investments.length === 0 ? (
            <div className="col-span-2 p-8 text-center text-xs text-[#666] bg-[#111] border border-[#222] rounded-3xl">
              No individual investment holdings logged. Tap "ADD ASSET" to log a mutual fund, stock, crypto, or FD.
            </div>
          ) : (
            investments.map((inv) => (
              <div
                key={inv.id}
                className="p-5 bg-carbon border border-nothing hover:border-[#333] rounded-3xl space-y-4 transition-all relative group"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 bg-obsidian border border-nothing text-[9px] font-mono text-red-400 font-bold uppercase rounded">
                        {inv.type}
                      </span>
                    </div>
                    <h3 className="text-base font-bold font-mono text-white mt-2">{inv.name}</h3>
                    {inv.notes && <p className="text-xs text-[#777] font-mono mt-1">{inv.notes}</p>}
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-bold font-mono text-white">
                      {currencySymbol}{inv.currentValue.toLocaleString('en-IN')}
                    </div>
                    <div className={`text-xs font-mono font-bold ${
                      inv.returnsPercent >= 0 ? 'text-green-400' : 'text-red-500'
                    }`}>
                      {inv.returnsPercent >= 0 ? '+' : ''}{inv.returnsPercent}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[#888] font-mono pt-2 border-t border-nothing">
                  <span>Invested: <strong className="text-white">{currencySymbol}{inv.amountInvested.toLocaleString('en-IN')}</strong></span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(inv)}
                      className="p-1 text-[#888] hover:text-white hover:bg-[#222] rounded-lg transition-colors cursor-pointer"
                      title="Edit"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {onDeleteInvestment && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteInv(inv.id, inv.name, inv.type, inv.amountInvested, e)}
                        className="p-1 text-[#888] hover:text-red-400 hover:bg-[#222] rounded-lg transition-colors cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Monthly Contributions Log */}
                {inv.monthlyContributions && inv.monthlyContributions.length > 0 && (
                  <div className="pt-2 border-t border-nothing">
                    <div className="text-[10px] text-[#666] uppercase tracking-wider font-mono mb-2">
                      Monthly Contributions Record
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {inv.monthlyContributions.map((mc, idx) => (
                        <div key={idx} className="px-2.5 py-1 bg-obsidian border border-nothing rounded-lg text-center shrink-0">
                          <div className="text-[9px] text-[#666] font-mono">{mc.month}</div>
                          <div className="text-xs font-bold font-mono text-white">+{currencySymbol}{mc.amount.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal for adding/editing investment */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-carbon border border-nothing p-6 rounded-3xl max-w-md w-full shadow-2xl relative">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-nothing">
              <h3 className="text-sm font-bold font-mono text-white uppercase">
                {editingInv ? 'Edit Investment Record' : 'Log Investment Record'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingInv(null);
                }}
                className="text-[#666] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveInvestment} className="space-y-4">
              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Investment / Asset Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Parag Parikh Flexi Cap Fund"
                  className="w-full px-4 py-2.5 bg-obsidian border border-nothing focus:border-red-600 rounded-xl text-xs font-mono text-white placeholder-[#555] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Asset Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as InvestmentType)}
                  className="w-full px-4 py-2.5 bg-obsidian border border-nothing focus:border-red-600 rounded-xl text-xs font-mono text-white outline-none"
                >
                  <option value="Mutual Funds">Mutual Funds (SIP / Lumpsum)</option>
                  <option value="Stocks">Direct Stocks & ETFs</option>
                  <option value="Crypto">Crypto Assets</option>
                  <option value="Fixed Deposit">Fixed Deposit / Term Deposit</option>
                  <option value="Gold">Digital Gold / Sovereign Gold Bonds</option>
                  <option value="Real Estate">Real Estate / REITs</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                    Amount Invested ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={amountInvested}
                    onChange={(e) => setAmountInvested(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full px-4 py-2.5 bg-obsidian border border-nothing focus:border-red-600 rounded-xl text-xs font-mono text-white placeholder-[#555] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                    Current Market Value ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={currentValue}
                    onChange={(e) => setCurrentValue(e.target.value)}
                    placeholder="e.g. 5420"
                    className="w-full px-4 py-2.5 bg-obsidian border border-nothing focus:border-red-600 rounded-xl text-xs font-mono text-white placeholder-[#555] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-[#666] uppercase tracking-wider font-mono mb-1">
                  Notes / Folio Number (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Folio: 1234567/89, via Zerodha Coin"
                  className="w-full px-4 py-2 bg-obsidian border border-nothing focus:border-red-600 rounded-xl text-xs font-mono text-white placeholder-[#555] outline-none resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  {editingInv ? 'Save Changes' : 'Save Investment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Ledger Transaction Modal Dialog */}
      <AnimatePresence>
        {txnToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setTxnToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Dialog Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#121216] border border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#18181f] border border-[#2d2d35] rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                      Delete Transaction?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTxnToDelete(null)}
                  className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details card */}
              <div className="p-4 bg-[#181820] border border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Title / Payee:</span>
                    <span className="font-bold text-white max-w-[200px] truncate">
                      {txnToDelete.category}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Account:</span>
                    <span className="text-white font-bold">{txnToDelete.account}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Amount:</span>
                    <span className="font-bold text-cyan-400">
                      {currencySymbol}{txnToDelete.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Date:</span>
                    <span className="text-[#aaa]">{formatDateDisplay(txnToDelete.date)}</span>
                  </div>
                </div>
              </div>

              {/* Checkbox */}
              <label className="flex items-center gap-3 p-3 bg-[#0c0c0f] border border-[#222]/80 hover:border-[#333] rounded-2xl cursor-pointer transition-all select-none">
                <input
                  type="checkbox"
                  checked={doNotAskAgainChecked}
                  onChange={(e) => setDoNotAskAgainChecked(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-xs font-bold text-white">Do not ask again</span>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTxnToDelete(null)}
                  className="px-4 py-2 bg-[#18181f] hover:bg-[#222] border border-[#2d2d35] text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteTxn}
                  className="px-5 py-2 text-xs font-mono uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Asset Holding Modal Dialog */}
      <AnimatePresence>
        {assetToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono select-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAssetToDelete(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />

            {/* Dialog Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 450, damping: 32 }}
              className="relative z-10 w-full max-w-md bg-[#121216] border border-[#222] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-[#18181f] border border-[#2d2d35] rounded-2xl shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-white tracking-wide uppercase">
                      Delete Asset?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssetToDelete(null)}
                  className="p-1.5 text-[#555] hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Details card */}
              <div className="p-4 bg-[#181820] border border-[#26262f] rounded-2xl">
                <div className="space-y-1.5 font-mono">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Asset Name:</span>
                    <span className="font-bold text-white max-w-[200px] truncate">
                      {assetToDelete.name}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Asset Type:</span>
                    <span className="text-white font-bold">{assetToDelete.type}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#666]">Invested Capital:</span>
                    <span className="font-bold text-red-400">
                      {currencySymbol}{assetToDelete.amount.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkbox */}
              <label className="flex items-center gap-3 p-3 bg-[#0c0c0f] border border-[#222]/80 hover:border-[#333] rounded-2xl cursor-pointer transition-all select-none">
                <input
                  type="checkbox"
                  checked={doNotAskAgainChecked}
                  onChange={(e) => setDoNotAskAgainChecked(e.target.checked)}
                  className="w-4.5 h-4.5 accent-red-600 rounded bg-black border border-[#333] cursor-pointer"
                />
                <span className="text-xs font-bold text-white">Do not ask again</span>
              </label>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAssetToDelete(null)}
                  className="px-4 py-2 bg-[#18181f] hover:bg-[#222] border border-[#2d2d35] text-xs font-mono text-[#888] hover:text-white rounded-xl uppercase font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAsset}
                  className="px-5 py-2 text-xs font-mono uppercase rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};


